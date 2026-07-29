// @ts-nocheck
import * as THREE from 'three'
import { getOceanHeight } from './ocean'

/* ──────────────────────────────────────────────────────────────────────
   Rare Surface-Skimming Shark Encounter
   Spawns a rare shark swimming gracefully through the ocean with its prominent
   dorsal fin breaking and skimming the surface. The vertical position dynamically
   tracks Gerstner ocean waves so the fin stays perfectly riding the swells.
   ────────────────────────────────────────────────────────────────────── */

const MIN_SHARKS = 1
const MAX_SHARKS = 3

export interface Shark {
  mesh: THREE.Group
  dorsalFin: THREE.Mesh
  tailFin: THREE.Mesh
  x: number
  z: number
  y: number
  angle: number
  speed: number
  swimTimer: number
  isDiving: boolean
  state: 'HIDDEN' | 'APPROACHING' | 'CIRCLING' | 'LEAVING' | 'DIVING'
  orbitAngle: number
  orbitRadius: number
  orbitTravel: number
  targetOrbitTravel: number
  animationOffset: number
}

export interface SharkManager {
  sharks: Shark[]
  active: boolean
  encounterCount: number
  nextEncounterTimer: number
}

/** Create 3D Shark with origin at Waterline (Y=0). Body is submerged, Fin extends ABOVE Y=0. */
function buildSharkMesh(): { group: THREE.Group; dorsalFin: THREE.Mesh; tailFin: THREE.Mesh } {
  const group = new THREE.Group()

  const skinMat = new THREE.MeshStandardMaterial({ color: 0x1a2636, roughness: 0.3 }) // Deep navy shark skin
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xebf2fa, roughness: 0.4 }) // Light belly
  // The fins are single triangles. Render both faces so they remain visible
  // while the shark crosses either side of the player's boat.
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x121b27,
    roughness: 0.25,
    side: THREE.DoubleSide
  })

  // Torso / Main Body (submerged below Y=0)
  const bodyGeom = new THREE.ConeGeometry(0.85, 4.5, 8)
  bodyGeom.rotateX(-Math.PI / 2)
  bodyGeom.scale(0.85, 0.75, 1.0)
  const body = new THREE.Mesh(bodyGeom, skinMat)
  body.position.y = -0.65 // Submerged under water surface
  group.add(body)

  // White belly slice
  const bellyGeom = new THREE.ConeGeometry(0.78, 4.0, 8)
  bellyGeom.rotateX(-Math.PI / 2)
  bellyGeom.scale(0.8, 0.38, 0.95)
  const belly = new THREE.Mesh(bellyGeom, bellyMat)
  belly.position.y = -0.90
  group.add(belly)

  // Sharp Prominent Dorsal Fin (Base at Y=0, apex extends UP to Y=+1.6!)
  const finGeom = new THREE.BufferGeometry()
  const finVertices = new Float32Array([
    0, 0.0, 0.5,
    0, 1.65, -0.4,
    0, 0.0, -0.9
  ])
  finGeom.setAttribute('position', new THREE.BufferAttribute(finVertices, 3))
  finGeom.computeVertexNormals()
  const dorsalFin = new THREE.Mesh(finGeom, finMat)
  dorsalFin.position.set(0, 0.0, 0.1)
  group.add(dorsalFin)

  // Pectoral Fins (Submerged)
  const pecL = new THREE.Mesh(finGeom, finMat)
  pecL.scale.set(0.6, 0.6, 0.6)
  pecL.rotation.z = -Math.PI / 3
  pecL.rotation.y = -Math.PI / 6
  pecL.position.set(-0.65, -0.6, 0.4)
  group.add(pecL)

  const pecR = new THREE.Mesh(finGeom, finMat)
  pecR.scale.set(0.6, 0.6, 0.6)
  pecR.rotation.z = Math.PI / 3
  pecR.rotation.y = Math.PI / 6
  pecR.position.set(0.65, -0.6, 0.4)
  group.add(pecR)

  // Tail Fin (Caudal) — Upper lobe breaks surface (Y=+0.9)!
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, -0.5, -2.1)

  const tailGeom = new THREE.BufferGeometry()
  const tailVerts = new Float32Array([
    0, 1.35, -0.6,
    0, -0.7, -0.4,
    0, 0.0, 0.0
  ])
  tailGeom.setAttribute('position', new THREE.BufferAttribute(tailVerts, 3))
  tailGeom.computeVertexNormals()
  const tailFin = new THREE.Mesh(tailGeom, finMat)
  tailPivot.add(tailFin)
  group.add(tailPivot)

  group.scale.setScalar(2.5) // Impressive 2.5x scale
  group.visible = false
  return { group, dorsalFin, tailFin: tailPivot as any }
}

export function createShark(scene: THREE.Scene): SharkManager {
  const sharks: Shark[] = []
  for (let i = 0; i < MAX_SHARKS; i++) {
    const { group, dorsalFin, tailFin } = buildSharkMesh()
    scene.add(group)
    sharks.push({
      mesh: group,
      dorsalFin,
      tailFin,
      x: 0,
      z: 0,
      y: 0,
      angle: 0,
      speed: 7.5,
      swimTimer: 0,
      isDiving: false,
      state: 'HIDDEN',
      orbitAngle: 0,
      orbitRadius: 30,
      orbitTravel: 0,
      targetOrbitTravel: Math.PI * 4,
      animationOffset: Math.random() * Math.PI * 2
    })
  }
  return {
    sharks,
    active: false,
    encounterCount: 0,
    nextEncounterTimer: 18 + Math.random() * 22,
  }
}

function configureShark(shark: Shark, playerX: number, playerZ: number, playerAngle: number, circling: boolean) {
  const spawnAngle = circling ? playerAngle + Math.random() * Math.PI * 2 : Math.random() * Math.PI * 2
  shark.orbitRadius = 25 + Math.random() * 11
  shark.orbitAngle = spawnAngle
  const dist = circling ? shark.orbitRadius : 88 + Math.random() * 35
  shark.x = playerX + Math.sin(spawnAngle) * dist
  shark.z = playerZ + Math.cos(spawnAngle) * dist
  shark.angle = circling
    ? shark.orbitAngle + Math.PI / 2
    : Math.atan2(playerX - shark.x, playerZ - shark.z)
  shark.speed = 7.5 + Math.random() * 2.5
  shark.swimTimer = 75
  shark.orbitTravel = 0
  shark.targetOrbitTravel = Math.PI * (4 + Math.floor(Math.random() * 3))
  shark.animationOffset = Math.random() * Math.PI * 2
  shark.isDiving = false
  shark.state = circling ? 'CIRCLING' : 'APPROACHING'
  shark.mesh.visible = true
}

function beginSharkEncounter(manager: SharkManager, playerX: number, playerZ: number, playerAngle = 0, circling = false) {
  manager.encounterCount = MIN_SHARKS + Math.floor(Math.random() * (MAX_SHARKS - MIN_SHARKS + 1))
  manager.active = true
  manager.sharks.forEach((shark, index) => {
    if (index < manager.encounterCount) configureShark(shark, playerX, playerZ, playerAngle, circling)
    else {
      shark.state = 'HIDDEN'
      shark.mesh.visible = false
    }
  })
}

/** Force spawn 1-3 sharks next to the player for instant visual testing. */
export function forceSpawnShark(manager: SharkManager, playerX: number, playerZ: number, playerAngle = 0) {
  if (!manager) return
  beginSharkEncounter(manager, playerX, playerZ, playerAngle, true)
}

/** Cannon fire sends every active shark rapidly away from the hull. */
export function scareShark(manager: SharkManager, playerX: number, playerZ: number) {
  if (!manager?.active) return
  manager.sharks.forEach(shark => {
    if (shark.state === 'HIDDEN') return
    shark.angle = Math.atan2(shark.x - playerX, shark.z - playerZ)
    shark.speed = Math.max(shark.speed, 13)
    shark.state = 'LEAVING'
    shark.swimTimer = 12
    shark.isDiving = false
  })
}

export function hideSharks(manager: SharkManager) {
  if (!manager) return
  manager.sharks.forEach(shark => {
    shark.state = 'HIDDEN'
    shark.mesh.visible = false
  })
  manager.active = false
  manager.nextEncounterTimer = 55 + Math.random() * 65
}

export function updateShark(
  manager: SharkManager,
  dt: number,
  time: number,
  playerX: number,
  playerZ: number,
  windAngle = 0,
  windSpeed = 3
) {
  if (!manager) return

  // Manage rare spawn timer
  if (!manager.active) {
    manager.nextEncounterTimer -= dt
    if (manager.nextEncounterTimer <= 0) beginSharkEncounter(manager, playerX, playerZ)
    return
  }

  manager.sharks.forEach(shark => {
    if (shark.state === 'HIDDEN') return
    shark.swimTimer -= dt

    const distanceToPlayer = Math.hypot(shark.x - playerX, shark.z - playerZ)
    if (shark.state === 'APPROACHING') {
      shark.angle = Math.atan2(playerX - shark.x, playerZ - shark.z)
      shark.x += Math.sin(shark.angle) * shark.speed * dt
      shark.z += Math.cos(shark.angle) * shark.speed * dt
      if (distanceToPlayer <= shark.orbitRadius + 4) {
        shark.state = 'CIRCLING'
        shark.orbitAngle = Math.atan2(shark.x - playerX, shark.z - playerZ)
        shark.orbitTravel = 0
      }
    } else if (shark.state === 'CIRCLING') {
      const step = (shark.speed / shark.orbitRadius) * dt
      shark.orbitAngle += step
      shark.orbitTravel += step
      const targetX = playerX + Math.sin(shark.orbitAngle) * shark.orbitRadius
      const targetZ = playerZ + Math.cos(shark.orbitAngle) * shark.orbitRadius
      shark.x += (targetX - shark.x) * Math.min(1, 5 * dt)
      shark.z += (targetZ - shark.z) * Math.min(1, 5 * dt)
      shark.angle = shark.orbitAngle + Math.PI / 2
      if (shark.orbitTravel >= shark.targetOrbitTravel || shark.swimTimer <= 0) {
        shark.state = 'LEAVING'
        shark.angle = Math.atan2(shark.x - playerX, shark.z - playerZ)
        shark.swimTimer = 14
      }
    } else if (shark.state === 'LEAVING') {
      shark.speed = Math.min(15, shark.speed + 3 * dt)
      shark.x += Math.sin(shark.angle) * shark.speed * dt
      shark.z += Math.cos(shark.angle) * shark.speed * dt
      if (distanceToPlayer > 105 || shark.swimTimer <= 0) {
        shark.state = 'DIVING'
        shark.isDiving = true
      }
    }

    const oceanY = getOceanHeight(shark.x, shark.z, time, windAngle, windSpeed)
    const targetY = shark.state === 'DIVING' ? oceanY - 12 : oceanY
    shark.y += (targetY - shark.y) * (shark.isDiving ? 1.2 : 5) * dt

    if (shark.isDiving && shark.y < oceanY - 10) {
      shark.mesh.visible = false
      shark.state = 'HIDDEN'
      return
    }

    shark.mesh.position.set(shark.x, shark.y, shark.z)
    shark.mesh.rotation.set(0, shark.angle, Math.sin(time * 3.5 + shark.animationOffset) * 0.08)
    shark.tailFin.rotation.y = Math.sin(time * 7.5 + shark.animationOffset) * 0.55
  })

  if (manager.sharks.every(shark => shark.state === 'HIDDEN')) {
    manager.active = false
    manager.nextEncounterTimer = 55 + Math.random() * 65
  }
}
