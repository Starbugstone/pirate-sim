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
  [SWELL_A_X, SWELL_A_Z, 0.014, 0.55, 2.40, 0.42],   // primary swell — tall, long, sweeping
  [SWELL_B_X, SWELL_B_Z, 0.032, 0.90, 0.70, 0.35],   // secondary cross-swell
  [SWELL_C_X, SWELL_C_Z, 0.085, 1.50, 0.18, 0.20],   // medium chop
  [SWELL_A_X + 0.2, SWELL_A_Z - 0.1, 0.16, 2.10, 0.06, 0.10], // fine detail
] as const

const RIPPLE_FREQ  = 0.35
const RIPPLE_SPEED = 2.6
const RIPPLE_AMP   = 0.025
const RIPPLE_Q     = 0.06

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
  varying float vDepth;

  const vec2 swA = vec2(${SWELL_A_X}, ${SWELL_A_Z});
  const vec2 swB = vec2(${SWELL_B_X}, ${SWELL_B_Z});
  const vec2 swC = vec2(${SWELL_C_X}, ${SWELL_C_Z});
  const vec2 swD = vec2(${(SWELL_A_X + 0.2).toFixed(4)}, ${(SWELL_A_Z - 0.1).toFixed(4)});

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
    gerstner(wc, swD, ${WAVES[3][2]}, ${WAVES[3][3]}, ${WAVES[3][4]}, ${WAVES[3][5]}, disp, tX, tY);

    vec2 w = normalize(uWindDir);
    float rAmp = ${RIPPLE_AMP} + uWindStrength * 0.003;
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
    vFoam = smoothstep(0.06, 0.22, slope) * 0.7
          + smoothstep(1.0, 2.2, disp.y) * 0.5;

    vDepth = clamp((-disp.y + 1.0) / 4.0, 0.0, 1.0);

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
  varying float vDepth;

  // Hash for procedural patterns
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);

    // ── Detail-normal perturbation (small surface waves, fragment-level) ──
    vec2 uv = vWorldPos;
    float t = uTime;
    float dx = cos(uv.x * 0.55 + uv.y * 0.28 + t * 0.7)  * 0.30
             + cos(uv.x * 1.6 - t * 1.1) * cos(uv.y * 1.3 + t * 0.7) * 0.18
             + cos(uv.x * 3.8 + t * 2.0) * cos(uv.y * 3.2 - t * 1.5) * 0.06
             + cos(uv.x * 7.0 + t * 3.2) * 0.02;
    float dz = cos(uv.y * 0.50 - uv.x * 0.20 - t * 0.55) * 0.30
             + cos(uv.y * 1.8 + t * 0.95) * cos(uv.x * 1.1 - t * 0.85) * 0.18
             + cos(uv.y * 3.5 - t * 1.8) * cos(uv.x * 2.8 + t * 1.3) * 0.06
             + cos(uv.y * 6.5 - t * 2.8) * 0.02;
    N = normalize(N + vec3(dx, 0.0, dz) * 0.10);

    vec3 V      = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(vec3(0.25, 0.80, 0.35));
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, sunDir), 0.0);

    // ── Base water colour: deep navy underneath, brighter teal above ──
    vec3 abyssCol    = vec3(0.001, 0.012, 0.045);
    vec3 deepCol     = vec3(0.005, 0.035, 0.10);
    vec3 midCol      = vec3(0.012, 0.10,  0.20);
    vec3 surfaceCol  = vec3(0.025, 0.18,  0.30);
    vec3 crestCol    = vec3(0.05,  0.26,  0.34);

    float elev = clamp((vElevation + 2.5) / 5.0, 0.0, 1.0);
    vec3 col = mix(abyssCol, deepCol,    smoothstep(0.0,  0.15, elev));
    col = mix(col, midCol,               smoothstep(0.15, 0.35, elev));
    col = mix(col, surfaceCol,           smoothstep(0.35, 0.65, elev));
    col = mix(col, crestCol,             smoothstep(0.65, 1.0,  elev));

    // Darken the deep troughs further with depth-dependent absorption
    col *= mix(0.55, 1.0, elev);

    // ── Diffuse lighting ──
    col += vec3(0.012, 0.028, 0.038) * NdotL;

    // ── Subsurface scattering — luminous turquoise through wave crests ──
    vec3 sssDir = normalize(sunDir + N * 0.55);
    float sss = pow(max(dot(V, -sssDir), 0.0), 3.0)
              * smoothstep(-0.5, 1.5, vElevation) * 0.55;
    col += vec3(0.015, 0.25, 0.18) * sss;

    // Thinner areas near crest tops get extra translucency
    float thinEdge = smoothstep(1.2, 2.4, vElevation) * pow(max(1.0 - NdotV, 0.0), 2.0);
    col += vec3(0.02, 0.20, 0.15) * thinEdge * 0.4;

    // Back-lit rim on crests
    float backLit = pow(max(dot(V, -sunDir), 0.0), 6.0)
                  * smoothstep(0.3, 1.8, vElevation) * 0.35;
    col += vec3(0.025, 0.16, 0.12) * backLit;

    // ── Sun specular — sharp dancing glints ──
    vec3  H       = normalize(sunDir + V);
    float NdotH   = max(dot(N, H), 0.0);
    float sunSpec = pow(NdotH, 512.0) * 1.4;
    col += vec3(1.0, 0.97, 0.90) * sunSpec;

    // Secondary broader sun shimmer
    float shimmer = pow(NdotH, 48.0) * 0.12;
    col += vec3(0.9, 0.95, 1.0) * shimmer;

    // ── Sky specular — broad cool reflection ──
    float skySpec = pow(NdotH, 10.0) * 0.04;
    col += vec3(0.45, 0.6, 0.8) * skySpec;

    // ── Fresnel reflection — sky dome gradient ──
    float fresnel = pow(1.0 - NdotV, 4.5);
    vec3 R     = reflect(-V, N);
    float skyT = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizonCol = vec3(0.60, 0.74, 0.85);
    vec3 zenithCol  = vec3(0.18, 0.38, 0.68);
    vec3 skyReflect = mix(horizonCol, zenithCol, skyT);
    col = mix(col, skyReflect, fresnel * 0.42);

    // ── Foam & whitecaps ──
    float foam = vFoam;

    // Animated wind-aligned foam streaks on wave faces
    vec2 fw = normalize(uWindDir);
    vec2 perp = vec2(-fw.y, fw.x);
    float streak1 = sin(dot(vWorldPos, fw) * 0.25 + t * 0.20)
                  * cos(dot(vWorldPos, perp) * 0.18 - t * 0.10);
    float streak2 = sin(dot(vWorldPos, fw) * 0.6 + t * 0.35)
                  * cos(dot(vWorldPos, perp) * 0.45 + t * 0.18);
    foam += max(streak1, 0.0) * 0.20 * smoothstep(0.5, 1.8, vElevation);
    foam += max(streak2, 0.0) * 0.10 * smoothstep(0.8, 2.0, vElevation);

    // Breaking-crest whitecap at the very top of the wave
    float crestWhite = smoothstep(1.6, 2.4, vElevation) * 0.7;
    float crestNoise = sin(vWorldPos.x * 1.2 + t * 0.8) * sin(vWorldPos.y * 1.5 - t * 0.6);
    crestWhite *= 0.5 + 0.5 * max(crestNoise, 0.0);
    foam += crestWhite;

    // Speckle foam on steep faces
    float speckle = hash(floor(vWorldPos * 1.5)) * smoothstep(0.12, 0.25, 1.0 - abs(N.y));
    foam += speckle * 0.15;

    vec3 foamCol = vec3(0.92, 0.96, 0.99);
    col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.55);

    // ── Alpha: translucent in troughs, opaque on surface ──
    float alpha = mix(0.82, 0.97, elev);
    alpha = mix(alpha, 1.0, fresnel * 0.5);
    alpha = mix(alpha, 1.0, clamp(foam * 0.5, 0.0, 1.0));

    // ── Tone-map ──
    col = col / (col + 0.55) * 1.2;

    gl_FragColor = vec4(col, alpha);
  }
`

// ────────────────────────── runtime API ──────────────────────────
export function createOcean(scene: THREE.Scene): THREE.Mesh {
  // Deep-water backing plane visible through the alpha transparency
  const deepGeom = new THREE.PlaneGeometry(OCEAN_SIZE * 2, OCEAN_SIZE * 2)
  const deepMat  = new THREE.MeshBasicMaterial({ color: 0x010820, side: THREE.FrontSide })
  const deepPlane = new THREE.Mesh(deepGeom, deepMat)
  deepPlane.rotation.x = -Math.PI / 2
  deepPlane.position.y = -6.0
  deepPlane.frustumCulled = false
  deepPlane.renderOrder = -1
  scene.add(deepPlane)

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
    transparent: true,
    side: THREE.DoubleSide,
    fog: false,
    depthWrite: true
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -1.1
  mesh.renderOrder = 0
  mesh.frustumCulled = false
  mesh.userData.deepPlane = deepPlane
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
  if (mesh.userData.deepPlane) {
    mesh.userData.deepPlane.position.x = playerX
    mesh.userData.deepPlane.position.z = playerZ
  }
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
  const rAmp = RIPPLE_AMP + windStrength * 0.003
  h += rAmp * Math.sin((worldX * wdx + worldZ * wdz) * RIPPLE_FREQ + time * RIPPLE_SPEED)
  return h
}

// ────────────────────────── bow-spray pool ──────────────────────────
const SPRAY_POOL_SIZE = 60

export function createSprayPool(scene: THREE.Scene) {
  const sprites: THREE.Mesh[] = []
  const geom = new THREE.SphereGeometry(0.15, 5, 5)
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

    const spread = (Math.random() - 0.5) * 1.4
    d.vx   = Math.sin(angle + spread) * (speed * 0.10 + Math.random() * 2.5)
    d.vy   = 2.5 + Math.random() * 4
    d.vz   = Math.cos(angle + spread) * (speed * 0.10 + Math.random() * 2.5)
    d.life = 0.5 + Math.random() * 0.6
    d.active = true

    s.position.set(
      x + Math.sin(angle) * 5 + (Math.random() - 0.5) * 3,
      0.8,
      z + Math.cos(angle) * 5 + (Math.random() - 0.5) * 3
    )
    s.visible = true;
    (s.material as THREE.MeshBasicMaterial).opacity = 0.75
    s.scale.setScalar(0.7 + Math.random() * 0.8)
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

    const fade = Math.max(0, d.life / 0.8);
    (s.material as THREE.MeshBasicMaterial).opacity = fade * 0.65
    s.scale.multiplyScalar(1 - dt * 0.6)

    if (d.life <= 0 || s.position.y < -0.5) {
      d.active = false
      s.visible = false
    }
  }
}
