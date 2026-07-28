// @ts-nocheck
import * as THREE from 'three'
import { disposeMesh } from './helpers'
import { getGerstnerDisplacement } from './ocean'

export function createFire(scene: THREE.Scene, x: number, z: number) {
  const fireGroup = new THREE.Group()
  const flames = []

  for (let i = 0; i < 5; i++) {
    const flameGeom = new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 6, 6)
    const flameMat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0xff6600 : 0xff3300,
      transparent: true, opacity: 0.8
    })
    const flame = new THREE.Mesh(flameGeom, flameMat)
    flame.position.set(
      (Math.random() - 0.5) * 1.5,
      1.5 + Math.random() * 0.5,
      (Math.random() - 0.5) * 1.5
    )
    flame.userData.baseY = flame.position.y
    flame.userData.phase = Math.random() * Math.PI * 2
    flames.push(flame)
    fireGroup.add(flame)
  }

  for (let i = 0; i < 3; i++) {
    const smokeGeom = new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 5, 5)
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x444444, transparent: true, opacity: 0.4
    })
    const smoke = new THREE.Mesh(smokeGeom, smokeMat)
    smoke.position.set(
      (Math.random() - 0.5) * 1,
      2.5 + Math.random() * 0.5,
      (Math.random() - 0.5) * 1
    )
    smoke.userData.baseY = smoke.position.y
    smoke.userData.phase = Math.random() * Math.PI * 2
    flames.push(smoke)
    fireGroup.add(smoke)
  }

  fireGroup.position.set(x, 0, z)
  scene.add(fireGroup)
  return { mesh: fireGroup, flames }
}

// ────────────────────────── 3D Wave-Locked Ribbon Wake System ──────────────────────────
interface TrailPoint {
  origX: number
  origZ: number
  heading: number
  speed: number
  age: number
  initialWidth: number
}

interface ShipTrail {
  points: TrailPoint[]
  mesh: THREE.Mesh
  geometry: THREE.BufferGeometry
  lastEmitTime: number
}

const MAX_TRAIL_POINTS = 80
const MAX_TRAIL_AGE = 6.0 // seconds trail expands and fades behind vessel

const wakeShaderMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    attribute float aAge;
    varying vec2 vUv;
    varying float vAge;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vAge = aAge;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vAge;
    varying vec3 vWorldPos;

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
      // Soft V-shaped edge fade
      float centerFade = sin(vUv.x * 3.14159);
      float ageFade = max(0.0, 1.0 - vAge);

      // Fine scrolling foam texture along trail
      vec2 p = vWorldPos.xz * 0.4 + vec2(uTime * 0.15, -uTime * 0.08);
      float foamTex = noise(p * 2.5);

      float foam = smoothstep(0.20, 0.65, foamTex + centerFade * 0.35) * centerFade * ageFade;

      vec3 wakeColor = mix(vec3(0.95, 0.99, 1.0), vec3(0.72, 0.95, 0.98), vAge);
      gl_FragColor = vec4(wakeColor, foam * 0.85 * ageFade);
    }
  `,
  uniforms: {
    uTime: { value: 0 }
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  depthTest: true,
  polygonOffset: true,
  polygonOffsetFactor: -4.0,
  polygonOffsetUnits: -4.0
})

const shipTrails = new Map<string | number, ShipTrail>()

export function emitShipWake(
  scene: THREE.Scene,
  shipId: string | number,
  x: number,
  z: number,
  heading: number,
  speed: number,
  initialWidth = 2.4
) {
  let trail = shipTrails.get(shipId)

  if (!trail) {
    const geometry = new THREE.BufferGeometry()
    const posAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 2 * 3), 3)
    const uvAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 2 * 2), 2)
    const ageAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 2), 1)

    geometry.setAttribute('position', posAttr)
    geometry.setAttribute('uv', uvAttr)
    geometry.setAttribute('aAge', ageAttr)

    const indices: number[] = []
    for (let i = 0; i < MAX_TRAIL_POINTS - 1; i++) {
      const i2 = i * 2
      indices.push(i2, i2 + 1, i2 + 2)
      indices.push(i2 + 1, i2 + 3, i2 + 2)
    }
    geometry.setIndex(indices)

    const mesh = new THREE.Mesh(geometry, wakeShaderMaterial.clone())
    mesh.renderOrder = 2
    mesh.frustumCulled = false
    scene.add(mesh)

    trail = { points: [], mesh, geometry, lastEmitTime: 0 }
    shipTrails.set(shipId, trail)
  }

  const now = performance.now() * 0.001
  if (now - trail.lastEmitTime > 0.04) {
    const sternOffset = initialWidth * 0.8
    const sternX = x - Math.sin(heading) * sternOffset
    const sternZ = z - Math.cos(heading) * sternOffset

    trail.points.unshift({
      origX: sternX,
      origZ: sternZ,
      heading,
      speed,
      age: 0,
      initialWidth
    })

    if (trail.points.length > MAX_TRAIL_POINTS) {
      trail.points.pop()
    }
    trail.lastEmitTime = now
  }
}

export function updateShipWakes(
  scene: THREE.Scene,
  dt: number,
  time = 0,
  _windAngle = 0,
  _windStrength = 3
) {
  const now = time || performance.now() * 0.001

  shipTrails.forEach((trail) => {
    // Age trail points
    for (let i = trail.points.length - 1; i >= 0; i--) {
      trail.points[i].age += dt
      if (trail.points[i].age > MAX_TRAIL_AGE) {
        trail.points.splice(i, 1)
      }
    }

    if (trail.points.length < 2) {
      trail.mesh.visible = false
      return
    }

    trail.mesh.visible = true
    ;(trail.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = now

    const posAttr = trail.geometry.attributes.position as THREE.BufferAttribute
    const uvAttr = trail.geometry.attributes.uv as THREE.BufferAttribute
    const ageAttr = trail.geometry.attributes.aAge as THREE.BufferAttribute

    const posArr = posAttr.array as Float32Array
    const uvArr = uvAttr.array as Float32Array
    const ageArr = ageAttr.array as Float32Array

    let vertIdx = 0
    let uvIdx = 0
    let ageIdx = 0

    for (let i = 0; i < trail.points.length; i++) {
      const p = trail.points[i]
      const normAge = Math.min(1.0, p.age / MAX_TRAIL_AGE)

      // V-shaped wake widening over time
      const currentWidth = p.initialWidth + p.age * (1.1 + p.speed * 0.12)

      // Perpendicular vector to ship heading
      const perpX = Math.cos(p.heading) * currentWidth * 0.5
      const perpZ = -Math.sin(p.heading) * currentWidth * 0.5

      // Sample 3D Gerstner displacement so wake vertex moves in 100% 3D sync with ocean mesh!
      const disp = getGerstnerDisplacement(p.origX, p.origZ, now)

      // Left vertex
      posArr[vertIdx++] = disp.x - perpX
      posArr[vertIdx++] = disp.y + 0.06
      posArr[vertIdx++] = disp.z - perpZ

      // Right vertex
      posArr[vertIdx++] = disp.x + perpX
      posArr[vertIdx++] = disp.y + 0.06
      posArr[vertIdx++] = disp.z + perpZ

      const v = i / (trail.points.length - 1)
      uvArr[uvIdx++] = 0
      uvArr[uvIdx++] = v

      uvArr[uvIdx++] = 1
      uvArr[uvIdx++] = v

      ageArr[ageIdx++] = normAge
      ageArr[ageIdx++] = normAge
    }

    posAttr.needsUpdate = true
    uvAttr.needsUpdate = true
    ageAttr.needsUpdate = true

    trail.geometry.setDrawRange(0, (trail.points.length - 1) * 6)
  })
}

// Backwards-compatible legacy exports
export function spawnWakeParticle(scene: THREE.Scene, _wakeArray: any, x: number, z: number, angle: number, isEnemy: boolean) {
  const id = isEnemy ? `enemy_${x.toFixed(1)}_${z.toFixed(1)}` : 'player'
  emitShipWake(scene, id, x, z, angle, 5.0, isEnemy ? 2.0 : 2.6)
}

export function updateWakeParticles(scene: THREE.Scene, _wakeArray: any, dt: number, time = 0, windAngle = 0, windStrength = 3) {
  updateShipWakes(scene, dt, time, windAngle, windStrength)
}

/**
 * Cannon muzzle flash & billowy smoke burst
 */
interface MuzzleParticle {
  mesh: THREE.Mesh
  light?: THREE.PointLight
  life: number
  maxLife: number
  vx: number
  vy: number
  vz: number
  growth: number
  isLight?: boolean
}

const muzzleParticles: MuzzleParticle[] = []

export function createCannonMuzzleFlash(scene: THREE.Scene, pos: THREE.Vector3, dir: THREE.Vector3) {
  const flashLight = new THREE.PointLight(0xffaa22, 6, 12)
  flashLight.position.copy(pos)
  scene.add(flashLight)

  muzzleParticles.push({
    mesh: new THREE.Mesh(),
    light: flashLight,
    life: 0.12,
    maxLife: 0.12,
    vx: 0, vy: 0, vz: 0, growth: 0,
    isLight: true
  })

  const fireGeom = new THREE.SphereGeometry(0.5, 6, 6)
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.9 })
  const fireMesh = new THREE.Mesh(fireGeom, fireMat)
  fireMesh.position.copy(pos)
  scene.add(fireMesh)

  muzzleParticles.push({
    mesh: fireMesh,
    life: 0.15,
    maxLife: 0.15,
    vx: dir.x * 3,
    vy: 0.5,
    vz: dir.z * 3,
    growth: 4.0
  })

  const smokeGeom = new THREE.SphereGeometry(0.6, 6, 6)
  for (let i = 0; i < 3; i++) {
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 })
    const smokeMesh = new THREE.Mesh(smokeGeom, smokeMat)
    smokeMesh.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4
    ))
    scene.add(smokeMesh)

    muzzleParticles.push({
      mesh: smokeMesh,
      life: 0.35 + Math.random() * 0.2,
      maxLife: 0.5,
      vx: dir.x * (4 + Math.random() * 3) + (Math.random() - 0.5) * 1.5,
      vy: 1.0 + Math.random() * 1.0,
      vz: dir.z * (4 + Math.random() * 3) + (Math.random() - 0.5) * 1.5,
      growth: 3.5
    })
  }
}

export function updateMuzzleFlashes(scene: THREE.Scene, dt: number) {
  for (let i = muzzleParticles.length - 1; i >= 0; i--) {
    const p = muzzleParticles[i]
    p.life -= dt

    if (p.isLight && p.light) {
      p.light.intensity = Math.max(0, (p.life / p.maxLife) * 6)
      if (p.life <= 0) {
        scene.remove(p.light)
        p.light.dispose()
        muzzleParticles.splice(i, 1)
      }
      continue
    }

    if (p.life <= 0) {
      disposeMesh(p.mesh, scene)
      muzzleParticles.splice(i, 1)
      continue
    }

    p.mesh.position.x += p.vx * dt
    p.mesh.position.y += p.vy * dt
    p.mesh.position.z += p.vz * dt
    p.mesh.scale.addScalar(p.growth * dt)
    if (p.mesh.material) {
      p.mesh.material.opacity = (p.life / p.maxLife) * 0.6
    }
  }
}
