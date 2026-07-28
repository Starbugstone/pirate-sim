// @ts-nocheck
import * as THREE from 'three'
import { OCEAN_SIZE } from './constants'

// ─── 1. Optimized Trochoidal Gerstner Waves for 60 FPS ───
export const WAVES = [
  [ 0.7071,  0.7071, 0.035, 1.25, 1.80, 0.65], // Primary Swell (1.8m)
  [-0.8660,  0.5000, 0.065, 1.50, 0.90, 0.55], // Cross Chop (0.9m)
  [ 0.3420, -0.9397, 0.120, 2.00, 0.40, 0.45]  // Surface Ripples (0.4m)
] as const

// ─── Procedural Seamless Normal Map Texture Generator ───
let cachedNormalMap: THREE.CanvasTexture | null = null

function getWaterNormalMap(): THREE.CanvasTexture {
  if (cachedNormalMap) return cachedNormalMap

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(size, size)
  const data = imgData.data

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const u = (x / size) * Math.PI * 4
      const v = (y / size) * Math.PI * 4

      const dx = Math.cos(u * 2.0 + v) * 0.4 + Math.sin(u * 4.0 - v * 2.0) * 0.2
      const dy = Math.sin(v * 2.0 + u) * 0.4 + Math.cos(v * 4.0 - u * 2.0) * 0.2
      const dz = 1.0

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      data[idx]     = Math.floor(((dx / len) * 0.5 + 0.5) * 255)
      data[idx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255)
      data[idx + 2] = Math.floor(((dz / len) * 0.5 + 0.5) * 255)
      data[idx + 3] = 255
    }
  }
  ctx.putImageData(imgData, 0, 0)
  cachedNormalMap = new THREE.CanvasTexture(canvas)
  cachedNormalMap.wrapS = THREE.RepeatWrapping
  cachedNormalMap.wrapT = THREE.RepeatWrapping
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

    // Semi-Transparent Caribbean Water Palette
    vec3 deepNavy      = vec3(0.01, 0.15, 0.32); // Deep blue sea
    vec3 shallowTurq   = vec3(0.02, 0.55, 0.68); // Tropical shallow cyan

    float hFactor = smoothstep(-1.5, 1.5, vElevation);
    vec3 waterColor = mix(deepNavy, shallowTurq, hFactor * 0.5 + 0.25);

    // Directional wave lighting
    float NdotL = max(dot(N, sunDir), 0.0);
    waterColor *= (0.80 + NdotL * 0.35);

    // Sun specular sparkle
    vec3 H = normalize(sunDir + V);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 128.0) * 1.4;
    vec3 sunGlint = vec3(1.0, 0.96, 0.84) * spec;

    // Fresnel sky reflection
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.5);
    vec3 skyReflect = vec3(0.20, 0.55, 0.80);

    vec3 col = mix(waterColor, skyReflect, fresnel * 0.30) + sunGlint;

    // Semi-transparent water alpha: allows seabed & island shorelines to show through cleanly
    float alpha = mix(0.80, 0.90, fresnel * 0.4);

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
  const geometry = new THREE.PlaneGeometry(1000, 1000, 80, 80)

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
const SPRAY_POOL_SIZE = 40

export function createSprayPool(scene: THREE.Scene) {
  const sprites: THREE.Mesh[] = []
  const geom = new THREE.SphereGeometry(0.25, 6, 6)
  const mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })

  for (let i = 0; i < SPRAY_POOL_SIZE; i++) {
    const m = new THREE.Mesh(geom, mat)
    m.visible = false
    scene.add(m)
    sprites.push(m)
  }
  return {
    sprites,
    data: sprites.map(() => ({ active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.6 }))
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

    const spread = (Math.random() - 0.5) * 1.5
    const side = Math.random() > 0.5 ? 1 : -1
    const sprayAngle = angle + side * (Math.PI * 0.4 + spread * 0.3)

    d.vx   = Math.sin(sprayAngle) * (speed * 0.25 + Math.random() * 2.5)
    d.vy   = 2.5 + Math.random() * 4.0
    d.vz   = Math.cos(sprayAngle) * (speed * 0.25 + Math.random() * 2.5)
    d.maxLife = 0.4 + Math.random() * 0.5
    d.life = d.maxLife
    d.active = true

    const bowDist = 3.5
    s.position.set(
      x + Math.sin(angle) * bowDist + (Math.random() - 0.5) * 1.5,
      0.6,
      z + Math.cos(angle) * bowDist + (Math.random() - 0.5) * 1.5
    )
    s.visible = true;
    (s.material as THREE.MeshBasicMaterial).opacity = 0.80
    s.scale.setScalar(0.7 + Math.random() * 0.9)
    spawned++
  }
}

export function updateSpray(pool: ReturnType<typeof createSprayPool>, dt: number) {
  for (let i = 0; i < pool.data.length; i++) {
    const d = pool.data[i]
    if (!d.active) continue
    const s = pool.sprites[i]

    d.life -= dt
    d.vy   -= 11.0 * dt
    s.position.x += d.vx * dt
    s.position.y += d.vy * dt
    s.position.z += d.vz * dt

    const fade = Math.max(0, d.life / d.maxLife);
    (s.material as THREE.MeshBasicMaterial).opacity = fade * 0.75
    s.scale.multiplyScalar(1 + dt * 0.8)

    if (d.life <= 0 || s.position.y < -0.5) {
      d.active = false
      s.visible = false
    }
  }
}

