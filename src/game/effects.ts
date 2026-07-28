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

const MAX_TRAIL_POINTS = 30
const MAX_TRAIL_AGE = 1.8 // seconds trail expands and fades behind vessel

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

      float foam = smoothstep(0.30, 0.70, foamTex + edgeFade * 0.25) * edgeFade * ageFade;

      vec3 wakeColor = mix(vec3(0.90, 0.98, 1.0), vec3(0.20, 0.70, 0.85), vAge);
      gl_FragColor = vec4(wakeColor, foam * 0.40 * ageFade);
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
    const sternOffset = initialWidth * 0.8
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
      const currentWidth = p.initialWidth + p.age * (0.35 + p.speed * 0.04)

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
    trail.geometry.setDrawRange(0, trail.points.length * 2)
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

export function createCannonMuzzleFlash(scene: THREE.Scene, x: number, y: number, z: number, angle: number) {
  const flashGroup = new THREE.Group()

  const flashGeom = new THREE.SphereGeometry(0.6, 8, 8)
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 1.0
  })
  const flash = new THREE.Mesh(flashGeom, flashMat)
  flashGroup.add(flash)

  for (let i = 0; i < 4; i++) {
    const smokeGeom = new THREE.SphereGeometry(0.5 + Math.random() * 0.4, 6, 6)
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.6
    })
    const smoke = new THREE.Mesh(smokeGeom, smokeMat)
    const offsetDist = 0.5 + Math.random() * 0.8
    const offsetAngle = angle + (Math.random() - 0.5) * 0.8
    smoke.position.set(
      Math.sin(offsetAngle) * offsetDist,
      (Math.random() - 0.5) * 0.3,
      Math.cos(offsetAngle) * offsetDist
    )
    smoke.userData.vx = Math.sin(offsetAngle) * (2 + Math.random() * 2)
    smoke.userData.vy = 0.5 + Math.random() * 1.0
    smoke.userData.vz = Math.cos(offsetAngle) * (2 + Math.random() * 2)
    smoke.userData.maxLife = 0.5 + Math.random() * 0.3
    smoke.userData.life = smoke.userData.maxLife
    flashGroup.add(smoke)
  }

  const flashLight = new THREE.PointLight(0xffaa22, 5, 20)
  flashLight.position.set(0, 0, 0)
  flashGroup.add(flashLight)

  flashGroup.position.set(x, y, z)
  scene.add(flashGroup)

  return {
    group: flashGroup,
    light: flashLight,
    life: 0.4,
    maxLife: 0.4
  }
}

const activeFlashes: any[] = []

export function addMuzzleFlash(flash: any) {
  activeFlashes.push(flash)
}

export function updateMuzzleFlashes(scene: THREE.Scene, dt: number) {
  for (let i = activeFlashes.length - 1; i >= 0; i--) {
    const flash = activeFlashes[i]
    flash.life -= dt

    if (flash.light) {
      flash.light.intensity = (flash.life / flash.maxLife) * 5
    }

    flash.group.children.forEach((child: any) => {
      if (child.userData.vx !== undefined) {
        child.position.x += child.userData.vx * dt
        child.position.y += child.userData.vy * dt
        child.position.z += child.userData.vz * dt
        child.userData.life -= dt
        if (child.material) {
          child.material.opacity = Math.max(0, child.userData.life / child.userData.maxLife) * 0.6
        }
      }
    })

    if (flash.life <= 0) {
      scene.remove(flash.group)
      disposeMesh(flash.group)
      activeFlashes.splice(i, 1)
    }
  }
}
