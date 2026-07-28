// @ts-nocheck
import * as THREE from 'three'
import { generateIslandMesh, IslandArchetype, getTerrainNormalMap, fbm } from './terrain'

export function createSky(scene: THREE.Scene) {
  const sunGeometry = new THREE.CircleGeometry(12, 32)
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfffaed })
  const sun = new THREE.Mesh(sunGeometry, sunMaterial)
  sun.position.set(120, 90, -120)
  sun.lookAt(0, 0, 0)
  scene.add(sun)
}

// ── 1. Detailed Multi-Frond Palm Tree Generator ──
export function createDetailedPalmTree(scale = 1.0): THREE.Group {
  const treeGroup = new THREE.Group()

  // Trunk: Curved cylinder
  const trunkSegments = 5
  const trunkHeight = (6 + Math.random() * 3) * scale
  const trunkGeom = new THREE.CylinderGeometry(0.25 * scale, 0.4 * scale, trunkHeight, 7, trunkSegments)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4e37, roughness: 0.9 })

  // Curve the trunk vertices
  const pos = trunkGeom.attributes.position
  const curveDir = Math.random() * Math.PI * 2
  const curveAmt = (0.8 + Math.random() * 0.8) * scale
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const normY = (y + trunkHeight / 2) / trunkHeight
    const offset = Math.pow(normY, 1.8) * curveAmt
    pos.setX(i, pos.getX(i) + Math.cos(curveDir) * offset)
    pos.setZ(i, pos.getZ(i) + Math.sin(curveDir) * offset)
  }
  trunkGeom.computeVertexNormals()

  const trunk = new THREE.Mesh(trunkGeom, trunkMat)
  trunk.position.y = trunkHeight / 2
  trunk.castShadow = true
  treeGroup.add(trunk)

  // Top frond crown point
  const topX = Math.cos(curveDir) * curveAmt
  const topZ = Math.sin(curveDir) * curveAmt
  const crownY = trunkHeight

  // Coconuts
  const coconutMat = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.8 })
  for (let c = 0; c < 3; c++) {
    const cocoGeom = new THREE.SphereGeometry(0.25 * scale, 6, 6)
    const coco = new THREE.Mesh(cocoGeom, coconutMat)
    const angle = (c / 3) * Math.PI * 2
    coco.position.set(topX + Math.cos(angle) * 0.3, crownY - 0.3, topZ + Math.sin(angle) * 0.3)
    treeGroup.add(coco)
  }

  // Fronds (7-9 fan-shaped palm leaves)
  const numFronds = 7 + Math.floor(Math.random() * 3)
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x2e7d32,
    roughness: 0.6,
    side: THREE.DoubleSide
  })

  for (let f = 0; f < numFronds; f++) {
    const frondAngle = (f / numFronds) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
    const frondLength = (4.5 + Math.random() * 1.5) * scale

    // Leaf blade using a flattened cone
    const frondGeom = new THREE.ConeGeometry(0.8 * scale, frondLength, 5)
    frondGeom.rotateX(-Math.PI / 2)
    frondGeom.scale(1.2, 0.15, 1.0)

    const frondMesh = new THREE.Mesh(frondGeom, frondMat)
    frondMesh.castShadow = true
    frondMesh.position.set(topX, crownY, topZ)
    frondMesh.rotation.y = frondAngle
    frondMesh.rotation.x = 0.35 + Math.random() * 0.2 // Arch downwards
    treeGroup.add(frondMesh)
  }

  return treeGroup
}

// ── 2. Wooden Pirate Watchtower ──
export function createWatchtower(): THREE.Group {
  const tower = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
  const thatchMat = new THREE.MeshStandardMaterial({ color: 0x8b7d6b, roughness: 0.95 })

  // 4 Legs
  for (let i = 0; i < 4; i++) {
    const legGeom = new THREE.CylinderGeometry(0.2, 0.25, 9)
    const leg = new THREE.Mesh(legGeom, woodMat)
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    leg.position.set(Math.cos(angle) * 1.8, 4.5, Math.sin(angle) * 1.8)
    leg.rotation.z = (Math.random() - 0.5) * 0.05
    tower.add(leg)
  }

  // Platform
  const platGeom = new THREE.BoxGeometry(4.2, 0.4, 4.2)
  const plat = new THREE.Mesh(platGeom, woodMat)
  plat.position.y = 8.5
  tower.add(plat)

  // Railings
  const railGeom = new THREE.BoxGeometry(4.0, 0.8, 0.2)
  for (let r = 0; r < 4; r++) {
    const rail = new THREE.Mesh(railGeom, woodMat)
    rail.rotation.y = (r * Math.PI) / 2
    const offX = r === 1 ? 2.0 : r === 3 ? -2.0 : 0
    const offZ = r === 0 ? 2.0 : r === 2 ? -2.0 : 0
    rail.position.set(offX, 9.1, offZ)
    tower.add(rail)
  }

  // Thatch Roof
  const roofGeom = new THREE.ConeGeometry(3.2, 2.5, 5)
  const roof = new THREE.Mesh(roofGeom, thatchMat)
  roof.position.y = 11.2
  tower.add(roof)

  // Hanging Lantern
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 })
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), lanternMat)
  lantern.position.set(0, 8.0, 1.8)
  tower.add(lantern)

  return tower
}

// ── 3. Coastal Cannon ──
export function createCannon(): THREE.Group {
  const cannonGroup = new THREE.Group()
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.85 })

  // Carriage base
  const baseGeom = new THREE.BoxGeometry(1.2, 0.6, 2.2)
  const base = new THREE.Mesh(baseGeom, woodMat)
  base.position.y = 0.5
  cannonGroup.add(base)

  // Wheels
  for (let w = 0; w < 4; w++) {
    const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10)
    wheelGeom.rotateZ(Math.PI / 2)
    const wheel = new THREE.Mesh(wheelGeom, woodMat)
    const wx = w % 2 === 0 ? 0.75 : -0.75
    const wz = w < 2 ? 0.7 : -0.7
    wheel.position.set(wx, 0.35, wz)
    cannonGroup.add(wheel)
  }

  // Iron Barrel
  const barrelGeom = new THREE.CylinderGeometry(0.3, 0.4, 2.6, 12)
  barrelGeom.rotateX(Math.PI / 2)
  const barrel = new THREE.Mesh(barrelGeom, ironMat)
  barrel.position.set(0, 0.9, 0.2)
  barrel.rotation.x = -0.15 // Angle slightly up
  cannonGroup.add(barrel)

  return cannonGroup
}

// ── 4. Main Island Spawn Function ──
export function spawnIsland(scene: THREE.Scene, x: number, z: number, forcedArchetype?: IslandArchetype) {
  const islandGroup = new THREE.Group()

  // Select Archetype
  const archetype = forcedArchetype !== undefined
    ? forcedArchetype
    : Math.floor(Math.random() * 4) as IslandArchetype

  // Scale radius based on archetype - larger expansive landmasses
  let radius = 90
  if (archetype === IslandArchetype.VolcanicPeak) radius = 120 + Math.random() * 30
  else if (archetype === IslandArchetype.Atoll) radius = 95 + Math.random() * 25
  else if (archetype === IslandArchetype.PirateBay) radius = 100 + Math.random() * 25
  else radius = 80 + Math.random() * 20

  const seed = Math.random() * 1000
  const islandData = generateIslandMesh(radius, archetype, seed)
  islandGroup.add(islandData.group)

  // ── Place Palm Trees organically on sandy/grassy slopes ──
  const numTrees = Math.floor(16 + radius * 0.25)
  for (let t = 0; t < numTrees; t++) {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * radius * 0.75
    const localX = Math.cos(angle) * dist
    const localZ = Math.sin(angle) * dist
    const groundY = islandData.heightmapFn(localX, localZ)

    // Only plant trees between y = 0.8 (above water line) and y = 30.0 (below high volcanic peaks)
    if (groundY >= 0.8 && groundY <= 30.0) {
      const palmScale = 0.8 + Math.random() * 0.5
      const tree = createDetailedPalmTree(palmScale)
      tree.position.set(localX, groundY, localZ)
      tree.rotation.y = Math.random() * Math.PI * 2
      islandGroup.add(tree)
    }
  }

  // ── Place Watchtower on high cliff / peak ──
  if (archetype === IslandArchetype.VolcanicPeak || archetype === IslandArchetype.PirateBay) {
    const watchtower = createWatchtower()
    const towerAngle = Math.random() * Math.PI * 2
    const towerDist = radius * 0.4
    const tx = Math.cos(towerAngle) * towerDist
    const tz = Math.sin(towerAngle) * towerDist
    const ty = islandData.heightmapFn(tx, tz)
    if (ty > 4.0) {
      watchtower.position.set(tx, ty, tz)
      islandGroup.add(watchtower)
    }
  }

  // ── Dock & Pirate Village Buildings ──
  let hasDock = false
  let dockEndX = radius
  let dockEndZ = 0
  let dockEndRing = null

  if (islandData.dockSpot || archetype === IslandArchetype.PirateBay) {
    hasDock = true
    const spot = islandData.dockSpot || { x: radius * 0.6, z: 0, angle: 0 }
    const dockLength = 16 + radius * 0.2
    const dockGeom = new THREE.BoxGeometry(dockLength, 0.4, 4.5)
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
    const dock = new THREE.Mesh(dockGeom, dockMat)

    const dockX = spot.x + Math.cos(spot.angle) * (dockLength / 2)
    const dockZ = spot.z + Math.sin(spot.angle) * (dockLength / 2)
    dock.position.set(dockX, 0.2, dockZ)
    dock.rotation.y = -spot.angle
    islandGroup.add(dock)

    dockEndX = spot.x + Math.cos(spot.angle) * dockLength
    const dockEndZ = spot.z + Math.sin(spot.angle) * dockLength

    // Dock End Ring
    const dockEndRingGeom = new THREE.RingGeometry(6, 8, 32)
    const dockEndRingMat = new THREE.MeshBasicMaterial({
      color: 0xff3300, transparent: true, opacity: 0.6, side: THREE.DoubleSide
    })
    dockEndRing = new THREE.Mesh(dockEndRingGeom, dockEndRingMat)
    dockEndRing.rotation.x = -Math.PI / 2
    dockEndRing.position.set(dockEndX, 0.25, dockEndZ)
    islandGroup.add(dockEndRing)

    // Add 2 Coastal Cannons near the dock
    for (let c = 0; c < 2; c++) {
      const cannon = createCannon()
      const cOffset = (c === 0 ? 5 : -5)
      cannon.position.set(spot.x + cOffset, islandData.heightmapFn(spot.x + cOffset, spot.z), spot.z)
      cannon.rotation.y = -spot.angle + Math.PI / 2
      islandGroup.add(cannon)
    }

    // Pirate Village Huts
    const numHuts = 2 + Math.floor(Math.random() * 3)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b6d51, roughness: 0.85 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.9 })

    for (let h = 0; h < numHuts; h++) {
      const hAngle = spot.angle + (-0.6 + h * 0.4)
      const hDist = radius * 0.45 + Math.random() * 10
      const hx = Math.cos(hAngle) * hDist
      const hz = Math.sin(hAngle) * hDist
      const hy = islandData.heightmapFn(hx, hz)

      if (hy > 0.5) {
        const hutGroup = new THREE.Group()
        const hutW = 4 + Math.random() * 2
        const hutH = 3.5
        const wall = new THREE.Mesh(new THREE.BoxGeometry(hutW, hutH, hutW), wallMat)
        wall.position.y = hutH / 2
        hutGroup.add(wall)

        const roof = new THREE.Mesh(new THREE.ConeGeometry(hutW * 0.85, 2.2, 4), roofMat)
        roof.position.y = hutH + 1.1
        roof.rotation.y = Math.PI / 4
        hutGroup.add(roof)

        hutGroup.position.set(hx, hy, hz)
        islandGroup.add(hutGroup)
      }
    }
  }

  islandGroup.position.set(x, 0, z)
  scene.add(islandGroup)

  islandGroup.userData.dockEndX = dockEndX
  islandGroup.userData.dockEndZ = dockEndZ
  islandGroup.userData.dockWorldX = x + dockEndX
  islandGroup.userData.dockWorldZ = z + (dockEndRing ? dockEndRing.position.z : 0)
  islandGroup.userData.hasHarbor = hasDock
  islandGroup.userData.dockEndRing = dockEndRing

  return {
    x,
    z,
    radius: radius * 0.85, // Collision radius
    heightmapFn: (lx: number, lz: number) => islandData.heightmapFn(lx - x, lz - z),
    mesh: islandGroup
  }
}

export function spawnRock(scene: THREE.Scene, x: number, z: number) {
  const rockGroup = new THREE.Group()
  // Large sea cove rock formation base radius (18 - 32 units wide)
  const rockRadius = 18 + Math.random() * 14

  // Shared rock material with terrain normal map & depth polygon offset
  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.05,
    normalMap: getTerrainNormalMap(),
    normalScale: new THREE.Vector2(0.6, 0.6),
    flatShading: false,
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5
  })

  // Helper to create deformed rock mesh
  const createRockMesh = (r: number, scaleY: number, noiseAmp: number) => {
    const geom = new THREE.IcosahedronGeometry(r, 2)
    const posAttr = geom.attributes.position
    const seed = Math.random() * 1000

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i)
      const vy = posAttr.getY(i)
      const vz = posAttr.getZ(i)
      const n = fbm(vx * 0.1 + seed, vz * 0.1 + seed, 3) * noiseAmp
      const dist = Math.sqrt(vx * vx + vy * vy + vz * vz)
      const factor = dist > 0.0001 ? 1.0 + (n / dist) : 1.0
      posAttr.setXYZ(i, vx * factor, vy * factor * scaleY, vz * factor)
    }

    geom.computeVertexNormals()
    const normAttr = geom.attributes.normal

    const colors: number[] = []
    const wetStone = new THREE.Color(0x282320)
    const cliffStone = new THREE.Color(0x564e47)
    const mossGreen = new THREE.Color(0x3a562d)

    for (let i = 0; i < posAttr.count; i++) {
      const vy = posAttr.getY(i)
      const ny = normAttr.getY(i)
      const vColor = new THREE.Color()

      if (vy <= 0.3) {
        vColor.copy(wetStone)
      } else if (ny > 0.62 && vy > 3.0) {
        vColor.copy(mossGreen)
      } else {
        vColor.copy(cliffStone)
      }
      colors.push(vColor.r, vColor.g, vColor.b)
    }

    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    const mesh = new THREE.Mesh(geom, rockMat)
    mesh.renderOrder = 2
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  // 1. Central Towering Sea Stack Pinnacle (Height 35 - 55 units!)
  const mainHeightScale = 2.2 + Math.random() * 1.4
  const mainRock = createRockMesh(rockRadius, mainHeightScale, 4.0)
  mainRock.position.y = -rockRadius * 0.2
  mainRock.rotation.y = Math.random() * Math.PI * 2
  rockGroup.add(mainRock)

  // 2. Asymmetric Sea Cove Side Buttress Cliffs (1-2 attached cliff ledges)
  const numButtresses = 1 + Math.floor(Math.random() * 2)
  for (let b = 0; b < numButtresses; b++) {
    const bRadius = rockRadius * (0.55 + Math.random() * 0.3)
    const bHeightScale = 1.5 + Math.random() * 1.0
    const bMesh = createRockMesh(bRadius, bHeightScale, 3.0)
    const angle = b * Math.PI + (Math.random() - 0.5) * 1.0
    const dist = rockRadius * 0.7
    bMesh.position.set(Math.cos(angle) * dist, -bRadius * 0.25, Math.sin(angle) * dist)
    bMesh.rotation.y = Math.random() * Math.PI * 2
    rockGroup.add(bMesh)
  }

  // 3. Jagged Satellite Sea Stack Pillars (2-3 surrounding rocks)
  const numSat = 2 + Math.floor(Math.random() * 2)
  for (let s = 0; s < numSat; s++) {
    const satRadius = rockRadius * (0.3 + Math.random() * 0.25)
    const satHeightScale = 1.6 + Math.random() * 1.2
    const satMesh = createRockMesh(satRadius, satHeightScale, 2.0)
    const angle = Math.random() * Math.PI * 2
    const dist = rockRadius * 1.4 + Math.random() * 8
    satMesh.position.set(Math.cos(angle) * dist, -satRadius * 0.3, Math.sin(angle) * dist)
    satMesh.rotation.y = Math.random() * Math.PI * 2
    rockGroup.add(satMesh)
  }

  // Shallow Turquoise Reef Apron Ring around formation base
  const reefGeom = new THREE.RingGeometry(rockRadius * 0.9, rockRadius * 2.2, 32)
  reefGeom.rotateX(-Math.PI / 2)
  const reefMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false
  })
  const reefMesh = new THREE.Mesh(reefGeom, reefMat)
  reefMesh.position.y = 0.15
  rockGroup.add(reefMesh)

  rockGroup.position.set(x, 0, z)
  scene.add(rockGroup)
  return { x, z, radius: rockRadius + 12, mesh: rockGroup }
}

export function spawnSunkenShip(scene: THREE.Scene, x: number, z: number) {
  const shipwreckGroup = new THREE.Group()
  const hullGeom = new THREE.BoxGeometry(3.5, 1.8, 9)
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3d291a, roughness: 0.9 })
  const hull = new THREE.Mesh(hullGeom, hullMat)
  hull.position.y = -0.3
  hull.rotation.x = 0.35
  hull.rotation.z = (Math.random() - 0.5) * 0.2
  shipwreckGroup.add(hull)

  const mastGeom = new THREE.CylinderGeometry(0.15, 0.25, 7)
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x2b1b10, roughness: 0.9 })
  const mast = new THREE.Mesh(mastGeom, mastMat)
  mast.position.set(0, 2.2, 1)
  mast.rotation.x = -0.45
  shipwreckGroup.add(mast)

  // Floating Golden Beacon Ring (makes unlooted wrecks visible across water)
  const beaconGeom = new THREE.RingGeometry(2.5, 4.5, 24)
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd700, transparent: true, opacity: 0.75, side: THREE.DoubleSide
  })
  const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat)
  beaconMesh.rotation.x = -Math.PI / 2
  beaconMesh.position.set(0, 0.4, 0)
  shipwreckGroup.add(beaconMesh)

  shipwreckGroup.position.set(x, 0, z)
  scene.add(shipwreckGroup)

  return {
    x,
    z,
    radius: 6,
    mesh: shipwreckGroup,
    beaconMesh,
    isLooted: false,
    lootValue: 120 + Math.floor(Math.random() * 150)
  }
}

export function createKraken(scene: THREE.Scene, krakenRef) {
  const krakenMesh = new THREE.Group()

  const bodyGeometry = new THREE.SphereGeometry(12, 20, 20)
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1a3030, roughness: 0.7 })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.scale.y = 0.6
  body.position.y = 3
  krakenMesh.add(body)

  const eyeGeometry = new THREE.SphereGeometry(2, 12, 12)
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff2222 })
  const eyeL = new THREE.Mesh(eyeGeometry, eyeMaterial)
  eyeL.position.set(-4, 5, 8)
  krakenMesh.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeometry, eyeMaterial)
  eyeR.position.set(4, 5, 8)
  krakenMesh.add(eyeR)

  krakenRef.tentacles = []
  for (let i = 0; i < 8; i++) {
    const tentGroup = new THREE.Group()
    const angle = (i / 8) * Math.PI * 2
    tentGroup.rotation.y = angle

    const tentGeom = new THREE.CylinderGeometry(0.4, 1.5, 35, 8)
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x1a3030, roughness: 0.7 })
    const tent = new THREE.Mesh(tentGeom, tentMat)
    tent.position.set(17, 0, 0)
    tent.rotation.z = Math.PI / 2
    tentGroup.add(tent)
    krakenMesh.add(tentGroup)

    tent.userData.angle = angle
    tent.userData.baseAngle = angle
    tent.userData.phase = Math.random() * Math.PI * 2
    tent.userData.speed = 0.8 + Math.random() * 0.4
    tent.userData.state = 'idle'
    tent.userData.targetAngle = 0
    tent.userData.smashCooldown = 0
    tent.userData.smashDuration = 0
    tent.userData.hitChance = 0
    tent.userData.group = tentGroup

    krakenRef.tentacles.push(tent)
  }

  const whirlpoolGeom = new THREE.RingGeometry(15, 25, 32)
  const whirlpoolMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide
  })
  const whirlpool = new THREE.Mesh(whirlpoolGeom, whirlpoolMat)
  whirlpool.rotation.x = -Math.PI / 2
  whirlpool.position.y = 0.5
  krakenMesh.add(whirlpool)
  krakenMesh.userData.whirlpool = whirlpool

  krakenMesh.position.set(0, 0, 0)
  scene.add(krakenMesh)

  return krakenMesh
}
