// @ts-nocheck
import * as THREE from 'three'
import { OCEAN_SIZE, OCEAN_SEGMENTS } from './constants'

// Fixed swell headings — ocean swells carry momentum independent of wind.
// Only the tiny ripple layer tracks the live wind direction so shifts never
// cause the main wave pattern to jump.
const SWELL_A_X =  0.766,  SWELL_A_Z =  0.643
const SWELL_B_X = -0.342,  SWELL_B_Z =  0.940
const SWELL_C_X =  0.500,  SWELL_C_Z = -0.866

// ─── Wave table shared between GPU and CPU ───
// [dirX, dirZ, frequency, speed, amplitude, steepness(Q)]
const WAVES = [
  [SWELL_A_X, SWELL_A_Z, 0.028, 0.70, 1.10, 0.50],  // primary swell — tall, widely spaced
  [SWELL_B_X, SWELL_B_Z, 0.058, 1.20, 0.35, 0.38],  // secondary cross-swell
  [SWELL_C_X, SWELL_C_Z, 0.140, 1.90, 0.09, 0.18],  // chop
] as const

const RIPPLE_FREQ  = 0.32
const RIPPLE_SPEED = 2.8
const RIPPLE_AMP   = 0.03
const RIPPLE_Q     = 0.08

// ────────────────────────── vertex shader ──────────────────────────
const vertexShader = `
  uniform float uTime;
  uniform vec2  uWorldOffset;
  uniform vec2  uWindDir;
  uniform float uWindStrength;

  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;
  varying vec2  vWorldPos;
  varying float vElevation;
  varying float vFoam;

  const vec2 swA = vec2(${SWELL_A_X}, ${SWELL_A_Z});
  const vec2 swB = vec2(${SWELL_B_X}, ${SWELL_B_Z});
  const vec2 swC = vec2(${SWELL_C_X}, ${SWELL_C_Z});

  // Accumulate a single Gerstner wave into displacement + tangent frame
  void gerstner(vec2 pos, vec2 dir, float freq, float spd, float amp, float Q,
                inout vec3 disp, inout vec3 tX, inout vec3 tY) {
    float phase = dot(pos, dir) * freq + uTime * spd;
    float c = cos(phase);
    float s = sin(phase);
    float WA  = freq * amp;
    float QWA = Q * WA;

    disp.x += dir.x * Q * amp * c;
    disp.y += amp * s;
    disp.z += dir.y * Q * amp * c;

    tX.x -= dir.x * dir.x * QWA * s;
    tX.y -= dir.x * dir.y * QWA * s;
    tX.z += dir.x * WA * c;

    tY.x -= dir.x * dir.y * QWA * s;
    tY.y -= dir.y * dir.y * QWA * s;
    tY.z += dir.y * WA * c;
  }

  void main() {
    vec2 wc = position.xy + uWorldOffset;

    vec3 disp = vec3(0.0);
    vec3 tX   = vec3(1.0, 0.0, 0.0);
    vec3 tY   = vec3(0.0, 1.0, 0.0);

    gerstner(wc, swA, ${WAVES[0][2]}, ${WAVES[0][3]}, ${WAVES[0][4]}, ${WAVES[0][5]}, disp, tX, tY);
    gerstner(wc, swB, ${WAVES[1][2]}, ${WAVES[1][3]}, ${WAVES[1][4]}, ${WAVES[1][5]}, disp, tX, tY);
    gerstner(wc, swC, ${WAVES[2][2]}, ${WAVES[2][3]}, ${WAVES[2][4]}, ${WAVES[2][5]}, disp, tX, tY);

    vec2 w = normalize(uWindDir);
    float rAmp = ${RIPPLE_AMP} + uWindStrength * 0.004;
    gerstner(wc, w, ${RIPPLE_FREQ}, ${RIPPLE_SPEED}, rAmp, ${RIPPLE_Q}, disp, tX, tY);

    vec3 pos = position;
    pos.xy += disp.xz;
    pos.z  += disp.y;

    vec3 localN = normalize(cross(tY, tX));

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldNormal   = normalize(mat3(modelMatrix) * localN);
    vWorldPosition = wp.xyz;
    vWorldPos      = wc;
    vElevation     = disp.y;

    float slope = 1.0 - abs(localN.z);
    vFoam = smoothstep(0.04, 0.18, slope) * 0.6
          + smoothstep(0.4, 1.0, disp.y) * 0.3;

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

// ────────────────────────── fragment shader ──────────────────────────
const fragmentShader = `
  uniform float uTime;
  uniform vec2  uWindDir;
  uniform float uWindStrength;

  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;
  varying vec2  vWorldPos;
  varying float vElevation;
  varying float vFoam;

  void main() {
    vec3 N = normalize(vWorldNormal);

    // ── Detail-normal perturbation (small waves in fragment shader) ──
    vec2 uv = vWorldPos;
    float dx = cos(uv.x * 0.7 + uv.y * 0.35 + uTime * 0.9) * 0.28
             + cos(uv.x * 2.1 - uTime * 1.4) * cos(uv.y * 1.7 + uTime * 0.85) * 0.14
             + cos(uv.x * 4.8 + uTime * 2.4) * 0.04;
    float dz = cos(uv.y * 0.6 - uv.x * 0.25 - uTime * 0.65) * 0.28
             + cos(uv.y * 2.3 + uTime * 1.15) * cos(uv.x * 1.4 - uTime * 1.05) * 0.14
             + cos(uv.y * 4.2 - uTime * 2.1) * 0.04;
    N = normalize(N + vec3(dx, 0.0, dz) * 0.12);

    vec3 V      = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(vec3(0.28, 0.82, 0.38));

    // ── Water colour — elevation-based 4-stop gradient ──
    vec3 abyss  = vec3(0.002, 0.018, 0.06);
    vec3 deep   = vec3(0.008, 0.055, 0.14);
    vec3 mid    = vec3(0.02,  0.16,  0.26);
    vec3 crest  = vec3(0.05,  0.28,  0.36);

    float t = clamp((vElevation + 1.2) / 2.4, 0.0, 1.0);
    vec3 col = mix(abyss, deep, smoothstep(0.0, 0.25, t));
    col = mix(col, mid,   smoothstep(0.25, 0.55, t));
    col = mix(col, crest, smoothstep(0.55, 1.0,  t));

    // ── Diffuse ──
    float NdotL = max(dot(N, sunDir), 0.0);
    col += vec3(0.018, 0.035, 0.045) * NdotL;

    // ── Subsurface scattering — turquoise glow through thin crests ──
    vec3 sssDir = normalize(sunDir + N * 0.6);
    float sss   = pow(max(dot(V, -sssDir), 0.0), 3.5)
                * smoothstep(-0.2, 0.8, vElevation) * 0.45;
    col += vec3(0.01, 0.22, 0.16) * sss;

    // Back-light rim on crests looking toward the sun
    float backLit = pow(max(dot(V, -sunDir), 0.0), 8.0)
                  * smoothstep(0.1, 0.9, vElevation) * 0.35;
    col += vec3(0.02, 0.14, 0.10) * backLit;

    // ── Sun specular — crisp glint ──
    vec3  H       = normalize(sunDir + V);
    float sunSpec = pow(max(dot(N, H), 0.0), 350.0) * 1.0;
    col += vec3(1.0, 0.96, 0.88) * sunSpec;

    // ── Sky specular — broad soft shimmer ──
    float skySpec = pow(max(dot(N, H), 0.0), 12.0) * 0.06;
    col += vec3(0.4, 0.6, 0.8) * skySpec;

    // ── Fresnel reflection — sky gradient ──
    float fresnel = pow(1.0 - max(dot(V, N), 0.0), 5.0);
    vec3 R        = reflect(-V, N);
    float skyT    = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyCol   = mix(vec3(0.55, 0.70, 0.82), vec3(0.22, 0.42, 0.72), skyT);
    col = mix(col, skyCol, fresnel * 0.38);

    // ── Foam — steep faces + animated wind-streaks ──
    float foam = vFoam;
    vec2 fw = normalize(uWindDir);
    float streak = sin(dot(vWorldPos, fw) * 0.35 + uTime * 0.25)
                 * cos(dot(vWorldPos, vec2(-fw.y, fw.x)) * 0.28 - uTime * 0.15);
    foam += max(streak, 0.0) * 0.12 * smoothstep(0.15, 0.7, vElevation);
    col = mix(col, vec3(0.92, 0.96, 0.98), clamp(foam, 0.0, 1.0) * 0.45);

    // ── Subtle tone-map to keep highlights from blowing out ──
    col = col / (col + 0.6) * 1.15;

    gl_FragColor = vec4(col, 1.0);
  }
`

// ────────────────────────── runtime API ──────────────────────────
export function createOcean(scene: THREE.Scene): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS)
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime:         { value: 0 },
      uWorldOffset:  { value: new THREE.Vector2(0, 0) },
      uWindDir:      { value: new THREE.Vector2(0, 1) },
      uWindStrength: { value: 3 }
    },
    transparent: false,
    side: THREE.FrontSide,
    fog: false,
    depthWrite: true
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -1.1
  mesh.renderOrder = 0
  mesh.frustumCulled = false
  scene.add(mesh)
  return mesh
}

export function updateOcean(
  mesh: THREE.Mesh,
  time: number,
  playerX: number,
  playerZ: number,
  windAngle: number,
  windStrength: number
) {
  mesh.position.x = playerX
  mesh.position.z = playerZ
  const u = (mesh.material as THREE.ShaderMaterial).uniforms
  u.uTime.value         = time
  u.uWorldOffset.value.set(playerX, playerZ)
  u.uWindDir.value.set(Math.sin(windAngle), Math.cos(windAngle))
  u.uWindStrength.value = windStrength
}

/**
 * CPU-side wave-height evaluation that mirrors the GPU Gerstner vertex shader.
 * Returns only the vertical displacement (the horizontal Gerstner shift is
 * purely cosmetic and doesn't affect where a boat should sit).
 */
export function getOceanHeight(
  worldX: number,
  worldZ: number,
  time: number,
  windAngle: number,
  windStrength: number
): number {
  let h = 0
  for (const [dx, dz, freq, speed, amp] of WAVES) {
    h += amp * Math.sin((worldX * dx + worldZ * dz) * freq + time * speed)
  }
  const wdx = Math.sin(windAngle)
  const wdz = Math.cos(windAngle)
  const rAmp = RIPPLE_AMP + windStrength * 0.004
  h += rAmp * Math.sin((worldX * wdx + worldZ * wdz) * RIPPLE_FREQ + time * RIPPLE_SPEED)
  return h
}

// ────────────────────────── bow-spray pool ──────────────────────────
const SPRAY_POOL_SIZE = 40

export function createSprayPool(scene: THREE.Scene) {
  const sprites: THREE.Mesh[] = []
  const geom = new THREE.SphereGeometry(0.12, 4, 4)
  const mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })

  for (let i = 0; i < SPRAY_POOL_SIZE; i++) {
    const m = new THREE.Mesh(geom, mat.clone())
    m.visible = false
    scene.add(m)
    sprites.push(m)
  }
  return {
    sprites,
    data: sprites.map(() => ({ active: false, vx: 0, vy: 0, vz: 0, life: 0 }))
  }
}

export function emitSpray(
  pool: ReturnType<typeof createSprayPool>,
  x: number, z: number, angle: number, speed: number, count: number
) {
  let spawned = 0
  for (let i = 0; i < pool.data.length && spawned < count; i++) {
    if (pool.data[i].active) continue
    const d = pool.data[i], s = pool.sprites[i]

    const spread = (Math.random() - 0.5) * 1.2
    d.vx   = Math.sin(angle + spread) * (speed * 0.08 + Math.random() * 2)
    d.vy   = 2 + Math.random() * 3
    d.vz   = Math.cos(angle + spread) * (speed * 0.08 + Math.random() * 2)
    d.life = 0.4 + Math.random() * 0.5
    d.active = true

    s.position.set(
      x + Math.sin(angle) * 4 + (Math.random() - 0.5) * 2,
      0.5,
      z + Math.cos(angle) * 4 + (Math.random() - 0.5) * 2
    )
    s.visible = true;
    (s.material as THREE.MeshBasicMaterial).opacity = 0.7
    s.scale.setScalar(0.6 + Math.random() * 0.6)
    spawned++
  }
}

export function updateSpray(pool: ReturnType<typeof createSprayPool>, dt: number) {
  for (let i = 0; i < pool.data.length; i++) {
    const d = pool.data[i]
    if (!d.active) continue
    const s = pool.sprites[i]

    d.life -= dt
    d.vy   -= 9.8 * dt
    s.position.x += d.vx * dt
    s.position.y += d.vy * dt
    s.position.z += d.vz * dt

    const fade = Math.max(0, d.life / 0.7);
    (s.material as THREE.MeshBasicMaterial).opacity = fade * 0.6
    s.scale.multiplyScalar(1 - dt * 0.8)

    if (d.life <= 0 || s.position.y < -0.5) {
      d.active = false
      s.visible = false
    }
  }
}
