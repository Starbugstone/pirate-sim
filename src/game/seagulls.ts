// @ts-nocheck
import * as THREE from 'three'
import { playSeagullSound } from './audio'

/* ──────────────────────────────────────────────────────────────────────
   Ambient Seagulls System
   Occasional flocks approach the ship, circle briefly, sometimes land on a
   sail's upper yard, and then leave the area again.
   ────────────────────────────────────────────────────────────────────── */

const MIN_SEAGULLS = 3
const MAX_SEAGULLS = 6
const SPAWN_DIST = 115
const DESPAWN_DIST = 190
const SHIP_CIRCLE_RADIUS = 15

export interface Seagull {
  group: THREE.Group
  wingL: THREE.Mesh
  wingR: THREE.Mesh
  head: THREE.Mesh
  state: 'HIDDEN' | 'APPROACHING' | 'CIRCLING' | 'LANDING' | 'PERCHED' | 'TAKEOFF' | 'LEAVING'
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  circleAngle: number
  circleRadius: number
  circleHeight: number
  stateTimer: number
  perchDuration: number
  landAttempted: boolean
  squawkTimer: number
  perchOffset: number
  animationOffset: number
}

export interface SeagullManager {
  birds: Seagull[]
  active: boolean
  encounterCount: number
  nextEncounterTimer: number
  sailWorldPosition: THREE.Vector3
}

/** Create a detailed low-poly 3D Seagull model with articulated wing pivots */
function createSeagullMesh(): { group: THREE.Group; wingL: THREE.Mesh; wingR: THREE.Mesh; head: THREE.Mesh } {
  const group = new THREE.Group()

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }) // Pure white plumage
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x7a8694, roughness: 0.5 }) // Grey wing backs & dark tips
  const beakMat = new THREE.MeshPhongMaterial({ color: 0xffaa00, shininess: 40 })    // Bright yellow beak
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 })

  // Body
  const bodyGeom = new THREE.ConeGeometry(0.35, 1.4, 8)
  bodyGeom.rotateX(-Math.PI / 2)
  bodyGeom.scale(0.9, 0.8, 1.0)
  const body = new THREE.Mesh(bodyGeom, bodyMat)
  group.add(body)

  // Head
  const headGeom = new THREE.SphereGeometry(0.28, 8, 8)
  headGeom.scale(0.95, 1.0, 1.1)
  const head = new THREE.Mesh(headGeom, bodyMat)
  head.position.set(0, 0.2, 0.7)
  group.add(head)

  // Beak
  const beakGeom = new THREE.ConeGeometry(0.09, 0.4, 6)
  beakGeom.rotateX(Math.PI / 2)
  const beak = new THREE.Mesh(beakGeom, beakMat)
  beak.position.set(0, 0.15, 1.05)
  group.add(beak)

  // Eyes
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat)
  eyeL.position.set(-0.14, 0.25, 0.8)
  group.add(eyeL)
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat)
  eyeR.position.set(0.14, 0.25, 0.8)
  group.add(eyeR)

  // Tail
  const tailGeom = new THREE.BoxGeometry(0.4, 0.05, 0.6)
  const tail = new THREE.Mesh(tailGeom, bodyMat)
  tail.position.set(0, 0.08, -0.85)
  tail.rotation.x = -0.15
  group.add(tail)

  // Left Wing Pivot Group
  const wingPivotL = new THREE.Group()
  wingPivotL.position.set(-0.28, 0.14, 0.1)
  const wingGeomL = new THREE.BoxGeometry(1.4, 0.05, 0.48)
  wingGeomL.translate(-0.65, 0, 0)
  const wingL = new THREE.Mesh(wingGeomL, wingMat)
  wingPivotL.add(wingL)
  group.add(wingPivotL)

  // Right Wing Pivot Group
  const wingPivotR = new THREE.Group()
  wingPivotR.position.set(0.28, 0.14, 0.1)
  const wingGeomR = new THREE.BoxGeometry(1.4, 0.05, 0.48)
  wingGeomR.translate(0.65, 0, 0)
  const wingR = new THREE.Mesh(wingGeomR, wingMat)
  wingPivotR.add(wingR)
  group.add(wingPivotR)

  group.scale.setScalar(1.45) // Larger scale for clear visual visibility from camera
  return { group, wingL: wingPivotL, wingR: wingPivotR, head }
}

export function createSeagulls(scene: THREE.Scene): SeagullManager {
  const birds: Seagull[] = []

  for (let i = 0; i < MAX_SEAGULLS; i++) {
    const { group, wingL, wingR, head } = createSeagullMesh()
    group.visible = false
    scene.add(group)

    const bird: Seagull = {
      group,
      wingL,
      wingR,
      head,
      state: 'HIDDEN',
      x: 0, y: 22, z: 0,
      vx: 0, vy: 0, vz: 0,
      circleAngle: Math.random() * Math.PI * 2,
      circleRadius: SHIP_CIRCLE_RADIUS + (i % 2) * 4,
      circleHeight: 22 + (i % 3) * 2,
      stateTimer: 15,
      perchDuration: 3.5,
      landAttempted: false,
      squawkTimer: 2 + i * 3,
      perchOffset: (i - (MAX_SEAGULLS - 1) / 2) * 0.8,
      animationOffset: Math.random() * Math.PI * 2
    }
    birds.push(bird)
  }

  return {
    birds,
    active: false,
    encounterCount: 0,
    nextEncounterTimer: 12 + Math.random() * 18,
    sailWorldPosition: new THREE.Vector3()
  }
}

/** Get a perch point along the top yard of the main sail. */
function getPlayerSailTopWorld(playerShip: THREE.Group, targetVec: THREE.Vector3, xOffset = 0): THREE.Vector3 {
  if (!playerShip) {
    targetVec.set(xOffset, 17, 0)
    return targetVec
  }
  const mainSail = playerShip.userData?.sails?.[0]
  if (mainSail) {
    const height = mainSail.geometry?.parameters?.height || 9.5
    targetVec.set(xOffset, height / 2 + 0.28, 0.08)
    return mainSail.localToWorld(targetVec)
  }
  targetVec.set(xOffset, 16.9, -0.5)
  return playerShip.localToWorld(targetVec)
}

function beginSeagullEncounter(manager: SeagullManager, playerX: number, playerZ: number, debug = false) {
  const approachAngle = Math.random() * Math.PI * 2
  manager.encounterCount = MIN_SEAGULLS + Math.floor(Math.random() * (MAX_SEAGULLS - MIN_SEAGULLS + 1))
  manager.active = true
  manager.birds.forEach((bird, idx) => {
    if (idx >= manager.encounterCount) {
      bird.state = 'HIDDEN'
      bird.group.visible = false
      return
    }
    // Keep a loose flock direction while varying each bird's line, distance,
    // and altitude so they do not arrive as a rigid horizontal formation.
    const birdApproachAngle = approachAngle + (Math.random() - 0.5) * 0.38
    const spawnDistance = SPAWN_DIST + (Math.random() - 0.5) * 36
    const lateral = (idx - (manager.encounterCount - 1) / 2) * 3.2 + (Math.random() - 0.5) * 8
    bird.x = playerX + Math.cos(birdApproachAngle) * spawnDistance + Math.cos(birdApproachAngle + Math.PI / 2) * lateral
    bird.z = playerZ + Math.sin(birdApproachAngle) * spawnDistance + Math.sin(birdApproachAngle + Math.PI / 2) * lateral
    bird.y = 14 + Math.random() * 14
    bird.circleAngle = Math.random() * Math.PI * 2
    bird.circleRadius = SHIP_CIRCLE_RADIUS + (idx % 2) * 4
    bird.circleHeight = 16 + Math.random() * 7
    bird.perchOffset = (idx - (manager.encounterCount - 1) / 2) * 0.8
    bird.state = debug && idx === 0 ? 'LANDING' : 'APPROACHING'
    bird.stateTimer = debug && idx === 0 ? 4 : 7
    bird.landAttempted = debug && idx === 0
    bird.squawkTimer = 1 + Math.random() * 4
    bird.animationOffset = Math.random() * Math.PI * 2
    bird.group.visible = true
  })
}

/** Force an encounter for visual testing; one bird demonstrates sail landing. */
export function forceSpawnSeagulls(manager: SeagullManager, _playerShip: THREE.Group, playerX: number, playerZ: number) {
  if (!manager || !manager.birds) return
  playSeagullSound(playerX, playerZ, playerX, playerZ)
  beginSeagullEncounter(manager, playerX, playerZ, true)
}

/** Cannon fire makes every visible bird immediately flee away from the ship. */
export function scareSeagulls(manager: SeagullManager, playerX: number, playerZ: number) {
  if (!manager?.active) return
  manager.birds.forEach(bird => {
    if (bird.state === 'HIDDEN') return
    const dx = bird.x - playerX
    const dz = bird.z - playerZ
    const length = Math.hypot(dx, dz) || 1
    bird.state = 'LEAVING'
    bird.stateTimer = 8
    bird.vx = dx / length * 18 + (Math.random() - 0.5) * 4
    bird.vz = dz / length * 18 + (Math.random() - 0.5) * 4
    bird.vy = 7 + Math.random() * 3
  })
}

export function hideSeagulls(manager: SeagullManager) {
  if (!manager) return
  manager.birds.forEach(bird => {
    bird.state = 'HIDDEN'
    bird.group.visible = false
  })
  manager.active = false
  manager.nextEncounterTimer = 35 + Math.random() * 55
}

export function updateSeagulls(
  manager: SeagullManager,
  dt: number,
  time: number,
  playerShip: THREE.Group,
  playerX: number,
  playerZ: number
) {
  if (!manager || !manager.birds) return

  if (!manager.active) {
    manager.nextEncounterTimer -= dt
    if (manager.nextEncounterTimer <= 0) beginSeagullEncounter(manager, playerX, playerZ)
    return
  }

  const sailWorldPos = manager.sailWorldPosition
  let visibleBirds = 0

  manager.birds.forEach(bird => {
    if (bird.state === 'HIDDEN') return
    visibleBirds++
    bird.squawkTimer -= dt
    bird.stateTimer -= dt

    // Occasional seagull cry
    if (bird.squawkTimer <= 0) {
      playSeagullSound(bird.x, bird.z, playerX, playerZ)
      bird.squawkTimer = 10 + Math.random() * 18
    }

    const dxP = bird.x - playerX
    const dzP = bird.z - playerZ
    const distSq = dxP * dxP + dzP * dzP
    if (distSq > DESPAWN_DIST * DESPAWN_DIST && bird.state === 'LEAVING') {
      bird.state = 'HIDDEN'
      bird.group.visible = false
      return
    }

    if (bird.state === 'APPROACHING') {
      const dx = playerX - bird.x
      const dz = playerZ - bird.z
      const length = Math.hypot(dx, dz) || 1
      bird.vx = dx / length * 14
      bird.vz = dz / length * 14
      bird.vy = (bird.circleHeight - bird.y) * 0.8
      bird.x += bird.vx * dt
      bird.y += bird.vy * dt
      bird.z += bird.vz * dt
      if (length < 42 || bird.stateTimer <= 0) {
        bird.state = 'CIRCLING'
        bird.stateTimer = 12 + Math.random() * 8
        bird.circleAngle = Math.atan2(bird.x - playerX, bird.z - playerZ)
      }
    }
    else if (bird.state === 'CIRCLING') {
      const circleSpeed = 0.75 + Math.sin(bird.circleAngle * 2) * 0.1
      bird.circleAngle += circleSpeed * dt

      const targetX = playerX + Math.sin(bird.circleAngle) * bird.circleRadius
      const targetZ = playerZ + Math.cos(bird.circleAngle) * bird.circleRadius
      const targetY = bird.circleHeight

      bird.x += (targetX - bird.x) * 3.0 * dt
      bird.z += (targetZ - bird.z) * 3.0 * dt
      bird.y += (targetY - bird.y) * 2.5 * dt

      bird.vx = Math.cos(bird.circleAngle) * bird.circleRadius * circleSpeed
      bird.vz = -Math.sin(bird.circleAngle) * bird.circleRadius * circleSpeed

      // Only some encounters include a landing, and at most one bird tries.
      if (!bird.landAttempted && bird.stateTimer < 7) {
        bird.landAttempted = true
        if (Math.random() < 0.12) {
          bird.state = 'LANDING'
          bird.stateTimer = 3.5
        }
      }

      if (bird.stateTimer <= 0 && bird.state === 'CIRCLING') {
        scareSeagulls(manager, playerX, playerZ)
      }
    }
    else if (bird.state === 'LANDING') {
      getPlayerSailTopWorld(playerShip, sailWorldPos, bird.perchOffset)
      bird.x += (sailWorldPos.x - bird.x) * 4.0 * dt
      bird.z += (sailWorldPos.z - bird.z) * 4.0 * dt
      bird.y += (sailWorldPos.y - bird.y) * 4.0 * dt

      const distToLanding = Math.hypot(sailWorldPos.x - bird.x, sailWorldPos.y - bird.y, sailWorldPos.z - bird.z)
      if (distToLanding < 0.9 || bird.stateTimer <= 0) {
        bird.state = 'PERCHED'
        bird.perchDuration = 2.5 + Math.random() * 3.0
        playSeagullSound(bird.x, bird.z, playerX, playerZ)
      }
    }
    else if (bird.state === 'PERCHED') {
      getPlayerSailTopWorld(playerShip, sailWorldPos, bird.perchOffset)
      bird.x = sailWorldPos.x
      bird.y = sailWorldPos.y
      bird.z = sailWorldPos.z

      bird.perchDuration -= dt

      if (bird.head) {
        bird.head.rotation.y = Math.sin(time * 4 + bird.animationOffset) * 0.4
      }

      if (bird.perchDuration <= 0) {
        bird.state = 'TAKEOFF'
        bird.stateTimer = 1.5
        playSeagullSound(bird.x, bird.z, playerX, playerZ)
      }
    }
    else if (bird.state === 'TAKEOFF') {
      bird.vy = 6.0
      bird.vx = Math.sin(playerShip ? playerShip.rotation.y : 0) * 8 + (Math.random() - 0.5) * 4
      bird.vz = Math.cos(playerShip ? playerShip.rotation.y : 0) * 8 + (Math.random() - 0.5) * 4

      bird.x += bird.vx * dt
      bird.y += bird.vy * dt
      bird.z += bird.vz * dt

      if (bird.stateTimer <= 0) {
        bird.state = 'LEAVING'
        bird.stateTimer = 8
      }
    }
    else if (bird.state === 'LEAVING') {
      bird.x += bird.vx * dt
      bird.y += bird.vy * dt
      bird.z += bird.vz * dt
      bird.vy += 1.2 * dt
      if (bird.stateTimer <= 0) {
        bird.state = 'HIDDEN'
        bird.group.visible = false
      }
    }

    // Mesh Transforms & Wing Animations
    bird.group.position.set(bird.x, bird.y, bird.z)

    if (bird.state === 'PERCHED') {
      const shipHeading = playerShip ? playerShip.rotation.y : 0
      bird.group.rotation.set(0, shipHeading, 0)
      if (bird.wingL) bird.wingL.rotation.z = -0.8
      if (bird.wingR) bird.wingR.rotation.z = 0.8
    } else {
      const heading = Math.atan2(bird.vx, bird.vz)
      bird.group.rotation.y = heading

      const isGliding = (bird.state === 'CIRCLING' && Math.sin(time * 1.5 + bird.animationOffset) > 0.2) || bird.state === 'LANDING'
      const flapFreq = bird.state === 'TAKEOFF' ? 22 : 12
      const flapAngle = isGliding ? 0.08 : Math.sin(time * flapFreq + bird.animationOffset) * 0.7

      if (bird.wingL) bird.wingL.rotation.z = flapAngle
      if (bird.wingR) bird.wingR.rotation.z = -flapAngle
    }
  })

  if (visibleBirds === 0 || manager.birds.every(bird => bird.state === 'HIDDEN')) {
    manager.active = false
    manager.nextEncounterTimer = 35 + Math.random() * 55
  }
}
