// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './pirates.css'
import {
  SHIP_TYPES, MAX_TREASURES, MAX_CANNONBALLS, MAX_ISLANDS, MAX_ROCKS,
  MAX_DISPOSE_PER_FRAME, MAX_WIND_PARTICLES, CHUNK_SIZE, HARBOUR_RANGE,
  ICON_RENDER_DIST, INACTIVE_DIST, ACTIVE_DIST, KRAKEN_INACTIVE_DIST,
  KRAKEN_RENDER_DIST, CANNONBALL_CULL_DIST, ENEMY_IDLE_DIST,
  ENEMY_ALERT_DIST, ENEMY_ATTACK_DIST
} from './constants'
import { normalizeAngle, shortestAngleDelta } from './helpers'
import { createOcean, updateOcean, getOceanHeight, createSprayPool, emitSpray, updateSpray } from './ocean'
import { createPlayerShip as buildPlayerShip, createEnemyShipMesh } from './ships'
import { createSky, spawnIsland as buildIsland, spawnRock as buildRock, spawnSunkenShip as buildSunkenShip, createKraken as buildKraken } from './world'
import { createFire as buildFire, spawnWakeParticle as emitWake, updateWakeParticles as tickWake } from './effects'
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
  }
}
export function PiratesGame() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const windOverlayRef = useRef(null)
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
let animationId = null

// Game state
const gameState = ref('start') // start, playing, gameover
const victory = ref(false)
const hp = ref(100)
const gold = ref(0)

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

// Computed for HUD
const aliveEnemies = computed(() => enemyShips.value.filter(e => e.hp > 0).length)
const cannonCooldown = ref(0) // Both sides
const portCooldown = ref(0) // Left side
const starboardCooldown = ref(0) // Right side
const playerSpeed = ref(0)

// Ship state
let playerShip
const playerPos = ref({ x: 0, z: 0 })
let playerAngle = 0
let targetRotation = 0

// Anchor state
let anchorDropped = false
let anchorAnimating = false
let anchorMesh = null
let anchorAnimProgress = 0   // 0 = fully raised, 1 = fully dropped
let anchorAnimDir = 0        // 1 = dropping, -1 = raising

// Parrot state
let parrotGroup: THREE.Group | null = null

// Camera - 0 = behind (navigation), 1 = top-down (fighting)
let cameraMode = 0 // Start in behind view

// Wind
let windAngle = 0
let targetWindAngle = 0 // For smooth wind transitions
const windSpeed = ref(3)
let targetWindSpeed = 3 // For smooth wind speed transitions
let windChangeTimer = 0
let windVisualAngle = 0
let windVisualSpeed = 3

// Projectiles
let cannonballs = []

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

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
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

  const visualSmoothing = Math.min(1, dt * 2.8)
  windVisualAngle = normalizeAngle(
    windVisualAngle + shortestAngleDelta(windVisualAngle, windAngle) * visualSmoothing
  )
  windVisualSpeed += (windSpeed.value - windVisualSpeed) * visualSmoothing

  const ctx = windParticleContext
  const width = window.innerWidth
  const height = window.innerHeight
  const margin = 140
  const time = Date.now() * 0.001
  const speed = getWindOverlaySpeed()
  updateWindViewData()

  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'

  for (const particle of windParticles) {
    if (!particle || !Number.isFinite(particle.x) || !Number.isFinite(particle.y) || !Number.isFinite(particle.z)) {
      spawnWindParticle(particle, speed, true)
      continue
    }

    particle.speed += (speed - particle.speed) * 0.12
    const swirlPhase = time * particle.swirlSpeed + particle.phase
    const swirlOffset = Math.sin(swirlPhase) * particle.swirl
    const verticalSwirl = Math.cos(swirlPhase * 0.9) * particle.swirl * 0.12
    particle.vx += (windFlowVector.x * particle.speed + windCrossVector.x * swirlOffset - particle.vx) * 0.18
    particle.vz += (windFlowVector.z * particle.speed + windCrossVector.z * swirlOffset - particle.vz) * 0.18
    particle.vy += (verticalSwirl - particle.vy) * 0.08

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
    const gradient = ctx.createLinearGradient(tailX, tailY, screenX, screenY)
    gradient.addColorStop(0, 'rgba(210, 235, 245, 0)')
    gradient.addColorStop(0.35, `rgba(220, 242, 248, ${(alpha * 0.62 * depthFade).toFixed(3)})`)
    gradient.addColorStop(1, `rgba(248, 253, 255, ${(alpha * 1.18 * depthFade).toFixed(3)})`)

    ctx.strokeStyle = gradient
    ctx.lineWidth = particle.width * (1.55 - Math.max(-0.4, windHeadProjection.z + 0.2) * 0.45)
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(screenX, screenY)
    ctx.stroke()
  }
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
  scene.background = new THREE.Color(0x87CEEB)
  scene.fog = null
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 30, -40)
  camera.lookAt(0, 0, 0)
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: false, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)
  const sunLight = new THREE.DirectionalLight(0xffffcc, 1)
  sunLight.position.set(50, 100, 50)
  scene.add(sunLight)
  createSky(scene)
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
  playerShip = buildPlayerShip()
  scene.add(playerShip)
}

// Spawn enemy ships - one of each type
function spawnEnemyShip() {
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
      lastShot: 0,
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
function spawnTreasure(x, z, baseGold = 50, showMsg = true) {
  // Hard cap on treasures - remove oldest if at limit
  if (treasures.value.length >= MAX_TREASURES) {
    const old = treasures.value.shift()
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
    timer: 60, // 60 seconds
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

  // Expand chunks gradually â€” cap at 5x5 (radius 2) to avoid lag spikes
  const chunkRadius = spawnedChunks.size < 10 ? 1 : 2

  // Check chunk grid around player
  for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
      const cx = px + dx
      const cz = pz + dz
      const key = `${cx},${cz}`

      if (!spawnedChunks.has(key)) {
        spawnChunk(cx, cz)
        spawnedChunks.add(key)
      }
    }
  }

  // Cleanup distant chunks (beyond 9x9)
  cleanupDistantChunks()

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

  // 40% chance of island per chunk, then 1-2 islands
  if (Math.random() < 0.4) {
    const numIslands = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < numIslands; i++) {
      const angle = Math.random() * Math.PI * 2
      const maxDist = (CHUNK_SIZE / 2) - 40 // Keep 40 units from edge
      const dist = 20 + Math.random() * maxDist
      const ix = worldX + Math.cos(angle) * dist
      const iz = worldZ + Math.sin(angle) * dist
      worldObjects.islands.push(buildIsland(scene, ix, iz))
    }
  }

  // Spawn rocks (3-6 per chunk) - away from borders
  const numRocks = 3 + Math.floor(Math.random() * 4)
  for (let i = 0; i < numRocks; i++) {
    const angle = Math.random() * Math.PI * 2
    const maxDist = (CHUNK_SIZE / 2) - 25
    const dist = 15 + Math.random() * maxDist
    const rx = worldX + Math.cos(angle) * dist
    const rz = worldZ + Math.sin(angle) * dist
    worldObjects.rocks.push(buildRock(scene, rx, rz))
  }

  // Ship tracking for this chunk (used by both live ships and sunken ships)
  const chunkShips = []

  // Spawn random ships (0-3 ships per chunk) - skip starting chunk
  if (!isStartingChunk) {
    const numShips = Math.random() < 0.3 ? 1 : 0 // 30% chance of 1 ship per chunk

    for (let s = 0; s < numShips; s++) {
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
      spawnTreasure(sx, sz, 75, false)
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
    lastShot: 0,
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

  // Aggressive cleanup: only keep objects within 3 chunks
  const maxDist = CHUNK_SIZE * 3

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

  // Clean chunk references beyond 4 chunks
  for (const key of [...spawnedChunks]) {
    const [cx, cz] = key.split(',').map(Number)
    const wx = cx * CHUNK_SIZE + CHUNK_SIZE / 2
    const wz = cz * CHUNK_SIZE + CHUNK_SIZE / 2
    const dx = wx - px
    const dz = wz - pz
    if (Math.sqrt(dx*dx + dz*dz) > CHUNK_SIZE * 4) {
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

    // Update timer
    t.timer -= dt

    // Check player distance
    const dx = playerPos.value.x - t.x
    const dz = playerPos.value.z - t.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    // Reset timer if player enters zone
    if (dist < 10) {
      t.timer = 60
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
    if (t.timer <= 0) {
      showMessage('Treasure lost to the sea...', 2000)
      // Fade out and sink
      t.collected = true
      t.collectFade = 1.0
      t.mesh.userData.sinking = true
    }

    // Update mesh positions (world coordinates)
    if (t.mesh) t.mesh.position.set(t.x, 1, t.z)
    if (t.ringMesh) t.ringMesh.position.set(t.x, 0.3, t.z)

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

  // Determine which side(s) to fire
  let sidesToFire = []
  if (side === 'port') sidesToFire = [-1] // Left
  else if (side === 'starboard') sidesToFire = [1] // Right
  else sidesToFire = [-1, 1] // Both

  // Number of cannons per broadside based on upgrade
  const numCannons = 3 + playerUpgrades.value.cannonCount * 2

  for (const sideVal of sidesToFire) {
    // Fire cannons with cone spread - count scales with upgrade
    const sidePositions = []
    for (let c = 0; c < numCannons; c++) {
      sidePositions.push(-2 + (4 / (numCannons - 1 || 1)) * c)
    }
    for (let i = 0; i < sidePositions.length; i++) {
      const zOffset = sidePositions[i]
      // Calculate cone angle: front cannon fires forward, back fires backward
      // Mirror between sides: port (-1) and starboard (+1)
      // port: front = forward (+), back = backward (-)
      // starboard: front = forward (+), back = backward (-)
      const coneAngle = sideVal * (1 - i) * (10 * Math.PI / 180) // Mirrored per side

      const ballGeometry = new THREE.SphereGeometry(0.35, 8, 8)
      const ballMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
      const ball = new THREE.Mesh(ballGeometry, ballMaterial)

      const sideOffset = sideVal * 2
      ball.position.set(
        playerPos.value.x + Math.sin(angle) * zOffset + Math.sin(angle + sideVal * Math.PI / 2) * sideOffset,
        2,
        playerPos.value.z + Math.cos(angle) * zOffset + Math.cos(angle + sideVal * Math.PI / 2) * sideOffset
      )

      const speed = 40
      // Add cone angle to firing direction
      const fireAngle = angle + sideVal * Math.PI / 2 + coneAngle
      cannonballs.push({
        mesh: ball,
        vx: Math.sin(fireAngle) * speed,
        vz: Math.cos(fireAngle) * speed,
        life: 3,
        isPlayer: true,
        spawnTime: Date.now()
      })

      scene.add(ball)
    }
  }

  const sideName = side === 'port' ? 'PORT (LEFT)' : (side === 'starboard' ? 'STARBOARD (RIGHT)' : 'BROADSIDE')
  showMessage(`${sideName} broadside fired`, 1000)
}

function fireEnemyCannon() {
  // Legacy function - keep for compatibility
  if (enemyShips.value.length > 0 && enemyShips.value[0].hp > 0) {
    fireEnemyCannonMulti(enemyShips.value[0], SHIP_TYPES[enemyShips.value[0].type], 0)
  }
}

function fireEnemyCannonMulti(enemy, shipType, enemyIndex) {
  const angle = enemy.angle

  if (shipType === SHIP_TYPES.NORMAL) {
    // Normal ship fires 1 cannon straight ahead
    const ballGeom = new THREE.SphereGeometry(0.35, 8, 8)
    const ballMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const ball = new THREE.Mesh(ballGeom, ballMat)
    ball.position.set(enemy.x, 2, enemy.z)

    const speed = 35
    cannonballs.push({
      mesh: ball,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      life: 3,
      isEnemy: true,
      spawnTime: Date.now(),
      damage: shipType.cannonDamage,
      sourceIndex: enemyIndex
    })
    scene.add(ball)
  } else if (shipType === SHIP_TYPES.BIG) {
    // Big ship fires 2 cannons from each side (broadside)
    for (let side = -1; side <= 1; side += 2) {
      for (let offset = -1; offset <= 1; offset += 2) {
        const ballGeom = new THREE.SphereGeometry(0.4, 8, 8)
        const ballMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
        const ball = new THREE.Mesh(ballGeom, ballMat)
        ball.position.set(
          enemy.x + Math.sin(angle + side * Math.PI / 2) * offset * 2,
          2,
          enemy.z + Math.cos(angle + side * Math.PI / 2) * offset * 2
        )

        const speed = 30
        cannonballs.push({
          mesh: ball,
          vx: Math.sin(angle + side * Math.PI / 2) * speed,
          vz: Math.cos(angle + side * Math.PI / 2) * speed,
          life: 3,
          isEnemy: true,
          spawnTime: Date.now(),
          damage: shipType.cannonDamage,
          sourceIndex: enemyIndex
        })
        scene.add(ball)
      }
    }
  }
  // Rammers don't shoot - they ram!
}

function updateCannonballs(dt) {
  // Hard cap enforcement - remove oldest if over limit
  while (cannonballs.length > MAX_CANNONBALLS) {
    const ball = cannonballs.shift()
    if (ball && ball.mesh) disposeMesh(ball.mesh)
  }

  for (let i = cannonballs.length - 1; i >= 0; i--) {
    const ball = cannonballs[i]

    // Performance: Cull distant cannonballs
    const distToPlayerSq = (ball.mesh.position.x - playerPos.value.x) ** 2 + (ball.mesh.position.z - playerPos.value.z) ** 2
    if (distToPlayerSq > CANNONBALL_CULL_DIST * CANNONBALL_CULL_DIST) {
      disposeMesh(ball.mesh)
      cannonballs.splice(i, 1)
      continue
    }

    ball.mesh.position.x += ball.vx * dt
    ball.mesh.position.z += ball.vz * dt
    ball.life -= dt

    // Check collision with enemies (both player AND enemy cannons can damage enemies)
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

        if (Math.sqrt(dx * dx + dz * dz) < hitDist) {
          const damage = ball.damage || 10
          enemy.hp -= damage

          if (ball.isPlayer) {
            showMessage(`Hit ${shipType.name}`)
          } else {
            showMessage(`Enemy fire hit ${shipType.name}`)
          }

          disposeMesh(ball.mesh)
          cannonballs.splice(i, 1)
          break // Only hit one enemy
        }
      }
    }

    // Check collision with kraken
    if (krakenActive && kraken.value.hp > 0) {
      const dx = ball.mesh.position.x - kraken.value.x
      const dz = ball.mesh.position.z - kraken.value.z
      if (Math.sqrt(dx * dx + dz * dz) < 10) {
        kraken.value.hp -= 5
        showMessage('Hit the Kraken!')
        if (kraken.value.hp <= 0) {
          victory.value = true
          gameState.value = 'gameover'
        }
        disposeMesh(ball.mesh)
        cannonballs.splice(i, 1)
        continue
      }
    }

    // Check collision with player (from enemy cannons only - not your own!)
    // Add grace period so your own cannons don't hit you
    const age = (Date.now() - ball.spawnTime) / 1000
    if (age > 0.3 && ball.isEnemy) {
      const pdx = ball.mesh.position.x - playerPos.value.x
      const pdz = ball.mesh.position.z - playerPos.value.z
      if (Math.sqrt(pdx * pdx + pdz * pdz) < 3) {
        const damage = ball.damage || 10
        hp.value -= damage
        showMessage('You were hit!')
        disposeMesh(ball.mesh)
        cannonballs.splice(i, 1)
        if (hp.value <= 0) {
          gameState.value = 'gameover'
        }
        continue
      }
    }

    if (ball.life <= 0) {
      disposeMesh(ball.mesh)
      cannonballs.splice(i, 1)
    }
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
  if (!anchorDropped) return
  if (harbourShopDismissed) return

  for (const island of worldObjects.islands) {
    if (!island.mesh.userData.hasHarbor) continue
    const dockEndX = island.mesh.userData.dockEndX
    // Dock extends along +X from island center
    const dx = playerPos.value.x - (island.x + dockEndX)
    const dz = playerPos.value.z - island.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < HARBOUR_RANGE) {
      shopOpen.value = true
      harbourShopDismissed = false
      shopMessage.value = ''
      mouseDeltaX = 0
      turnAccumulator = 0
      releasePointerLock()
      showMessage('Welcome to port', 3000)
      return
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
  if (!playerShip || !playerShip.userData.sails) return

  const time = Date.now() * 0.001
  const windStrength = windSpeed.value / 6 // Normalize 0-1

  // Calculate how aligned we are with wind (1 = perfect tailwind, -1 = perfect headwind)
  const windAlignment = Math.cos(windAngle - playerAngle)
  // Positive = wind behind, Negative = wind in front
  const windBehind = Math.max(0, windAlignment) // 1 when wind behind, 0 when in front
  const windAhead = Math.max(0, -windAlignment) // 1 when wind in front, 0 when behind

  // More billowing when going fast with wind, less when slow/against wind
  const speedFactor = playerSpeed.value / 15 // 0 to 1 based on speed

  playerShip.userData.sails.forEach((sail, index) => {
    if (!sail.userData.originalVertices || !sail.userData.fixedEdges) return

    const positions = sail.geometry.attributes.position
    const original = sail.userData.originalVertices
    const fixedEdges = sail.userData.fixedEdges

    for (let i = 0; i < positions.count; i++) {
      // Skip vertices on top and bottom edges (attached to yards)
      if (fixedEdges[i]) continue

      const x = original[i * 3] // Horizontal position (-width/2 to +width/2)
      const y = original[i * 3 + 1] // Vertical position

      // x ranges from -width/2 to +width/2
      // The sides (left and right edges) are free to billow
      // distFromCenter: 0 at center (x=0), 1 at edges
      const width = 5.5 / 2 // approximate
      const distFromCenter = Math.abs(x) / width

      // === WIND BEHIND = FULL BELLY, CURVED SHAPE ===
      // Maximum billow when wind is behind and we're moving fast
      // Billow in X direction (sideways from the mast)
      const maxBillow = windBehind * windStrength * (1.5 + speedFactor * 1.0)
      // Curved billow - full in middle, less at corners (parabolic)
      // Only the vertical sides billow, not top/bottom
      const curvedBillow = Math.pow(distFromCenter, 1.5) * maxBillow * 2

      // === WIND IN FRONT = FLUTTER, ALMOST NO VOLUME ===
      // Sails luff and flutter when wind is against
      const flutterAmount = windAhead * 0.25 * (0.2 + speedFactor * 0.3)
      const flutter = Math.sin(time * 8 + y * 0.5 + index * 2) * flutterAmount

      // Apply billow to X axis (sideways billow)
      // Sign matches x direction so both sides billow outward
      const direction = x >= 0 ? 1 : -1
      positions.array[i * 3] = x + direction * curvedBillow + flutter
    }

    positions.needsUpdate = true
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

function update(dt) {
  // Gradual per-frame disposal - prevents lag spikes from bulk cleanup
  processDisposalQueue()

  // GPU ocean animation — runs every frame regardless of game state so waves
  // are always visible.  Uses a local accumulator instead of Date.now() to
  // stay within float32 precision on the GPU.
  oceanTime += dt
  if (oceanMesh) {
    updateOcean(oceanMesh, oceanTime, playerPos.value.x, playerPos.value.z, windAngle, windSpeed.value)
  }
  if (sprayPool) updateSpray(sprayPool, dt)

  if (shopOpen.value) {
    // Pause physics when in harbour shop
    // Check if player left harbour zone - auto-close shop
    if (!anchorDropped) {
      shopOpen.value = false
      harbourShopDismissed = false
    } else {
      let stillInHarbour = false
      for (const island of worldObjects.islands) {
        if (!island.mesh.userData.hasHarbor) continue
        const dockEndX = island.mesh.userData.dockEndX
        const dx = playerPos.value.x - (island.x + dockEndX)
        const dz = playerPos.value.z - island.z
        if (Math.sqrt(dx * dx + dz * dz) < HARBOUR_RANGE) {
          stillInHarbour = true
          break
        }
      }
      if (!stillInHarbour) {
        shopOpen.value = false
        harbourShopDismissed = false
      }
    }
    renderer.render(scene, camera)
    return
  }

  // Check harbour entry while anchored (player may drift into range)
  if (anchorDropped) {
    checkHarbourEntry()
  }

  if (gameState.value !== 'playing') return

  // Update wind - more dynamic changes
  windChangeTimer -= dt
  if (windChangeTimer <= 0) {
    // Set new target wind values
    // Wind changes should feel broad and nautical, not twitchy.
    const shiftAmount = (0.35 + Math.random() * 0.9) * (Math.random() > 0.5 ? 1 : -1)
    targetWindAngle = normalizeAngle(targetWindAngle + shiftAmount)
    targetWindSpeed = 2.5 + Math.random() * 3.5
    windChangeTimer = 14 + Math.random() * 6
    showMessage('Wind shifting...', 2000)
  }

  // Wind direction and force should ease over time instead of snapping.
  const windTransitionSpeed = 0.14
  const windAngleDelta = shortestAngleDelta(windAngle, targetWindAngle)
  if (Math.abs(windAngleDelta) > 0.001) {
    windAngle = normalizeAngle(windAngle + windAngleDelta * windTransitionSpeed * dt * 60)
  }

  if (Math.abs(targetWindSpeed - windSpeed.value) > 0.02) {
    windSpeed.value += (targetWindSpeed - windSpeed.value) * (windTransitionSpeed * 0.65) * dt * 60
  }

  // Animate sails
  animateSails(dt)

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
  playerPos.value.x += Math.sin(playerAngle) * playerSpeed.value * dt
  playerPos.value.z += Math.cos(playerAngle) * playerSpeed.value * dt

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

  // Update ship mesh — sample wave heights to bob on the surface
  const px = playerPos.value.x
  const pz = playerPos.value.z
  playerShip.position.x = px
  playerShip.position.z = pz

  const hCenter = getOceanHeight(px, pz, oceanTime, windAngle, windSpeed.value)
  const bowOff = 6, sideOff = 3
  const hBow   = getOceanHeight(px + Math.sin(playerAngle) * bowOff,  pz - Math.cos(playerAngle) * bowOff, oceanTime, windAngle, windSpeed.value)
  const hStern = getOceanHeight(px - Math.sin(playerAngle) * bowOff,  pz + Math.cos(playerAngle) * bowOff, oceanTime, windAngle, windSpeed.value)
  const hPort  = getOceanHeight(px - Math.cos(playerAngle) * sideOff, pz - Math.sin(playerAngle) * sideOff, oceanTime, windAngle, windSpeed.value)
  const hStbd  = getOceanHeight(px + Math.cos(playerAngle) * sideOff, pz + Math.sin(playerAngle) * sideOff, oceanTime, windAngle, windSpeed.value)

  const speedDampen = 1.0 / (1.0 + playerSpeed.value * 0.025)
  playerShip.position.y = hCenter * speedDampen

  const pitch = Math.atan2((hBow - hStern) * speedDampen, bowOff * 2) * 2.2
  const roll  = Math.atan2((hPort - hStbd) * speedDampen, sideOff * 2) * 2.0
  playerShip.rotation.x = pitch
  playerShip.rotation.z = roll
  playerShip.rotation.y = playerAngle

  // Emit bow spray when moving through waves
  if (sprayPool) {
    const spd = playerSpeed.value
    const waveSlam = Math.max(0, -(hBow - hStern)) * spd * 0.02
    if (spd > 3) {
      const sprayChance = (spd - 3) * 0.035 + waveSlam
      if (Math.random() < sprayChance) {
        emitSpray(sprayPool, px, pz, playerAngle, spd, 1 + Math.floor(spd / 5))
      }
    }
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

    // Performance: Throttle AI updates
    if (!aiThrottle) {
      mesh.position.x = enemy.x
      mesh.position.z = enemy.z
      mesh.position.y = getOceanHeight(enemy.x, enemy.z, oceanTime, windAngle, windSpeed.value)
      mesh.rotation.y = enemy.angle
      return
    }
    // Performance: Skip AI for distant enemies
    if (distToPlayer > ACTIVE_DIST) {
      mesh.visible = distToPlayer <= ACTIVE_DIST + 100
      mesh.position.x = enemy.x
      mesh.position.z = enemy.z
      mesh.position.y = getOceanHeight(enemy.x, enemy.z, oceanTime, windAngle, windSpeed.value)
      mesh.rotation.y = enemy.angle
      return
    }

    // Within active range - full AI
    mesh.visible = true

    // Enemy state machine
    if (!enemy.state) enemy.state = 'IDLE'

    // State transitions based on distance
    if (distToPlayer > ENEMY_IDLE_DIST) {
      enemy.state = 'IDLE'
    } else if (distToPlayer > ENEMY_ATTACK_DIST) {
      enemy.state = 'ALERT'
    } else {
      enemy.state = 'ATTACKING'
    }

    let targetAngle = enemy.angle // Default: keep current direction

    // Different behavior based on state
    if (enemy.state === 'IDLE') {
      // Wander randomly, don't chase player
      if (!enemy.idleAngle || Math.random() < 0.01) {
        enemy.idleAngle = enemy.angle + (Math.random() - 0.5) * 1.5
      }
      targetAngle = enemy.idleAngle
    } else if (enemy.state === 'ALERT') {
      // Start approaching player, but slower
      targetAngle = Math.atan2(dx, dz)
      // Slow movement toward player
      enemy.speedMod = enemy.speedMod || 0.5
    } else {
      // ATTACKING - full chase behavior
      enemy.speedMod = 1.0

      if (enemy.type === 'RAMMER') {
        // Rammers charge directly at player
        targetAngle = Math.atan2(dx, dz)
      } else if (enemy.type === 'NORMAL') {
        // Normal ships try to stay at medium range and circle
        if (distToPlayer > 35) {
          targetAngle = Math.atan2(dx, dz)
        } else if (distToPlayer < 20) {
          targetAngle = Math.atan2(dx, dz) + Math.PI * 0.7
        } else {
          targetAngle = Math.atan2(dx, dz) + (index % 2 === 0 ? 0.5 : -0.5)
        }
      } else if (enemy.type === 'BIG') {
        // Big ships try to get broadside for maximum firepower
        if (distToPlayer > 45) {
          // Too far - approach while trying to angle correctly
          targetAngle = Math.atan2(dx, dz)
        } else if (distToPlayer < 25) {
          // Too close - back off while turning to broadside
          targetAngle = Math.atan2(dx, dz) + Math.PI * 0.5
        } else {
          // Good range - try to be perpendicular to player for broadside
          // Circle to the side based on which side is closer to broadside
          const perpAngle = Math.atan2(dx, dz) + Math.PI * 0.5
          const otherAngle = Math.atan2(dx, dz) - Math.PI * 0.5
          // Pick the direction that gets us to broadside faster
          const angleDiff = Math.abs(enemy.angle - perpAngle)
          const otherDiff = Math.abs(enemy.angle - otherAngle)
          targetAngle = angleDiff < otherDiff ? perpAngle : otherAngle
        }
      }
    }

    // Check for islands ahead only (enemies ignore rocks for avoidance)
    const lookAheadX = enemy.x + Math.sin(enemy.angle) * 15
    const lookAheadZ = enemy.z + Math.cos(enemy.angle) * 15
    const islandAhead = checkIslandCollision(lookAheadX, lookAheadZ, 5)

    // 15% chance to not notice obstacle (stupid AI)
    const oblivious = Math.random() < 0.15

    let moveAngle = targetAngle

    if (islandAhead && !oblivious) {
      const leftCheck = checkIslandCollision(
        enemy.x + Math.sin(enemy.angle + 0.5) * 10,
        enemy.z + Math.cos(enemy.angle + 0.5) * 10, 5
      )
      const rightCheck = checkIslandCollision(
        enemy.x + Math.sin(enemy.angle - 0.5) * 10,
        enemy.z + Math.cos(enemy.angle - 0.5) * 10, 5
      )

      // 20% chance to pick wrong direction even if one is clear
      const wrongChoice = Math.random() < 0.2

      if (!leftCheck && rightCheck && !wrongChoice) moveAngle = enemy.angle + 0.8 * dt
      else if (!rightCheck && leftCheck && !wrongChoice) moveAngle = enemy.angle - 0.8 * dt
      else if (!leftCheck && !rightCheck) moveAngle = enemy.angle + (Math.random() > 0.5 ? 0.8 : -0.8) * dt
      else moveAngle = enemy.angle + Math.PI
    }

    // Smoothly turn toward target
    enemy.angle += (moveAngle - enemy.angle) * dt * shipType.turnSpeed

    // Move at speed based on type and state
    let speedMult = enemy.speedMod || 1.0
    if (islandAhead) speedMult *= 0.5
    const enemySpeed = shipType.speed * speedMult
    enemy.x += Math.sin(enemy.angle) * enemySpeed * dt
    enemy.z += Math.cos(enemy.angle) * enemySpeed * dt

    // Enemy wake
    if (enemySpeed > 2 && Math.random() < 0.1) {
      emitWake(scene, playerWake, enemy.x, enemy.z, enemy.angle, true)
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

    // Update mesh — bob on waves
    mesh.position.x = enemy.x
    mesh.position.z = enemy.z
    const eH = getOceanHeight(enemy.x, enemy.z, oceanTime, windAngle, windSpeed.value)
    mesh.position.y = eH
    const eFwd = 4 * (shipType.size || 1)
    const eSide = 2 * (shipType.size || 1)
    const eHBow  = getOceanHeight(enemy.x + Math.sin(enemy.angle) * eFwd, enemy.z - Math.cos(enemy.angle) * eFwd, oceanTime, windAngle, windSpeed.value)
    const eHStern = getOceanHeight(enemy.x - Math.sin(enemy.angle) * eFwd, enemy.z + Math.cos(enemy.angle) * eFwd, oceanTime, windAngle, windSpeed.value)
    const eHPort  = getOceanHeight(enemy.x - Math.cos(enemy.angle) * eSide, enemy.z - Math.sin(enemy.angle) * eSide, oceanTime, windAngle, windSpeed.value)
    const eHStbd  = getOceanHeight(enemy.x + Math.cos(enemy.angle) * eSide, enemy.z + Math.sin(enemy.angle) * eSide, oceanTime, windAngle, windSpeed.value)
    mesh.rotation.x = Math.atan2(eHBow - eHStern, eFwd * 2) * 1.8
    mesh.rotation.z = Math.atan2(eHPort - eHStbd, eSide * 2) * 1.6
    mesh.rotation.y = enemy.angle

    // Animate enemy sails
    if (mesh.userData.sails) {
      const time = Date.now() * 0.001
      mesh.userData.sails.forEach((sail, sailIndex) => {
        if (!sail.userData.originalVertices) return
        const positions = sail.geometry.attributes.position
        const original = sail.userData.originalVertices
        const windStrength = windSpeed.value / 6
        for (let i = 0; i < positions.count; i++) {
          const x = original[i * 3]
          const y = original[i * 3 + 1]
          const bulge = Math.abs(x) / 3 * windStrength
          const wave = Math.sin(time * 2.5 + y * 0.5 + sailIndex) * 0.25 * windStrength
          positions.array[i * 3 + 2] = bulge + wave
        }
        positions.needsUpdate = true
      })
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

    // Enemy fires only when attacking and in range
    if (enemy.state === 'ATTACKING' || enemy.state === 'ALERT') {
      const now = Date.now()
      // Fire rates - more aggressive
      const fireChance = enemy.type === 'BIG' ? 0.08 : (enemy.type === 'NORMAL' ? 0.1 : 0.15)
      const fireRange = enemy.type === 'NORMAL' ? 45 : 55

      if (Math.random() < fireChance && distToPlayer < fireRange && now - enemy.lastShot > 1200) {
        // Check line of sight to player
        if (hasLineOfSight(enemy.x, enemy.z, playerPos.value.x, playerPos.value.z)) {
          enemy.lastShot = now
          fireEnemyCannonMulti(enemy, shipType, index)
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
  // Spawn wake particles based on speed
  if (playerSpeed.value > 1) {
    // Spawn rate based on speed
    const spawnChance = playerSpeed.value / 20
    if (Math.random() < spawnChance) {
      emitWake(scene, playerWake, playerPos.value.x, playerPos.value.z, playerAngle, false)
    }
  }
  tickWake(scene, playerWake, dt)

  // Update GPU wind particles every frame via uniforms only.
  updateWindParticles(dt)

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

function animate() {
  animationId = requestAnimationFrame(animate)

  const dt = 1 / 60
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
  cannonballs.forEach(b => { if (b && b.mesh) disposeMesh(b.mesh) })
  cannonballs = []

  // Clear wake particles - dispose properly
  playerWake.forEach(w => { if (w && w.mesh) disposeMesh(w.mesh) })
  playerWake = []

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
          <div className="stat">Enemies: {ui.aliveEnemies} / 3 | Kraken: {ui.krakenHp > 0 ? 'ACTIVE' : (ui.aliveEnemies === 0 ? 'NEXT' : '---')}</div>
        </div>
      </div>
      <canvas ref={canvasRef}></canvas>
      <canvas ref={windOverlayRef} className="wind-overlay-canvas"></canvas>
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
          <button onClick={() => actionsRef.current.startGame()}>Set Sail</button>
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
