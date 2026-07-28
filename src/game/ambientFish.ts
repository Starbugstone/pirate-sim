// @ts-nocheck
import * as THREE from 'three'

/* ──────────────────────────────────────────────────────────────────────
   Ambient Fish Schools
   ──────────────────────────────────────────────────────────────────────
   Spawns 4-5 schools of 10-14 fish each. Each school is a tight flock
   that swims together in a shared direction across the world.
   Schools spawn randomly 60-150 units from the player and despawn once
   they've drifted >200 units away, at which point a replacement school
   spawns on the opposite side of the player.
   ────────────────────────────────────────────────────────────────────── */

const NUM_SCHOOLS       = 5
const FISH_PER_SCHOOL   = 12
const TOTAL_FISH        = NUM_SCHOOLS * FISH_PER_SCHOOL
const SPAWN_NEAR        = 60   // min distance from player on spawn
const SPAWN_FAR         = 150  // max distance from player on spawn
const DESPAWN_DIST      = 350  // remove school once this far (past fog boundary)
const SCHOOL_RADIUS     = 8    // how tightly fish cluster
const SCHOOL_SPEED      = 4    // units/s — fast enough to be clearly moving

const TROPICAL_SPECIES_COLORS = [
  new THREE.Color(0x0077ff), // Royal Blue Tang
  new THREE.Color(0xffb700), // Golden Yellow Butterflyfish
  new THREE.Color(0x00f0ff), // Electric Cyan Chromis
  new THREE.Color(0xff0066), // Magenta Basslet
  new THREE.Color(0xff5500), // Flame Angel
  new THREE.Color(0x22ee99)  // Emerald Parrotfish
]

interface FishInstance {
  x: number; y: number; z: number
  ox: number; oy: number; oz: number
  scale: number
  wiggleOffset: number
  color: THREE.Color
}

interface School {
  cx: number; cz: number
  angle: number
  speed: number
  fish: FishInstance[]
  turnTimer: number
}

let schools: School[] = []
const fishTransform = new THREE.Object3D()

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function createTropicalFishGeometry(): THREE.BufferGeometry {
  const body = new THREE.ConeGeometry(0.35, 1.4, 6)
  body.rotateX(Math.PI / 2)
  body.scale(0.35, 0.85, 1.0)

  const tail = new THREE.ConeGeometry(0.35, 0.55, 3)
  tail.rotateZ(Math.PI / 2)
  tail.scale(0.15, 1.2, 0.7)
  tail.translate(0, 0, -0.75)

  const dorsal = new THREE.ConeGeometry(0.25, 0.45, 3)
  dorsal.rotateX(-Math.PI / 4)
  dorsal.scale(0.12, 1.0, 0.8)
  dorsal.translate(0, 0.35, -0.1)

  const bGeom = body.toNonIndexed()
  const tGeom = tail.toNonIndexed()
  const dGeom = dorsal.toNonIndexed()

  const bPos = bGeom.attributes.position
  const tPos = tGeom.attributes.position
  const dPos = dGeom.attributes.position

  const totalVerts = bPos.count + tPos.count + dPos.count
  const positions = new Float32Array(totalVerts * 3)

  let offset = 0
  for (let i = 0; i < bPos.count; i++) {
    positions[offset++] = bPos.getX(i)
    positions[offset++] = bPos.getY(i)
    positions[offset++] = bPos.getZ(i)
  }
  for (let i = 0; i < tPos.count; i++) {
    positions[offset++] = tPos.getX(i)
    positions[offset++] = tPos.getY(i)
    positions[offset++] = tPos.getZ(i)
  }
  for (let i = 0; i < dPos.count; i++) {
    positions[offset++] = dPos.getX(i)
    positions[offset++] = dPos.getY(i)
    positions[offset++] = dPos.getZ(i)
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.computeVertexNormals()
  merged.computeBoundingSphere()
  merged.computeBoundingBox()
  return merged
}

/** Spawn a school at a random position near the player */
function spawnSchool(playerX: number, playerZ: number): School {
  const spawnAngle = Math.random() * Math.PI * 2
  const spawnDist  = randomBetween(SPAWN_NEAR, SPAWN_FAR)
  const cx = playerX + Math.cos(spawnAngle) * spawnDist
  const cz = playerZ + Math.sin(spawnAngle) * spawnDist

  const angle = Math.random() * Math.PI * 2
  const speed = SCHOOL_SPEED + randomBetween(-1, 1)

  // Pick school species color theme
  const speciesColor = TROPICAL_SPECIES_COLORS[Math.floor(Math.random() * TROPICAL_SPECIES_COLORS.length)]
  return {
    cx,
    cz,
    angle: Math.random() * Math.PI * 2,
    speed: 10.0 + Math.random() * 6.0,
    turnTimer: randomBetween(2, 5),
    fish: Array.from({ length: FISH_PER_SCHOOL }, () => ({
      ox: randomBetween(-14, 14),
      oy: randomBetween(-0.5, 0.8),
      oz: randomBetween(-14, 14),
      x: 0, y: -2.2, z: 0,
      scale: randomBetween(1.0, 1.8), // Vibrant tropical fish size
      color: speciesColor.clone().offsetHSL((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08),
      wiggleOffset: Math.random() * Math.PI * 2
    }))
  }
}

export function createAmbientFish(scene: THREE.Scene) {
  const geom = createTropicalFishGeometry()

  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.25,
    metalness: 0.15,
    flatShading: false,
    side: THREE.DoubleSide
  })

  const instancedMesh = new THREE.InstancedMesh(geom, mat, TOTAL_FISH)
  instancedMesh.frustumCulled = false

  const dummy = fishTransform
  dummy.scale.set(0, 0, 0)
  dummy.updateMatrix()
  for (let i = 0; i < TOTAL_FISH; i++) {
    instancedMesh.setMatrixAt(i, dummy.matrix)
  }
  instancedMesh.instanceMatrix.needsUpdate = true

  scene.add(instancedMesh)
  return instancedMesh
}

export function updateAmbientFish(
  mesh: THREE.InstancedMesh,
  dt: number,
  time: number,
  playerX: number,
  playerZ: number
) {
  if (!mesh) return

  while (schools.length < NUM_SCHOOLS) {
    schools.push(spawnSchool(playerX, playerZ))
  }

  const dummy = fishTransform
  let instanceIdx = 0

  for (let si = 0; si < schools.length; si++) {
    const school = schools[si]

    // Move school center forward through the water
    school.cx += Math.sin(school.angle) * school.speed * dt
    school.cz += Math.cos(school.angle) * school.speed * dt

    school.turnTimer -= dt
    if (school.turnTimer <= 0) {
      school.angle += randomBetween(-0.5, 0.5)
      school.turnTimer = randomBetween(2.5, 6)
    }

    const ddx = school.cx - playerX
    const ddz = school.cz - playerZ
    if (ddx * ddx + ddz * ddz > DESPAWN_DIST * DESPAWN_DIST) {
      schools[si] = spawnSchool(playerX, playerZ)
      for (let fi = 0; fi < FISH_PER_SCHOOL; fi++) {
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(instanceIdx++, dummy.matrix)
      }
      continue
    }

    for (let fi = 0; fi < school.fish.length; fi++) {
      const f = school.fish[fi]

      const cosA = Math.cos(school.angle)
      const sinA = Math.sin(school.angle)
      const localX = f.ox * cosA - f.oz * sinA
      const localZ = f.ox * sinA + f.oz * cosA

      f.x = school.cx + localX
      f.z = school.cz + localZ

      // Submerged depth (y = -2.2 to -3.2) — safely beneath waves, crystal clear visibility
      const baseDepth = -2.2 - f.scale * 0.4 + f.oy * 0.3
      const depthWobble = Math.sin(time * 2.2 + f.wiggleOffset) * 0.3
      f.y = baseDepth + depthWobble

      // Dynamic swimming animation (tail wiggling, pitch & roll)
      const wiggle = Math.sin(time * 12.0 + f.wiggleOffset) * 0.45
      const pitch  = Math.cos(time * 2.2 + f.wiggleOffset) * 0.15
      const roll   = Math.sin(time * 1.8 + f.wiggleOffset) * 0.10

      dummy.position.set(f.x, f.y, f.z)
      dummy.rotation.set(pitch, school.angle + wiggle, roll)
      dummy.scale.setScalar(f.scale)
      dummy.updateMatrix()

      mesh.setMatrixAt(instanceIdx, dummy.matrix)
      mesh.setColorAt(instanceIdx, f.color)
      instanceIdx++
    }
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
