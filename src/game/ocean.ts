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
  // dirX, dirZ, freq, speed, amp, Q
  [ 0.766, -0.642, 0.065, 0.65, 1.30, 0.95], // Primary North-West swell
  [-0.939,  0.342, 0.081, 0.82, 0.65, 0.88], // Sharp East-South swell
  [-0.173, -0.984, 0.120, 1.10, 0.25, 0.80], // Tight North wobble
  [ 0.542,  0.840, 0.180, 1.45, 0.15, 0.70], // South-West chop
  [-0.642, -0.766, 0.250, 1.90, 0.08, 0.60], // Micro North-East detail
  [ 0.840,  0.542, 0.350, 2.40, 0.04, 0.50], // Fine South-West surface ripple
] as const

const RIPPLE_FREQ  = 0.95
const RIPPLE_SPEED = 2.6
const RIPPLE_AMP   = 0.070
const RIPPLE_Q     = 0.85

// ────────────────────────── vertex shader ──────────────────────────
const vertexShader = `
  #include <fog_pars_vertex>
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

  // Swells evaluated dynamically

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

${WAVES.map((w, i) => `    gerstner(wc, vec2(${w[0].toFixed(4)}, ${w[1].toFixed(4)}), ${w[2].toFixed(4)}, ${w[3].toFixed(4)}, ${w[4].toFixed(4)}, ${w[5].toFixed(4)}, disp, tX, tY);`
).join('\n')}
    vec2 w = normalize(uWindDir);
    float rAmp = ${RIPPLE_AMP.toFixed(4)} + uWindStrength * 0.003;
    gerstner(wc, w, ${RIPPLE_FREQ.toFixed(4)}, ${RIPPLE_SPEED.toFixed(4)}, rAmp, ${RIPPLE_Q.toFixed(4)}, disp, tX, tY);

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

    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

// ────────────────────────── fragment shader ──────────────────────────
const fragmentShader = `
  #include <fog_pars_fragment>
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

    // ── Base water colour: Deep pure blues (Less green/turquoise) ──
    vec3 deepOcean   = vec3(0.00, 0.07, 0.35); // Viscose deep blue
    vec3 shallowCol  = vec3(0.05, 0.35, 0.70); // Strong pure blue
    vec3 crestCol    = vec3(0.15, 0.65, 0.90); // Piercing light blue at peaks
    
    // Adjust scale since amplitude is much higher now (up to ~5.0 total)
    float elev = clamp((vElevation + 3.0) / 6.0, 0.0, 1.0);
    // Smooth interpolations based on elevation
    vec3 col = mix(deepOcean, shallowCol, smoothstep(0.0, 0.5, elev));
    col = mix(col, crestCol, smoothstep(0.5, 0.9, elev));

    // Darken the deep troughs slightly
    col *= mix(0.70, 1.0, elev);

    // ── Diffuse lighting ──
    col += vec3(0.05, 0.1, 0.15) * NdotL;

    // ── Subsurface scattering — luminous turquoise through wave crests ──
    vec3 sssDir = normalize(sunDir + N * 0.55);
    float sss = pow(max(dot(V, -sssDir), 0.0), 2.0)
              * smoothstep(-0.5, 1.5, vElevation) * 0.75;
    col += vec3(0.1, 0.6, 0.5) * sss;

    // Thinner areas near crest tops get extra translucency
    float thinEdge = smoothstep(0.8, 1.8, vElevation) * pow(max(1.0 - NdotV, 0.0), 2.0);
    col += vec3(0.15, 0.70, 0.65) * thinEdge * 0.6;

    // Back-lit rim on crests
    float backLit = pow(max(dot(V, -sunDir), 0.0), 4.0)
                  * smoothstep(0.3, 1.8, vElevation) * 0.5;
    col += vec3(0.1, 0.5, 0.4) * backLit;

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

    // Breaking-crest whitecap: pure continuous thin line at the absolute top of the ridge
    float crestLine = smoothstep(0.96, 0.99, elev); // Trigger only at the extreme 3% top edge
    foam += crestLine * 1.5;

    // Small speckle noise to add a bit of water detail, but entirely avoiding big blocks
    float fineSpeckle = step(0.85, hash(floor(vWorldPos * 30.0 - vec2(t * 5.0, t * 5.0)))) * smoothstep(0.8, 0.95, elev);
    foam += fineSpeckle * 0.4;

    // Pure white foam color to pop against the blue
    vec3 foamCol = vec3(1.0, 1.0, 1.0);
    col = mix(col, foamCol, clamp(foam, 0.0, 1.0));

    // ── Alpha: Increased opacity ("less alpha" means less transparent) ──
    float alpha = mix(0.85, 0.65, smoothstep(0.1, 0.9, elev));
    // Foam makes water surface more visibly opaque
    alpha = mix(alpha, 1.0, clamp(foam, 0.0, 1.0));

    // ── Tone-map ──
    col = col / (col + 0.55) * 1.2;

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`

const sandVertexShader = `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const sandFragmentShader = `
  #include <fog_pars_fragment>
  varying vec2 vUv;

  // Simple pseudo-random hash
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Basic value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // FBM (Fractal Brownian Motion) for sand variance
  float fbm(vec2 p) {
    float f = 0.0;
    float w = 0.5;
    for (int i = 0; i < 4; i++) {
      f += w * noise(p);
      p *= 2.0;
      w *= 0.5;
    }
    return f;
  }

  void main() {
    // Large scaling for the vast ocean floor
    vec2 p = vUv * 800.0;
    
    // Create sand ripple effect
    float ripples = sin(p.x * 2.0 + noise(p * 0.2) * 4.0) * 0.5 + 0.5;
    float sandNoise = fbm(p * 0.5);
    
    // Base sand colors
    vec3 colorA = vec3(0.5, 0.45, 0.35); // Darker wet sand
    vec3 colorB = vec3(0.7, 0.65, 0.50); // Lighter sand
    
    vec3 color = mix(colorA, colorB, sandNoise);
    
    // Add darker spots for rocks/variance
    float spots = smoothstep(0.7, 0.8, fbm(p * 2.0));
    color = mix(color, vec3(0.2, 0.2, 0.15), spots * 0.6);
    
    // Apply ripples
    color -= ripples * 0.08;

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`

// ────────────────────────── runtime API ──────────────────────────
export function createOcean(scene: THREE.Scene): THREE.Mesh {
  // Procedural sandy backing plane visible through the alpha transparency
  const deepGeom = new THREE.PlaneGeometry(OCEAN_SIZE * 2, OCEAN_SIZE * 2)
  const deepMat  = new THREE.ShaderMaterial({
    vertexShader: sandVertexShader,
    fragmentShader: sandFragmentShader,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib['fog']]),
    fog: true,
    side: THREE.FrontSide
  })
  const deepPlane = new THREE.Mesh(deepGeom, deepMat)
  deepPlane.rotation.x = -Math.PI / 2
  deepPlane.position.y = -18.0
  deepPlane.frustumCulled = false
  deepPlane.renderOrder = -1
  scene.add(deepPlane)

  const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS)
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      {
        uTime:         { value: 0 },
        uWorldOffset:  { value: new THREE.Vector2(0, 0) },
        uWindDir:      { value: new THREE.Vector2(0, 1) },
        uWindStrength: { value: 3 }
      }
    ]),
    transparent: true,
    side: THREE.DoubleSide,
    fog: true,
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

