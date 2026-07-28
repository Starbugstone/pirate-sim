// @ts-nocheck
import * as THREE from 'three'
import { OCEAN_SIZE } from './constants'

// ─── 1. Optimized Trochoidal Gerstner Waves for 60 FPS ───
export const WAVES = [
  // direction X/Z, wave number, angular speed, amplitude, steepness.
  // The angular speeds approximate deep-water dispersion (omega = sqrt(g*k)).
  [ 0.8192,  0.5736, 0.052, 0.714, 1.45, 0.42], // long ocean swell
  [ 0.9659, -0.2588, 0.089, 0.934, 0.72, 0.36], // crossing swell
  [-0.4226,  0.9063, 0.145, 1.193, 0.34, 0.28], // wind wave
  [ 0.2588,  0.9659, 0.230, 1.502, 0.15, 0.18]  // short chop
] as const

// ─── Tiled high-frequency normal detail ───
let cachedNormalMap: THREE.Texture | null = null

function getWaterNormalMap(): THREE.Texture {
  if (cachedNormalMap) return cachedNormalMap
  cachedNormalMap = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}waternormals.jpg`)
  cachedNormalMap.wrapS = THREE.RepeatWrapping
  cachedNormalMap.wrapT = THREE.RepeatWrapping
  cachedNormalMap.minFilter = THREE.LinearMipmapLinearFilter
  cachedNormalMap.magFilter = THREE.LinearFilter
  return cachedNormalMap
}

// ────────────────────────── Vertex Shader ──────────────────────────
const vertexShader = `
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform vec2  uWorldOffset;

  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;
  varying vec2  vWorldPos;
  varying float vElevation;

  void gerstnerWave(vec2 pos, vec2 dir, float freq, float spd, float amp, float Q,
                    inout vec3 disp, inout float dhdx, inout float dhdz) {
    float phase = dot(pos, dir) * freq + uTime * spd;
    float c = cos(phase);
    float s = sin(phase);
    float WA = freq * amp;

    disp.x += dir.x * Q * amp * c;
    disp.y += amp * s;
    disp.z += dir.y * Q * amp * c;

    dhdx += dir.x * WA * c;
    dhdz += dir.y * WA * c;
  }

  void main() {
    vec2 wc = vec2(position.x + uWorldOffset.x, uWorldOffset.y - position.y);

    vec3 disp = vec3(0.0);
    float dhdx = 0.0;
    float dhdz = 0.0;

${WAVES.map((w) => `    gerstnerWave(wc, vec2(${w[0].toFixed(4)}, ${w[1].toFixed(4)}), ${w[2].toFixed(4)}, ${w[3].toFixed(4)}, ${w[4].toFixed(4)}, ${w[5].toFixed(4)}, disp, dhdx, dhdz);`
).join('\n')}

    vec3 pos = position;
    pos.x += disp.x;
    pos.y -= disp.z;
    pos.z  = disp.y;

    vec3 worldN = normalize(vec3(-dhdx, 1.0, -dhdz));
    vec4 wp = modelMatrix * vec4(pos, 1.0);

    vWorldNormal   = worldN;
    vWorldPosition = wp.xyz;
    vWorldPos      = wc;
    vElevation     = disp.y;

    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

// ────────────────────────── Fragment Shader ──────────────────────────
const fragmentShader = `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform sampler2D uNormalMap;

  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;
  varying vec2  vWorldPos;
  varying float vElevation;

  void main() {
    // Hardware accelerated scrolling normal map for 60 FPS water ripples
    vec2 uv0 = vWorldPos * 0.06 + vec2(uTime * 0.025, uTime * 0.015);
    vec2 uv1 = vWorldPos * 0.12 - vec2(uTime * 0.015, -uTime * 0.020);

    vec3 n0 = texture2D(uNormalMap, uv0).rgb * 2.0 - 1.0;
    vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
    vec3 rippleN = normalize(n0 + n1);

    vec3 N = normalize(vWorldNormal + vec3(rippleN.x * 0.18, 0.0, rippleN.y * 0.18));
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(vec3(0.40, 0.70, 0.50));

    // Caribbean water: darker troughs, translucent turquoise faces and pale crests.
    vec3 deepNavy      = vec3(0.008, 0.075, 0.16);
    vec3 shallowTurq   = vec3(0.015, 0.39, 0.50);
    vec3 crestColor    = vec3(0.32, 0.72, 0.76);

    float hFactor = smoothstep(-1.5, 1.5, vElevation);
    vec3 waterColor = mix(deepNavy, shallowTurq, hFactor * 0.58 + 0.18);
    float crest = smoothstep(0.72, 1.48, vElevation) * smoothstep(0.015, 0.10, 1.0 - N.y);
    waterColor = mix(waterColor, crestColor, crest * 0.34);

    // Directional wave lighting
    float NdotL = max(dot(N, sunDir), 0.0);
    waterColor *= (0.80 + NdotL * 0.35);

    // Sun specular sparkle
    vec3 H = normalize(sunDir + V);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 180.0) * 0.92 + pow(NdotH, 34.0) * 0.075;
    vec3 sunGlint = vec3(1.0, 0.96, 0.84) * spec;

    // Fresnel sky reflection
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.5);
    vec3 skyReflect = vec3(0.16, 0.48, 0.72);

    vec3 col = mix(waterColor, skyReflect, fresnel * 0.48) + sunGlint;

    // Semi-transparent water alpha: allows seabed & island shorelines to show through cleanly
    // Clear Caribbean water: transparent face-on, denser at grazing angles and crests.
    // This restores underwater fish/coral visibility without making reflections vanish.
    float alpha = clamp(mix(0.80, 0.94, fresnel) + crest * 0.025, 0.0, 0.96);

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`

// ────────────────────────── Sand Bed Shaders ──────────────────────────
const sandVertexShader = `
  #include <fog_pars_vertex>
  varying vec2 vWorldXZ;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldXZ = wp.xz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const sandFragmentShader = `
  #include <fog_pars_fragment>
  varying vec2 vWorldXZ;

  void main() {
    vec3 deepBed    = vec3(0.02, 0.10, 0.20);
    vec3 shallowBed = vec3(0.08, 0.35, 0.42);
    float detail = sin(vWorldXZ.x * 0.05) * cos(vWorldXZ.y * 0.05) * 0.5 + 0.5;
    vec3 col = mix(deepBed, shallowBed, detail * 0.3);

    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`

export function createOcean(scene: THREE.Scene): THREE.Mesh {
  const normalMap = getWaterNormalMap()

  // Seabed floor mesh
  const deepGeom = new THREE.PlaneGeometry(OCEAN_SIZE * 2, OCEAN_SIZE * 2, 32, 32)
  const deepMat  = new THREE.ShaderMaterial({
    vertexShader: sandVertexShader,
    fragmentShader: sandFragmentShader,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib['fog']]),
    fog: true,
    side: THREE.FrontSide
  })
  const deepPlane = new THREE.Mesh(deepGeom, deepMat)
  deepPlane.rotation.x = -Math.PI / 2
  deepPlane.position.y = -22.0
  deepPlane.frustumCulled = false
  deepPlane.renderOrder = -1
  scene.add(deepPlane)

  // Semi-transparent main ocean surface mesh (optimized geometry grid for 60 FPS)
  // Extend beyond the fog's fully opaque distance so the square mesh edge can
  // never become visible at the horizon. Shader detail keeps this inexpensive.
  const geometry = new THREE.PlaneGeometry(2200, 2200, 160, 160)

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      {
        uTime:        { value: 0 },
        uWorldOffset: { value: new THREE.Vector2(0, 0) },
        uNormalMap:   { value: normalMap }
      }
    ]),
    transparent: true,
    side: THREE.FrontSide,
    fog: true,
    depthWrite: false
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

export function setOceanIslands(
  _mesh: THREE.Mesh,
  _islands: Array<{ x: number; y?: number; z: number; radius: number }>,
  _rocks: Array<{ x: number; y?: number; z: number; radius: number }> = []
) {
  // Kept for backward compatibility
}

export function updateOcean(
  mesh: THREE.Mesh,
  time: number,
  playerX: number,
  playerZ: number,
  _windAngle: number,
  _windStrength: number
) {
  mesh.position.x = playerX
  mesh.position.z = playerZ
  if (mesh.userData.deepPlane) {
    mesh.userData.deepPlane.position.x = playerX
    mesh.userData.deepPlane.position.z = playerZ
  }
  const u = (mesh.material as THREE.ShaderMaterial).uniforms
  u.uTime.value = time
  u.uWorldOffset.value.set(playerX, playerZ)
}

export function getGerstnerDisplacement(
  worldX: number,
  worldZ: number,
  time: number
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } {
  let dx = 0, dy = 0, dz = 0
  let dhdx = 0, dhdz = 0

  for (const [dirX, dirZ, freq, spd, amp, Q] of WAVES) {
    const phase = (worldX * dirX + worldZ * dirZ) * freq + time * spd
    const c = Math.cos(phase)
    const s = Math.sin(phase)
    const WA = freq * amp

    dx += dirX * Q * amp * c
    dy += amp * s
    dz += dirZ * Q * amp * c

    dhdx += dirX * WA * c
    dhdz += dirZ * WA * c
  }

  const nx = -dhdx
  const ny = 1.0
  const nz = -dhdz
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

// ────────────────────────── Bow & Stern Spray System ──────────────────────────
const SPRAY_POOL_SIZE = 72

export function createSprayPool(scene: THREE.Scene) {
  const positions = new Float32Array(SPRAY_POOL_SIZE * 3)
  const alphas = new Float32Array(SPRAY_POOL_SIZE)
  const sizes = new Float32Array(SPRAY_POOL_SIZE)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (180.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float soft = 1.0 - smoothstep(0.02, 0.25, dot(p, p));
        gl_FragColor = vec4(0.88, 0.97, 1.0, vAlpha * soft);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 3
  scene.add(points)
  return {
    points,
    positions,
    alphas,
    sizes,
    data: Array.from({ length: SPRAY_POOL_SIZE }, () => ({ active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.6 }))
  }
}

export function emitSpray(
  pool: ReturnType<typeof createSprayPool>,
  x: number, z: number, angle: number, speed: number, count: number, surfaceY = 0
) {
  let spawned = 0
  for (let i = 0; i < pool.data.length && spawned < count; i++) {
    if (pool.data[i].active) continue
    const d = pool.data[i]

    const spread = (Math.random() - 0.5) * 0.7
    const side = Math.random() > 0.5 ? 1 : -1
    // Spray is thrown outward and aft from the stern, never projected through the hull.
    const sprayAngle = angle + Math.PI + side * (0.38 + spread)

    d.vx   = Math.sin(sprayAngle) * (speed * 0.16 + 0.8 + Math.random() * 1.6)
    d.vy   = 1.2 + Math.random() * 2.7
    d.vz   = Math.cos(sprayAngle) * (speed * 0.16 + 0.8 + Math.random() * 1.6)
    d.maxLife = 0.35 + Math.random() * 0.55
    d.life = d.maxLife
    d.active = true

    const sternDist = 6.6
    const offset = i * 3
    pool.positions[offset] = x - Math.sin(angle) * sternDist + Math.cos(angle) * side * (1.1 + Math.random() * 1.4)
    pool.positions[offset + 1] = surfaceY + 0.18 + Math.random() * 0.35
    pool.positions[offset + 2] = z - Math.cos(angle) * sternDist - Math.sin(angle) * side * (1.1 + Math.random() * 1.4)
    pool.alphas[i] = 0.72
    pool.sizes[i] = 0.65 + Math.random() * 0.9
    spawned++
  }
  pool.points.geometry.attributes.position.needsUpdate = true
  pool.points.geometry.attributes.aAlpha.needsUpdate = true
  pool.points.geometry.attributes.aSize.needsUpdate = true
}

export function updateSpray(pool: ReturnType<typeof createSprayPool>, dt: number) {
  for (let i = 0; i < pool.data.length; i++) {
    const d = pool.data[i]
    if (!d.active) continue
    const offset = i * 3

    d.life -= dt
    d.vy   -= 11.0 * dt
    pool.positions[offset] += d.vx * dt
    pool.positions[offset + 1] += d.vy * dt
    pool.positions[offset + 2] += d.vz * dt

    const fade = Math.max(0, d.life / d.maxLife)
    pool.alphas[i] = fade * 0.72
    pool.sizes[i] += dt * 0.9

    if (d.life <= 0 || pool.positions[offset + 1] < -0.5) {
      d.active = false
      pool.alphas[i] = 0
    }
  }
  pool.points.geometry.attributes.position.needsUpdate = true
  pool.points.geometry.attributes.aAlpha.needsUpdate = true
  pool.points.geometry.attributes.aSize.needsUpdate = true
}
