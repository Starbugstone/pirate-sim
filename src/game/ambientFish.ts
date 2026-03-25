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

interface FishInstance {
  // world position
  x: number; y: number; z: number
  // per-fish offsets from school center (randomized once)
  ox: number; oy: number; oz: number
  scale: number
  wiggleOffset: number
}

interface School {
  // school center (world space)
  cx: number; cz: number
  // heading angle
  angle: number
  speed: number
  fish: FishInstance[]
  turnTimer: number
}

let schools: School[] = []

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a)
}

/** Spawn a school at a random position near the player */
function spawnSchool(playerX: number, playerZ: number): School {
  // Pick a random angle and distance to place the school
  const spawnAngle = Math.random() * Math.PI * 2
  const spawnDist  = randomBetween(SPAWN_NEAR, SPAWN_FAR)
  const cx = playerX + Math.cos(spawnAngle) * spawnDist
  const cz = playerZ + Math.sin(spawnAngle) * spawnDist

  // Random swimming direction (NOT towards the player)
  const angle = Math.random() * Math.PI * 2
  const speed = SCHOOL_SPEED + randomBetween(-1, 1)

  const fish: FishInstance[] = []
  for (let i = 0; i < FISH_PER_SCHOOL; i++) {
    const scale = randomBetween(0.6, 1.8)
    fish.push({
      x: 0, y: 0, z: 0,
      ox: (Math.random() - 0.5) * SCHOOL_RADIUS,
      oy: 0,
      oz: (Math.random() - 0.5) * SCHOOL_RADIUS,
      scale,
      wiggleOffset: Math.random() * Math.PI * 2
    })
  }

  return { cx, cz, angle, speed, fish, turnTimer: randomBetween(3, 8) }
}

export function createAmbientFish(scene: THREE.Scene) {
  // Elongated fish shape — thinner and longer than a cone
  const geom = new THREE.ConeGeometry(0.3, 1.4, 4)
  geom.rotateX(Math.PI / 2) // point nose forward along +Z

  const mat = new THREE.MeshPhongMaterial({
    color: 0x2277aa,
    shininess: 60,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  })

  const mesh = new THREE.InstancedMesh(geom, mat, TOTAL_FISH)
  mesh.frustumCulled = false

  // Hide all instances initially
  const dummy = new THREE.Object3D()
  dummy.scale.set(0, 0, 0)
  dummy.updateMatrix()
  for (let i = 0; i < TOTAL_FISH; i++) {
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true

  scene.add(mesh)
  return mesh
}

export function updateAmbientFish(
  mesh: THREE.InstancedMesh,
  dt: number,
  time: number,
  playerX: number,
  playerZ: number
) {
  if (!mesh) return

  // Ensure we have schools
  while (schools.length < NUM_SCHOOLS) {
    schools.push(spawnSchool(playerX, playerZ))
  }

  const dummy = new THREE.Object3D()
  let instanceIdx = 0

  for (let si = 0; si < schools.length; si++) {
    const school = schools[si]

    // ── Move school center ──
    school.cx += Math.sin(school.angle) * school.speed * dt
    school.cz += Math.cos(school.angle) * school.speed * dt

    // Occasionally turn slightly
    school.turnTimer -= dt
    if (school.turnTimer <= 0) {
      school.angle += randomBetween(-0.6, 0.6)
      school.turnTimer = randomBetween(3, 8)
    }

    // ── Despawn if too far from player, respawn fresh ──
    const ddx = school.cx - playerX
    const ddz = school.cz - playerZ
    if (ddx * ddx + ddz * ddz > DESPAWN_DIST * DESPAWN_DIST) {
      schools[si] = spawnSchool(playerX, playerZ)
      // Don't render this frame, it'll appear next frame
      for (let fi = 0; fi < FISH_PER_SCHOOL; fi++) {
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(instanceIdx++, dummy.matrix)
      }
      continue
    }

    // ── Position each fish relative to school center ──
    for (let fi = 0; fi < school.fish.length; fi++) {
      const f = school.fish[fi]

      // Tight formation: offset rotates with school heading
      const cosA = Math.cos(school.angle)
      const sinA = Math.sin(school.angle)
      const localX = f.ox * cosA - f.oz * sinA
      const localZ = f.ox * sinA + f.oz * cosA

      f.x = school.cx + localX
      f.z = school.cz + localZ

      // Depth: vary between -1.5 and -6 below surface
      const baseDepth = -1.5 - f.scale * 2.5
      const depthWobble = Math.sin(time * 0.8 + f.wiggleOffset) * 0.4
      f.y = baseDepth + depthWobble

      // Tail wiggle: oscillate rotation around Y
      const wiggle = Math.sin(time * 6.0 + f.wiggleOffset) * 0.3

      dummy.position.set(f.x, f.y, f.z)
      dummy.rotation.set(0, school.angle + wiggle, 0)
      dummy.scale.setScalar(f.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(instanceIdx++, dummy.matrix)
    }
  }

  mesh.instanceMatrix.needsUpdate = true
}
