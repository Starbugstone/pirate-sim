// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './pirates.css'
import {
  SHIP_TYPES, MAX_TREASURES, MAX_CANNONBALLS, MAX_ACTIVE_ENEMIES, MAX_ISLANDS, MAX_ROCKS,
  MAX_DISPOSE_PER_FRAME, MAX_WIND_PARTICLES, CHUNK_SIZE, HARBOUR_RANGE,
  ICON_RENDER_DIST, INACTIVE_DIST, ACTIVE_DIST, KRAKEN_INACTIVE_DIST,
  KRAKEN_RENDER_DIST, CANNONBALL_CULL_DIST, ENEMY_IDLE_DIST,
  ENEMY_ALERT_DIST, ENEMY_ATTACK_DIST
} from './constants'
import { normalizeAngle, shortestAngleDelta } from './helpers'
import { createOcean, updateOcean, setOceanIslands, getOceanHeight, createSprayPool, emitSpray, updateSpray } from './ocean'
import { createPlayerShip as buildPlayerShip, createEnemyShipMesh, updateShipBuoyancy } from './ships'
import { createSky, updateSky, spawnIsland as buildIsland, spawnRock as buildRock, spawnSunkenShip as buildSunkenShip, createKraken as buildKraken } from './world'
import { createFire as buildFire, spawnWakeParticle as emitWake, updateWakeParticles as tickWake, clearShipWakes, createCannonMuzzleFlash, updateMuzzleFlashes, clearMuzzleFlashes } from './effects'
import { createAmbientFish, updateAmbientFish } from './ambientFish'
import { updateShorelineFoamTime } from './terrain'
const makeRef = (value) => ({ value })
const computed = (getter) => ({
  get value() {
    return getter()
  }
})
const initialUi = {
  gameState: 'start',
  victory: false,
  hp: 100,
  gold: 0,
  windDirection: 'N',
  windSpeed: 3,
  playerSpeed: 0,
  message: '',
  portCooldown: 0,
  starboardCooldown: 0,
  aliveEnemies: 0,
  krakenHp: 150,
  enemyIndicators: [],
  shopOpen: false,
  shopMessage: '',
  brakeActive: false,
  playerUpgrades: {
    sailSpeed: 0,
    cannonCount: 0,
    cannonSpeed: 0,
    maxHpBonus: 0,
    repairCount: 0,
    parrot: 0
  },
  waterMode: 'custom'
}
export function PiratesGame() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const windOverlayRef = useRef(null)
  const minimapCanvasRef = useRef(null)
  const actionsRef = useRef({
    startGame: () => {},
    buyUpgrade: (_type) => {},
    closeShop: () => {}
  })
  const [ui, setUi] = useState(initialUi)
  useEffect(() => {
    const ref = makeRef
    const container = {
      get value() {
        return containerRef.current
      },
      set value(next) {
        containerRef.current = next
      }
    }
    const canvas = {
      get value() {
        return canvasRef.current
      },
      set value(next) {
        canvasRef.current = next
      }
    }
    const windOverlay = {
      get value() {
        return windOverlayRef.current
      },
      set value(next) {
        windOverlayRef.current = next
      }
    }


let scene, camera, renderer
let atmosphere
let animationId = null
// Constants from ocean.js / ship.js

// Game state
const gameState = ref('start') // start, playing, gameover
const victory = ref(false)
const hp = ref(100)
const gold = ref(0)
const score = ref(0) // Added score variable

// Fire effects for damaged ships
const playerFire = ref(null) // { mesh, particles: [] }
const enemyFires = ref([]) // Array of { mesh, particles: [], hp }

let fireScene = null // Fire scene for particle effects

// Treasure system
const treasures = ref([]) // Array of treasure entities { x, z, mesh, ringMesh, timer, collecting, collected, collectFade }
let treasureCollectTimer = 0
const message = ref('')
const enemyIndicators = ref([]) // For directional indicators

// Harbour / Shop system
const shopOpen = ref(false)
const playerUpgrades = ref({
  sailSpeed: 0,   // +1-3 = faster sails (extra speed bonus)
  cannonCount: 0, // +1-3 = more cannons per broadside
  parrot: 0,      // +1-5 = pirate's parrot, each level +5% loot
  cannonSpeed: 0, // +1-3 = faster reload
  maxHpBonus: 0,  // +10 max HP per level
  repairCount: 0  // times repair used (increases cost by 10 each time)
})
const shopMessage = ref('')
const showShopMessage = (msg) => {
  shopMessage.value = msg
  setTimeout(() => { if (shopMessage.value === msg) shopMessage.value = '' }, 2500)
}

// Wind particles rendered on a lightweight overlay canvas.
let windParticles = []
let debugWindArrow
let windParticleContext = null
const windWorldVector = new THREE.Vector3()
const windCameraRight = new THREE.Vector3()
const windCameraUp = new THREE.Vector3()
const windCameraForward = new THREE.Vector3()
const windViewCenter = new THREE.Vector3()
const windFlowVector = new THREE.Vector3()
const windCrossVector = new THREE.Vector3()
const windHeadProjection = new THREE.Vector3()
const windTailProjection = new THREE.Vector3()
const windTailWorld = new THREE.Vector3()
let disposeQueue = [] // Pending { mesh, type } for gradual disposal
let lastChunkCount = 0
let spawnCheckFrameCounter = 0
let fireEffectsFrameCounter = 0
let indicatorsFrameCounter = 0
let windParticleFrameCounter = 0
let lastCleanupTime = 0
let minimapUpdateAccumulator = 0
let windUpdateAccumulator = 0
let fishUpdateAccumulator = 0
let sailUpdateAccumulator = 0
let lastFrameTime = performance.now()

// Computed for HUD
const aliveEnemies = computed(() => enemyShips.value.filter(e => e.hp > 0).length)
const cannonCooldown = ref(0) // Both sides
const portCooldown = ref(0) // Left side
const starboardCooldown = ref(0) // Right side
const playerSpeed = ref(0)

// Ship state
let playerShip
const playerPhysicsState = { currentY: 0, currentPitch: 0, currentRoll: 0 }
const playerPos = ref({ x: 0, z: 0 })
let playerAngle = 0
let targetRotation = 0

// Anchor state
let anchorDropped = false
let anchorAnimating = false
let anchorMesh = null
let anchorAnimProgress = 0   // 0 = fully raised, 1 = fully dropped
let anchorAnimDir = 0        // 1 = dropping, -1 = raising
let collisionCooldown = 0    // seconds remaining before next collision damage

// Parrot state
let parrotGroup: THREE.Group | null = null
let fishMesh: THREE.InstancedMesh | null = null

// Camera - 0 = behind (navigation), 1 = top-down (fighting)
let cameraMode = 0 // Start in behind view

// Wind
let windAngle = 0
const windSpeed = ref(3)
let windTransitionStartAngle = windAngle
let windTransitionStartSpeed = windSpeed.value
let targetWindAngle = windAngle
let targetWindSpeed = windSpeed.value
let windTransitionElapsed = 0
let windTransitionDuration = 0
let windVisualAngle = 0
let windVisualSpeed = 3

const MIN_WIND_SPEED = 2.5
const MAX_WIND_SPEED = 6
const MIN_WIND_TRANSITION_TIME = 26
const MAX_WIND_TRANSITION_TIME = 40

function beginWindTransition(announce = true) {
  windTransitionStartAngle = windAngle
  windTransitionStartSpeed = windSpeed.value

  // Broad, slow course changes keep the wind meaningful without forcing an
  // instant reaction from the player.
  const shiftAmount = (0.35 + Math.random() * 0.9) * (Math.random() > 0.5 ? 1 : -1)
  targetWindAngle = normalizeAngle(windAngle + shiftAmount)

  targetWindSpeed = MIN_WIND_SPEED + Math.random() * (MAX_WIND_SPEED - MIN_WIND_SPEED)
  if (Math.abs(targetWindSpeed - windSpeed.value) < 0.6) {
    targetWindSpeed = windSpeed.value < (MIN_WIND_SPEED + MAX_WIND_SPEED) / 2
      ? Math.min(MAX_WIND_SPEED, windSpeed.value + 0.6)
      : Math.max(MIN_WIND_SPEED, windSpeed.value - 0.6)
  }

  windTransitionElapsed = 0
  windTransitionDuration = MIN_WIND_TRANSITION_TIME +
    Math.random() * (MAX_WIND_TRANSITION_TIME - MIN_WIND_TRANSITION_TIME)

  if (announce) showMessage('Wind shifting...', 2000)
}

function updateWind(dt) {
  if (windTransitionDuration <= 0) beginWindTransition(false)

  windTransitionElapsed = Math.min(windTransitionDuration, windTransitionElapsed + dt)
  const progress = windTransitionElapsed / windTransitionDuration
  const angleChange = shortestAngleDelta(windTransitionStartAngle, targetWindAngle)

  // Both values move at a constant rate for the full transition. All wind
  // consumers use these live values, so sails and boat physics remain aligned.
  windAngle = normalizeAngle(windTransitionStartAngle + angleChange * progress)
  windSpeed.value = windTransitionStartSpeed +
    (targetWindSpeed - windTransitionStartSpeed) * progress

  if (windTransitionElapsed >= windTransitionDuration) beginWindTransition()
}

// Projectiles
let cannonballs = []
const cannonballGeometry = new THREE.SphereGeometry(0.35, 8, 8)
const playerCannonballMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 })
const enemyCannonballMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 })

function removeCannonballAt(index) {
  const ball = cannonballs[index]
  if (ball?.mesh) scene.remove(ball.mesh)
  cannonballs.splice(index, 1)
}

function spawnCannonball(position, velocity, options) {
  // Enforce the cap before allocating/adding a new mesh, including during a
  // large broadside fired within a single frame.
  while (cannonballs.length >= MAX_CANNONBALLS) removeCannonballAt(0)

  const ball = new THREE.Mesh(
    cannonballGeometry,
    options.isEnemy ? enemyCannonballMaterial : playerCannonballMaterial
  )
  ball.position.copy(position)
  cannonballs.push({
    mesh: ball,
    vx: velocity.x,
    vz: velocity.z,
    life: 3,
    spawnTime: performance.now(),
    ...options
  })
  scene.add(ball)
}

// Ship wake/trail particles
let playerWake = []

// Enemy ships - array for multiple enemies
const enemyShips = ref([]) // { x, z, hp, maxHp, angle, type, mesh }
let enemyShipMeshes = [] // Array of meshes

// Enemy ship types

// Kraken
const kraken = ref({ x: 0, z: 0, hp: 150, angle: 0, tentacles: [] })
let krakenMesh
let krakenActive = false
let krakenTimer = 0
let frameCount = 0 // For throttling updates

// Islands and rocks
let islands = []
let rocks = []

// Procedural world generation
let spawnedChunks = new Set() // Track spawned areas "x,z"
let worldObjects = { islands: [], rocks: [], ships: [] }

let oceanMesh
let oceanTime = 0
let sprayPool

const showMessage = (msg, duration = 3000) => {
  message.value = msg
  setTimeout(() => {
    if (message.value === msg) message.value = ''
  }, duration)
}


// === MEMORY MANAGEMENT ===
function disposeMesh(mesh) {
  if (!mesh) return
  if (mesh.geometry) {
    mesh.geometry.dispose()
  }
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
    } else {
      if (mesh.material.map) mesh.material.map.dispose()
      mesh.material.dispose()
    }
  }
  scene.remove(mesh)
}

function disposeGroup(group) {
  if (!group) return
  group.traverse(child => {
    if (child.isMesh) disposeMesh(child)
  })
  scene.remove(group)
}

function resizeWindOverlay() {
  if (!windOverlay.value) return

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
  windOverlay.value.width = Math.floor(window.innerWidth * pixelRatio)
  windOverlay.value.height = Math.floor(window.innerHeight * pixelRatio)
  windOverlay.value.style.width = `${window.innerWidth}px`
  windOverlay.value.style.height = `${window.innerHeight}px`

  windParticleContext = windOverlay.value.getContext('2d')
  if (windParticleContext) {
    windParticleContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    windParticleContext.lineCap = 'round'
    windParticleContext.lineJoin = 'round'
  }
}

function updateWindViewData() {
  camera.matrixWorld.extractBasis(windCameraRight, windCameraUp, windCameraForward)
  windCameraForward.y = 0
  if (windCameraForward.lengthSq() < 0.00001) {
    windCameraForward.set(Math.sin(playerAngle), 0, Math.cos(playerAngle))
  }
  windCameraForward.normalize()
  windCameraRight.crossVectors(windCameraUp, windCameraForward).normalize()

  windFlowVector.set(Math.sin(windVisualAngle), 0, Math.cos(windVisualAngle)).normalize()
  windCrossVector.set(-windFlowVector.z, 0, windFlowVector.x).normalize()

  windViewCenter.set(
    playerPos.value.x,
    0,
    playerPos.value.z
  )
}

function getWindOverlaySpeed() {
  return 22 + windVisualSpeed * 8.5
}

function spawnWindParticle(particle, speed, visibleSpawn = false) {
  updateWindViewData()
  const crossSpread = 64 + camera.position.y * 0.7
  const forwardSpread = 46 + camera.position.y * 0.58
  const backwardSpread = 42 + camera.position.y * 0.38
  const heightMin = 1.8
  const heightMax = Math.min(9 + camera.position.y * 0.28, 34)
  const crossOffset = (Math.random() - 0.5) * crossSpread * 2
  const forwardOffset = -backwardSpread + Math.random() * (forwardSpread + backwardSpread)
  const windOffset = visibleSpawn
    ? (Math.random() - 0.5) * (20 + camera.position.y * 0.18)
    : (Math.random() - 0.5) * (46 + camera.position.y * 0.42)
  const gust = 0.75 + Math.random() * 0.7

  particle.x =
    windViewCenter.x +
    windCameraRight.x * crossOffset +
    windCameraForward.x * forwardOffset +
    windFlowVector.x * windOffset
  particle.z =
    windViewCenter.z +
    windCameraRight.z * crossOffset +
    windCameraForward.z * forwardOffset +
    windFlowVector.z * windOffset
  particle.y = heightMin + Math.random() * (heightMax - heightMin)
  particle.speed = speed * gust
  particle.vx = windFlowVector.x * particle.speed + windCrossVector.x * ((Math.random() - 0.5) * particle.speed * 0.08)
  particle.vz = windFlowVector.z * particle.speed + windCrossVector.z * ((Math.random() - 0.5) * particle.speed * 0.08)
  particle.vy = (Math.random() - 0.5) * 0.5
  particle.width = 0.55 + Math.random() * 1.25
  particle.length = 3.5 + Math.random() * 5.5 + particle.speed * 0.085
  particle.life = 0
  particle.maxLife = 1.8 + Math.random() * 1.5
  particle.alpha = 0.24 + Math.random() * 0.24
  particle.phase = Math.random() * Math.PI * 2
  particle.swirl = 0.45 + Math.random() * 1.2
  particle.swirlSpeed = 1.2 + Math.random() * 2.1
}

function createWindParticles() {
  resizeWindOverlay()
  windVisualAngle = windAngle
  windVisualSpeed = windSpeed.value

  const speed = getWindOverlaySpeed()
  windParticles = []

  for (let i = 0; i < MAX_WIND_PARTICLES; i++) {
    const particle = {}
    spawnWindParticle(particle, speed, true)
    windParticles.push(particle)
  }
}

function updateWindParticles(dt) {
  if (!windParticleContext) return

  // Render from the same wind state used by sailing physics. The particles'
  // velocity then turns with that state instead of chasing a separate target.
  windVisualAngle = windAngle
  windVisualSpeed = windSpeed.value

  const ctx = windParticleContext
  const width = window.innerWidth
  const height = window.innerHeight
  const margin = 140
  const time = Date.now() * 0.001
  const speed = getWindOverlaySpeed()
  updateWindViewData()

  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = 'rgb(230, 247, 252)'

  for (const particle of windParticles) {
    if (!particle || !Number.isFinite(particle.x) || !Number.isFinite(particle.y) || !Number.isFinite(particle.z)) {
      spawnWindParticle(particle, speed, true)
      continue
    }

    const velocityAdjustment = Math.min(1, dt * 6)
    particle.speed += (speed - particle.speed) * velocityAdjustment
    const swirlPhase = time * particle.swirlSpeed + particle.phase
    const swirlOffset = Math.sin(swirlPhase) * particle.swirl
    const verticalSwirl = Math.cos(swirlPhase * 0.9) * particle.swirl * 0.12
    particle.vx += (windFlowVector.x * particle.speed + windCrossVector.x * swirlOffset - particle.vx) * velocityAdjustment
    particle.vz += (windFlowVector.z * particle.speed + windCrossVector.z * swirlOffset - particle.vz) * velocityAdjustment
    particle.vy += (verticalSwirl - particle.vy) * Math.min(1, dt * 2.5)

    particle.x += particle.vx * dt
    particle.z += particle.vz * dt
    particle.y += particle.vy * dt
    particle.life += dt

    const fadeIn = Math.min(1, particle.life / 0.25)
    const fadeOut = Math.max(0, 1 - particle.life / particle.maxLife)
    const alpha = particle.alpha * fadeIn * fadeOut

    windHeadProjection.set(particle.x, particle.y, particle.z).project(camera)

    const centerDx = particle.x - windViewCenter.x
    const centerDz = particle.z - windViewCenter.z
    const centerDistSq = centerDx * centerDx + centerDz * centerDz

    if (
      particle.life >= particle.maxLife ||
      centerDistSq > (140 + camera.position.y) * (140 + camera.position.y) ||
      windHeadProjection.z < -1.2 ||
      windHeadProjection.z > 1.2
    ) {
      spawnWindParticle(particle, speed, true)
      continue
    }

    const screenX = (windHeadProjection.x * 0.5 + 0.5) * width
    const screenY = (-windHeadProjection.y * 0.5 + 0.5) * height

    if (
      screenX < -margin ||
      screenX > width + margin ||
      screenY < -margin ||
      screenY > height + margin
    ) {
      spawnWindParticle(particle, speed, true)
      continue
    }

    const velocityLength = Math.max(Math.hypot(particle.vx, particle.vy, particle.vz), 0.0001)
    windTailWorld.set(
      particle.x - (particle.vx / velocityLength) * particle.length,
      particle.y - (particle.vy / velocityLength) * particle.length * 0.16,
      particle.z - (particle.vz / velocityLength) * particle.length
    )
    windTailProjection.copy(windTailWorld).project(camera)

    const tailX = (windTailProjection.x * 0.5 + 0.5) * width
    const tailY = (-windTailProjection.y * 0.5 + 0.5) * height

    const depthFade = Math.max(0.2, 1 - Math.max(0, windHeadProjection.z) * 0.55)
    ctx.globalAlpha = alpha * depthFade
    ctx.lineWidth = particle.width * (1.55 - Math.max(-0.4, windHeadProjection.z + 0.2) * 0.45)
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(screenX, screenY)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

// Queue something for gradual disposal (avoids synchronous spikes)
function queueForDisposal(mesh) {
  if (mesh) disposeQueue.push(mesh)
}

// Process a few pending disposals per frame (non-blocking)
function processDisposalQueue() {
  for (let i = 0; i < MAX_DISPOSE_PER_FRAME; i++) {
    if (disposeQueue.length === 0) break
    const mesh = disposeQueue.shift()
    if (mesh) {
      if (mesh.isGroup) {
        disposeGroup(mesh)
      } else {
        disposeMesh(mesh)
      }
    }
  }
}

function init() {
  scene = new THREE.Scene()
  // The pale blue-grey fog matches the humid horizon in the sky dome. Terrain
  // is completely concealed before it reaches the procedural load boundary.
  scene.fog = new THREE.Fog(0x9fcfd7, 380, 900)
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400)
  camera.position.set(0, 30, -40)
  camera.lookAt(0, 0, 0)
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: false, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  atmosphere = createSky(scene)
  createPlayerShipLocal()
  oceanMesh = createOcean(scene)
  sprayPool = createSprayPool(scene)
  createWindParticles()
  spawnEnemyShip()
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('click', onClick)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('pointerlockchange', onPointerLockChange)
  window.addEventListener('wheel', onWheel)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
}





function createPlayerShipLocal() {
  const oldPos = playerShip ? playerShip.position.clone() : new THREE.Vector3(0, 0, 0)
  const oldRotY = playerShip ? playerShip.rotation.y : playerAngle
  const oldRotZ = playerShip ? playerShip.rotation.z : 0
  if (playerShip) scene.remove(playerShip)
  playerShip = buildPlayerShip(playerUpgrades.value)
  playerShip.position.copy(oldPos)
  playerShip.rotation.y = oldRotY
  playerShip.rotation.z = oldRotZ
  scene.add(playerShip)
}

// Spawn enemy ships - one of each type
function spawnEnemyShip() {
  // Ambient Fish
  if (!fishMesh) fishMesh = createAmbientFish(scene)
  // Clear existing enemies
  enemyShipMeshes.forEach(mesh => scene.remove(mesh))
  enemyShipMeshes = []
  enemyShips.value = []

  // Spawn 3 different enemy types at different positions
  const types = ['RAMMER', 'NORMAL', 'BIG']
  const positions = [
    { x: 200, z: -200 },
    { x: -180, z: -250 },
    { x: 100, z: -300 }
  ]

  // Validate positions - make sure they're not on islands/rocks
  for (let i = 0; i < positions.length; i++) {
    let valid = false
    let attempts = 0
    let pos = { ...positions[i] }

    while (!valid && attempts < 20) {
      valid = true

      // Check islands
      for (const island of worldObjects.islands) {
        const dx = pos.x - island.x
        const dz = pos.z - island.z
        if (Math.sqrt(dx * dx + dz * dz) < island.radius + 20) {
          valid = false
          break
        }
      }

      // Check rocks
      if (valid) {
        for (const rock of worldObjects.rocks) {
          const dx = pos.x - rock.x
          const dz = pos.z - rock.z
          if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 10) {
            valid = false
            break
          }
        }
      }

      if (!valid) {
        pos.x = (Math.random() - 0.5) * 400
        pos.z = (Math.random() - 0.5) * 400 - 100
        if (Math.sqrt(pos.x * pos.x + pos.z * pos.z) < 150) valid = false
      }

      attempts++
    }
    positions[i] = pos
  }

  types.forEach((type, index) => {
    const shipType = SHIP_TYPES[type]
    const pos = positions[index]

    // Create enemy data
    const enemy = {
      x: pos.x,
      z: pos.z,
      hp: shipType.hp,
      maxHp: shipType.hp,
      angle: 0,
      type: type,
      nextShotAt: performance.now() + 800 + Math.random() * 1200,
      sinking: false,
      sinkingTime: 0
    }
    enemyShips.value.push(enemy)

    // Create mesh
    const mesh = createEnemyShipMesh(shipType)
    mesh.position.set(enemy.x, 0, enemy.z)
    scene.add(mesh)
    enemyShipMeshes.push(mesh)
  })

  showMessage('3 enemy ships approaching!', 3000)
}


function createKrakenLocal() {
  if (krakenMesh) scene.remove(krakenMesh)
  krakenMesh = buildKraken(scene, kraken.value)
  krakenActive = true
  kraken.value.hp = 200
  showMessage('The Kraken awakens!', 5000)
}

// Treasure functions
function spawnTreasure(x, z, baseGold = 50, showMsg = true, permanent = false) {
  // Hard cap on treasures - remove oldest non-permanent if at limit
  if (treasures.value.length >= MAX_TREASURES) {
    const skipIndex = treasures.value.findIndex(t => !t.permanent)
    const old = skipIndex !== -1 ? treasures.value.splice(skipIndex, 1)[0] : treasures.value.shift()
    if (old) {
      if (old.mesh) disposeMesh(old.mesh)
      if (old.ringMesh) disposeMesh(old.ringMesh)
    }
  }

  // Treasure chest
  const chestGeom = new THREE.BoxGeometry(1.5, 1, 1)
  const chestMat = new THREE.MeshPhongMaterial({ color: 0xFFD700 }) // Gold
  const chest = new THREE.Mesh(chestGeom, chestMat)
  chest.position.set(x, 1, z)
  scene.add(chest)

  // Collection ring
  const ringGeom = new THREE.RingGeometry(8, 10, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xFFD700,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  })
  const ring = new THREE.Mesh(ringGeom, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.3
  scene.add(ring)

  // Add as unique entity to array
  const treasureEntity = {
    x: x,
    z: z,
    mesh: chest,
    ringMesh: ring,
    timer: 60, // 60 seconds (ignored if permanent)
    permanent: permanent,
    collecting: false,
    collected: false,
    collectFade: 1.0,
    gold: baseGold + Math.floor(Math.random() * 50)
  }

  treasures.value.push(treasureEntity)

  if (showMsg) {
    showMessage('Treasure spawned. Drop anchor to collect it.', 3000)
  }
}

function spawnEnemyTreasure(enemy) {
  // Treasure based on enemy type
  let baseGold
  if (enemy.type === 'RAMMER') baseGold = 125
  else if (enemy.type === 'BIG') baseGold = 150
  else baseGold = 100 // NORMAL

  spawnTreasure(enemy.x, enemy.z, baseGold)
}

// Procedural world generation
function checkProceduralSpawns() {
  const px = Math.floor(playerPos.value.x / CHUNK_SIZE)
  const pz = Math.floor(playerPos.value.z / CHUNK_SIZE)

  // Keep an extra ring loaded beyond the fog. New chunks are ordered nearest
  // first and capped per pass so the larger view distance does not cause a
  // single expensive terrain-generation frame.
  const chunkRadius = 3
  const missingChunks = []
  for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
      const cx = px + dx
      const cz = pz + dz
      const key = `${cx},${cz}`
      if (!spawnedChunks.has(key)) missingChunks.push({ cx, cz, key, distSq: dx * dx + dz * dz })
    }
  }
  missingChunks.sort((a, b) => a.distSq - b.distSq)
  for (const chunk of missingChunks.slice(0, 4)) {
    spawnChunk(chunk.cx, chunk.cz)
    spawnedChunks.add(chunk.key)
  }

  // Ensure kraken is always in loaded chunk
  if (krakenActive && kraken.value) {
    // Check if kraken is in loaded chunk
    const kx = Math.floor(kraken.value.x / CHUNK_SIZE)
    const kz = Math.floor(kraken.value.z / CHUNK_SIZE)
    const dist = Math.sqrt((kx - px) ** 2 + (kz - pz) ** 2)

    // If kraken too far or unloaded, spawn new one
    if (dist > 5) {
      // Find a chunk not too close to player
      let spawnDist = 6
      let newCX = px, newCZ = pz
      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = Math.random() * Math.PI * 2
        const testDist = 5 + Math.random() * 3
        newCX = px + Math.floor(Math.cos(angle) * testDist)
        newCZ = pz + Math.floor(Math.sin(angle) * testDist)
        if (!spawnedChunks.has(`${newCX},${newCZ}`)) {
          spawnDist = testDist
          break
        }
      }

      // Respawn kraken (find valid position not on islands/rocks)
      let kx, kz, validK
      let kAttempts = 0

      do {
        validK = true
        const worldX = newCX * CHUNK_SIZE + CHUNK_SIZE / 2
        const worldZ = newCZ * CHUNK_SIZE + CHUNK_SIZE / 2
        kx = worldX + (Math.random() - 0.5) * 100
        kz = worldZ + (Math.random() - 0.5) * 100

        // Check islands
        for (const island of worldObjects.islands) {
          const dx = kx - island.x
          const dz = kz - island.z
          if (Math.sqrt(dx * dx + dz * dz) < island.radius + 30) {
            validK = false
            break
          }
        }

        // Check rocks
        if (validK) {
          for (const rock of worldObjects.rocks) {
            const dx = kx - rock.x
            const dz = kz - rock.z
            if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 15) {
              validK = false
              break
            }
          }
        }

        kAttempts++
      } while (!validK && kAttempts < 10)

      kraken.value.x = kx
      kraken.value.z = kz
      if (krakenMesh) {
        scene.remove(krakenMesh)
        krakenMesh = null
      }
      createKrakenLocal()
      showMessage('A new Kraken approaches...', 3000)
    }
  }
}

function spawnChunk(cx, cz) {
  const worldX = cx * CHUNK_SIZE + CHUNK_SIZE / 2
  const worldZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2

  // Skip ships in starting chunk (0,0) - spawnEnemyShip handles initial enemies
  const isStartingChunk = (cx === 0 && cz === 0)

  // 20% chance of island per chunk — rarer, only 1
  if (Math.random() < 0.2 && worldObjects.islands.length < MAX_ISLANDS) {
    const angle = Math.random() * Math.PI * 2
    const maxDist = (CHUNK_SIZE / 2) - 50
    const dist = 25 + Math.random() * maxDist
    const ix = worldX + Math.cos(angle) * dist
    const iz = worldZ + Math.sin(angle) * dist
    const pdx = ix - playerPos.value.x
    const pdz = iz - playerPos.value.z
    if (pdx * pdx + pdz * pdz > 120 * 120) {
      worldObjects.islands.push(buildIsland(scene, ix, iz))
    }
  }

  // Spawn rocks (rare, 35% chance per chunk) - strictly away from islands & borders
  if (Math.random() < 0.35 && worldObjects.rocks.length < MAX_ROCKS) {
    let rx, rz, validRock = false
    let attempts = 0
    do {
      const angle = Math.random() * Math.PI * 2
      const maxDist = (CHUNK_SIZE / 2) - 35
      const dist = 25 + Math.random() * maxDist
      rx = worldX + Math.cos(angle) * dist
      rz = worldZ + Math.sin(angle) * dist

      validRock = true
      const playerDx = rx - playerPos.value.x
      const playerDz = rz - playerPos.value.z
      if (playerDx * playerDx + playerDz * playerDz < 75 * 75) {
        validRock = false
      }
      // Check against all islands to prevent clipping
      for (const island of worldObjects.islands) {
        const dx = rx - island.x
        const dz = rz - island.z
        if (Math.sqrt(dx * dx + dz * dz) < island.radius + 50) {
          validRock = false
          break
        }
      }
      attempts++
    } while (!validRock && attempts < 10)

    if (validRock) {
      worldObjects.rocks.push(buildRock(scene, rx, rz))
    }
  }

  // Ship tracking for this chunk (used by both live ships and sunken ships)
  const chunkShips = []

  // Spawn random ships (0-3 ships per chunk) - skip starting chunk
  if (!isStartingChunk && enemyShips.value.length < MAX_ACTIVE_ENEMIES) {
    const numShips = Math.random() < 0.3 ? 1 : 0 // 30% chance of 1 ship per chunk

    for (let s = 0; s < numShips && enemyShips.value.length < MAX_ACTIVE_ENEMIES; s++) {
      // Try to find a valid position (away from borders and other ships)
      let sx, sz, valid
      let attempts = 0

      do {
        valid = true
        const angle = Math.random() * Math.PI * 2
        // Keep ships at least 30 units from chunk edge
        const maxDist = (CHUNK_SIZE / 2) - 30
        const dist = 30 + Math.random() * maxDist
        sx = worldX + Math.cos(angle) * dist
        sz = worldZ + Math.sin(angle) * dist

        // Check distance from other ships in this chunk
        for (const other of chunkShips) {
          const dx = sx - other.x
          const dz = sz - other.z
          if (Math.sqrt(dx * dx + dz * dz) < 20) {
            valid = false
            break
          }
        }

        // Keep the opening waters navigable and avoid spawning combat on camera.
        const playerDx = sx - playerPos.value.x
        const playerDz = sz - playerPos.value.z
        if (playerDx * playerDx + playerDz * playerDz < 90 * 90) {
          valid = false
        }

        // Check distance from existing enemies (avoid spawning on top)
        for (const enemy of enemyShips.value) {
          const dx = sx - enemy.x
          const dz = sz - enemy.z
          if (Math.sqrt(dx * dx + dz * dz) < 30) {
            valid = false
            break
          }
        }

        // Check distance from islands
        for (const island of worldObjects.islands) {
          const dx = sx - island.x
          const dz = sz - island.z
          if (Math.sqrt(dx * dx + dz * dz) < island.radius + 15) {
            valid = false
            break
          }
        }

        // Check distance from rocks
        for (const rock of worldObjects.rocks) {
          const dx = sx - rock.x
          const dz = sz - rock.z
          if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 8) {
            valid = false
            break
          }
        }

        attempts++
      } while (!valid && attempts < 10)

      if (valid) {
        chunkShips.push({ x: sx, z: sz })
        spawnRandomShip(sx, sz)
      }
    }
  }

  // Deterministic: ~5% of chunks get a sunken ship, based on chunk coords
  // Same chunks always have sunken ships â€” no random spam
  if (!isStartingChunk && (cx * 31 + cz * 17) % 100 < 5) {
    let sx, sz, validPos
    let attempts = 0

    do {
      validPos = true
      const angle = Math.random() * Math.PI * 2
      const maxDist = (CHUNK_SIZE / 2) - 40
      const dist = 30 + Math.random() * maxDist
      sx = worldX + Math.cos(angle) * dist
      sz = worldZ + Math.sin(angle) * dist

      // Check islands
      for (const island of worldObjects.islands) {
        const dx = sx - island.x
        const dz = sz - island.z
        if (Math.sqrt(dx * dx + dz * dz) < island.radius + 25) {
          validPos = false
          break
        }
      }

      // Check rocks
      if (validPos) {
        for (const rock of worldObjects.rocks) {
          const dx = sx - rock.x
          const dz = sz - rock.z
          if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 10) {
            validPos = false
            break
          }
        }
      }

      // Check other ships
      if (validPos) {
        for (const ship of chunkShips) {
          const dx = sx - ship.x
          const dz = sz - ship.z
          if (Math.sqrt(dx * dx + dz * dz) < 30) {
            validPos = false
            break
          }
        }
      }

      // Must be at least 30 units from player
      if (validPos) {
        const dx = sx - playerPos.value.x
        const dz = sz - playerPos.value.z
        if (Math.sqrt(dx * dx + dz * dz) < 30) {
          validPos = false
        }
      }

      attempts++
    } while (!validPos && attempts < 10)

    if (validPos) {
      const wreck = buildSunkenShip(scene, sx, sz)
      worldObjects.ships = worldObjects.ships || []
      worldObjects.ships.push(wreck)
      spawnTreasure(sx, sz, 75, false, true)
    }
  }
}




function spawnRandomShip(x, z) {
  const types = ['RAMMER', 'NORMAL', 'BIG']
  const type = types[Math.floor(Math.random() * types.length)]
  const shipType = SHIP_TYPES[type]

  const enemy = {
    x, z,
    hp: shipType.hp,
    maxHp: shipType.hp,
    angle: Math.random() * Math.PI * 2,
    type,
    nextShotAt: performance.now() + 800 + Math.random() * 1200,
    sinking: false,
    sinkingTime: 0
  }

  const mesh = createEnemyShipMesh(shipType)
  mesh.position.set(x, 0, z)
  scene.add(mesh)

  enemyShips.value.push(enemy)
  enemyShipMeshes.push(mesh)
}

function cleanupDistantChunks() {
  const px = playerPos.value.x
  const pz = playerPos.value.z

  // Retain objects until they are fully hidden by the horizon mist.
  const maxDist = CHUNK_SIZE * 5

  // Clean islands - queue mesh for gradual disposal (avoid sync spikes)
  for (let i = worldObjects.islands.length - 1; i >= 0; i--) {
    const island = worldObjects.islands[i]
    const dx = island.x - px
    const dz = island.z - pz
    if (Math.sqrt(dx*dx + dz*dz) > maxDist || worldObjects.islands.length > MAX_ISLANDS) {
      queueForDisposal(island.mesh)
      worldObjects.islands.splice(i, 1)
    }
  }

  // Clean rocks - queue mesh for gradual disposal
  for (let i = worldObjects.rocks.length - 1; i >= 0; i--) {
    const rock = worldObjects.rocks[i]
    const dx = rock.x - px
    const dz = rock.z - pz
    if (Math.sqrt(dx*dx + dz*dz) > maxDist || worldObjects.rocks.length > MAX_ROCKS) {
      queueForDisposal(rock.mesh)
      worldObjects.rocks.splice(i, 1)
    }
  }

  // Clean ships queue mesh for gradual disposal
  if (worldObjects.ships) {
    for (let i = worldObjects.ships.length - 1; i >= 0; i--) {
      const ship = worldObjects.ships[i]
      const dx = ship.x - px
      const dz = ship.z - pz
      if (Math.sqrt(dx*dx + dz*dz) > maxDist) {
        queueForDisposal(ship.mesh)
        worldObjects.ships.splice(i, 1)
      }
    }
  }

  // Clean permanent distant treasures
  for (let i = treasures.value.length - 1; i >= 0; i--) {
    const t = treasures.value[i]
    if (t.permanent) {
      const dx = t.x - px
      const dz = t.z - pz
      if (Math.sqrt(dx*dx + dz*dz) > maxDist) {
        if (t.mesh) queueForDisposal(t.mesh)
        if (t.ringMesh) queueForDisposal(t.ringMesh)
        treasures.value.splice(i, 1)
      }
    }
  }

  // Keep chunk references slightly beyond the object cleanup distance.
  for (const key of [...spawnedChunks]) {
    const [cx, cz] = key.split(',').map(Number)
    const wx = cx * CHUNK_SIZE + CHUNK_SIZE / 2
    const wz = cz * CHUNK_SIZE + CHUNK_SIZE / 2
    const dx = wx - px
    const dz = wz - pz
    if (Math.sqrt(dx*dx + dz*dz) > CHUNK_SIZE * 6) {
      spawnedChunks.delete(key)
    }
  }
}

function updateTreasure(dt) {
  // Loop through all treasure entities (backwards for safe removal)
  for (let i = treasures.value.length - 1; i >= 0; i--) {
    const t = treasures.value[i]

    // Handle collected/expired state - fade out and remove
    if (t.collected) {
      t.collectFade -= dt * 2 // Fade out over ~0.5 seconds
      if (t.mesh) {
        t.mesh.scale.setScalar(Math.max(0.01, t.collectFade))
        // Float up if collected, sink if expired/sinking
        if (t.mesh.userData.sinking) {
          t.mesh.position.y -= dt * 2 // Sink
        } else {
          t.mesh.position.y += dt * 2 // Float up
        }
      }
      if (t.ringMesh) {
        // Ring shrinks to 0 then disappears
        t.ringMesh.scale.setScalar(Math.max(0.01, t.collectFade))
        t.ringMesh.material.opacity = Math.max(0, t.collectFade)
      }

      if (t.collectFade <= 0) {
        // Fully remove and dispose
        if (t.mesh) disposeMesh(t.mesh)
        if (t.ringMesh) disposeMesh(t.ringMesh)
        treasures.value.splice(i, 1)
        continue
      }
      // Skip rest of update while fading
      continue
    }

    // Check player distance
    const dx = playerPos.value.x - t.x
    const dz = playerPos.value.z - t.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    // Update timer if not permanent
    if (!t.permanent) {
      t.timer -= dt
      if (dist < 10) t.timer = 60 // Reset timer if near
    }

    // Check for collection (only one at a time to prevent spam)
    if (anchorDropped && dist < 10 && treasureCollectTimer <= 0) {
      // Start collecting
      t.collecting = true
      treasureCollectTimer = 3
      showMessage('Collecting treasure...', 2000)
    }

    // Handle collecting state - shrink the ring and count down
    if (t.collecting) {
      treasureCollectTimer -= dt

      // Shrink the ring as we collect
      const collectProgress = 1 - (treasureCollectTimer / 3) // 0 to 1 as we collect
      const ringScale = 1 - (collectProgress * 0.9) // Shrink from 1 to 0.1
      if (t.ringMesh) {
        t.ringMesh.scale.setScalar(Math.max(0.1, ringScale))
        t.ringMesh.material.opacity = 0.5 + collectProgress * 0.4
        t.ringMesh.material.color.setHex(0x00FF00) // Green while collecting
      }

      if (treasureCollectTimer <= 0) {
        const baseCoins = t.gold || 50
        const parrotBonus = 1 + playerUpgrades.value.parrot * 0.05
        const coins = Math.round(baseCoins * parrotBonus)
        gold.value += coins
        showMessage(playerUpgrades.value.parrot > 0 ? `+${coins} gold (parrot +${playerUpgrades.value.parrot * 5}%)` : `+${coins} gold`, 3000)

        // Start fade out animation
        t.collected = true
        t.collectFade = 1.0
        treasureCollectTimer = 0
        t.collecting = false
      }
    }

    // Reset collecting if player moves away
    if (dist >= 10 && t.collecting) {
      t.collecting = false
      treasureCollectTimer = 0
      // Reset ring scale
      if (t.ringMesh) {
        t.ringMesh.scale.setScalar(1)
      }
    }

    // Expired treasure - fade out and sink
    if (!t.permanent && t.timer <= 0) {
      showMessage('Treasure lost to the sea...', 2000)
      // Fade out and sink
      t.collected = true
      t.collectFade = 1.0
      t.mesh.userData.sinking = true
    }

    // Update mesh positions (world coordinates)
    const oceanH = getOceanHeight(t.x, t.z, oceanTime, windAngle, windSpeed.value)
    if (t.mesh) t.mesh.position.set(t.x, oceanH + 1, t.z)
    if (t.ringMesh) t.ringMesh.position.set(t.x, oceanH + 0.3, t.z)

    // Update ring pulsing
    if (t.ringMesh) {
      const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.2
      t.ringMesh.material.opacity = t.collecting ? 0.8 : pulse
      t.ringMesh.material.color.setHex(t.collecting ? 0x00FF00 : 0xFFD700)
    }
  }
}

function fireCannon(side) {
  // side: 'port' (left), 'starboard' (right), or 'both'
  const cooldownTime = 1.5 - playerUpgrades.value.cannonSpeed * 0.25

  if (side === 'port') {
    if (portCooldown.value > 0) return
    portCooldown.value = cooldownTime
  } else if (side === 'starboard') {
    if (starboardCooldown.value > 0) return
    starboardCooldown.value = cooldownTime
  } else {
    if (cannonCooldown.value > 0) return
    cannonCooldown.value = cooldownTime
  }

  const angle = playerAngle
  let sidesToFire = []
  if (side === 'port') sidesToFire = ['port']
  else if (side === 'starboard') sidesToFire = ['starboard']
  else sidesToFire = ['port', 'starboard']

  const muzzleWorldPos = new THREE.Vector3()
  const muzzleDir = new THREE.Vector3()

  sidesToFire.forEach(sideKey => {
    const sideSign = sideKey === 'port' ? -1 : 1
    const cannonsList = playerShip && playerShip.userData && playerShip.userData[`${sideKey}Cannons`]

    if (cannonsList && cannonsList.length > 0) {
      cannonsList.forEach((cEntry, idx) => {
        if (cEntry.mesh) {
          cEntry.mesh.getWorldPosition(muzzleWorldPos)
        } else {
          const sideOffset = sideSign * 3.4
          const zOffset = cEntry.zOffset || 0
          muzzleWorldPos.set(
            playerPos.value.x + Math.sin(angle) * zOffset + Math.sin(angle + sideSign * Math.PI / 2) * sideOffset,
            2.6,
            playerPos.value.z + Math.cos(angle) * zOffset + Math.cos(angle + sideSign * Math.PI / 2) * sideOffset
          )
        }

        const coneAngle = sideSign * (1 - idx) * (5 * Math.PI / 180)
        const fireAngle = angle + sideSign * Math.PI / 2 + coneAngle
        muzzleDir.set(Math.sin(fireAngle), 0, Math.cos(fireAngle)).normalize()

        // Create muzzle flash particle & smoke burst at cannon muzzle
        createCannonMuzzleFlash(scene, muzzleWorldPos.clone(), muzzleDir.clone())

        const speed = 42
        spawnCannonball(muzzleWorldPos, muzzleDir.clone().multiplyScalar(speed), { isPlayer: true })
      })
    } else {
      const numCannons = 3 + playerUpgrades.value.cannonCount * 2
      for (let c = 0; c < numCannons; c++) {
        const zOffset = -4 + (8 / (numCannons - 1 || 1)) * c
        const fireAngle = angle + sideSign * Math.PI / 2
        muzzleWorldPos.set(
          playerPos.value.x + Math.sin(angle) * zOffset + Math.sin(angle + sideSign * Math.PI / 2) * 3.4,
          2.6,
          playerPos.value.z + Math.cos(angle) * zOffset + Math.cos(angle + sideSign * Math.PI / 2) * 3.4
        )
        muzzleDir.set(Math.sin(fireAngle), 0, Math.cos(fireAngle)).normalize()
        createCannonMuzzleFlash(scene, muzzleWorldPos.clone(), muzzleDir.clone())

        spawnCannonball(muzzleWorldPos, muzzleDir.clone().multiplyScalar(42), { isPlayer: true })
      }
    }
  })

  const sideName = side === 'port' ? 'PORT (LEFT)' : (side === 'starboard' ? 'STARBOARD (RIGHT)' : 'BROADSIDE')
  showMessage(`${sideName} broadside fired`, 1000)
}

function fireEnemyCannon() {
  // Legacy function - keep for compatibility
  if (enemyShips.value.length > 0 && enemyShips.value[0].hp > 0) {
    fireEnemyCannonMulti(enemyShips.value[0], SHIP_TYPES[enemyShips.value[0].type], 0)
  }
}

function fireEnemyCannonMulti(enemy, shipType, enemyIndex, sideToFire) {
  const angle = enemy.angle
  const mesh = enemyShipMeshes[enemyIndex]

  const sides = [sideToFire || 'starboard']
  const muzzlePos = new THREE.Vector3()
  const muzzleDir = new THREE.Vector3()

  sides.forEach(sideKey => {
    const sideSign = sideKey === 'port' ? -1 : 1
    const cannons = mesh && mesh.userData && mesh.userData[`${sideKey}Cannons`]

    if (cannons && cannons.length > 0) {
      cannons.forEach(c => {
        if (c.mesh) {
          c.mesh.getWorldPosition(muzzlePos)
        } else {
          muzzlePos.set(
            enemy.x + Math.sin(angle + sideSign * Math.PI / 2) * 2.5,
            2.5,
            enemy.z + Math.cos(angle + sideSign * Math.PI / 2) * 2.5
          )
        }

        const fireAngle = angle + sideSign * Math.PI / 2
        muzzleDir.set(Math.sin(fireAngle), 0, Math.cos(fireAngle))
        createCannonMuzzleFlash(scene, muzzlePos.clone(), muzzleDir.clone())

        spawnCannonball(muzzlePos, muzzleDir.clone().multiplyScalar(35), {
          isEnemy: true,
          damage: shipType.cannonDamage,
          sourceIndex: enemyIndex
        })
      })
    } else {
      muzzlePos.set(enemy.x, 2.5, enemy.z)
      muzzleDir.set(Math.sin(angle), 0, Math.cos(angle))
      createCannonMuzzleFlash(scene, muzzlePos.clone(), muzzleDir.clone())

      spawnCannonball(muzzlePos, muzzleDir.clone().multiplyScalar(35), {
        isEnemy: true,
        damage: shipType.cannonDamage,
        sourceIndex: enemyIndex
      })
    }
  })
}

function updateCannonballs(dt) {
  while (cannonballs.length > MAX_CANNONBALLS) removeCannonballAt(0)

  for (let i = cannonballs.length - 1; i >= 0; i--) {
    const ball = cannonballs[i]

    // Performance: Cull distant cannonballs
    const distToPlayerSq = (ball.mesh.position.x - playerPos.value.x) ** 2 + (ball.mesh.position.z - playerPos.value.z) ** 2
    if (distToPlayerSq > CANNONBALL_CULL_DIST * CANNONBALL_CULL_DIST) {
      removeCannonballAt(i)
      continue
    }

    ball.mesh.position.x += ball.vx * dt
    ball.mesh.position.z += ball.vz * dt
    ball.life -= dt

    // Check collision with enemies (both player AND enemy cannons can damage enemies)
    let hitEnemy = false
    if (ball.isPlayer || ball.isEnemy) {
      for (let eIndex = 0; eIndex < enemyShips.value.length; eIndex++) {
        const enemy = enemyShips.value[eIndex]
        if (enemy.hp <= 0) continue

        // Don't hit yourself (for enemy cannons)
        if (ball.isEnemy && ball.sourceIndex === eIndex) continue

        const dx = ball.mesh.position.x - enemy.x
        const dz = ball.mesh.position.z - enemy.z
        const shipType = SHIP_TYPES[enemy.type]
        const hitDist = 6 * shipType.size

        if (dx * dx + dz * dz < hitDist * hitDist) {
          const damage = ball.damage || 10
          enemy.hp -= damage

          if (ball.isPlayer) {
            showMessage(`Hit ${shipType.name}`)
          } else {
            showMessage(`Enemy fire hit ${shipType.name}`)
          }

          removeCannonballAt(i)
          hitEnemy = true
          break // Only hit one enemy
        }
      }
    }
    if (hitEnemy) continue

    // Check collision with kraken
    if (krakenActive && kraken.value.hp > 0) {
      const dx = ball.mesh.position.x - kraken.value.x
      const dz = ball.mesh.position.z - kraken.value.z
      if (dx * dx + dz * dz < 100) {
        kraken.value.hp -= 5
        showMessage('Hit the Kraken!')
        if (kraken.value.hp <= 0) {
          victory.value = true
          gameState.value = 'gameover'
        }
        removeCannonballAt(i)
        continue
      }
    }

    // Check collision with player (from enemy cannons only - not your own!)
    // Add grace period so your own cannons don't hit you
    const age = (performance.now() - ball.spawnTime) / 1000
    if (age > 0.3 && ball.isEnemy) {
      const pdx = ball.mesh.position.x - playerPos.value.x
      const pdz = ball.mesh.position.z - playerPos.value.z
      if (pdx * pdx + pdz * pdz < 9) {
        const damage = ball.damage || 10
        hp.value -= damage
        showMessage('You were hit!')
        removeCannonballAt(i)
        if (hp.value <= 0) {
          gameState.value = 'gameover'
        }
        continue
      }
    }

    if (ball.life <= 0) {
      removeCannonballAt(i)
      continue
    }

    // Check collision with islands and rocks — cannonballs smash into terrain
    let hitTerrain = false
    for (const islandList of [islands, worldObjects.islands]) {
      for (const island of islandList) {
        const dx = ball.mesh.position.x - island.x
        const dz = ball.mesh.position.z - island.z
        if (dx * dx + dz * dz < island.radius * island.radius) {
          hitTerrain = true
          break
        }
      }
      if (hitTerrain) break
    }
    if (!hitTerrain) {
      for (const rockList of [rocks, worldObjects.rocks]) {
        for (const rock of rockList) {
          const dx = ball.mesh.position.x - rock.x
          const dz = ball.mesh.position.z - rock.z
          const hitRadius = rock.radius + 2
          if (dx * dx + dz * dz < hitRadius * hitRadius) {
            hitTerrain = true
            break
          }
        }
        if (hitTerrain) break
      }
    }
    if (hitTerrain) removeCannonballAt(i)
  }
}

let mouseDeltaX = 0 // Track mouse movement for steering

let turnAccumulator = 0 // Clamp total accumulated turn
let brakeHeld = false
let harbourShopDismissed = false

function releasePointerLock() {
  if (document.pointerLockElement) {
    document.exitPointerLock()
  }
}

function onMouseMove(e) {
  if (shopOpen.value) return
  // Always accumulate mouse movement when game is playing
  // This works because pointer lock captures all mouse movement
  if (gameState.value === 'playing') {
    // Very low sensitivity for big ship feel (inverted: right turns right)
    const turnInput = -e.movementX * 0.0003

    // Clamp the accumulated turn to maintain sluggish feel
    // Can't push past this limit no matter how far you move mouse
    const maxTurnDelta = 0.008 // Max turn per frame
    turnAccumulator += turnInput
    turnAccumulator = Math.max(-maxTurnDelta, Math.min(maxTurnDelta, turnAccumulator))

    mouseDeltaX = turnAccumulator
  }
}

function onPointerLockChange() {
  pointerLocked = document.pointerLockElement !== null
  if (pointerLocked) {
    mouseDeltaX = 0 // Reset on lock
    showMessage('Pointer locked - move mouse to steer', 2000)
  } else {
    showMessage('Pointer unlocked - click to re-lock', 2000)
  }
}

function requestPointerLock() {
  // Request on canvas element
  if (canvas.value) {
    canvas.value.requestPointerLock()
  }
}

function onClick(e) {
  // Request pointer lock on any click when playing
  if (gameState.value === 'playing' && !shopOpen.value) {
    requestPointerLock()
  }
}

function onMouseDown(e) {
  if (gameState.value === 'playing' && !shopOpen.value) {
    // Left click (button 0) = starboard (right), Right click (button 2) = port (left)
    // Inverted: left side of ship = left click feels more natural
    if (e.button === 0) {
      fireCannon('starboard')
    } else if (e.button === 2) {
      fireCannon('port')
    }
  }
}

function onContextMenu(e) {
  e.preventDefault() // Prevent context menu on right click
  // Right click fires port cannons (inverted from left click)
  if (gameState.value === 'playing' && !shopOpen.value) {
    fireCannon('port')
  }
}

function onWheel(e) {
  if (shopOpen.value) return
  // Scroll up = more top-down (fighting), scroll down = more behind (navigation)
  if (e.deltaY < 0) {
    cameraMode = Math.min(1, cameraMode + 0.1)
  } else {
    cameraMode = Math.max(0, cameraMode - 0.1)
  }

  const modeNames = ['Navigation', 'Combat']
  const currentMode = cameraMode > 0.5 ? 1 : 0
  showMessage(`${modeNames[currentMode]} view`, 1500)
}

function onKeyDown(e) {
  if (gameState.value !== 'playing') return
  if (shopOpen.value) return
  if (anchorAnimating) return

  if (e.key === 'b' || e.key === 'B') {
    brakeHeld = true
    return
  }

  // A key - toggle anchor
  if (e.key === 'a' || e.key === 'A') {
    anchorAnimating = true

    if (!anchorDropped) {
      showMessage('Dropping anchor...', 1500)
      if (!anchorMesh) createAnchor()
      anchorAnimDir = 1
      anchorAnimProgress = 0
    } else {
      showMessage('Raising anchor...', 1500)
      anchorAnimDir = -1
      anchorAnimProgress = 1
    }
  }
}

function onKeyUp(e) {
  if (e.key === 'b' || e.key === 'B') {
    brakeHeld = false
  }
}

function createAnchor() {
  const anchorGroup = new THREE.Group()
  const metalMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, specular: 0x444444, shininess: 30 })

  // Chain (positioned relative to group origin)
  const chainGeom = new THREE.CylinderGeometry(0.06, 0.06, 10, 6)
  const chain = new THREE.Mesh(chainGeom, metalMat)
  chain.position.y = -5
  anchorGroup.add(chain)

  // Shank (vertical bar)
  const shankGeom = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8)
  const shank = new THREE.Mesh(shankGeom, metalMat)
  shank.position.y = -11
  anchorGroup.add(shank)

  // Crown (bottom cross-piece)
  const crownGeom = new THREE.BoxGeometry(2.2, 0.2, 0.2)
  const crown = new THREE.Mesh(crownGeom, metalMat)
  crown.position.y = -12.2
  anchorGroup.add(crown)

  // Flukes (angled tips)
  const flukeGeom = new THREE.ConeGeometry(0.25, 1.2, 4)
  const flukeL = new THREE.Mesh(flukeGeom, metalMat)
  flukeL.rotation.z = Math.PI * 0.15
  flukeL.position.set(-1.1, -12.6, 0)
  anchorGroup.add(flukeL)
  const flukeR = new THREE.Mesh(flukeGeom, metalMat)
  flukeR.rotation.z = -Math.PI * 0.15
  flukeR.position.set(1.1, -12.6, 0)
  anchorGroup.add(flukeR)

  // Ring at top
  const ringGeom = new THREE.TorusGeometry(0.3, 0.06, 8, 12)
  const ring = new THREE.Mesh(ringGeom, metalMat)
  ring.position.y = 0.2
  anchorGroup.add(ring)

  anchorGroup.position.y = 0
  anchorGroup.visible = false
  playerShip.add(anchorGroup)
  anchorMesh = anchorGroup
}

// === HARBOUR SYSTEM ===

function checkHarbourEntry() {
  for (const island of worldObjects.islands) {
    if (!island.mesh || !island.mesh.userData.hasHarbor) continue
    const dockWorldX = island.userData && island.userData.dockWorldX !== undefined
      ? island.userData.dockWorldX
      : (island.x + (island.mesh.userData.dockEndX || 0))
    const dockWorldZ = island.userData && island.userData.dockWorldZ !== undefined
      ? island.userData.dockWorldZ
      : island.z
    const dx = playerPos.value.x - dockWorldX
    const dz = playerPos.value.z - dockWorldZ
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < HARBOUR_RANGE * 1.6) {
      if (!anchorDropped && !shopOpen.value && !harbourShopDismissed) {
        showMessage('⚓ PORT DOCK NEARBY — Press A to drop anchor & enter Port Shop', 1500)
      } else if (anchorDropped && !harbourShopDismissed) {
        shopOpen.value = true
        harbourShopDismissed = false
        shopMessage.value = ''
        mouseDeltaX = 0
        turnAccumulator = 0
        releasePointerLock()
        showMessage('Welcome to Port', 3000)
        return
      }
    }
  }
}

function createParrotMesh() {
  if (parrotGroup) return
  const g = new THREE.Group()

  // Body — bright green/red macaw
  const bodyGeom = new THREE.SphereGeometry(0.35, 8, 8)
  bodyGeom.scale(1, 1.3, 0.9)
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1b8c1b, specular: 0x224422, shininess: 20 })
  const body = new THREE.Mesh(bodyGeom, bodyMat)
  g.add(body)

  // Head
  const headGeom = new THREE.SphereGeometry(0.22, 8, 8)
  const headMat = new THREE.MeshPhongMaterial({ color: 0x22aa22, specular: 0x336633, shininess: 25 })
  const head = new THREE.Mesh(headGeom, headMat)
  head.position.set(0, 0.42, 0.08)
  g.add(head)

  // Beak
  const beakGeom = new THREE.ConeGeometry(0.07, 0.18, 6)
  const beakMat = new THREE.MeshPhongMaterial({ color: 0xf5c542 })
  const beak = new THREE.Mesh(beakGeom, beakMat)
  beak.rotation.x = -Math.PI / 2
  beak.position.set(0, 0.40, 0.28)
  g.add(beak)

  // Eyes
  const eyeGeom = new THREE.SphereGeometry(0.04, 6, 6)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const eyeL = new THREE.Mesh(eyeGeom, eyeMat)
  eyeL.position.set(-0.12, 0.48, 0.17)
  g.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeom, eyeMat)
  eyeR.position.set(0.12, 0.48, 0.17)
  g.add(eyeR)

  // Red chest patch
  const chestGeom = new THREE.SphereGeometry(0.20, 6, 6)
  chestGeom.scale(0.8, 0.7, 0.5)
  const chestMat = new THREE.MeshPhongMaterial({ color: 0xcc2222 })
  const chest = new THREE.Mesh(chestGeom, chestMat)
  chest.position.set(0, 0.05, 0.22)
  g.add(chest)

  // Tail feathers
  const tailGeom = new THREE.BoxGeometry(0.12, 0.5, 0.05)
  const tailMat1 = new THREE.MeshPhongMaterial({ color: 0x2244cc })
  const tailMat2 = new THREE.MeshPhongMaterial({ color: 0xcc2222 })
  const tail1 = new THREE.Mesh(tailGeom, tailMat1)
  tail1.position.set(-0.06, -0.55, -0.1)
  tail1.rotation.x = 0.15
  g.add(tail1)
  const tail2 = new THREE.Mesh(tailGeom, tailMat2)
  tail2.position.set(0.06, -0.55, -0.1)
  tail2.rotation.x = 0.15
  g.add(tail2)

  // Wings (folded)
  const wingGeom = new THREE.BoxGeometry(0.06, 0.35, 0.25)
  const wingMat = new THREE.MeshPhongMaterial({ color: 0x178c17 })
  const wingL = new THREE.Mesh(wingGeom, wingMat)
  wingL.position.set(-0.28, 0.05, -0.02)
  wingL.rotation.z = 0.15
  g.add(wingL)
  const wingR = new THREE.Mesh(wingGeom, wingMat)
  wingR.position.set(0.28, 0.05, -0.02)
  wingR.rotation.z = -0.15
  g.add(wingR)

  // Perch on the crosstree near the crow's nest
  g.position.set(0.6, 12.5, 0)
  g.scale.setScalar(1.8)
  playerShip.add(g)
  parrotGroup = g
}

function buyUpgrade(type) {
  const costs = {
    sailSpeed: { 1: 150, 2: 350, 3: 600 },
    cannonCount: { 1: 200, 2: 450, 3: 750 },
    cannonSpeed: { 1: 175, 2: 400, 3: 700 },
    maxHpBonus: { 1: 150, 2: 300, 3: 500, 4: 750, 5: 1000 },
    parrot: { 1: 500, 2: 750, 3: 1100, 4: 1500, 5: 2000 }
  }

  if (type === 'repairHaul') {
    const cost = 100 + playerUpgrades.value.repairCount * 10
    if (gold.value < cost) {
      showShopMessage(`Not enough gold. Need ${cost}`)
      return
    }
    gold.value -= cost
    playerUpgrades.value.repairCount++
    const maxHp = 100 + playerUpgrades.value.maxHpBonus * 10
    hp.value = Math.min(maxHp, hp.value + 10)
    showShopMessage(`Repaired: +10 HP for ${cost}g`)
    return
  }

  if (type === 'parrot') {
    const current = playerUpgrades.value.parrot
    if (current >= 5) {
      showShopMessage('Max level reached')
      return
    }
    const nextLevel = current + 1
    const cost = costs.parrot[nextLevel]
    if (gold.value < cost) {
      showShopMessage(`Not enough gold. Need ${cost}`)
      return
    }
    gold.value -= cost
    playerUpgrades.value.parrot = nextLevel
    if (nextLevel === 1) {
      createParrotMesh()
      showShopMessage(`Polly wants a cracker! +5% loot`)
    } else {
      showShopMessage(`Parrot levelled up! Now +${nextLevel * 5}% loot`)
    }
    return
  }

  if (type === 'maxHpBonus') {
    const current = playerUpgrades.value.maxHpBonus
    if (current >= 5) {
      showShopMessage('Max level reached')
      return
    }
    const nextLevel = current + 1
    const cost = costs.maxHpBonus[nextLevel]
    if (gold.value < cost) {
      showShopMessage(`Not enough gold. Need ${cost}`)
      return
    }
    gold.value -= cost
    playerUpgrades.value.maxHpBonus = nextLevel
    const newMaxHp = 100 + nextLevel * 10
    hp.value = newMaxHp // Full heal on upgrade
    showShopMessage(`Max HP +10. Now ${newMaxHp} HP`)
    return
  }

  const current = playerUpgrades.value[type]
  if (current >= 3) {
    showShopMessage('Max level reached')
    return
  }
  const nextLevel = current + 1
  const cost = costs[type][nextLevel]
  if (gold.value < cost) {
    showShopMessage(`Not enough gold. Need ${cost}`)
    return
  }
  gold.value -= cost
  playerUpgrades.value[type] = nextLevel
  showShopMessage(`Upgraded ${type} to level ${nextLevel}`)

  // Rebuild player ship model so new visual upgrades appear immediately!
  createPlayerShipLocal()
}

function closeShop() {
  shopOpen.value = false
  harbourShopDismissed = true
  shopMessage.value = ''
  showMessage('Back to the helm', 1500)
  requestPointerLock()
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  resizeWindOverlay()
  createWindParticles()
}

function getWindDirection() {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(((windAngle + Math.PI) / (Math.PI * 2)) * 8) % 8
  return dirs[idx]
}

// Animate sails based on wind
function animateSails(dt) {
  const time = Date.now() * 0.001

  // 1. Animate player topmast Jolly Roger flag fluttering
  if (playerShip && playerShip.userData.flagMesh) {
    const flagMesh = playerShip.userData.flagMesh
    const positions = flagMesh.geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const wave = Math.sin(time * 14 - x * 4) * 0.18 * Math.max(0, x)
      positions.setZ(i, wave)
    }
    positions.needsUpdate = true
  }

  // 2. Animate player ship sails and yard trim
  if (playerShip && playerShip.userData.sails) {
    const windStrength = windSpeed.value / 6 // 0-1
    const angleDelta = shortestAngleDelta(playerAngle, windAngle)
    const windAlignment = Math.cos(angleDelta) // 1 = tailwind, -1 = headwind
    const isHeadwind = windAlignment < -0.65 // No-Go Zone

    // Yard Trim: Yardarms pivot up to +-60 deg to catch wind
    const targetYardRotation = Math.max(-1.0, Math.min(1.0, angleDelta * 0.5))

    playerShip.userData.sails.forEach((sail, index) => {
      // Trim yard group
      if (sail.userData.yardGroup) {
        sail.userData.yardGroup.rotation.y += (targetYardRotation - sail.userData.yardGroup.rotation.y) * 3.0 * dt
      }

      if (!sail.userData.originalVertices || !sail.userData.fixedEdges) return

      const positions = sail.geometry.attributes.position
      const original = sail.userData.originalVertices
      const fixedEdges = sail.userData.fixedEdges

      for (let i = 0; i < positions.count; i++) {
        if (fixedEdges[i]) continue

        const x = original[i * 3]
        const y = original[i * 3 + 1]

        const normX = x / 4.0
        const normY = y / 4.0

        if (isHeadwind) {
          // No-Go Zone: Luffing / Violent Fluttering
          const flutter = Math.sin(time * 16 + y * 2.0 + index * 3.0) * 0.35 * (1 - Math.abs(normY))
          positions.array[i * 3 + 2] = flutter
          positions.array[i * 3] = x + Math.cos(time * 12 + y) * 0.12
        } else {
          // Wind Catching: Dynamic 3D Aerofoil Billow
          const billowDepth = (0.8 + windStrength * 1.4) * (1 - normY * normY) * Math.max(0.2, (windAlignment + 1) / 2)
          const ripple = Math.sin(time * 8 + y * 1.5 + x * 2.0) * 0.08 * (1 - Math.abs(normY))
          positions.array[i * 3 + 2] = billowDepth + ripple
          positions.array[i * 3] = x * (1 + billowDepth * 0.08)
        }
      }

      positions.needsUpdate = true
    })
  }

  // 3. Animate AI enemy ship sails & topmast flags
  enemyShipMeshes.forEach(mesh => {
    if (mesh && mesh.userData.flagMesh) {
      const flagMesh = mesh.userData.flagMesh
      const positions = flagMesh.geometry.attributes.position
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i)
        const wave = Math.sin(time * 12 - x * 4) * 0.15 * Math.max(0, x)
        positions.setZ(i, wave)
      }
      positions.needsUpdate = true
    }

    if (mesh && mesh.userData.sails) {
      mesh.userData.sails.forEach(sail => {
        if (!sail.userData.originalVertices || !sail.userData.fixedEdges) return
        const positions = sail.geometry.attributes.position
        const original = sail.userData.originalVertices
        const fixedEdges = sail.userData.fixedEdges
        for (let i = 0; i < positions.count; i++) {
          if (fixedEdges[i]) continue
          const x = original[i * 3]
          const y = original[i * 3 + 1]
          const billow = Math.sin(time * 4 + y) * 0.2
          positions.array[i * 3 + 2] = 0.4 + billow
        }
        positions.needsUpdate = true
      })
    }
  })

  // Update treasure
  if (gameState.value === 'playing') {
    updateTreasure(dt)
  }
}



// Check if a position would collide with obstacles
function checkIslandCollision(x, z, radius) {
  // Check only islands (for obstacle avoidance)
  for (const island of islands) {
    const dx = x - island.x
    const dz = z - island.z
    if (Math.sqrt(dx * dx + dz * dz) < island.radius + radius) {
      return true
    }
  }

  for (const island of worldObjects.islands) {
    const dx = x - island.x
    const dz = z - island.z
    if (Math.sqrt(dx * dx + dz * dz) < island.radius + radius) {
      return true
    }
  }

  return false
}

// Check rocks only (for collision damage - enemies can sometimes hit rocks)
function checkRockCollision(x, z, radius) {
  for (const rock of rocks) {
    const dx = x - rock.x
    const dz = z - rock.z
    if (Math.sqrt(dx * dx + dz * dz) < rock.radius + radius) {
      return true
    }
  }

  for (const rock of worldObjects.rocks) {
    const dx = x - rock.x
    const dz = z - rock.z
    if (Math.sqrt(dx * dx + dz * dz) < rock.radius + radius) {
      return true
    }
  }

  return false
}

// Line of sight check - returns true if no obstacles between two points
function hasLineOfSight(x1, z1, x2, z2) {
  const dx = x2 - x1
  const dz = z2 - z1
  const dist = Math.sqrt(dx * dx + dz * dz)
  const steps = Math.ceil(dist / 5) // Check every 5 units

  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const checkX = x1 + dx * t
    const checkZ = z1 + dz * t

    // Check static islands (legacy)
    for (const island of islands) {
      const idx = checkX - island.x
      const idz = checkZ - island.z
      if (Math.sqrt(idx * idx + idz * idz) < island.radius) {
        return false
      }
    }

    // Check procedural islands
    for (const island of worldObjects.islands) {
      const idx = checkX - island.x
      const idz = checkZ - island.z
      if (Math.sqrt(idx * idx + idz * idz) < island.radius) {
        return false
      }
    }

    // Check static rocks
    for (const rock of rocks) {
      const rdx = checkX - rock.x
      const rdz = checkZ - rock.z
      if (Math.sqrt(rdx * rdx + rdz * rdz) < rock.radius + 2) {
        return false
      }
    }

    // Check procedural rocks
    for (const rock of worldObjects.rocks) {
      const rdx = checkX - rock.x
      const rdz = checkZ - rock.z
      if (Math.sqrt(rdx * rdx + rdz * rdz) < rock.radius + 2) {
        return false
      }
    }
  }

  return true
}

function updateFireEffects(dt) {
  const time = Date.now() * 0.001

  // Player fire
  if (playerFire.value) {
    const hpPercent = hp.value / 100
    if (hpPercent > 0.5) {
      // Remove fire if health restored - dispose properly
      disposeGroup(playerFire.value.mesh)
      playerFire.value = null
    } else {
      // Animate flames
      playerFire.value.mesh.position.set(playerPos.value.x, 0, playerPos.value.z)
      const intensity = 1 - (hpPercent / 0.5) // 0 when 50% hp, 1 when 0% hp

      for (const flame of playerFire.value.flames) {
        const flicker = Math.sin(time * 10 + flame.userData.phase) * 0.2 * intensity
        flame.scale.setScalar(0.5 + flicker + intensity * 0.5)
        flame.position.y = flame.userData.baseY + flicker * 0.5
      }
    }
  } else if (hp.value < 50) {
    // Create fire when damaged
    playerFire.value = buildFire(scene, playerPos.value.x, playerPos.value.z)
  }

  // Enemy fires
  for (let i = enemyFires.value.length - 1; i >= 0; i--) {
    const fire = enemyFires.value[i]
    const enemy = enemyShips.value.find(e => e === fire.enemy)

    if (!enemy || enemy.hp > enemy.maxHp * 0.5) {
      // Remove fire if enemy healed or dead - dispose properly
      disposeGroup(fire.mesh)
      enemyFires.value.splice(i, 1)
    } else {
      // Animate flames
      fire.mesh.position.set(enemy.x, 0, enemy.z)
      const hpPercent = enemy.hp / enemy.maxHp
      const intensity = 1 - (hpPercent / 0.5)

      for (const flame of fire.flames) {
        const flicker = Math.sin(time * 10 + flame.userData.phase) * 0.2 * intensity
        flame.scale.setScalar(0.5 + flicker + intensity * 0.5)
        flame.position.y = flame.userData.baseY + flicker * 0.5
      }
    }
  }

  // Create fire for damaged enemies
  for (const enemy of enemyShips.value) {
    if (enemy.hp > 0 && enemy.hp < enemy.maxHp * 0.5) {
      const hasFire = enemyFires.value.some(f => f.enemy === enemy)
      if (!hasFire) {
        enemyFires.value.push({
          enemy,
          ...buildFire(scene, enemy.x, enemy.z)
        })
      }
    }
  }
}

function updateMinimap() {
  const canvas = minimapCanvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, 180, 180)

  ctx.save()
  ctx.beginPath()
  ctx.arc(90, 90, 85, 0, Math.PI * 2)
  ctx.clip()

  ctx.fillStyle = '#0a2336'
  ctx.fillRect(0, 0, 180, 180)

  ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(90, 90, 30, 0, Math.PI * 2)
  ctx.arc(90, 90, 60, 0, Math.PI * 2)
  ctx.stroke()

  const px = playerPos.value.x
  const pz = playerPos.value.z
  const scale = 0.28

  function worldToMap(wx, wz) {
    const dx = (wx - px) * scale
    const dz = (wz - pz) * scale
    return { x: 90 + dx, y: 90 + dz }
  }

  worldObjects.islands.forEach(island => {
    const pos = worldToMap(island.x, island.z)
    const r = Math.max(4, island.radius * scale)
    if (pos.x + r >= 0 && pos.x - r <= 180 && pos.y + r >= 0 && pos.y - r <= 180) {
      ctx.fillStyle = '#d4be8d'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r + 1.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#3a6645'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
      ctx.fill()

      if (island.mesh && island.mesh.userData && island.mesh.userData.hasHarbor) {
        const dockX = island.userData && island.userData.dockWorldX !== undefined ? island.userData.dockWorldX : (island.x + (island.mesh.userData.dockEndX || 0))
        const dockZ = island.userData && island.userData.dockWorldZ !== undefined ? island.userData.dockWorldZ : island.z
        const dPos = worldToMap(dockX, dockZ)
        ctx.fillStyle = '#00ff88'
        ctx.beginPath()
        ctx.arc(dPos.x, dPos.y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  })

  worldObjects.rocks.forEach(rock => {
    const pos = worldToMap(rock.x, rock.z)
    const r = Math.max(2, rock.radius * scale)
    ctx.fillStyle = '#555555'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    ctx.fill()
  })

  if (worldObjects.ships) {
    worldObjects.ships.forEach(ship => {
      if (!ship.isLooted) {
        const pos = worldToMap(ship.x, ship.z)
        ctx.fillStyle = '#ffd700'
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ff8c00'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    })
  }

  (enemyShips.value || []).forEach(enemy => {
    if (enemy && enemy.hp > 0) {
      const pos = worldToMap(enemy.x, enemy.z)
      ctx.fillStyle = '#ff3333'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  const pAngle = typeof playerAngle !== 'undefined' ? playerAngle : (playerShip ? playerShip.rotation.y : 0)
  ctx.save()
  ctx.translate(90, 90)
  ctx.rotate(-pAngle)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(0, -7)
  ctx.lineTo(4, 5)
  ctx.lineTo(0, 3)
  ctx.lineTo(-4, 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.restore()

  ctx.strokeStyle = '#b8860b'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(90, 90, 87, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 9px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', 90, 12)
  ctx.fillText('S', 90, 168)
  ctx.fillText('E', 168, 90)
  ctx.fillText('W', 12, 90)
}

function update(dt) {
  oceanTime += dt
  processDisposalQueue()
  updateMuzzleFlashes(scene, dt)

  if (oceanMesh) {
    updateOcean(oceanMesh, oceanTime, playerPos.value.x, playerPos.value.z, windAngle, windSpeed.value)
  }
  updateShorelineFoamTime(oceanTime)
  if (sprayPool) updateSpray(sprayPool, dt)
  fishUpdateAccumulator += dt
  if (fishMesh && fishUpdateAccumulator >= 1 / 30) {
    updateAmbientFish(fishMesh, fishUpdateAccumulator, oceanTime, playerPos.value.x, playerPos.value.z)
    fishUpdateAccumulator = 0
  }

  minimapUpdateAccumulator += dt
  if (minimapUpdateAccumulator >= 0.15) {
    updateMinimap()
    minimapUpdateAccumulator = 0
  }

  // Check sunken shipwreck looting
  if (worldObjects.ships && gameState.value === 'playing') {
    worldObjects.ships.forEach(ship => {
      if (!ship.isLooted && ship.mesh) {
        updateShipBuoyancy(
          ship.mesh,
          ship.physicsState || (ship.physicsState = { currentY: 0, currentPitch: 0, currentRoll: 0 }),
          ship.x,
          ship.z,
          ship.heading || 0,
          0,
          0,
          oceanTime,
          dt,
          9,
          3.5
        )

        const dx = playerPos.value.x - ship.x
        const dz = playerPos.value.z - ship.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 20) {
          ship.isLooted = true
          const parrotBonus = 1 + (playerUpgrades.value.parrot || 0) * 0.05
          const loot = Math.floor((ship.lootValue || 150) * parrotBonus)
          gold.value += loot
          score.value += loot
          const maxHp = 100 + (playerUpgrades.value.maxHpBonus || 0) * 10
          if (hp.value < maxHp) {
            hp.value = Math.min(maxHp, hp.value + 15)
          }
          showMessage(`🏴‍☠️ Looted Sunken Shipwreck! +${loot} Gold & Supplies!`, 3500)

          if (ship.mesh) scene.remove(ship.mesh)
          if (ship.beaconMesh) scene.remove(ship.beaconMesh)
        }
      }
    })
  }

  const allIslands = [...islands, ...worldObjects.islands]
  allIslands.forEach(island => {
    if (island.mesh && island.mesh.userData.hasHarbor && island.mesh.userData.dock) {
      const gX = island.x + island.mesh.userData.dockEndX
      const gZ = island.z
      const h = getOceanHeight(gX, gZ, oceanTime, windAngle, windSpeed.value)
      island.mesh.userData.dockEndRing.position.y = h + 0.2
    }
  })

  if (shopOpen.value) {
    if (!anchorDropped) {
      shopOpen.value = false
      harbourShopDismissed = false
    } else {
      let stillInHarbour = false
      for (const island of worldObjects.islands) {
        if (!island.mesh.userData.hasHarbor) continue
        const dockWorldX = island.userData && island.userData.dockWorldX !== undefined ? island.userData.dockWorldX : (island.x + (island.mesh.userData.dockEndX || 0))
        const dockWorldZ = island.userData && island.userData.dockWorldZ !== undefined ? island.userData.dockWorldZ : island.z
        const dx = playerPos.value.x - dockWorldX
        const dz = playerPos.value.z - dockWorldZ
        if (Math.sqrt(dx * dx + dz * dz) < HARBOUR_RANGE * 1.6) {
          stillInHarbour = true
          break
        }
      }
      if (!stillInHarbour) {
        shopOpen.value = false
        harbourShopDismissed = false
      }
    }
    return
  }

  checkHarbourEntry()

  if (gameState.value !== 'playing') return

  // Direction and intensity progress linearly over long, continuous passages.
  updateWind(dt)

  // Animate sails
  sailUpdateAccumulator += dt
  if (sailUpdateAccumulator >= 1 / 30) {
    animateSails(sailUpdateAccumulator)
    sailUpdateAccumulator = 0
  }

  // === GRADUAL STEERING WITH MOUSE ===
  // Add mouse delta to target rotation for easing
  if (mouseDeltaX !== 0) {
    targetRotation += mouseDeltaX
    // Decay the mouse delta
    mouseDeltaX *= 0.7
    // Clear if very small
    if (Math.abs(mouseDeltaX) < 0.0001) mouseDeltaX = 0
  }

  // Ease player angle towards target rotation (smooth turning)
  // Big ship takes time to react and turn
  // If anchor is dropped, turn VERY slowly
  const turnSpeed = anchorDropped ? 0.2 : 1.0
  const angleDiff = targetRotation - playerAngle
  if (Math.abs(angleDiff) > 0.001) {
    playerAngle += angleDiff * turnSpeed * dt
  }

  // === MOMENTUM-BASED SPEED PHYSICS ===
  // Calculate target speed based on wind alignment
  const windDir = Math.cos(windAngle - playerAngle)
  const windStrengthFactor = Math.max(0.65, Math.min(1.35, 0.7 + windSpeed.value * 0.11))
  const baseMaxSpeed = 15 + playerUpgrades.value.sailSpeed * 3
  const maxSpeed = baseMaxSpeed * windStrengthFactor
  const minSpeed = 1.25 + windSpeed.value * 0.18
  const windDrive = Math.max(0, (windDir + 1) / 2)
  const targetSpeed = minSpeed + (maxSpeed - minSpeed) * windDrive
  const brakingTargetSpeed = 0.35
  const desiredSpeed = brakeHeld && !anchorDropped ? Math.min(targetSpeed, brakingTargetSpeed) : targetSpeed

  // Gradually accelerate/decelerate toward target speed (momentum)
  // Big heavy ship takes a long time to speed up and slow down
  // If anchor dropped, no acceleration allowed
  const acceleration = anchorDropped ? 0 : (0.28 + windSpeed.value * 0.06) * (0.78 + windDrive * 0.35)
  if (playerSpeed.value < desiredSpeed) {
    playerSpeed.value = Math.min(desiredSpeed, playerSpeed.value + acceleration * dt)
  } else {
    playerSpeed.value = Math.max(desiredSpeed, playerSpeed.value - acceleration * 0.3 * dt)
  }

  // Holding brake adds drag, but the ship still carries momentum like a heavy hull.
  if (brakeHeld && !anchorDropped) {
    const brakingForce = playerSpeed.value > 8 ? 2.1 : 1.35
    playerSpeed.value = Math.max(0, playerSpeed.value - brakingForce * dt)
  }

  // Apply momentum to position
  const prevX = playerPos.value.x
  const prevZ = playerPos.value.z
  playerPos.value.x += Math.sin(playerAngle) * playerSpeed.value * dt
  playerPos.value.z += Math.cos(playerAngle) * playerSpeed.value * dt

  // ── Player collision with islands and rocks ──
  collisionCooldown = Math.max(0, collisionCooldown - dt)
  const shipRadius = 5 // approximate ship collision radius
  let hitObstacle = null
  let hitIsRock = false

  // Check islands (both static and procedural)
  for (const island of [...islands, ...worldObjects.islands]) {
    const dx = playerPos.value.x - island.x
    const dz = playerPos.value.z - island.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < island.radius + shipRadius) {
      hitObstacle = island
      hitIsRock = false
      break
    }
  }

  // Check rocks (both static and procedural)
  if (!hitObstacle) {
    for (const rock of [...rocks, ...worldObjects.rocks]) {
      const dx = playerPos.value.x - rock.x
      const dz = playerPos.value.z - rock.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < rock.radius + shipRadius) {
        hitObstacle = rock
        hitIsRock = true
        break
      }
    }
  }

  if (hitObstacle) {
    // Push player back out of the obstacle
    const dx = playerPos.value.x - hitObstacle.x
    const dz = playerPos.value.z - hitObstacle.z
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.01
    const overlap = (hitObstacle.radius + shipRadius) - dist
    const pushX = (dx / dist) * (overlap + 1)
    const pushZ = (dz / dist) * (overlap + 1)
    playerPos.value.x = prevX + pushX * 0.5
    playerPos.value.z = prevZ + pushZ * 0.5

    // Apply damage based on speed (with cooldown)
    const impactSpeed = playerSpeed.value
    if (collisionCooldown <= 0 && impactSpeed > 1) {
      const dmgMultiplier = hitIsRock ? 2 : 1
      const damage = Math.floor(impactSpeed * dmgMultiplier)
      hp.value = Math.max(0, hp.value - damage)
      collisionCooldown = 1.0 // 1 second cooldown

      if (hitIsRock) {
        showMessage(`Hit a rock! -${damage} HP`, 2000)
      } else {
        showMessage(`Ran aground! -${damage} HP`, 2000)
      }
    }

    // Kill speed on impact
    playerSpeed.value = Math.max(0, playerSpeed.value * 0.1)
  }

  // Infinite world - check procedural spawns every 20 frames (not every frame)
  spawnCheckFrameCounter++
  if (spawnCheckFrameCounter >= 20) {
    spawnCheckFrameCounter = 0
    checkProceduralSpawns()
  }

  // Cleanup distant objects every 2 seconds
  if (Date.now() - lastCleanupTime > 2000) {
    cleanupDistantChunks()
    lastCleanupTime = Date.now()
  }

  // Update player ship mesh with multi-point hull buoyancy physics
  const px = playerPos.value.x
  const pz = playerPos.value.z
  const spd = playerSpeed.value

  const physRes = updateShipBuoyancy(
    playerShip,
    playerPhysicsState,
    px,
    pz,
    playerAngle,
    spd,
    angleDiff * turnSpeed,
    oceanTime,
    dt,
    14,
    6,
    0.72
  )

  // Update ocean island & boulder shore foam list periodically
  if (oceanMesh && frameCount % 30 === 0) {
    setOceanIslands(oceanMesh, [...islands, ...worldObjects.islands], [...rocks, ...worldObjects.rocks])
  }

  // Emit wave-locked stern spray when water is being shed at speed.
  if (sprayPool && spd > 2.5) {
    const waveSlam = Math.max(0, -(physRes.dispBow.y - physRes.dispStern.y)) * spd * 0.03
    const sprayRate = (spd - 2.5) * 2.4 + waveSlam * 60
    if (Math.random() < Math.min(1, sprayRate * dt)) {
      emitSpray(sprayPool, px, pz, playerAngle, spd, 1 + Math.floor(spd / 4), physRes.dispStern.y)
    }
  }

  // Emit player wake trail
  if (spd > 0.5) {
    emitWake(scene, 'player', px, pz, playerAngle, spd, 1.8)
  }

  // Anchor drop/raise animation
  if (anchorMesh) {
    anchorMesh.visible = anchorDropped || anchorAnimating

    if (anchorAnimating) {
      anchorAnimProgress += anchorAnimDir * dt * 1.0  // 1 second full travel
      anchorAnimProgress = Math.max(0, Math.min(1, anchorAnimProgress))

      // Animate Y from 0 (raised, tucked into ship) to -15 (dropped into water)
      const ease = anchorAnimDir > 0
        ? anchorAnimProgress * anchorAnimProgress          // accelerate drop
        : 1 - (1 - anchorAnimProgress) * (1 - anchorAnimProgress)  // decelerate raise
      anchorMesh.position.y = -ease * 12

      if (anchorAnimDir > 0 && anchorAnimProgress >= 1) {
        anchorAnimating = false
        anchorAnimDir = 0
        anchorDropped = true
        playerSpeed.value = 0
        showMessage('Anchor dropped', 1500)
        checkHarbourEntry()
      } else if (anchorAnimDir < 0 && anchorAnimProgress <= 0) {
        anchorAnimating = false
        anchorAnimDir = 0
        anchorDropped = false
        harbourShopDismissed = false
        playerSpeed.value = 0.5
        showMessage('Anchor raised', 1500)
      }
    }
  }

  // Parrot idle animation — head bob, slight body sway
  if (parrotGroup) {
    const pt = oceanTime * 2.5
    parrotGroup.rotation.y = Math.sin(pt * 0.4) * 0.3
    if (parrotGroup.children[1]) parrotGroup.children[1].rotation.x = Math.sin(pt * 1.2) * 0.12
    parrotGroup.position.y = 12.5 + Math.sin(pt * 0.7) * 0.08
  }

  // Camera follow - interpolate between behind view and top-down based on cameraMode
  // Behind view (navigation): close behind, lower angle
  const behindDist = 50
  const behindHeight = 35
  // Top-down view (combat): high above, looking down
  const topDownDist = 80
  const topDownHeight = 100

  // Interpolate based on cameraMode
  let dist = behindDist + (topDownDist - behindDist) * cameraMode
  const height = behindHeight + (topDownHeight - behindHeight) * cameraMode

  // Add distance based on speed (camera pulls back when going faster)
  const speedBoost = playerSpeed.value * 1.5
  dist += speedBoost

  camera.position.x = playerPos.value.x - Math.sin(playerAngle) * dist
  camera.position.z = playerPos.value.z - Math.cos(playerAngle) * dist
  camera.position.y = height
  camera.lookAt(playerPos.value.x, 5, playerPos.value.z) // Look slightly above water
  if (atmosphere) updateSky(atmosphere, camera.position.x, camera.position.z)

  // Island collision
  for (const island of islands) {
    const dx = playerPos.value.x - island.x
    const dz = playerPos.value.z - island.z
    if (Math.sqrt(dx * dx + dz * dz) < island.radius + 3) {
      hp.value -= 20 * dt
      showMessage('Hit an island!')
    }
  }

  // Rock collision
  for (const rock of rocks) {
    const dx = playerPos.value.x - rock.x
    const dz = playerPos.value.z - rock.z
    if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 2) {
      hp.value -= 30 * dt
      showMessage('Hit a rock!')
    }
  }

  if (hp.value <= 0) {
    gameState.value = 'gameover'
    shopOpen.value = false
  }

  // === MULTIPLE ENEMY SHIPS AI ===
  // Performance: Throttle AI updates to every 2nd frame
  const aiThrottle = frameCount % 2 === 0
  enemyShips.value.forEach((enemy, index) => {
    if (enemy.hp <= 0) return // Skip destroyed ships

    const mesh = enemyShipMeshes[index]
    if (!mesh) return

    const shipType = SHIP_TYPES[enemy.type]

    // Calculate direction to player
    const dx = playerPos.value.x - enemy.x
    const dz = playerPos.value.z - enemy.z
    const distToPlayerSq = dx * dx + dz * dz
    const distToPlayer = Math.sqrt(distToPlayerSq)

    // Skip AI for very distant enemies (already handled above, but double-check)
    if (distToPlayerSq > ACTIVE_DIST * ACTIVE_DIST) return

    // Performance: Throttle EXPENSIVE AI decisions
    if (aiThrottle || !enemy.targetAngle) {
      // Enemy state machine
      if (!enemy.state) enemy.state = 'IDLE'

      // State transitions based on distance
      if (distToPlayer > ENEMY_IDLE_DIST) enemy.state = 'IDLE'
      else if (distToPlayer > ENEMY_ATTACK_DIST) enemy.state = 'ALERT'
      else enemy.state = 'ATTACKING'

      let targetAngle = enemy.angle 

      if (enemy.state === 'IDLE') {
        if (!enemy.idleAngle || Math.random() < 0.02) {
          enemy.idleAngle = enemy.angle + (Math.random() - 0.5) * 2.0
        }
        targetAngle = enemy.idleAngle
      } else if (enemy.state === 'ALERT') {
        targetAngle = Math.atan2(dx, dz)
        enemy.speedMod = 0.5
      } else {
        enemy.speedMod = 1.0
        if (enemy.type === 'RAMMER') targetAngle = Math.atan2(dx, dz)
        else if (enemy.type === 'NORMAL') {
          if (distToPlayer > 35) targetAngle = Math.atan2(dx, dz)
          else if (distToPlayer < 20) targetAngle = Math.atan2(dx, dz) + Math.PI * 0.7
          else targetAngle = Math.atan2(dx, dz) + (index % 2 === 0 ? 0.6 : -0.6)
        } else if (enemy.type === 'BIG') {
          const perpAngle = Math.atan2(dx, dz) + Math.PI * 0.5
          const otherAngle = Math.atan2(dx, dz) - Math.PI * 0.5
          const angleDiff = Math.abs(enemy.angle - perpAngle)
          const otherDiff = Math.abs(enemy.angle - otherAngle)
          targetAngle = angleDiff < otherDiff ? perpAngle : otherAngle
        }
      }

      // Check for islands ahead only
      const lookAheadX = enemy.x + Math.sin(enemy.angle) * 18
      const lookAheadZ = enemy.z + Math.cos(enemy.angle) * 18
      const islandAhead = checkIslandCollision(lookAheadX, lookAheadZ, 6)
      const oblivious = Math.random() < 0.1

      let moveAngle = targetAngle
      if (islandAhead && !oblivious) {
        const leftCheck = checkIslandCollision(enemy.x + Math.sin(enemy.angle + 0.6) * 12, enemy.z + Math.cos(enemy.angle + 0.6) * 12, 6)
        const rightCheck = checkIslandCollision(enemy.x + Math.sin(enemy.angle - 0.6) * 12, enemy.z + Math.cos(enemy.angle - 0.6) * 12, 6)
        
        if (!leftCheck && rightCheck) moveAngle = enemy.angle + 1.2
        else if (!rightCheck && leftCheck) moveAngle = enemy.angle - 1.2
        else if (!leftCheck && !rightCheck) moveAngle = enemy.angle + 1.5
        else moveAngle = enemy.angle + Math.PI
        
        enemy.speedMod = 0.4 // Slow down to turn
      }
      
      enemy.targetAngle = moveAngle
    }

    // Smoothly turn toward target (ALWAYS runs every frame)
    let diff = enemy.targetAngle - enemy.angle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    enemy.angle += diff * dt * shipType.turnSpeed

    // Move at speed (ALWAYS runs every frame)
    let speedMult = enemy.speedMod || 1.0
    const enemySpeed = shipType.speed * speedMult
    enemy.x += Math.sin(enemy.angle) * enemySpeed * dt
    enemy.z += Math.cos(enemy.angle) * enemySpeed * dt

    // Enemy wake trail
    if (enemySpeed > 0.5) {
      emitWake(scene, `enemy_${index}`, enemy.x, enemy.z, enemy.angle, enemySpeed, 1.4)
    }

    // Check if enemy hit a rock (takes damage but keeps going sometimes)
    if (checkRockCollision(enemy.x, enemy.z, 3)) {
      enemy.hp -= 5 * dt // Less damage from rocks
      // Only push away 30% of the time (sometimes they get stuck)
      if (Math.random() < 0.3) {
        const pushAngle = Math.random() * Math.PI * 2
        enemy.x += Math.sin(pushAngle) * 2
        enemy.z += Math.cos(pushAngle) * 2
      }
      if (Math.random() < 0.05) {
        showMessage(`${enemy.type} scraped a rock`, 1000)
      }
    }

    // Infinite world - no boundaries

    // Update enemy mesh — multi-point hull buoyancy on waves
    mesh.userData.physicsState = mesh.userData.physicsState || { currentY: 0, currentPitch: 0, currentRoll: 0 }
    const sizeMult = shipType.size || 1.0
    const enemyPhysRes = updateShipBuoyancy(
      mesh,
      mesh.userData.physicsState,
      enemy.x,
      enemy.z,
      enemy.angle,
      enemySpeed,
      diff * 0.5,
      oceanTime,
      dt,
      12 * sizeMult,
      5 * sizeMult
    )

    // Visible vessels shed a smaller stern plume into the same one-draw-call pool.
    if (sprayPool && enemySpeed > 3 && distToPlayerSq < 180 * 180) {
      const enemySprayRate = (enemySpeed - 3) * 0.45
      if (Math.random() < enemySprayRate * dt) {
        emitSpray(sprayPool, enemy.x, enemy.z, enemy.angle, enemySpeed, 1, enemyPhysRes.dispStern.y)
      }
    }

    // Collision with player
    const edx = playerPos.value.x - enemy.x
    const edz = playerPos.value.z - enemy.z
    const enemyDist = Math.sqrt(edx * edx + edz * edz)
    const collisionDist = 4 * shipType.size

    if (enemyDist < collisionDist + 3) {
      // Rammers deal 2x damage but take little damage
      const damage = enemy.type === 'RAMMER' ? shipType.rammingDamage * 2 : shipType.rammingDamage
      hp.value -= damage * dt

      // Rammers are harder to damage from collision
      const enemyDamage = enemy.type === 'RAMMER' ? 2 : 5
      enemy.hp -= enemyDamage

      // Bounce back
      enemy.x -= Math.sin(enemy.angle) * 2
      enemy.z -= Math.cos(enemy.angle) * 2

      const typeName = enemy.type === 'RAMMER' ? 'Ramming ship' : (enemy.type === 'BIG' ? 'Galleon' : 'Sloop')
      showMessage(`Collision with ${typeName}`)
    }

    // Enemy fires only when attacking, in range, and presenting a broadside.
    if (enemy.state === 'ATTACKING' || enemy.state === 'ALERT') {
      const now = performance.now()
      const fireRange = enemy.type === 'NORMAL' ? 45 : 55
      const starboardAlignment = distToPlayer > 0
        ? (dx * Math.cos(enemy.angle) - dz * Math.sin(enemy.angle)) / distToPlayer
        : 0
      const hasBroadsideAim = Math.abs(starboardAlignment) > 0.65

      if (distToPlayer < fireRange && hasBroadsideAim && now >= enemy.nextShotAt) {
        // Avoid repeating terrain line-of-sight scans every rendered frame when
        // an island blocks an otherwise valid shot.
        enemy.nextShotAt = now + 250
        if (hasLineOfSight(enemy.x, enemy.z, playerPos.value.x, playerPos.value.z)) {
          const sideToFire = starboardAlignment > 0 ? 'starboard' : 'port'
          fireEnemyCannonMulti(enemy, shipType, index, sideToFire)

          // A real-time reload schedule is independent of frame rate and is
          // staggered so several enemies cannot create one giant synchronized burst.
          const reloadTime = enemy.type === 'BIG' ? 3000 : (enemy.type === 'NORMAL' ? 2400 : 2800)
          enemy.nextShotAt = now + reloadTime + Math.random() * 700
        }
      }
    }
  })

  // === ENEMY-ENEMY COLLISION ===
  for (let i = 0; i < enemyShips.value.length; i++) {
    const e1 = enemyShips.value[i]
    if (e1.hp <= 0) continue
    const t1 = SHIP_TYPES[e1.type]

    for (let j = i + 1; j < enemyShips.value.length; j++) {
      const e2 = enemyShips.value[j]
      if (e2.hp <= 0) continue
      const t2 = SHIP_TYPES[e2.type]

      const dx = e1.x - e2.x
      const dz = e1.z - e2.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      const collisionDist = (4 * t1.size) + (4 * t2.size)

      if (dist < collisionDist) {
        // Both take damage
        e1.hp -= 5
        e2.hp -= 5

        // Bounce apart
        const angle = Math.atan2(dx, dz)
        e1.x += Math.sin(angle) * 3
        e1.z += Math.cos(angle) * 3
        e2.x -= Math.sin(angle) * 3
        e2.z -= Math.cos(angle) * 3

        showMessage('Enemy ships collided')
      }
    }
  }

  // === ENEMY OBSTACLE COLLISION (rocks and islands) ===
  enemyShips.value.forEach((enemy) => {
    if (enemy.hp <= 0) return
    const shipType = SHIP_TYPES[enemy.type]

    // Check islands
    for (const island of islands) {
      const dx = enemy.x - island.x
      const dz = enemy.z - island.z
      if (Math.sqrt(dx * dx + dz * dz) < island.radius + 5 * shipType.size) {
        enemy.hp -= 15
        // Bounce away
        const angle = Math.atan2(dx, dz)
        enemy.x += Math.sin(angle) * 5
        enemy.z += Math.cos(angle) * 5
        showMessage(`${shipType.name} hit an island`)
      }
    }

    // Check rocks
    for (const rock of rocks) {
      const dx = enemy.x - rock.x
      const dz = enemy.z - rock.z
      if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 3 * shipType.size) {
        enemy.hp -= 10
        // Bounce away
        const angle = Math.atan2(dx, dz)
        enemy.x += Math.sin(angle) * 3
        enemy.z += Math.cos(angle) * 3
        showMessage(`${shipType.name} hit a rock`)
      }
    }
  })

  // === SINKING ANIMATION ===
  enemyShips.value.forEach((enemy, index) => {
    if (enemy.hp <= 0 && !enemy.sinking) {
      // Start sinking
      enemy.sinking = true
      enemy.sinkingTime = 0
      const shipType = SHIP_TYPES[enemy.type]
      showMessage(`${shipType.name} is sinking`)
    }

    if (enemy.sinking) {
      enemy.sinkingTime += dt
      const mesh = enemyShipMeshes[index]
      if (mesh) {
        // Sink into water and rotate
        mesh.position.y = -enemy.sinkingTime * 2 // Sink down
        mesh.rotation.x = Math.min(Math.PI / 2, enemy.sinkingTime * 0.3) // Tilt back
        mesh.rotation.z = Math.sin(enemy.sinkingTime * 3) * 0.1 // Slight wobble
      }
    }
  })

  // Remove fully sunk enemies
  for (let i = enemyShips.value.length - 1; i >= 0; i--) {
    if (enemyShips.value[i].sinking && enemyShips.value[i].sinkingTime > 3) {
      // Spawn treasure before removing (unique entity each time)
      const enemy = enemyShips.value[i]
      spawnEnemyTreasure(enemy)

      // Remove after 3 seconds of sinking - dispose mesh properly
      const mesh = enemyShipMeshes[i]
      if (mesh) disposeGroup(mesh)
      enemyShipMeshes.splice(i, 1)
      enemyShips.value.splice(i, 1)
    }
  }

  // Kraken AI
  if (krakenActive && kraken.value.hp > 0) {
    const dx = playerPos.value.x - kraken.value.x
    const dz = playerPos.value.z - kraken.value.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    // Kraken states: idle (random movement), aggressive (chase player)
    if (dist > 70) {
      // Idle - move randomly
      if (!kraken.value.idleTarget || Math.random() < 0.01) {
        kraken.value.idleAngle = Math.random() * Math.PI * 2
        kraken.value.idleSpeed = 1 + Math.random() * 1
      }
      kraken.value.x += Math.sin(kraken.value.idleAngle) * kraken.value.idleSpeed * dt
      kraken.value.z += Math.cos(kraken.value.idleAngle) * kraken.value.idleSpeed * dt
    } else if (dist > 35) {
      // Approach - move toward player but slowly
      kraken.value.x += (dx / dist) * 2 * dt
      kraken.value.z += (dz / dist) * 2 * dt
    } else {
      // Aggressive - close to player
      if (dist > 25) {
        kraken.value.x += (dx / dist) * 3 * dt
        kraken.value.z += (dz / dist) * 3 * dt
      }
    }

    // === WHIRLPOOL - Pull player if too close ===
    // Whirlpool zone matches visual (about 25 units)
    if (dist < 25) {
      // Check wind direction relative to player heading
      // Positive = wind behind (tailwind), Negative = headwind
      let windAlignment = Math.cos(windAngle - playerAngle)

      // If wind is behind player (Â±20Â°), reduce pull or push out
      let pullModifier = 1.0
      if (windAlignment > 0.94) { // Within Â±20Â° of tailwind
        pullModifier = -0.5 // Push OUT of whirlpool
      }

      // Stronger pull when closer (within visual circle)
      const pullStrength = (1 - dist / 25) * 2 * pullModifier // Max pull speed of 2
      if (pullStrength !== 0) {
        playerPos.value.x += (kraken.value.x - playerPos.value.x) / dist * pullStrength * dt
        playerPos.value.z += (kraken.value.z - playerPos.value.z) / dist * pullStrength * dt
      }

      // Slow player movement in whirlpool - more if sailing against wind
      let slowFactor = 0.95
      if (windAlignment < 0.94 && windAlignment > 0) { // sailing against wind (but not completely)
        // Extra slowdown if wind is somewhat against
        slowFactor = 0.9
      } else if (windAlignment < 0.17) { // sailing directly against wind (Â±10Â°)
        slowFactor = 0.85 // Much faster slowdown
      }
      playerSpeed.value *= slowFactor
    }

    // === KRAKEN TENTACLES - Smash attack based on player speed ===
    const time = Date.now() * 0.001
    const anyActive = kraken.value.tentacles.some(t => t.userData.state !== 'idle')

    kraken.value.tentacles.forEach((tent, i) => {
      // Update cooldown
      if (tent.userData.smashCooldown > 0 && tent.userData.state === 'idle') {
        tent.userData.smashCooldown -= dt
      }

      const tentAngle = tent.userData.angle
      const tentGroup = tent.userData.group

      if (tent.userData.state === 'idle') {
        // Gentle wave animation using group rotation
        const wave = Math.sin(time * tent.userData.speed + tent.userData.phase) * 0.15
        tentGroup.rotation.x = wave
        tentGroup.rotation.z = Math.cos(tentAngle) * wave * 0.3

        // Check if should attack - player within 35 units
        if (dist < 35 && !anyActive && tent.userData.smashCooldown <= 0) {
          // Calculate hit chance based on speed
          // <5 = 100%, >13 = 0%, linear in between
          let hitChance = 1 - (playerSpeed.value - 5) / 8
          hitChance = Math.max(0, Math.min(1, hitChance))

          tent.userData.targetAngle = Math.atan2(dx, dz)
          tent.userData.hitChance = hitChance
          tent.userData.state = 'aiming'
        }
      }
      else if (tent.userData.state === 'aiming') {
        // Point toward target angle
        let angleDiff = tent.userData.targetAngle - tentAngle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        // Aim quickly
        if (Math.abs(angleDiff) > 0.05) {
          tent.userData.angle += angleDiff * 3 * dt
        } else {
          // Start smash after aiming
          tent.userData.state = 'smashing'
          tent.userData.smashDuration = 0
        }
        tentGroup.rotation.y = tent.userData.angle - tentAngle // Relative rotation
      }
      else if (tent.userData.state === 'smashing') {
        tent.userData.smashDuration += dt

        // Smash down animation - 0.4 seconds
        if (tent.userData.smashDuration < 0.4) {
          const progress = tent.userData.smashDuration / 0.4
          tentGroup.rotation.x = -progress * 2.5 // Slam down
        }
        // Impact frame - check hit
        else if (tent.userData.smashDuration >= 0.4 && tent.userData.smashDuration < 0.45) {
          // Determine if hit based on chance
          const roll = Math.random()
          const isHit = roll < tent.userData.hitChance

          // Calculate where tentacle hits
          const hitDist = 35 // Tentacle reaches to about 35 units
          const hitX = kraken.value.x + Math.sin(tent.userData.targetAngle) * hitDist
          const hitZ = kraken.value.z + Math.cos(tent.userData.targetAngle) * hitDist

          // Check if player is near hit point
          const pdx = playerPos.value.x - hitX
          const pdz = playerPos.value.z - hitZ
          const playerHitDist = Math.sqrt(pdx * pdx + pdz * pdz)

          if (isHit || playerHitDist < 8) {
            // Hit!
            hp.value -= 40
            showMessage('Tentacle smash!')
          } else {
            showMessage('Tentacle missed')
          }
        }
        // Reset
        else if (tent.userData.smashDuration > 0.8) {
          tent.userData.state = 'recovering'
          tent.userData.recoverDuration = 0
        }
      }
      else if (tent.userData.state === 'recovering') {
        tent.userData.recoverDuration += dt

        // Rise back up - 0.6 seconds
        if (tent.userData.recoverDuration < 0.6) {
          const progress = tent.userData.recoverDuration / 0.6
          tentGroup.rotation.x = -2.5 + progress * 2.5
        } else {
          tent.userData.state = 'idle'
          tent.userData.smashCooldown = 2 + Math.random() * 2
          tentGroup.rotation.x = 0
          // Return to original angle
          const origAngle = (i / 8) * Math.PI * 2
          tent.userData.angle = origAngle
          tentGroup.rotation.y = 0
        }
      }

      // Update group position to follow kraken
      tentGroup.position.x = kraken.value.x
      tentGroup.position.z = kraken.value.z

      // Position attached to body (at kraken center)
      tent.position.x = kraken.value.x
      tent.position.z = kraken.value.z
    })

    // Update whirlpool rotation
    if (krakenMesh.userData.whirlpool) {
      krakenMesh.userData.whirlpool.rotation.z += dt * 0.5
      const whirlpoolOpacity = dist < 25 ? 0.4 + (1 - dist / 25) * 0.3 : 0.15
      krakenMesh.userData.whirlpool.material.opacity = whirlpoolOpacity
    }

    // Performance: Only render kraken mesh within KRAKEN_RENDER_DIST
    const krakenDistToPlayerSq = (kraken.value.x - playerPos.value.x) ** 2 + (kraken.value.z - playerPos.value.z) ** 2
    const krakenVisible = krakenDistToPlayerSq < KRAKEN_RENDER_DIST * KRAKEN_RENDER_DIST
    krakenMesh.visible = krakenVisible

    if (krakenVisible) {
      krakenMesh.position.x = kraken.value.x
      krakenMesh.position.z = kraken.value.z
    }

    // Body collision
    if (dist < 15) {
      hp.value -= 20 * dt
      showMessage('Kraken contact!')
    }
  }

  // Update cannonballs
  updateCannonballs(dt)

  // Cannon cooldowns
  if (cannonCooldown.value > 0) cannonCooldown.value -= dt
  if (portCooldown.value > 0) portCooldown.value -= dt
  if (starboardCooldown.value > 0) starboardCooldown.value -= dt

  // === SHIP WAKE TRAIL ===
  tickWake(scene, playerWake, dt, oceanTime, windAngle, windSpeed.value)

  windUpdateAccumulator += dt
  if (windUpdateAccumulator >= 1 / 30) {
    updateWindParticles(windUpdateAccumulator)
    windUpdateAccumulator = 0
  }

  // Debug wind indicators â€” update direction every frame
  if (debugWindArrow) {
    debugWindArrow.rotation.y = windAngle
  }

  // Update fire effects on damaged ships (every 5 frames)
  fireEffectsFrameCounter++
  if (fireEffectsFrameCounter >= 5) {
    fireEffectsFrameCounter = 0
    updateFireEffects(dt)
  }
  
  // === UPDATE ENEMY INDICATORS === (every 5 frames, smoothed)
  indicatorsFrameCounter++
  if (indicatorsFrameCounter >= 5) {
    indicatorsFrameCounter = 0
    updateEnemyIndicators()
  }
}

function updateEnemyIndicators() {
  const indicators = []

  // Check enemy ships
  enemyShips.value.forEach(enemy => {
    const dx = enemy.x - playerPos.value.x
    const dz = enemy.z - playerPos.value.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    // Performance: Only show icons within ICON_RENDER_DIST
    if (dist < ICON_RENDER_DIST && dist > 50) {
      // Calculate angle to enemy
      const angleToEnemy = Math.atan2(dx, dz) - playerAngle

      // Convert to screen position (simple approximation)
      const screenX = 50 - Math.sin(angleToEnemy) * 40
      const screenY = 50 - Math.cos(angleToEnemy) * 30

      indicators.push({
        x: Math.max(10, Math.min(90, screenX)),
        y: Math.max(10, Math.min(90, screenY)),
        angle: angleToEnemy,
        icon: enemy.type === 'RAMMER' ? 'R' : (enemy.type === 'BIG' ? 'G' : 'S'),
        label: `${enemy.type} (${Math.round(dist)}m)`,
        hpPercent: enemy.hp / enemy.maxHp
      })
    }
  })

  // Check kraken
  if (krakenActive && kraken.value.hp > 0) {
    const dx = kraken.value.x - playerPos.value.x
    const dz = kraken.value.z - playerPos.value.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < ACTIVE_DIST) {
      const angleToKraken = Math.atan2(dx, dz) - playerAngle
      const screenX = 50 - Math.sin(angleToKraken) * 40
      const screenY = 50 - Math.cos(angleToKraken) * 30

      indicators.push({
        x: Math.max(10, Math.min(90, screenX)),
        y: Math.max(10, Math.min(90, screenY)),
        angle: -angleToKraken,
        icon: 'K',
        label: `KRAKEN (${Math.round(dist)}m)`
      })
    }
  }

  enemyIndicators.value = indicators
}

function animate(now = performance.now()) {
  animationId = requestAnimationFrame(animate)

  const dt = Math.min(0.05, Math.max(1 / 240, (now - lastFrameTime) / 1000))
  lastFrameTime = now
  frameCount++
  update(dt)

  renderer.render(scene, camera)
}

function startGame() {
  // Exit pointer lock if active
  if (document.pointerLockElement) {
    document.exitPointerLock()
  }
  mouseDeltaX = 0
  turnAccumulator = 0
  brakeHeld = false
  harbourShopDismissed = false
  targetRotation = 0
  cameraMode = 0 // Reset to behind view

  // Reset
  hp.value = 100
  gold.value = 0
  score.value = 0 // Added score reset

  // Reset procedural world
  spawnedChunks.clear()
  worldObjects.islands.forEach(i => scene.remove(i.mesh))
  worldObjects.rocks.forEach(r => scene.remove(r.mesh))
  worldObjects.islands = []
  worldObjects.rocks = []
  cannonCooldown.value = 0
  portCooldown.value = 0
  starboardCooldown.value = 0
  playerPos.value = { x: 0, z: 0 }
  playerAngle = 0
  targetRotation = 0
  playerSpeed.value = 0
  beginWindTransition(false)
  Object.assign(playerPhysicsState, {
    currentY: 0,
    currentPitch: 0,
    currentRoll: 0,
    heaveVelocity: 0,
    pitchVelocity: 0,
    rollVelocity: 0
  })
  windVisualAngle = windAngle
  windVisualSpeed = windSpeed.value

  // Reset anchor
  anchorDropped = false
  anchorAnimating = false
  anchorAnimProgress = 0
  anchorAnimDir = 0
  if (anchorMesh) anchorMesh.position.y = 0
  shopOpen.value = false

  // Reset upgrades
  playerUpgrades.value = { sailSpeed: 0, cannonCount: 0, cannonSpeed: 0, maxHpBonus: 0, repairCount: 0, parrot: 0 }
  if (parrotGroup && playerShip) {
    playerShip.remove(parrotGroup)
    parrotGroup = null
  }
  lastChunkCount = 0
  disposeQueue = [] // Clear pending disposals
  windParticleFrameCounter = 0
  windParticles = []
  if (windParticleContext) {
    windParticleContext.clearRect(0, 0, window.innerWidth, window.innerHeight)
  }
  createWindParticles()
  spawnCheckFrameCounter = 0
  fireEffectsFrameCounter = 0
  indicatorsFrameCounter = 0
  windParticleFrameCounter = 0
  lastCleanupTime = 0
  minimapUpdateAccumulator = 0
  windUpdateAccumulator = 0
  fishUpdateAccumulator = 0
  sailUpdateAccumulator = 0
  lastFrameTime = performance.now()

  // Clear fire effects
  if (playerFire.value) {
    disposeGroup(playerFire.value.mesh)
    playerFire.value = null
  }
  enemyFires.value.forEach(f => disposeGroup(f.mesh))
  enemyFires.value = []

  // Reset treasures - remove all treasure entities with dispose
  treasures.value.forEach(t => {
    if (t.mesh) disposeMesh(t.mesh)
    if (t.ringMesh) disposeMesh(t.ringMesh)
  })
  treasures.value = []
  treasureCollectTimer = 0

  // Clear old enemy references - dispose properly
  enemyShips.value = []
  enemyShipMeshes.forEach(mesh => disposeGroup(mesh))
  enemyShipMeshes = []

  // Spawn new enemies
  spawnEnemyShip()

  // Spawn kraken at random distant location
  const krakenDist = 150 + Math.random() * 100
  const krakenAngle = Math.random() * Math.PI * 2
  const startX = Math.sin(krakenAngle) * krakenDist
  const startZ = Math.cos(krakenAngle) * krakenDist

  if (krakenMesh) {
    scene.remove(krakenMesh)
    krakenMesh = null
  }
  // [KRAKEN DISABLED]
  // krakenActive = true
  // kraken.value = { x: startX, z: startZ, hp: 200, angle: 0, tentacles: [] }
  // createKrakenLocal()

  // Clear cannonballs - dispose properly
  cannonballs.forEach(b => { if (b?.mesh) scene.remove(b.mesh) })
  cannonballs = []
  clearMuzzleFlashes(scene)

  // Clear wake particles - dispose properly
  playerWake.forEach(w => { if (w && w.mesh) disposeMesh(w.mesh) })
  playerWake = []
  clearShipWakes(scene)

  victory.value = false
  gameState.value = 'playing'
  showMessage('Battle commenced', 3000)
}

    const publishUi = () => {
      setUi({
        gameState: gameState.value,
        victory: victory.value,
        hp: hp.value,
        gold: gold.value,
        windDirection: typeof getWindDirection === 'function' ? getWindDirection() : 'N',
        windSpeed: windSpeed.value,
        playerSpeed: playerSpeed.value,
        message: message.value,
        portCooldown: portCooldown.value,
        starboardCooldown: starboardCooldown.value,
        aliveEnemies: aliveEnemies.value,
        krakenHp: kraken.value.hp,
        enemyIndicators: [...enemyIndicators.value],
        shopOpen: shopOpen.value,
        shopMessage: shopMessage.value,
        brakeActive: brakeHeld && !anchorDropped,
        playerUpgrades: { ...playerUpgrades.value }
      })
    }
    const bindAction = (fn) => (...args) => {
      fn(...args)
      publishUi()
    }
    actionsRef.current = {
      startGame: bindAction(startGame),
      buyUpgrade: bindAction(buyUpgrade),
      closeShop: bindAction(closeShop)
    }
    const uiInterval = window.setInterval(publishUi, 100)
    try {
      init()
      animate()
      publishUi()
    } catch (error) {
      console.error('[Pirates] startup error:', error)
    }
    return () => {
      window.clearInterval(uiInterval)
      actionsRef.current = {
        startGame: () => {},
        buyUpgrade: (_type) => {},
        closeShop: () => {}
      }
      if (animationId) cancelAnimationFrame(animationId)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('click', onClick)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('pointerlockchange', onPointerLockChange)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }
      if (windParticleContext) {
        windParticleContext.clearRect(0, 0, window.innerWidth, window.innerHeight)
      }
      if (scene) clearShipWakes(scene)
      if (scene) {
        cannonballs.forEach(b => { if (b?.mesh) scene.remove(b.mesh) })
        cannonballs = []
        clearMuzzleFlashes(scene)
      }
      cannonballGeometry.dispose()
      playerCannonballMaterial.dispose()
      enemyCannonballMaterial.dispose()
      if (renderer) renderer.dispose()
    }
  }, [])
  return (
    <div className="game-container" ref={containerRef}>
      <div className="hud">
        <div className="hud-left">
          <div className="stat">HP: {ui.hp}/{100 + ui.playerUpgrades.maxHpBonus * 10}</div>
          <div className="stat">Gold: {ui.gold}</div>
          <div className="stat">Wind: {ui.windDirection} {ui.windSpeed.toFixed(1)} kn</div>
          <div className="stat">Speed: {ui.playerSpeed?.toFixed(1) || '0'} kn{ui.brakeActive ? ' | BRAKE' : ''}</div>
        </div>
        <div className="hud-center">
          {ui.message ? <div className="message">{ui.message}</div> : null}
        </div>
        <div className="hud-right">
          <div className="stat">Port: {ui.portCooldown > 0 ? `${ui.portCooldown.toFixed(1)}s` : 'READY'}</div>
          <div className="stat">Stbd: {ui.starboardCooldown > 0 ? `${ui.starboardCooldown.toFixed(1)}s` : 'READY'}</div>
          <div className="stat">Enemies: {ui.aliveEnemies} | Kraken: {ui.krakenHp > 0 ? 'ACTIVE' : (ui.aliveEnemies === 0 ? 'NEXT' : '---')}</div>
        </div>
      </div>
      <canvas ref={canvasRef}></canvas>
      <canvas ref={windOverlayRef} className="wind-overlay-canvas"></canvas>
      {/* Nautical Minimap Overlay */}
      <div className="minimap-container">
        <canvas ref={minimapCanvasRef} width={180} height={180} className="minimap-canvas"></canvas>
        <div className="minimap-title">CARIBBEAN RADAR</div>
      </div>
      <div className="indicators">
        {ui.enemyIndicators.map((enemy, index) => (
          <div
            key={`${enemy.label}-${index}`}
            className="indicator"
            style={{
              left: `${enemy.x}%`,
              top: `${enemy.y}%`,
              transform: `translate(-50%, -50%) rotate(${enemy.angle}rad)`
            }}
          >
            <span className="indicator-icon">{enemy.icon}</span>
            <span className="indicator-label">{enemy.label}</span>
            <div className="health-bar-container">
              <div className="health-bar" style={{ width: `${enemy.hpPercent * 100}%` }}></div>
            </div>
          </div>
        ))}
      </div>
      <div className="controls">
        <div className="control-hint">Click to lock | Move mouse to steer | LMB=Starboard | RMB=Port | Hold B = Brake | Scroll = Camera | Avoid rocks</div>
      </div>
      {ui.gameState === 'start' ? (
        <div className="overlay">
          <div className="title">Pirates of the Burning Sea</div>
          <p>Navigate the Caribbean. Fight the navy. Survive the Kraken.</p>
          <div className="instructions">
            <p><strong>Mouse</strong> - Steer your ship</p>
            <p><strong>Left Click</strong> - Fire starboard cannons</p>
            <p><strong>Right Click</strong> - Fire port cannons</p>
            <p><strong>Hold B</strong> - Apply braking force without dropping anchor</p>
            <p><strong>Wind</strong> - Sail with the wind for speed, against it for control</p>
            <p><strong>Avoid</strong> - Islands, rocks, and the Kraken</p>
            <p><strong>Defeat</strong> - The enemy ship, then face the Kraken</p>
          </div>

          <button onClick={() => actionsRef.current.startGame(ui.waterMode)}>Set Sail</button>
        </div>
      ) : null}
      {ui.gameState === 'gameover' ? (
        <div className="overlay">
          <div className="title">{ui.victory ? 'VICTORY' : 'GAME OVER'}</div>
          <p>{ui.victory ? 'You defeated the enemy and survived the Kraken.' : 'Your ship rests at the bottom of the sea.'}</p>
          <p>Gold collected: {ui.gold}</p>
          <button onClick={() => actionsRef.current.startGame()}>Sail Again</button>
        </div>
      ) : null}
      {ui.shopOpen ? (
        <div className="overlay harbour-overlay">
          <div className="harbour-title">PORT SHOP</div>
          <div className="harbour-gold">{ui.gold} Gold</div>
          <div className="harbour-hp">HP: {ui.hp}/{100 + ui.playerUpgrades.maxHpBonus * 10}</div>
          <div className="shop-upgrades">
            <div className="upgrade-card">
              <div className="upgrade-icon">S</div>
              <div className="upgrade-name">Faster Sails</div>
              <div className="upgrade-level">Level {ui.playerUpgrades.sailSpeed}/3</div>
              <div className="upgrade-bonus">
                {ui.playerUpgrades.sailSpeed === 0 ? '+0 max speed' : `+${ui.playerUpgrades.sailSpeed * 3} max speed`}
              </div>
              {ui.playerUpgrades.sailSpeed < 3 ? (
                <button className="upgrade-btn" onClick={() => actionsRef.current.buyUpgrade('sailSpeed')}>
                  BUY {[150, 350, 600][ui.playerUpgrades.sailSpeed]}g
                </button>
              ) : (
                <div className="upgrade-max">MAXED</div>
              )}
            </div>
            <div className="upgrade-card">
              <div className="upgrade-icon">C</div>
              <div className="upgrade-name">Broadside Power</div>
              <div className="upgrade-level">Level {ui.playerUpgrades.cannonCount}/3</div>
              <div className="upgrade-bonus">
                {ui.playerUpgrades.cannonCount === 0 ? '3 cannons/side' : `${3 + ui.playerUpgrades.cannonCount * 2} cannons/side`}
              </div>
              {ui.playerUpgrades.cannonCount < 3 ? (
                <button className="upgrade-btn" onClick={() => actionsRef.current.buyUpgrade('cannonCount')}>
                  BUY {[200, 450, 750][ui.playerUpgrades.cannonCount]}g
                </button>
              ) : (
                <div className="upgrade-max">MAXED</div>
              )}
            </div>
            <div className="upgrade-card">
              <div className="upgrade-icon">R</div>
              <div className="upgrade-name">Faster Cannons</div>
              <div className="upgrade-level">Level {ui.playerUpgrades.cannonSpeed}/3</div>
              <div className="upgrade-bonus">
                {ui.playerUpgrades.cannonSpeed === 0 ? '1.5s cooldown' : `${(1.5 - ui.playerUpgrades.cannonSpeed * 0.25).toFixed(2)}s cooldown`}
              </div>
              {ui.playerUpgrades.cannonSpeed < 3 ? (
                <button className="upgrade-btn" onClick={() => actionsRef.current.buyUpgrade('cannonSpeed')}>
                  BUY {[175, 400, 700][ui.playerUpgrades.cannonSpeed]}g
                </button>
              ) : (
                <div className="upgrade-max">MAXED</div>
              )}
            </div>
            <div className="upgrade-card repair-card">
              <div className="upgrade-icon">H</div>
              <div className="upgrade-name">Repair Haul</div>
              <div className="upgrade-level">Infinite</div>
              <div className="upgrade-bonus">Restore 10 HP for {100 + ui.playerUpgrades.repairCount * 10}g</div>
              <button className="upgrade-btn repair-btn" onClick={() => actionsRef.current.buyUpgrade('repairHaul')}>
                BUY {100 + ui.playerUpgrades.repairCount * 10}g
              </button>
            </div>
            <div className="upgrade-card">
              <div className="upgrade-icon">HP</div>
              <div className="upgrade-name">Max HP</div>
              <div className="upgrade-level">+{ui.playerUpgrades.maxHpBonus * 10} / +10 per level</div>
              <div className="upgrade-bonus">Current max: {100 + ui.playerUpgrades.maxHpBonus * 10} HP</div>
              {ui.playerUpgrades.maxHpBonus < 5 ? (
                <button className="upgrade-btn" onClick={() => actionsRef.current.buyUpgrade('maxHpBonus')}>
                  BUY {[150, 300, 500, 750, 1000][ui.playerUpgrades.maxHpBonus]}g
                </button>
              ) : (
                <div className="upgrade-max">MAXED (150 HP)</div>
              )}
            </div>
            <div className="upgrade-card">
              <div className="upgrade-icon" style={{fontSize: '1.6rem'}}>🦜</div>
              <div className="upgrade-name">Pirate's Parrot</div>
              <div className="upgrade-level">Level {ui.playerUpgrades.parrot}/5</div>
              <div className="upgrade-bonus">
                {ui.playerUpgrades.parrot === 0 ? 'No loot bonus' : `+${ui.playerUpgrades.parrot * 5}% loot`}
              </div>
              {ui.playerUpgrades.parrot < 5 ? (
                <button className="upgrade-btn" onClick={() => actionsRef.current.buyUpgrade('parrot')}>
                  BUY {[500, 750, 1100, 1500, 2000][ui.playerUpgrades.parrot]}g
                </button>
              ) : (
                <div className="upgrade-max">MAXED (+25% loot)</div>
              )}
            </div>
          </div>
          {ui.shopMessage ? <div className="shop-message">{ui.shopMessage}</div> : null}
          <button className="leave-btn" onClick={() => actionsRef.current.closeShop()}>Leave Port</button>
          <div className="shop-hint">Press A to raise anchor and sail</div>
        </div>
      ) : null}
    </div>
  )
}
