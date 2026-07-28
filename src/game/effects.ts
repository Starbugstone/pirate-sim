// @ts-nocheck
import * as THREE from 'three'
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

const MAX_TRAIL_POINTS = 48
const MAX_TRAIL_AGE = 2.4 // seconds trail expands and fades behind vessel

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
      float edgeFade = sin(vUv.x * 3.14159);
      float ageFade = pow(max(0.0, 1.0 - vAge), 1.6);

      // Fine scrolling foam stream
      vec2 p = vWorldPos.xz * 0.4 + vec2(uTime * 0.12, -uTime * 0.08);
      float foamTex = noise(p * 3.0);

      float brokenFoam = smoothstep(0.28, 0.68, foamTex + edgeFade * 0.30);
      float foam = (0.28 + brokenFoam * 0.72) * edgeFade * ageFade;

      vec3 wakeColor = mix(vec3(0.97, 1.0, 1.0), vec3(0.48, 0.82, 0.90), vAge);
      gl_FragColor = vec4(wakeColor, foam * 0.86 * ageFade);
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
  initialWidth = 1.6
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
  if (now - trail.lastEmitTime > 0.05) {
    // Width scales with hull size in the callers, so it is also a reliable
    // approximation of the stern distance. This keeps foam behind the transom.
    const sternOffset = initialWidth * 3.75
    const sternX = x - Math.sin(heading) * sternOffset
    const sternZ = z - Math.cos(heading) * sternOffset

    // Distance sanity check: clear trail if ship jumped > 4 units in a single step (prevents long stretched lines)
    if (trail.points.length > 0) {
      const lastP = trail.points[0]
      const dx = sternX - lastP.origX
      const dz = sternZ - lastP.origZ
      if (dx * dx + dz * dz > 16.0) {
        trail.points = []
      }
    }

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
      const currentWidth = p.initialWidth + p.age * (0.55 + p.speed * 0.075)

      // Perpendicular vector to ship heading
      const perpX = Math.cos(p.heading) * currentWidth * 0.5
      const perpZ = -Math.sin(p.heading) * currentWidth * 0.5

      // Sample 3D Gerstner displacement so wake vertex moves in 100% 3D sync with ocean mesh!
      const disp = getGerstnerDisplacement(p.origX, p.origZ, now)

      // Left vertex
      posArr[vertIdx++] = disp.x - perpX
      posArr[vertIdx++] = disp.y + 0.04
      posArr[vertIdx++] = disp.z - perpZ

      // Right vertex
      posArr[vertIdx++] = disp.x + perpX
      posArr[vertIdx++] = disp.y + 0.04
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

    if (posAttr.updateRange) {
      posAttr.updateRange.offset = 0
      posAttr.updateRange.count = vertIdx
    }
    if (uvAttr.updateRange) {
      uvAttr.updateRange.offset = 0
      uvAttr.updateRange.count = uvIdx
    }
    if (ageAttr.updateRange) {
      ageAttr.updateRange.offset = 0
      ageAttr.updateRange.count = ageIdx
    }
    trail.geometry.setDrawRange(0, Math.max(0, (trail.points.length - 1) * 6))
  })
}

// Legacy wrapper supporting both direct shipId or legacy object arguments
export function spawnWakeParticle(
  scene: THREE.Scene,
  shipIdOrArray: any,
  x: number,
  z: number,
  heading: number,
  speedOrIsEnemy: number | boolean = 3,
  width = 1.6
) {
  let shipId: string | number = 'player'
  let speed = typeof speedOrIsEnemy === 'number' ? speedOrIsEnemy : 3.0

  if (typeof shipIdOrArray === 'string' || typeof shipIdOrArray === 'number') {
    shipId = shipIdOrArray
  } else if (speedOrIsEnemy === true) {
    shipId = `enemy_${Math.round(x * 10)}_${Math.round(z * 10)}`
  }

  emitShipWake(scene, shipId, x, z, heading, speed, width)
}

export function updateWakeParticles(scene: THREE.Scene, _wakeArray: any, dt: number, time = 0, windAngle = 0, windStrength = 3) {
  updateShipWakes(scene, dt, time, windAngle, windStrength)
}

export function clearShipWakes(scene: THREE.Scene) {
  shipTrails.forEach((trail) => {
    scene.remove(trail.mesh)
    trail.geometry.dispose()
    ;(trail.mesh.material as THREE.Material).dispose()
  })
  shipTrails.clear()
}

const MAX_ACTIVE_MUZZLE_FLASHES = 24
const muzzleFlashGeometry = new THREE.SphereGeometry(0.6, 6, 6)
const muzzleFlashMaterial = new THREE.MeshBasicMaterial({
  color: 0xffaa00,
  transparent: true,
  opacity: 0.9,
  depthWrite: false
})
const muzzleSmokeMaterial = new THREE.PointsMaterial({
  color: 0x888888,
  size: 0.85,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  sizeAttenuation: true
})

const activeFlashes: any[] = []

function removeMuzzleFlash(scene: THREE.Scene, flash: any) {
  scene.remove(flash.group)
  flash.smoke.geometry.dispose()
}

export function createCannonMuzzleFlash(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3) {
  // A broadside can create many effects at once. Bound the count so overlapping
  // player/enemy volleys cannot grow the render list without limit.
  if (activeFlashes.length >= MAX_ACTIVE_MUZZLE_FLASHES) {
    removeMuzzleFlash(scene, activeFlashes.shift())
  }

  const flashGroup = new THREE.Group()
  const flash = new THREE.Mesh(muzzleFlashGeometry, muzzleFlashMaterial)
  flashGroup.add(flash)

  const smokePositions = new Float32Array(12)
  const smokeVelocities = new Float32Array(12)
  const fireDirection = direction.clone().normalize()
  for (let i = 0; i < 4; i++) {
    const offsetDist = 0.5 + Math.random() * 0.8
    const spreadX = (Math.random() - 0.5) * 0.45
    const spreadZ = (Math.random() - 0.5) * 0.45
    const velocity = 2 + Math.random() * 2
    const offset = i * 3
    smokePositions[offset] = fireDirection.x * offsetDist + spreadX
    smokePositions[offset + 1] = (Math.random() - 0.5) * 0.3
    smokePositions[offset + 2] = fireDirection.z * offsetDist + spreadZ
    smokeVelocities[offset] = (fireDirection.x + spreadX) * velocity
    smokeVelocities[offset + 1] = 0.5 + Math.random()
    smokeVelocities[offset + 2] = (fireDirection.z + spreadZ) * velocity
  }

  const smokeGeometry = new THREE.BufferGeometry()
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3))
  const smoke = new THREE.Points(smokeGeometry, muzzleSmokeMaterial)
  flashGroup.add(smoke)

  flashGroup.position.copy(position)
  scene.add(flashGroup)

  const effect = {
    group: flashGroup,
    flash,
    smoke,
    smokeVelocities,
    life: 0.4,
    maxLife: 0.4
  }
  activeFlashes.push(effect)
  return effect
}

export function updateMuzzleFlashes(scene: THREE.Scene, dt: number) {
  for (let i = activeFlashes.length - 1; i >= 0; i--) {
    const flash = activeFlashes[i]
    flash.life -= dt

    const lifeRatio = Math.max(0, flash.life / flash.maxLife)
    flash.flash.scale.setScalar(lifeRatio)

    const positions = flash.smoke.geometry.attributes.position.array
    for (let p = 0; p < positions.length; p += 3) {
      positions[p] += flash.smokeVelocities[p] * dt
      positions[p + 1] += flash.smokeVelocities[p + 1] * dt
      positions[p + 2] += flash.smokeVelocities[p + 2] * dt
    }
    flash.smoke.geometry.attributes.position.needsUpdate = true
    flash.smoke.scale.setScalar(1 + (1 - lifeRatio) * 0.8)

    if (flash.life <= 0) {
      removeMuzzleFlash(scene, flash)
      activeFlashes.splice(i, 1)
    }
  }
}

export function clearMuzzleFlashes(scene: THREE.Scene) {
  for (const flash of activeFlashes) removeMuzzleFlash(scene, flash)
  activeFlashes.length = 0
}
