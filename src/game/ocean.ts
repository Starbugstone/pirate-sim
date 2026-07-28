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
  [ 0.766, -0.642, 0.040, 0.75, 1.85, 0.95], // Primary rolling NW swell
  [-0.939,  0.342, 0.058, 0.90, 1.10, 0.90], // Sharp cross swell
  [-0.173, -0.984, 0.090, 1.20, 0.60, 0.85], // North ocean chop
  [ 0.542,  0.840, 0.140, 1.50, 0.35, 0.75], // South-West wavelets
  [-0.642, -0.766, 0.200, 1.95, 0.18, 0.65], // High-freq surface ripples
  [ 0.840,  0.542, 0.300, 2.40, 0.08, 0.55], // Capillary waves
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
    vec2 w = normalize(vec2(0.8, 0.6));
    float rAmp = 0.080 + uWindStrength * 0.004;
    gerstner(wc, w, 0.9500, 2.6000, rAmp, 0.8500, disp, tX, tY);

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
    vFoam = smoothstep(0.08, 0.28, slope) * 0.80
          + smoothstep(0.6, 2.2, disp.y) * 0.60;

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

  void main() {
    vec3 N = normalize(vWorldNormal);

    // Continuous surface micro-ripples
    vec2 uv = vWorldPos;
    float t = uTime;
    float dx = cos(uv.x * 0.45 + uv.y * 0.25 + t * 0.9) * 0.25
             + cos(uv.x * 1.4 - t * 1.3) * cos(uv.y * 1.1 + t * 0.8) * 0.12;
    float dz = cos(uv.y * 0.40 - uv.x * 0.20 - t * 0.7) * 0.25
             + cos(uv.y * 1.5 + t * 1.1) * cos(uv.x * 0.9 - t * 0.9) * 0.12;
    N = normalize(N + vec3(dx, 0.0, dz) * 0.18);

    vec3 V      = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(vec3(0.35, 0.82, 0.45));
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, sunDir), 0.0);

    // Caribbean Sea Color Spectrum
    vec3 deepCobalt     = vec3(0.01, 0.10, 0.32);
    vec3 reefAqua       = vec3(0.00, 0.52, 0.68);
    vec3 shallowTurq    = vec3(0.05, 0.78, 0.82);
    vec3 clearCyan      = vec3(0.18, 0.90, 0.85);

    float elev = clamp((vElevation + 3.2) / 6.4, 0.0, 1.0);

    vec3 col = mix(deepCobalt, reefAqua, smoothstep(0.0, 0.45, elev));
    col = mix(col, shallowTurq, smoothstep(0.45, 0.80, elev));
    col = mix(col, clearCyan, smoothstep(0.80, 1.0, elev));

    col *= mix(0.75, 1.08, elev);

    // Subsurface Scattering
    vec3 sssDir = normalize(sunDir + N * 0.4);
    float sss = pow(max(dot(V, -sssDir), 0.0), 2.5) * smoothstep(-0.2, 1.4, vElevation) * 0.65;
    col += vec3(0.08, 0.82, 0.72) * sss;

    float thinEdge = smoothstep(0.65, 1.8, vElevation) * pow(max(1.0 - NdotV, 0.0), 2.0);
    col += vec3(0.15, 0.85, 0.80) * thinEdge * 0.5;

    // Sun Specular Shimmer
    vec3 H        = normalize(sunDir + V);
    float NdotH   = max(dot(N, H), 0.0);
    float sunSpec = pow(NdotH, 384.0) * 1.5;
    col += vec3(1.0, 0.98, 0.92) * sunSpec;

    float shimmer = pow(NdotH, 48.0) * 0.15;
    col += vec3(0.85, 0.95, 1.0) * shimmer;

    // Fresnel Sky Dome Gradient
    float fresnel = pow(1.0 - NdotV, 4.0);
    vec3 R = reflect(-V, N);
    float skyT = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizonCol = vec3(0.65, 0.82, 0.92);
    vec3 zenithCol  = vec3(0.12, 0.42, 0.78);
    vec3 skyReflect = mix(horizonCol, zenithCol, skyT);
    col = mix(col, skyReflect, fresnel * 0.40);

    // Rolling wave crest foam
    float waveSlopeFoam = vFoam * 0.7;
    float crestFoam = smoothstep(0.72, 0.98, elev) * 0.65;
    float totalFoam = clamp(waveSlopeFoam + crestFoam, 0.0, 1.0);

    vec3 foamCol = vec3(0.96, 1.0, 1.0);
    col = mix(col, foamCol, totalFoam * 0.75);

    float alpha = mix(0.75, 0.55, smoothstep(0.1, 0.9, elev));
    alpha = mix(alpha, 0.95, totalFoam * 0.75);

    col = col / (col + 0.45) * 1.12;

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`

const sandVertexShader = `
  #include <fog_pars_vertex>
  varying vec2 vWorldXZ;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const sandFragmentShader = `
  #include <fog_pars_fragment>
  uniform float uTime;
  varying vec2 vWorldXZ;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

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
    vec2 p = vWorldXZ * 0.30;
    float t = uTime * 1.2;
    
    // Smooth Caribbean Sand & Dunes
    float ripples = sin(p.x * 2.0 + noise(p * 0.2) * 3.5) * 0.5 + 0.5;
    float sandNoise = fbm(p * 0.35);
    
    vec3 goldenSand = vec3(0.88, 0.80, 0.62);
    vec3 wetSand    = vec3(0.60, 0.52, 0.38);
    vec3 reefShadow = vec3(0.25, 0.42, 0.35);
    
    vec3 color = mix(wetSand, goldenSand, sandNoise);
    
    float reefSpot = smoothstep(0.68, 0.88, fbm(p * 1.1));
    color = mix(color, reefShadow, reefSpot * 0.5);
    
    color -= ripples * 0.06;

    // Smooth fluid underwater light network (ZERO static dots!)
    vec2 cUv1 = vWorldXZ * 0.08 + vec2(t * 0.25, t * 0.18);
    vec2 cUv2 = vWorldXZ * 0.14 - vec2(t * 0.18, -t * 0.22);
    float caust1 = sin(cUv1.x * 6.28 + cos(cUv1.y * 5.0)) * 0.5 + 0.5;
    float caust2 = cos(cUv2.y * 6.28 + sin(cUv2.x * 5.0)) * 0.5 + 0.5;
    float caustics = smoothstep(0.45, 0.85, caust1 * caust2);
    color += vec3(0.12, 0.55, 0.50) * caustics * 0.25;

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`

// ────────────────────────── runtime API ──────────────────────────
let oceanCenterX = 0;
let oceanCenterZ = 0;

export function createOcean(scene: THREE.Scene): THREE.Mesh {
  // Procedural sandy backing plane visible through the alpha transparency
  const deepGeom = new THREE.PlaneGeometry(OCEAN_SIZE * 2, OCEAN_SIZE * 2)
  const deepMat  = new THREE.ShaderMaterial({
    vertexShader: sandVertexShader,
    fragmentShader: sandFragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      { uTime: { value: 0 } }
    ]),
    fog: true,
    side: THREE.FrontSide
  })
  const deepPlane = new THREE.Mesh(deepGeom, deepMat)
  deepPlane.rotation.x = -Math.PI / 2
  deepPlane.position.y = -18.0
  deepPlane.frustumCulled = false
  deepPlane.renderOrder = -1
  scene.add(deepPlane)

  const geometry = new THREE.PlaneGeometry(OCEAN_SIZE * 2, OCEAN_SIZE * 2, 160, 160)
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
  oceanCenterX = playerX
  oceanCenterZ = playerZ

  mesh.position.x = playerX
  mesh.position.z = playerZ
  if (mesh.userData.deepPlane) {
    mesh.userData.deepPlane.position.x = playerX
    mesh.userData.deepPlane.position.z = playerZ
    ;(mesh.userData.deepPlane.material as THREE.ShaderMaterial).uniforms.uTime.value = time
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
  // Hardcode micro-ripple direction matching the shader
  const wdx = 0.8
  const wdz = 0.6
  const len = Math.sqrt(wdx*wdx + wdz*wdz)
  const rAmp = 0.070 + windStrength * 0.003
  h += rAmp * Math.sin((worldX * (wdx/len) + worldZ * (wdz/len)) * 0.9500 + time * 2.6000)
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

