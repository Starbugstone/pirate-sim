// @ts-nocheck
import * as THREE from 'three'
import { OCEAN_SIZE, OCEAN_SEGMENTS } from './constants'

// ─── Harmonically Tuned Gerstner Waves ───
// [dirX, dirZ, frequency, speed, amplitude, steepness(Q)]
export const WAVES = [
  [ 0.7071,  0.7071, 0.035, 1.25, 2.40, 0.85], // Rolling NW Primary Swell (2.4m height)
  [-0.8660,  0.5000, 0.065, 1.50, 1.30, 0.75], // Secondary Cross Chop (1.3m height)
  [ 0.3420, -0.9397, 0.110, 1.90, 0.65, 0.65], // South Ocean Wavelets (0.65m height)
  [-0.5000, -0.8660, 0.200, 2.40, 0.25, 0.50]  // Surface Wind Ripples
] as const

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

${WAVES.map((w) => `    gerstner(wc, vec2(${w[0].toFixed(4)}, ${w[1].toFixed(4)}), ${w[2].toFixed(4)}, ${w[3].toFixed(4)}, ${w[4].toFixed(4)}, ${w[5].toFixed(4)}, disp, tX, tY);`
).join('\n')}

    vec3 pos = position;
    pos.xy += disp.xz;
    pos.z  += disp.y;

    vec3 localN = normalize(cross(tY, tX));

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldNormal   = normalize(mat3(modelMatrix) * localN);
    vWorldPosition = wp.xyz;
    vWorldPos      = wc;
    vElevation     = disp.y;

    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

// ────────────────────────── fragment shader ──────────────────────────
const fragmentShader = `
  #include <fog_pars_fragment>
  uniform float uTime;

  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;
  varying vec2  vWorldPos;
  varying float vElevation;

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

  void main() {
    vec3 N = normalize(vWorldNormal);
    float t = uTime;

    // Micro-ripple perturbation
    vec2 uv = vWorldPos * 0.75;
    float dx = sin(uv.x * 1.5 + t * 1.8) * cos(uv.y * 1.2 - t * 1.4) * 0.10;
    float dz = cos(uv.y * 1.6 - t * 1.5) * sin(uv.x * 1.1 + t * 1.2) * 0.10;
    N = normalize(N + vec3(dx, 0.0, dz) * 0.12);

    vec3 V      = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(vec3(0.40, 0.75, 0.50));

    // Directional Sun Shading on Wave Slopes (Makes 3D rolling waves clearly visible!)
    float NdotL = max(dot(N, sunDir), 0.0);
    float waveShading = mix(0.48, 1.22, NdotL);

    // Vibrant Caribbean Sea Color Spectrum
    vec3 deepCobalt  = vec3(0.01, 0.08, 0.28);
    vec3 reefTurq    = vec3(0.00, 0.48, 0.62);
    vec3 clearCyan   = vec3(0.08, 0.75, 0.82);

    float elev = clamp((vElevation + 2.8) / 5.6, 0.0, 1.0);
    vec3 col = mix(deepCobalt, reefTurq, smoothstep(0.05, 0.55, elev));
    col = mix(col, clearCyan, smoothstep(0.55, 1.0, elev) * 0.42);

    // Apply directional wave slope lighting
    col *= waveShading;

    // Subsurface Wave Scattering (Sunlight translucent glow through crests)
    vec3 sssDir = normalize(sunDir + N * 0.35);
    float sss = pow(max(dot(V, -sssDir), 0.0), 2.5) * smoothstep(0.2, 1.8, vElevation) * 0.55;
    col += vec3(0.04, 0.85, 0.76) * sss;

    // Sun Specular Shimmer on Wave Facets
    vec3 H      = normalize(sunDir + V);
    float NdotH = max(dot(N, H), 0.0);
    float sunSpec = pow(NdotH, 128.0) * 1.5;
    col += vec3(1.0, 0.98, 0.90) * sunSpec;

    float shimmer = pow(NdotH, 24.0) * 0.16;
    col += vec3(0.85, 0.95, 1.0) * shimmer;

    // Fresnel Sky Reflection Gradient
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, 4.0);
    vec3 R = reflect(-V, N);
    float skyT = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizonCol = vec3(0.65, 0.82, 0.92);
    vec3 zenithCol  = vec3(0.12, 0.42, 0.78);
    vec3 skyReflect = mix(horizonCol, zenithCol, skyT);
    col = mix(col, skyReflect, fresnel * 0.38);

    // Sharp White Wave Crest Caps
    float crestCap = smoothstep(1.2, 2.3, vElevation);
    float fineNoise = noise(vWorldPos * 2.2 + vec2(t * 0.9, -t * 0.7));
    float crestFoam = crestCap * smoothstep(0.35, 0.75, fineNoise);

    vec3 foamCol = vec3(0.96, 1.0, 1.0);
    col = mix(col, foamCol, crestFoam * 0.85);

    float alpha = mix(0.85, 0.68, elev);
    alpha = mix(alpha, 0.95, crestFoam * 0.85);

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

  void main() {
    vec2 p = vWorldXZ * 0.30;
    float t = uTime * 1.2;

    vec3 goldenSand = vec3(0.88, 0.80, 0.62);
    vec3 wetSand    = vec3(0.60, 0.52, 0.38);

    float sandNoise = noise(p * 0.5);
    vec3 color = mix(wetSand, goldenSand, sandNoise);

    // Underwater Caustics Network
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

export function createOcean(scene: THREE.Scene): THREE.Mesh {
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

  // High-density ocean mesh plane (1200x1200 with 240x240 segments for crisp wave geometry)
  const geometry = new THREE.PlaneGeometry(1200, 1200, 240, 240)
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
  mesh.position.y = 0.0
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
    ;(mesh.userData.deepPlane.material as THREE.ShaderMaterial).uniforms.uTime.value = time
  }
  const u = (mesh.material as THREE.ShaderMaterial).uniforms
  u.uTime.value         = time
  u.uWorldOffset.value.set(playerX, playerZ)
  u.uWindDir.value.set(Math.sin(windAngle), Math.cos(windAngle))
  u.uWindStrength.value = windStrength
}

/**
 * CPU-side Gerstner 3D displacement solver that 100% mirrors the GPU vertex shader.
 * Returns exact 3D position (x, y, z) and wave surface normal (nx, ny, nz).
 */
export function getGerstnerDisplacement(
  worldX: number,
  worldZ: number,
  time: number
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } {
  let dx = 0, dy = 0, dz = 0
  let tXx = 1, tXy = 0, tXz = 0
  let tYx = 0, tYy = 1, tYz = 0

  for (const [dirX, dirZ, freq, spd, amp, Q] of WAVES) {
    const phase = (worldX * dirX + worldZ * dirZ) * freq + time * spd
    const c = Math.cos(phase)
    const s = Math.sin(phase)
    const WA  = freq * amp
    const QWA = Q * WA

    dx += dirX * Q * amp * c
    dy += amp * s
    dz += dirZ * Q * amp * c

    tXx -= dirX * dirX * QWA * s
    tXy -= dirX * dirZ * QWA * s
    tXz += dirX * WA * c

    tYx -= dirX * dirZ * QWA * s
    tYy -= dirZ * dirZ * QWA * s
    tYz += dirZ * WA * c
  }

  const nx = tXy * tYz - tXz * tYy
  const ny = tXz * tYx - tXx * tYz
  const nz = tXx * tYy - tXy * tYx
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0

  return {
    x: worldX + dx,
    y: dy,
    z: worldZ + dz,
    nx: nx / len,
    ny: ny / len,
    nz: nz / len
  }
}

export function getOceanHeight(
  worldX: number,
  worldZ: number,
  time: number,
  _windAngle: number = 0,
  _windStrength: number = 3
): number {
  return getGerstnerDisplacement(worldX, worldZ, time).y
}

// ────────────────────────── Bow Spray System ──────────────────────────
const SPRAY_POOL_SIZE = 60

export function createSprayPool(scene: THREE.Scene) {
  const sprites: THREE.Mesh[] = []
  const geom = new THREE.SphereGeometry(0.2, 6, 6)
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
    d.vx   = Math.sin(angle + spread) * (speed * 0.15 + Math.random() * 2.0)
    d.vy   = 2.0 + Math.random() * 3.5
    d.vz   = Math.cos(angle + spread) * (speed * 0.15 + Math.random() * 2.0)
    d.life = 0.4 + Math.random() * 0.5
    d.active = true

    s.position.set(
      x + Math.sin(angle) * 4 + (Math.random() - 0.5) * 2,
      0.6,
      z + Math.cos(angle) * 4 + (Math.random() - 0.5) * 2
    )
    s.visible = true;
    (s.material as THREE.MeshBasicMaterial).opacity = 0.75
    s.scale.setScalar(0.8 + Math.random() * 0.8)
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

    const fade = Math.max(0, d.life / 0.6);
    (s.material as THREE.MeshBasicMaterial).opacity = fade * 0.65
    s.scale.multiplyScalar(1 - dt * 0.5)

    if (d.life <= 0 || s.position.y < -0.5) {
      d.active = false
      s.visible = false
    }
  }
}
