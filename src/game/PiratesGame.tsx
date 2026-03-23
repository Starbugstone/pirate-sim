// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './pirates.css'
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
  playerUpgrades: {
    sailSpeed: 0,
    cannonCount: 0,
    cannonSpeed: 0,
    maxHpBonus: 0,
    repairCount: 0
  }
}
export function PiratesGame() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
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
  cannonSpeed: 0, // +1-3 = faster reload
  maxHpBonus: 0,  // +10 max HP per level
  repairCount: 0  // times repair used (increases cost by 10 each time)
})
const shopMessage = ref('')
const showShopMessage = (msg) => {
  shopMessage.value = msg
  setTimeout(() => { if (shopMessage.value === msg) shopMessage.value = '' }, 2500)
}

// Wind particles (GPU Points â€” single draw call, no per-particle JS objects)
const MAX_WIND_PARTICLES = 35
let windParticles
let debugWindArrow
let windParticlePositions
let windParticleLifetimes
let windParticleVels // { angle, speed } stored per particle
const MAX_TREASURES = 10
const MAX_CANNONBALLS = 40
const MAX_WAKE_PARTICLES = 35
const MAX_ISLANDS = 15  // Max islands to keep loaded
const MAX_ROCKS = 30   // Max rocks to keep loaded
const MAX_DISPOSE_PER_FRAME = 3 // Spread disposal across frames to avoid lag spikes
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

// Camera - 0 = behind (navigation), 1 = top-down (fighting)
let cameraMode = 0 // Start in behind view

// Wind
let windAngle = 0
let targetWindAngle = 0 // For smooth wind transitions
const windSpeed = ref(3)
let targetWindSpeed = 3 // For smooth wind speed transitions
let windChangeTimer = 0

// Projectiles
let cannonballs = []

// Ship wake/trail particles
let playerWake = []
const maxWakeParticles = 50

// Enemy ships - array for multiple enemies
const enemyShips = ref([]) // { x, z, hp, maxHp, angle, type, mesh }
let enemyShipMeshes = [] // Array of meshes

// Enemy ship types
const SHIP_TYPES = {
  RAMMER: { name: 'Rammer', hp: 150, speed: 10, turnSpeed: 0.5, rammingDamage: 20, cannonDamage: 5, color: 0x333333, size: 1.2 },
  NORMAL: { name: 'Sloop', hp: 80, speed: 6, turnSpeed: 2.0, rammingDamage: 10, cannonDamage: 10, color: 0x8B0000, size: 1.0 },
  BIG: { name: 'Galleon', hp: 200, speed: 4, turnSpeed: 1.0, rammingDamage: 10, cannonDamage: 15, color: 0x000080, size: 1.8 }
}

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

// Ocean (GPU shader - no CPU trig)
let oceanMesh
const OCEAN_SEGMENTS = 25 // 25x25 = 625 vertices â€” GPU handles all animation

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GPU OCEAN â€” all animation on GPU, zero CPU trig
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const oceanVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;
  
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Strong wave displacement so it's clearly visible
    float wave1 = sin(pos.x * 0.01 + uTime * 0.5) * cos(pos.y * 0.008 + uTime * 0.4) * 6.0;
    float wave2 = sin(pos.x * 0.02 + uTime * 0.8) * cos(pos.y * 0.015 + uTime * 0.6) * 3.0;
    float wave3 = sin((pos.x + pos.y) * 0.005 + uTime * 0.3) * 4.0;
    pos.z = wave1 + wave2 + wave3;
    vElevation = pos.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`
const oceanFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;
  void main() {
    // High contrast: deep blue troughs, bright blue-green peaks
    vec3 deep = vec3(0.02, 0.12, 0.35);
    vec3 mid = vec3(0.0, 0.35, 0.55);
    vec3 crest = vec3(0.15, 0.65, 0.75);
    float t = clamp((vElevation + 10.0) / 20.0, 0.0, 1.0);
    vec3 color = mix(deep, mid, smoothstep(0.0, 0.5, t));
    color = mix(color, crest, smoothstep(0.5, 1.0, t));
    // Bright shimmer on crests
    float shimmer = pow(max(0.0, vElevation / 10.0), 2.0) * 0.3;
    color += shimmer * vec3(0.5, 0.8, 0.9);
    gl_FragColor = vec4(color, 1.0);
  }
`

function createOcean() {
  const geometry = new THREE.PlaneGeometry(1500, 1500, OCEAN_SEGMENTS, OCEAN_SEGMENTS)
  const material = new THREE.ShaderMaterial({
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    side: THREE.DoubleSide,
    fog: false
  })
  oceanMesh = new THREE.Mesh(geometry, material)
  oceanMesh.rotation.x = -Math.PI / 2
  oceanMesh.position.y = -0.5
  oceanMesh.renderOrder = 0
  scene.add(oceanMesh)
}
function createWindParticles() {
  const count = MAX_WIND_PARTICLES
  windParticlePositions = new Float32Array(count * 3)
  windParticleLifetimes = new Float32Array(count)
  windParticleVels = new Float32Array(count)
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * 35
    windParticlePositions[i * 3] = Math.cos(angle) * radius
    windParticlePositions[i * 3 + 1] = 2 + Math.random() * 8
    windParticlePositions[i * 3 + 2] = Math.sin(angle) * radius
    windParticleLifetimes[i] = Math.random()
    windParticleVels[i] = 0.5 + Math.random() * 0.8
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(windParticlePositions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.5,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  })
  windParticles = new THREE.Points(geometry, material)
  windParticles.frustumCulled = false
  windParticles.renderOrder = 999 // Always on top
  scene.add(windParticles)
}

function updateWindParticles(dt) {
  if (!windParticles) return
  const count = MAX_WIND_PARTICLES
  const speed = windSpeed.value * 3 + 4
  
  for (let i = 0; i < count; i++) {
    windParticleLifetimes[i] -= dt * 0.4
    
    if (windParticleLifetimes[i] <= 0) {
      const spread = Math.random() * Math.PI * 2
      const radius = 5 + Math.random() * 30
      windParticlePositions[i * 3] = Math.cos(spread) * radius + playerPos.value.x
      windParticlePositions[i * 3 + 1] = 2 + Math.random() * 8
      windParticlePositions[i * 3 + 2] = Math.sin(spread) * radius + playerPos.value.z
      windParticleLifetimes[i] = 1.5 + Math.random() * 1.5
      windParticleVels[i] = 0.5 + Math.random() * 0.8
    } else {
      windParticlePositions[i * 3] += Math.sin(windAngle) * speed * windParticleVels[i] * dt
      windParticlePositions[i * 3 + 2] += Math.cos(windAngle) * speed * windParticleVels[i] * dt
    }
    
    // Keep near player (use player-relative positions so they stay close)
    const relX = windParticlePositions[i * 3] - playerPos.value.x
    const relZ = windParticlePositions[i * 3 + 2] - playerPos.value.z
    if (relX * relX + relZ * relZ > 60 * 60) windParticleLifetimes[i] = 0
  }
  
  windParticles.geometry.attributes.position.needsUpdate = true
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
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)
  const sunLight = new THREE.DirectionalLight(0xffffcc, 1)
  sunLight.position.set(50, 100, 50)
  scene.add(sunLight)
  createSky()
  createPlayerShip()
  createOcean()
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
}





function createSky() {
  // Sun
  const sunGeometry = new THREE.CircleGeometry(10, 32)
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 })
  const sun = new THREE.Mesh(sunGeometry, sunMaterial)
  sun.position.set(100, 80, -100)
  sun.lookAt(0, 0, 0)
  scene.add(sun)

  // [CLOUDS DISABLED] - too heavy, can re-enable later with optimization
  // Reduced from 20 clouds x 5 spheres = 100 meshes to just 5 simple clouds
  // if (false) { // Cloud toggle
  //   for (let i = 0; i < 20; i++) { ... }
  // }
}

function createPlayerShip() {
  playerShip = new THREE.Group()

  // === IMPROVED HULL - Tapered shape ===
  // Main hull body (tapered)
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-1.5, -4)
  hullShape.lineTo(1.5, -4)
  hullShape.lineTo(1.8, 0)
  hullShape.lineTo(1.5, 4)
  hullShape.lineTo(-1.5, 4)
  hullShape.lineTo(-1.8, 0)
  hullShape.closePath()

  const extrudeSettings = { depth: 2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 2 }
  const hullGeometry = new THREE.ExtrudeGeometry(hullShape, extrudeSettings)
  const hullMaterial = new THREE.MeshPhongMaterial({ color: 0x5C3317 }) // Darker wood
  const hull = new THREE.Mesh(hullGeometry, hullMaterial)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.5
  playerShip.add(hull)

  // Hull stripe (decorative)
  const stripeGeometry = new THREE.BoxGeometry(3.2, 0.15, 8.5)
  const stripeMaterial = new THREE.MeshPhongMaterial({ color: 0x8B0000 }) // Red stripe
  const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial)
  stripe.position.y = 1.3
  playerShip.add(stripe)

  // Deck with planks effect
  const deckGeometry = new THREE.BoxGeometry(2.8, 0.25, 7.5)
  const deckMaterial = new THREE.MeshPhongMaterial({ color: 0xDEB887 }) // Burlywood
  const deck = new THREE.Mesh(deckGeometry, deckMaterial)
  deck.position.y = 2.1
  playerShip.add(deck)

  // === RAILINGS ===
  const railMaterial = new THREE.MeshPhongMaterial({ color: 0x3D2817 })
  // Port side railing
  for (let i = 0; i < 8; i++) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), railMaterial)
    railPost.position.set(-1.3, 2.7, -3 + i * 0.85)
    playerShip.add(railPost)
  }
  // Starboard side railing
  for (let i = 0; i < 8; i++) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), railMaterial)
    railPost.position.set(1.3, 2.7, -3 + i * 0.85)
    playerShip.add(railPost)
  }
  // Railings top bar
  const railBarGeom = new THREE.CylinderGeometry(0.03, 0.03, 7, 8)
  const railBarL = new THREE.Mesh(railBarGeom, railMaterial)
  railBarL.rotation.x = Math.PI / 2
  railBarL.position.set(-1.3, 3.2, 0)
  playerShip.add(railBarL)
  const railBarR = new THREE.Mesh(railBarGeom, railMaterial)
  railBarR.rotation.x = Math.PI / 2
  railBarR.position.set(1.3, 3.2, 0)
  playerShip.add(railBarR)

  // === MASTS ===
  const mastMaterial = new THREE.MeshPhongMaterial({ color: 0x4A3728 })

  // Main mast - thicker
  const mainMastGeom = new THREE.CylinderGeometry(0.25, 0.3, 12, 8)
  const mainMast = new THREE.Mesh(mainMastGeom, mastMaterial)
  mainMast.position.y = 7.5
  playerShip.add(mainMast)

  // Main mast crosstree (supports the yard)
  const crosstreeGeom = new THREE.BoxGeometry(7, 0.15, 0.15)
  const crosstree = new THREE.Mesh(crosstreeGeom, mastMaterial)
  crosstree.position.set(0, 12.5, 0)
  playerShip.add(crosstree)

  // Crow's nest
  const nestGeom = new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8, 1, true)
  const nest = new THREE.Mesh(nestGeom, railMaterial)
  nest.position.set(0, 13, 0)
  playerShip.add(nest)
  // Nest floor
  const nestFloorGeom = new THREE.CircleGeometry(0.55, 8)
  const nestFloor = new THREE.Mesh(nestFloorGeom, deckMaterial)
  nestFloor.rotation.x = -Math.PI / 2
  nestFloor.position.y = -0.2
  nest.add(nestFloor)

  // Fore mast
  const foreMastGeom = new THREE.CylinderGeometry(0.18, 0.22, 7, 8)
  const foreMast = new THREE.Mesh(foreMastGeom, mastMaterial)
  foreMast.position.set(0, 5, -2.5)
  playerShip.add(foreMast)

  // Mizzen mast (rear)
  const mizzenMastGeom = new THREE.CylinderGeometry(0.12, 0.15, 5, 8)
  const mizzenMast = new THREE.Mesh(mizzenMastGeom, mastMaterial)
  mizzenMast.position.set(0, 4.5, 2.5)
  playerShip.add(mizzenMast)

  // === FIGUREHEAD (bow decoration) ===
  const figureheadMat = new THREE.MeshPhongMaterial({ color: 0xD2691E })
  // Dragon head
  const dragonHead = new THREE.Group()
  const headGeom = new THREE.ConeGeometry(0.4, 1.2, 6)
  const head = new THREE.Mesh(headGeom, figureheadMat)
  head.rotation.x = Math.PI / 2
  head.position.z = 0.4
  dragonHead.add(head)
  // Snout
  const snoutGeom = new THREE.ConeGeometry(0.2, 0.5, 6)
  const snout = new THREE.Mesh(snoutGeom, figureheadMat)
  snout.rotation.x = -Math.PI / 2
  snout.position.set(0, 0, 1)
  dragonHead.add(snout)
  dragonHead.position.set(0, 1.8, 4.5)
  playerShip.add(dragonHead)

  // === STERN DECORATION ===
  const sternMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 })
  const sternPanel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.1), sternMat)
  sternPanel.position.set(0, 2.8, -4)
  playerShip.add(sternPanel)

  // === WHITE SAILS THAT REACT TO WIND - SQUARE RIG STYLE ===
  // Sails have yards (spars) at top and bottom, sides billow outward

  // Main sail - 3D yard arms
  const mainSailGroup = new THREE.Group()

  // Top yard (horizontal spar)
  const topYardGeom = new THREE.CylinderGeometry(0.08, 0.08, 6, 8)
  const yardMat = new THREE.MeshPhongMaterial({ color: 0x654321 })
  const topYard = new THREE.Mesh(topYardGeom, yardMat)
  topYard.rotation.z = Math.PI / 2
  topYard.position.y = 3.5
  mainSailGroup.add(topYard)

  // Bottom yard
  const botYard = new THREE.Mesh(topYardGeom, yardMat)
  botYard.rotation.z = Math.PI / 2
  botYard.position.y = -3.5
  mainSailGroup.add(botYard)

  // The sail cloth - vertices organized so top row (y=max) and bottom row (y=min) stay fixed
  const sailGeom = new THREE.PlaneGeometry(5.5, 7, 12, 14)
  const sailMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95
  })
  const sail = new THREE.Mesh(sailGeom, sailMat)
  sail.position.set(0, 0, 0.05) // Slightly forward of yards
  sail.userData.isSail = true
  sail.userData.originalVertices = sailGeom.attributes.position.array.slice()
  // Store info about which vertices are fixed (top and bottom edges)
  const mainSailVerts = sailGeom.attributes.position
  sail.userData.fixedEdges = []
  for (let i = 0; i < mainSailVerts.count; i++) {
    const y = mainSailVerts.getY(i)
    // Top and bottom rows are fixed to yards
    if (Math.abs(y - 3.5) < 0.1 || Math.abs(y + 3.5) < 0.1) {
      sail.userData.fixedEdges.push(true)
    } else {
      sail.userData.fixedEdges.push(false)
    }
  }
  mainSailGroup.add(sail)
  mainSailGroup.position.set(0, 8, -1.5)
  playerShip.add(mainSailGroup)

  // Fore sail - 3D yard arms
  const foreSailGroup = new THREE.Group()
  const foreTopYardGeom = new THREE.CylinderGeometry(0.06, 0.06, 4, 8)
  const foreTopYard = new THREE.Mesh(foreTopYardGeom, yardMat)
  foreTopYard.rotation.z = Math.PI / 2
  foreTopYard.position.y = 2
  foreSailGroup.add(foreTopYard)
  const foreBotYard = new THREE.Mesh(foreTopYardGeom, yardMat)
  foreBotYard.rotation.z = Math.PI / 2
  foreBotYard.position.y = -2
  foreSailGroup.add(foreBotYard)
  const foreSailGeom = new THREE.PlaneGeometry(3.5, 4, 10, 12)
  const foreSailMat = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  const foreSail = new THREE.Mesh(foreSailGeom, foreSailMat)
  foreSail.position.set(0, 0, 0.05)
  foreSail.userData.isSail = true
  foreSail.userData.originalVertices = foreSailGeom.attributes.position.array.slice()
  foreSail.userData.fixedEdges = []
  for (let i = 0; i < foreSailGeom.attributes.position.count; i++) {
    const y = foreSailGeom.attributes.position.getY(i)
    foreSail.userData.fixedEdges.push(Math.abs(y - 2) < 0.1 || Math.abs(y + 2) < 0.1)
  }
  foreSailGroup.add(foreSail)
  foreSailGroup.position.set(0, 5, -3)
  playerShip.add(foreSailGroup)

  // Mizzen sail - 3D yard arms
  const mizzenGroup = new THREE.Group()
  const mizzenTopYardGeom = new THREE.CylinderGeometry(0.05, 0.05, 3.5, 8)
  const mizzenTopYard = new THREE.Mesh(mizzenTopYardGeom, yardMat)
  mizzenTopYard.rotation.z = Math.PI / 2
  mizzenTopYard.position.y = 1.75
  mizzenGroup.add(mizzenTopYard)
  const mizzenBotYard = new THREE.Mesh(mizzenTopYardGeom, yardMat)
  mizzenBotYard.rotation.z = Math.PI / 2
  mizzenBotYard.position.y = -1.75
  mizzenGroup.add(mizzenBotYard)
  const mizzenGeom = new THREE.PlaneGeometry(3, 3.5, 8, 10)
  const mizzenMat = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  const mizzen = new THREE.Mesh(mizzenGeom, mizzenMat)
  mizzen.position.set(0, 0, 0.05)
  mizzen.userData.isSail = true
  mizzen.userData.originalVertices = mizzenGeom.attributes.position.array.slice()
  mizzen.userData.fixedEdges = []
  for (let i = 0; i < mizzenGeom.attributes.position.count; i++) {
    const y = mizzenGeom.attributes.position.getY(i)
    mizzen.userData.fixedEdges.push(Math.abs(y - 1.75) < 0.1 || Math.abs(y + 1.75) < 0.1)
  }
  mizzenGroup.add(mizzen)
  mizzenGroup.position.set(0, 6, 1)
  playerShip.add(mizzenGroup)

  // Store sails for wind animation
  playerShip.userData.sails = [sail, foreSail, mizzen]

  // Store sails for wind animation
  playerShip.userData.sails = [sail, foreSail, mizzen]

  // Pirate flag
  const flagGeometry = new THREE.PlaneGeometry(1.5, 1)
  const flagMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const flag = new THREE.Mesh(flagGeometry, flagMaterial)
  flag.position.set(0, 12, 0)
  flag.rotation.y = Math.PI / 2
  playerShip.add(flag)

  // Cannon ports - left side
  for (let i = -1; i <= 1; i++) {
    const portGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.3)
    const portMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const portL = new THREE.Mesh(portGeometry, portMaterial)
    portL.position.set(-1.5, 1.5, i * 2)
    portL.rotation.z = Math.PI / 2
    playerShip.add(portL)

    const portR = new THREE.Mesh(portGeometry, portMaterial)
    portR.position.set(1.5, 1.5, i * 2)
    portR.rotation.z = Math.PI / 2
    playerShip.add(portR)
  }

  // Side cannons (port) - 3 cannons
  const sideCannonGeom = new THREE.CylinderGeometry(0.15, 0.2, 1.2)
  const sideCannonMat = new THREE.MeshPhongMaterial({ color: 0x333333 })

  // Port side cannons - 3 cannons angled for cone fire
  // i = -1 (front): 10Â° forward, i = 0 (middle): straight, i = 1 (back): 10Â° backward
  for (let i = -1; i <= 1; i++) {
    const cannon = new THREE.Mesh(sideCannonGeom, sideCannonMat)
    cannon.position.set(-1.6, 1.8, i * 2)
    cannon.rotation.z = Math.PI / 2
    // Angle cannons: front one forward, back one backward
    cannon.rotation.y = i * (10 * Math.PI / 180) // 10 degrees cone
    playerShip.add(cannon)
  }

  // Starboard side cannons - 3 cannons angled for cone fire
  for (let i = -1; i <= 1; i++) {
    const cannon = new THREE.Mesh(sideCannonGeom, sideCannonMat)
    cannon.position.set(1.6, 1.8, i * 2)
    cannon.rotation.z = Math.PI / 2
    // Angle cannons: front one forward, back one backward
    cannon.rotation.y = i * (10 * Math.PI / 180) // 10 degrees cone
    playerShip.add(cannon)
  }

  playerShip.position.set(0, 0, 0)
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

  showMessage('âš”ï¸ 3 Enemy ships approaching!', 3000)
}

function createEnemyShipMesh(shipType) {
  const mesh = new THREE.Group()
  const size = shipType.size
  const woodMat = new THREE.MeshPhongMaterial({ color: 0x654321 })
  const sailMat = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })

  // === IMPROVED HULL (tapered shape) ===
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-1.5 * size, -4 * size)
  hullShape.lineTo(1.5 * size, -4 * size)
  hullShape.lineTo(1.8 * size, 0)
  hullShape.lineTo(1.5 * size, 4 * size)
  hullShape.lineTo(-1.5 * size, 4 * size)
  hullShape.lineTo(-1.8 * size, 0)
  hullShape.closePath()

  const extrudeSettings = { depth: 2 * size, bevelEnabled: true, bevelThickness: 0.2 * size, bevelSize: 0.1 * size, bevelSegments: 2 }
  const hullGeom = new THREE.ExtrudeGeometry(hullShape, extrudeSettings)
  const hullMat = new THREE.MeshPhongMaterial({ color: shipType.color })
  const hull = new THREE.Mesh(hullGeom, hullMat)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.5 * size
  mesh.add(hull)

  // Hull stripe
  const stripeGeom = new THREE.BoxGeometry(3.2 * size, 0.15 * size, 8.5 * size)
  const stripeMat = new THREE.MeshPhongMaterial({ color: 0x8B0000 })
  const stripe = new THREE.Mesh(stripeGeom, stripeMat)
  stripe.position.y = 1.3 * size
  mesh.add(stripe)

  // Deck
  const deckGeom = new THREE.BoxGeometry(2.8 * size, 0.25 * size, 7.5 * size)
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xDEB887 })
  const deck = new THREE.Mesh(deckGeom, deckMat)
  deck.position.y = 2.1 * size
  mesh.add(deck)

  // Railings
  const railMat = new THREE.MeshPhongMaterial({ color: 0x3D2817 })
  for (let i = 0; i < 6; i++) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 1 * size), railMat)
    railPost.position.set(-1.3 * size, 2.7 * size, -3 + i * 1.2 * size)
    mesh.add(railPost)
    const railPost2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 1 * size), railMat)
    railPost2.position.set(1.3 * size, 2.7 * size, -3 + i * 1.2 * size)
    mesh.add(railPost2)
  }

  // === MASTS ===
  // Main mast
  const mainMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25 * size, 0.3 * size, 12 * size, 8),
    woodMat
  )
  mainMast.position.set(0, 7.5 * size, 0)
  mesh.add(mainMast)

  // Main yard (horizontal spar)
  const yard1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06 * size, 0.06 * size, 7 * size, 8),
    woodMat
  )
  yard1.rotation.z = Math.PI / 2
  yard1.position.set(0, 12 * size, 0)
  mesh.add(yard1)

  // Main sail - attached to yard, faces sideways
  const mainSail = new THREE.Mesh(
    new THREE.PlaneGeometry(6 * size, 6 * size),
    sailMat
  )
  mainSail.position.set(0, 10 * size, 0)
  mainSail.rotation.y = Math.PI / 2
  mesh.add(mainSail)

  // Lower yard and sail
  const yard2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 5 * size, 8),
    woodMat
  )
  yard2.rotation.z = Math.PI / 2
  yard2.position.set(0, 7 * size, 0)
  mesh.add(yard2)

  const lowerSail = new THREE.Mesh(
    new THREE.PlaneGeometry(4 * size, 4 * size),
    sailMat
  )
  lowerSail.position.set(0, 5.5 * size, 0)
  lowerSail.rotation.y = Math.PI / 2
  mesh.add(lowerSail)

  // Fore mast
  const foreMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * size, 0.22 * size, 8 * size, 8),
    woodMat
  )
  foreMast.position.set(0, 5 * size, -3 * size)
  mesh.add(foreMast)

  // Fore yard
  const foreYard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 4 * size, 8),
    woodMat
  )
  foreYard.rotation.z = Math.PI / 2
  foreYard.position.set(0, 7.5 * size, -3 * size)
  mesh.add(foreYard)

  // Fore sail
  const foreSail = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5 * size, 3.5 * size),
    sailMat
  )
  foreSail.position.set(0, 6 * size, -3 * size)
  foreSail.rotation.y = Math.PI / 2
  mesh.add(foreSail)

  // Flag
  const flagMat = new THREE.MeshBasicMaterial({
    color: shipType === SHIP_TYPES.RAMMER ? 0xff0000 : (shipType === SHIP_TYPES.BIG ? 0xffff00 : 0x0000ff)
  })
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5 * size, 1 * size), flagMat)
  flag.position.set(0, 13 * size, 0)
  flag.rotation.y = Math.PI / 2
  mesh.add(flag)

  // Rammer spike
  if (shipType === SHIP_TYPES.RAMMER) {
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.35 * size, 4 * size, 6),
      new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 })
    )
    spike.rotation.x = -Math.PI / 2
    spike.position.set(0, 1 * size, 5 * size)
    mesh.add(spike)
  }

  // No animated sails for enemies
  mesh.userData.sails = []

  return mesh
}

function createKraken() {
  if (krakenMesh) scene.remove(krakenMesh)

  krakenMesh = new THREE.Group()

  // Bigger, more impressive body
  const bodyGeometry = new THREE.SphereGeometry(12, 20, 20)
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x1a3030 })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.scale.y = 0.6
  body.position.y = 3
  krakenMesh.add(body)

  // Glowing eyes
  const eyeGeometry = new THREE.SphereGeometry(2, 12, 12)
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333 })
  const eyeL = new THREE.Mesh(eyeGeometry, eyeMaterial)
  eyeL.position.set(-4, 5, 8)
  krakenMesh.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeometry, eyeMaterial)
  eyeR.position.set(4, 5, 8)
  krakenMesh.add(eyeR)

  // Animated tentacles - attached to body center
  kraken.value.tentacles = []
  for (let i = 0; i < 8; i++) {
    // Create a group for each tentacle to pivot from body center
    const tentGroup = new THREE.Group()
    const angle = (i / 8) * Math.PI * 2
    tentGroup.rotation.y = angle

    // Tentacle mesh - positioned extending outward from center
    const tentGeom = new THREE.CylinderGeometry(0.4, 1.5, 35, 8)
    const tentMat = new THREE.MeshPhongMaterial({ color: 0x1a3030 })
    const tent = new THREE.Mesh(tentGeom, tentMat)
    tent.position.set(17, 0, 0) // Half of 35 = extends outward from center
    tent.rotation.z = Math.PI / 2 // Lay horizontal

    tentGroup.add(tent)
    krakenMesh.add(tentGroup)

    // Store tentacle data
    tent.userData.angle = angle
    tent.userData.baseAngle = angle
    tent.userData.phase = Math.random() * Math.PI * 2
    tent.userData.speed = 0.8 + Math.random() * 0.4
    tent.userData.state = 'idle'
    tent.userData.targetAngle = 0
    tent.userData.smashCooldown = 0
    tent.userData.smashDuration = 0
    tent.userData.hitChance = 0
    tent.userData.group = tentGroup // Reference to group for rotation

    kraken.value.tentacles.push(tent)
  }

  // Whirlpool effect (particle ring around kraken)
  const whirlpoolGeom = new THREE.RingGeometry(15, 25, 32)
  const whirlpoolMat = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  })
  const whirlpool = new THREE.Mesh(whirlpoolGeom, whirlpoolMat)
  whirlpool.rotation.x = -Math.PI / 2
  whirlpool.position.y = 0.5
  krakenMesh.add(whirlpool)
  krakenMesh.userData.whirlpool = whirlpool

  krakenMesh.position.set(0, 0, 0)
  scene.add(krakenMesh)
  krakenActive = true
  kraken.value.hp = 200

  showMessage('ðŸ’€ THE KRAKEN AWAKENS!', 5000)
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
    showMessage('ðŸ’° Treasure spawned! Drop anchor to collect!', 3000)
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
      createKraken()
      showMessage('ðŸ’€ A new Kraken approaches...', 3000)
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
      spawnIsland(ix, iz)
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
    spawnRock(rx, rz)
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
      spawnSunkenShip(sx, sz)
    }
  }
}

function spawnIsland(x, z) {
  const islandGroup = new THREE.Group()

  // Random island size - bigger islands now
  const islandSize = 20 + Math.random() * 25 // 20-45 radius
  const islandHeight = 6 + islandSize * 0.3

  // Sand base - larger cone
  const sandGeom = new THREE.ConeGeometry(islandSize, islandHeight, 8)
  const sandMat = new THREE.MeshPhongMaterial({ color: 0xF4A460 })
  const sand = new THREE.Mesh(sandGeom, sandMat)
  sand.position.y = islandHeight / 2
  islandGroup.add(sand)

  // Multiple palm trees for bigger islands
  const numTrees = Math.floor(1 + islandSize / 20)
  for (let t = 0; t < numTrees; t++) {
    const treeX = (Math.random() - 0.5) * islandSize * 0.6
    const treeZ = (Math.random() - 0.5) * islandSize * 0.6

    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.4, 5 + islandSize * 0.1)
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    const trunk = new THREE.Mesh(trunkGeom, trunkMat)
    trunk.position.set(treeX, islandHeight / 2 + 2 + islandSize * 0.05, treeZ)
    islandGroup.add(trunk)

    const leavesGeom = new THREE.ConeGeometry(3 + islandSize * 0.1, 4 + islandSize * 0.05, 8)
    const leavesMat = new THREE.MeshPhongMaterial({ color: 0x228B22 })
    const leaves = new THREE.Mesh(leavesGeom, leavesMat)
    leaves.position.set(treeX, islandHeight / 2 + 4 + islandSize * 0.1, treeZ)
    islandGroup.add(leaves)
  }

  // 30% chance of harbor (bigger dock for bigger islands)
  if (Math.random() < 0.3) {
    const dockLength = 12 + islandSize * 0.4
    const dockGeom = new THREE.BoxGeometry(dockLength, 0.3, 4)
    const dockMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    const dock = new THREE.Mesh(dockGeom, dockMat)
    // Dock extends outward from island edge (no rotation - straight line)
    dock.position.set(islandSize + dockLength / 2, 0.2, 0)
    dock.rotation.y = 0 // Pointing outward from island center
    islandGroup.add(dock)

    // Dock posts (along the dock)
    for (let p = 0; p < 3; p++) {
      const postGeom = new THREE.CylinderGeometry(0.2, 0.2, 1.5)
      const post = new THREE.Mesh(postGeom, dockMat)
      post.position.set(islandSize + 3 + p * 4, 0.9, 0)
      islandGroup.add(post)
    }

    // Red circle at dock end (like treasure - player anchors here)
    const dockEndX = islandSize + dockLength
    const dockEndRingGeom = new THREE.RingGeometry(6, 8, 32)
    const dockEndRingMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    })
    const dockEndRing = new THREE.Mesh(dockEndRingGeom, dockEndRingMat)
    dockEndRing.rotation.x = -Math.PI / 2
    dockEndRing.position.set(dockEndX, 0.2, 0)
    islandGroup.add(dockEndRing)

    // Store dock end position for gameplay
    islandGroup.userData.dockEndX = dockEndX
    islandGroup.userData.hasHarbor = true
  }

  islandGroup.position.set(x, 0, z)
  scene.add(islandGroup)
  worldObjects.islands.push({ x, z, radius: islandSize, mesh: islandGroup })
}

function spawnSunkenShip(x, z) {
  // Half-sunk shipwreck - brownish hull tilted
  const shipwreckGroup = new THREE.Group()

  // Hull (tilted as if sunk)
  const hullGeom = new THREE.BoxGeometry(3, 1.5, 8)
  const hullMat = new THREE.MeshPhongMaterial({ color: 0x4a3728 }) // Dark brown
  const hull = new THREE.Mesh(hullGeom, hullMat)
  hull.position.y = -0.3
  hull.rotation.x = 0.3 // Tilt back
  hull.rotation.z = (Math.random() - 0.5) * 0.2
  shipwreckGroup.add(hull)

  // Mast sticking out
  const mastGeom = new THREE.CylinderGeometry(0.15, 0.2, 6)
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x3d2817 })
  const mast = new THREE.Mesh(mastGeom, mastMat)
  mast.position.set(0, 2, 1)
  mast.rotation.x = -0.4
  shipwreckGroup.add(mast)

  shipwreckGroup.position.set(x, 0, z)
  scene.add(shipwreckGroup)

  // Spawn treasure at the wreck location (no message for sunken ships)
  spawnTreasure(x, z, 75, false)

  // Track for cleanup
  worldObjects.ships = worldObjects.ships || []
  worldObjects.ships.push({ x, z, radius: 5, mesh: shipwreckGroup })
}

function spawnRock(x, z) {
  const rockGeom = new THREE.DodecahedronGeometry(2 + Math.random() * 3)
  const rockMat = new THREE.MeshPhongMaterial({ color: 0x696969 })
  const rock = new THREE.Mesh(rockGeom, rockMat)
  rock.position.set(x, 0.5, z)
  rock.rotation.set(Math.random(), Math.random(), Math.random())
  scene.add(rock)
  worldObjects.rocks.push({ x, z, radius: 3, mesh: rock })
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
      showMessage('ðŸ’° Collecting treasure...', 2000)
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
        // Collected!
        const coins = t.gold || 50
        gold.value += coins
        showMessage(`ðŸ’° +${coins} Gold!`, 3000)

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
      showMessage('ðŸ’¨ Treasure lost to the sea...', 2000)
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
  showMessage(`ðŸ’¥ ${sideName} FIRE!`, 1000)
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
            showMessage(`ðŸ’¥ Hit ${shipType.name}!`)
          } else {
            showMessage(`ðŸ’¥ Enemy fire hit ${shipType.name}!`)
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
        showMessage('ðŸ’¥ Hit the Kraken!')
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
        showMessage('ðŸ’¥ You were hit!')
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

function onMouseMove(e) {
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
    showMessage('ðŸŽ¯ Pointer locked - move mouse to steer', 2000)
  } else {
    showMessage('âš ï¸ Pointer unlocked - click to re-lock', 2000)
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
  if (gameState.value === 'playing') {
    requestPointerLock()
  }
}

function onMouseDown(e) {
  if (gameState.value === 'playing') {
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
  if (gameState.value === 'playing') {
    fireCannon('port')
  }
}

function onWheel(e) {
  // Scroll up = more top-down (fighting), scroll down = more behind (navigation)
  if (e.deltaY < 0) {
    cameraMode = Math.min(1, cameraMode + 0.1)
  } else {
    cameraMode = Math.max(0, cameraMode - 0.1)
  }

  const modeNames = ['ðŸš¢ Navigation', 'âš”ï¸ Combat']
  const currentMode = cameraMode > 0.5 ? 1 : 0
  showMessage(`ðŸ“· ${modeNames[currentMode]} view`, 1500)
}

function onKeyDown(e) {
  if (gameState.value !== 'playing') return
  if (anchorAnimating) return

  // A key - toggle anchor
  if (e.key === 'a' || e.key === 'A') {
    anchorAnimating = true

    if (!anchorDropped) {
      // Drop anchor
      showMessage('âš“ Dropping anchor...', 1500)

      // Create anchor mesh if not exists
      if (!anchorMesh) {
        createAnchor()
      }

      // Animate anchor dropping (1 second)
      setTimeout(() => {
        anchorDropped = true
        anchorAnimating = false
        playerSpeed.value = 0 // Stop forward momentum
        showMessage('âš“ Anchor dropped!', 1500)
        // Check if near a harbour
        checkHarbourEntry()
      }, 1000)
    } else {
      // Raise anchor
      showMessage('âš“ Raising anchor...', 1500)

      // Animate anchor raising (1 second)
      setTimeout(() => {
        anchorDropped = false
        anchorAnimating = false
        playerSpeed.value = 0.5 // Start with slow speed
        showMessage('âš“ Anchor raised!', 1500)
      }, 1000)
    }
  }
}

function createAnchor() {
  // Simple anchor mesh
  const anchorGroup = new THREE.Group()

  // Chain
  const chainGeom = new THREE.CylinderGeometry(0.05, 0.05, 15, 6)
  const chainMat = new THREE.MeshPhongMaterial({ color: 0x333333 })
  const chain = new THREE.Mesh(chainGeom, chainMat)
  chain.position.y = -7.5
  anchorGroup.add(chain)

  // Anchor body
  const anchorGeom = new THREE.BoxGeometry(0.8, 0.5, 1)
  const anchorMat = new THREE.MeshPhongMaterial({ color: 0x222222 })
  const anchor = new THREE.Mesh(anchorGeom, anchorMat)
  anchor.position.y = -15
  anchorGroup.add(anchor)

  // Arms
  const armGeom = new THREE.BoxGeometry(2, 0.15, 0.15)
  const arm1 = new THREE.Mesh(armGeom, anchorMat)
  arm1.position.set(0, -14.5, 0)
  anchorGroup.add(arm1)
  const arm2 = new THREE.Mesh(armGeom, anchorMat)
  arm2.rotation.y = Math.PI / 2
  arm2.position.set(0, -14.5, 0)
  anchorGroup.add(arm2)

  anchorGroup.visible = false
  playerShip.add(anchorGroup)
  anchorMesh = anchorGroup
}

// === HARBOUR SYSTEM ===
const HARBOUR_RANGE = 15 // Distance to trigger harbour shop

function checkHarbourEntry() {
  if (!anchorDropped) return

  for (const island of worldObjects.islands) {
    if (!island.mesh.userData.hasHarbor) continue
    const dockEndX = island.mesh.userData.dockEndX
    // Dock extends along +X from island center
    const dx = playerPos.value.x - (island.x + dockEndX)
    const dz = playerPos.value.z - island.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < HARBOUR_RANGE) {
      shopOpen.value = true
      shopMessage.value = ''
      showMessage('ðŸ´â€â˜ ï¸ Welcome to port!', 3000)
      return
    }
  }
}

function buyUpgrade(type) {
  const costs = {
    sailSpeed: { 1: 150, 2: 350, 3: 600 },
    cannonCount: { 1: 200, 2: 450, 3: 750 },
    cannonSpeed: { 1: 175, 2: 400, 3: 700 },
    maxHpBonus: { 1: 150, 2: 300, 3: 500, 4: 750, 5: 1000 }
  }

  if (type === 'repairHaul') {
    const cost = 100 + playerUpgrades.value.repairCount * 10
    if (gold.value < cost) {
      showShopMessage(`ðŸ’° Not enough gold! Need ${cost}`)
      return
    }
    gold.value -= cost
    playerUpgrades.value.repairCount++
    const maxHp = 100 + playerUpgrades.value.maxHpBonus * 10
    hp.value = Math.min(maxHp, hp.value + 10)
    showShopMessage(`âœ… Repaired! +10 HP for ${cost}g`)
    return
  }

  if (type === 'maxHpBonus') {
    const current = playerUpgrades.value.maxHpBonus
    if (current >= 5) {
      showShopMessage('âš“ Max level reached!')
      return
    }
    const nextLevel = current + 1
    const cost = costs.maxHpBonus[nextLevel]
    if (gold.value < cost) {
      showShopMessage(`ðŸ’° Not enough gold! Need ${cost}`)
      return
    }
    gold.value -= cost
    playerUpgrades.value.maxHpBonus = nextLevel
    const newMaxHp = 100 + nextLevel * 10
    hp.value = newMaxHp // Full heal on upgrade
    showShopMessage(`âœ… Max HP +10! Now ${newMaxHp} HP`)
    return
  }

  const current = playerUpgrades.value[type]
  if (current >= 3) {
    showShopMessage('âš“ Max level reached!')
    return
  }
  const nextLevel = current + 1
  const cost = costs[type][nextLevel]
  if (gold.value < cost) {
    showShopMessage(`ðŸ’° Not enough gold! Need ${cost}`)
    return
  }
  gold.value -= cost
  playerUpgrades.value[type] = nextLevel
  showShopMessage(`âœ… Upgraded ${type} to level ${nextLevel}!`)
}

function closeShop() {
  shopOpen.value = false
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
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



// Chunk size
const CHUNK_SIZE = 200 // Each chunk is 200x200 units

// Performance: Distance tiers (see PERFORMANCE.md)
const ICON_RENDER_DIST = 200
const INACTIVE_DIST = 300
const ACTIVE_DIST = 400
const KRAKEN_INACTIVE_DIST = 300
const KRAKEN_RENDER_DIST = 300
const CANNONBALL_CULL_DIST = 300

// Enemy AI state machine distances
const ENEMY_IDLE_DIST = 200 // Beyond this = idle (don't chase)
const ENEMY_ALERT_DIST = 120 // Beyond this = alert (start approaching)
const ENEMY_ATTACK_DIST = 100 // Within this = attacking (full chase)

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

// Fire effect for damaged ships
function createFire(x, z, isEnemy = false) {
  const fireGroup = new THREE.Group()

  // Create multiple flame particles
  const flames = []
  for (let i = 0; i < 5; i++) {
    const flameGeom = new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 6, 6)
    const flameMat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0xff6600 : 0xff3300,
      transparent: true,
      opacity: 0.8
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

  // Add smoke (grey spheres above flames)
  for (let i = 0; i < 3; i++) {
    const smokeGeom = new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 5, 5)
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.4
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
    playerFire.value = createFire(playerPos.value.x, playerPos.value.z)
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
          ...createFire(enemy.x, enemy.z, true)
        })
      }
    }
  }
}

function update(dt) {
  // Gradual per-frame disposal - prevents lag spikes from bulk cleanup
  processDisposalQueue()

  // Also run cleanup checks (no disposal, just culling references)
  // Chunk cleanup is handled by the range check below

  if (shopOpen.value) {
    // Pause physics when in harbour shop
    // Check if player left harbour zone - auto-close shop
    if (!anchorDropped) {
      shopOpen.value = false
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
      if (!stillInHarbour) shopOpen.value = false
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
    // Wind can change by 45-180 degrees each shift
    const shiftAmount = (Math.random() * 2 + 0.5) * (Math.random() > 0.5 ? 1 : -1)
    targetWindAngle = windAngle + shiftAmount
    targetWindSpeed = 2 + Math.random() * 5
    windChangeTimer = 12 + Math.random() * 5 // Changes every 12-17 seconds
    showMessage(`ðŸ’¨ Wind shifting...`, 2000)
  }

  // Gradually transition wind angle (4 second transition)
  const windTransitionSpeed = 0.25 // Complete transition in ~4 seconds
  if (Math.abs(targetWindAngle - windAngle) > 0.01) {
    windAngle += (targetWindAngle - windAngle) * windTransitionSpeed * dt
  }

  // Gradually transition wind speed
  if (Math.abs(targetWindSpeed - windSpeed.value) > 0.1) {
    windSpeed.value += (targetWindSpeed - windSpeed.value) * windTransitionSpeed * dt
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
  const maxSpeed = 15 + playerUpgrades.value.sailSpeed * 3 // Bonus per sail level
  const minSpeed = 2 // Minimum speed with headwind
  const targetSpeed = minSpeed + (maxSpeed - minSpeed) * Math.max(0, (windDir + 1) / 2)

  // Gradually accelerate/decelerate toward target speed (momentum)
  // Big heavy ship takes a long time to speed up and slow down
  // If anchor dropped, no acceleration allowed
  const acceleration = anchorDropped ? 0 : 0.5
  if (playerSpeed.value < targetSpeed) {
    playerSpeed.value = Math.min(targetSpeed, playerSpeed.value + acceleration * dt)
  } else {
    playerSpeed.value = Math.max(targetSpeed, playerSpeed.value - acceleration * 0.3 * dt)
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

  // Update ship mesh
  playerShip.position.x = playerPos.value.x
  playerShip.position.z = playerPos.value.z

  // Update anchor visibility
  if (anchorMesh) {
    anchorMesh.visible = anchorDropped || anchorAnimating
  }
  playerShip.rotation.y = playerAngle

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
      showMessage('ðŸª¨ Hit an island!')
    }
  }

  // Rock collision
  for (const rock of rocks) {
    const dx = playerPos.value.x - rock.x
    const dz = playerPos.value.z - rock.z
    if (Math.sqrt(dx * dx + dz * dz) < rock.radius + 2) {
      hp.value -= 30 * dt
      showMessage('ðŸª¨ Hit a rock!')
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
      mesh.rotation.y = enemy.angle
      return
    }
    // Performance: Skip AI for distant enemies
    if (distToPlayer > ACTIVE_DIST) {
      // Just render stationary placeholder - no AI, no physics
      mesh.visible = distToPlayer <= ACTIVE_DIST + 100 // Fade out
      mesh.position.x = enemy.x
      mesh.position.z = enemy.z
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
      spawnWakeParticle(enemy.x, enemy.z, enemy.angle, true)
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
        showMessage(`ðŸ’¥ ${enemy.type} scraped a rock!`, 1000)
      }
    }

    // Infinite world - no boundaries

    // Update mesh
    mesh.position.x = enemy.x
    mesh.position.z = enemy.z
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
      showMessage(`âš”ï¸ Collision with ${typeName}!`)
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

        showMessage('ðŸ’¥ Enemy ships collided!')
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
        showMessage(`ðŸ’¥ ${shipType.name} hit an island!`)
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
        showMessage(`ðŸ’¥ ${shipType.name} hit a rock!`)
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
      showMessage(`ðŸ’€ ${shipType.name} sinking!`)
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

  // Check if all enemies are gone (including sinking)
  if (enemyShips.value.length === 0 && enemyShipMeshes.length === 0 && !krakenActive) {
    gold.value += 200
    showMessage('ðŸ’° All enemies destroyed! +200 Gold')

    // [KRAKEN DISABLED]
    // setTimeout(() => {
    //   if (gameState.value === 'playing') {
    //     createKraken()
    //   }
    // }, 3000)
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
            showMessage('ðŸ’€ TENTACLE SMASH!')
          } else {
            showMessage('ðŸ’€ Tentacle missed!')
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
      showMessage('ðŸ’€ KRAKEN CONTACT!')
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
      spawnWakeParticle(playerPos.value.x, playerPos.value.z, playerAngle, false)
    }
  }
  updateWakeParticles(dt)

  // Update wind particles (every 5 frames â€” cheap position math only)
  windParticleFrameCounter++
  if (windParticleFrameCounter >= 5) {
    windParticleFrameCounter = 0
    updateWindParticles(dt)
  }
  
  // Update GPU ocean shader time uniform
  if (oceanMesh) {
    oceanMesh.material.uniforms.uTime.value = Date.now() * 0.001
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
        icon: enemy.type === 'RAMMER' ? 'âš”ï¸' : (enemy.type === 'BIG' ? 'ðŸ´â€â˜ ï¸' : 'â›µ'),
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
        icon: 'ðŸ™',
        label: `KRAKEN (${Math.round(dist)}m)`
      })
    }
  }

  enemyIndicators.value = indicators
}

// Wake particle functions
function spawnWakeParticle(x, z, angle, isEnemy) {
  const wakeGeom = new THREE.SphereGeometry(0.15, 4, 4)
  const wakeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4
  })
  const wake = new THREE.Mesh(wakeGeom, wakeMat)

  // Position behind the ship
  const offset = isEnemy ? 5 : 5
  const sideOffset = (Math.random() - 0.5) * 2 // Random side
  wake.position.set(
    x - Math.sin(angle) * offset + Math.cos(angle) * sideOffset,
    0.3,
    z - Math.cos(angle) * offset - Math.sin(angle) * sideOffset
  )

  scene.add(wake)
  playerWake.push({
    mesh: wake,
    life: 2 + Math.random() // 2-3 seconds
  })

  // Limit particles
  while (playerWake.length > MAX_WAKE_PARTICLES) {
    const old = playerWake.shift()
    if (old && old.mesh) disposeMesh(old.mesh)
  }
}

function updateWakeParticles(dt) {
  for (let i = playerWake.length - 1; i >= 0; i--) {
    const p = playerWake[i]
    p.life -= dt

    // Expand and fade
    const scale = 1 + (2 - p.life) * 0.5
    p.mesh.scale.setScalar(scale)
    p.mesh.material.opacity = (p.life / 3) * 0.5
    p.mesh.position.y = 0.3 + Math.sin(Date.now() * 0.005 + i) * 0.2

    if (p.life <= 0) {
      disposeMesh(p.mesh)
      playerWake.splice(i, 1)
    }
  }
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

  // Reset anchor
  anchorDropped = false
  anchorAnimating = false
  shopOpen.value = false

  // Reset upgrades
  playerUpgrades.value = { sailSpeed: 0, cannonCount: 0, cannonSpeed: 0, maxHpBonus: 0, repairCount: 0 }
  lastChunkCount = 0
  disposeQueue = [] // Clear pending disposals
  windParticleFrameCounter = 0
  // Dispose wind particles
  if (windParticles) {
    disposeMesh(windParticles)
    windParticles = null
  }
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
  // createKraken()

  // Clear cannonballs - dispose properly
  cannonballs.forEach(b => { if (b && b.mesh) disposeMesh(b.mesh) })
  cannonballs = []

  // Clear wake particles - dispose properly
  playerWake.forEach(w => { if (w && w.mesh) disposeMesh(w.mesh) })
  playerWake = []

  victory.value = false
  gameState.value = 'playing'
  showMessage('âš”ï¸ Battle commenced!', 3000)
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
      if (document.pointerLockElement) {
        document.exitPointerLock()
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
          <div className="stat">Speed: {ui.playerSpeed?.toFixed(1) || '0'} kn</div>
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
        <div className="control-hint">Click to lock | Move mouse to steer | LMB=Starboard | RMB=Port | Scroll = Camera | Avoid rocks</div>
      </div>
      {ui.gameState === 'start' ? (
        <div className="overlay">
          <div className="title">Pirates of the Burning Sea</div>
          <p>Navigate the Caribbean. Fight the navy. Survive the Kraken.</p>
          <div className="instructions">
            <p><strong>Mouse</strong> - Steer your ship</p>
            <p><strong>Left Click</strong> - Fire starboard cannons</p>
            <p><strong>Right Click</strong> - Fire port cannons</p>
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
          </div>
          {ui.shopMessage ? <div className="shop-message">{ui.shopMessage}</div> : null}
          <button className="leave-btn" onClick={() => actionsRef.current.closeShop()}>Set Sail</button>
          <div className="shop-hint">Press A to raise anchor and sail</div>
        </div>
      ) : null}
    </div>
  )
}
