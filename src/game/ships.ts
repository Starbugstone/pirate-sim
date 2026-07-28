// @ts-nocheck
import * as THREE from 'three'
import { SHIP_TYPES } from './constants'

// Cache procedural sail textures to avoid recreating canvas unnecessarily
const textureCache: Record<string, THREE.CanvasTexture> = {}

function getSailTexture(type: 'player' | 'rammer' | 'sloop' | 'galleon'): THREE.CanvasTexture {
  if (textureCache[type]) return textureCache[type]

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Base canvas cloth texture
  ctx.fillStyle = type === 'rammer' ? '#262322' : (type === 'sloop' ? '#f5f2eb' : '#ebdcc5')
  ctx.fillRect(0, 0, 512, 512)

  // Cloth seam lines
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
  ctx.lineWidth = 3
  for (let x = 64; x < 512; x += 64) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 512)
    ctx.stroke()
  }

  // Draw authentic emblems
  if (type === 'player') {
    // Charcoal Jolly Roger Skull & Crossbones
    ctx.fillStyle = '#1a1817'
    ctx.strokeStyle = '#1a1817'
    ctx.lineWidth = 20
    ctx.lineCap = 'round'

    // Crossed bones behind skull
    ctx.beginPath()
    ctx.moveTo(130, 130); ctx.lineTo(382, 380)
    ctx.moveTo(382, 130); ctx.lineTo(130, 380)
    ctx.stroke()

    // Bone ends
    const boneEnds = [[130,130],[382,380],[382,130],[130,380]]
    boneEnds.forEach(([bx, by]) => {
      ctx.beginPath()
      ctx.arc(bx - 10, by, 14, 0, Math.PI * 2)
      ctx.arc(bx + 10, by, 14, 0, Math.PI * 2)
      ctx.fill()
    })

    // Skull head dome
    ctx.beginPath()
    ctx.arc(256, 230, 65, 0, Math.PI * 2)
    ctx.fill()

    // Skull jaw
    ctx.fillRect(224, 275, 64, 38)

    // Eye sockets cutout
    ctx.fillStyle = '#ebdcc5'
    ctx.beginPath()
    ctx.arc(232, 230, 16, 0, Math.PI * 2)
    ctx.arc(280, 230, 16, 0, Math.PI * 2)
    ctx.fill()

    // Nose socket cutout
    ctx.beginPath()
    ctx.moveTo(256, 248)
    ctx.lineTo(248, 262)
    ctx.lineTo(264, 262)
    ctx.closePath()
    ctx.fill()

    // Teeth gap lines
    ctx.strokeStyle = '#ebdcc5'
    ctx.lineWidth = 4
    for (let t = 236; t <= 276; t += 13) {
      ctx.beginPath()
      ctx.moveTo(t, 275)
      ctx.lineTo(t, 310)
      ctx.stroke()
    }
  } else if (type === 'rammer') {
    // Blood-red Corsair emblem
    ctx.fillStyle = '#b30000'
    ctx.strokeStyle = '#b30000'
    ctx.lineWidth = 16
    ctx.lineCap = 'round'

    // Crossed cutlasses
    ctx.beginPath()
    ctx.moveTo(120, 140); ctx.lineTo(392, 370)
    ctx.moveTo(392, 140); ctx.lineTo(120, 370)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(256, 240, 70, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#262322'
    ctx.beginPath()
    ctx.arc(232, 235, 18, 0, Math.PI * 2)
    ctx.arc(280, 235, 18, 0, Math.PI * 2)
    ctx.fill()
  } else if (type === 'sloop') {
    // Royal Navy Blue & Gold Insignia
    ctx.fillStyle = '#0a2351'
    ctx.beginPath()
    ctx.arc(256, 245, 75, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#d4af37'
    ctx.lineWidth = 8
    ctx.stroke()

    // Golden Crown
    ctx.fillStyle = '#d4af37'
    ctx.beginPath()
    ctx.moveTo(210, 175); ctx.lineTo(302, 175); ctx.lineTo(322, 130)
    ctx.lineTo(282, 155); ctx.lineTo(256, 115); ctx.lineTo(230, 155)
    ctx.lineTo(190, 130); ctx.closePath()
    ctx.fill()
  } else if (type === 'galleon') {
    // Golden Imperial Shield with Red Lion Crest
    ctx.fillStyle = '#c5a028'
    ctx.beginPath()
    ctx.moveTo(256, 140)
    ctx.lineTo(336, 175)
    ctx.lineTo(326, 290)
    ctx.lineTo(256, 350)
    ctx.lineTo(186, 290)
    ctx.lineTo(176, 175)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = '#6b0000'
    ctx.lineWidth = 6
    ctx.stroke()

    ctx.fillStyle = '#8b0000'
    ctx.beginPath()
    ctx.arc(256, 235, 45, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  textureCache[type] = texture
  return texture
}

/**
 * Creates the Player's Pirate Ship with high detail and dynamic shop upgrades.
 */
export function createPlayerShip(upgrades: any = {}): THREE.Group {
  const ship = new THREE.Group()

  const cannonCountLvl = upgrades.cannonCount || 0 // 0, 1, 2, 3
  const sailSpeedLvl = upgrades.sailSpeed || 0   // 0, 1, 2, 3
  const maxHpLvl = upgrades.maxHpBonus || 0       // 0 to 5
  const cannonSpeedLvl = upgrades.cannonSpeed || 0 // 0 to 3
  const parrotLvl = upgrades.parrot || 0           // 0 to 5

  // Materials
  const woodMat = new THREE.MeshPhongMaterial({ color: 0x4a2a18, roughness: 0.8 })
  const stripeMat = new THREE.MeshPhongMaterial({ color: 0x7c1c1c })
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xc4a47c })
  const railMat = new THREE.MeshPhongMaterial({ color: 0x2b180d })
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x3d2314 })
  const yardMat = new THREE.MeshPhongMaterial({ color: 0x4a2e16 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.85, roughness: 0.25 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.5 })
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x8b7355 })

  const cannonBarrelMat = cannonSpeedLvl > 0 ? brassMat : ironMat

  // Sail Material with Pirate Skull Texture
  const playerSailTexture = getSailTexture('player')
  const sailMat = new THREE.MeshPhongMaterial({
    map: playerSailTexture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
    shininess: 10
  })

  // Plain Sail Material for secondary sails
  const plainSailMat = new THREE.MeshPhongMaterial({
    color: 0xebdcc5,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95
  })

  // === 1. MAIN HULL (Swept & Curved Extrusion - Scale 1.8x) ===
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-2.8, -7.5)
  hullShape.lineTo(2.8, -7.5)
  hullShape.lineTo(3.4, -3.0)
  hullShape.lineTo(3.2, 3.5)
  hullShape.lineTo(2.2, 6.5)
  hullShape.lineTo(0.0, 8.5) // Bow tip
  hullShape.lineTo(-2.2, 6.5)
  hullShape.lineTo(-3.2, 3.5)
  hullShape.lineTo(-3.4, -3.0)
  hullShape.closePath()

  const extrudeSettings = { depth: 3.5, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.25, bevelSegments: 3 }
  const hullGeom = new THREE.ExtrudeGeometry(hullShape, extrudeSettings)
  const hull = new THREE.Mesh(hullGeom, woodMat)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.8
  ship.add(hull)

  // Red waterline / accent stripe
  const stripeGeom = new THREE.BoxGeometry(6.2, 0.35, 15.0)
  const stripe = new THREE.Mesh(stripeGeom, stripeMat)
  stripe.position.set(0, 2.4, -0.2)
  ship.add(stripe)

  // === 2. MAIN DECK & QUARTERDECK (Multi-tier) ===
  const deckGeom = new THREE.BoxGeometry(5.6, 0.4, 13.5)
  const deck = new THREE.Mesh(deckGeom, deckMat)
  deck.position.set(0, 3.6, -0.5)
  ship.add(deck)

  // Raised Stern Castle / Quarterdeck
  const quarterdeckGeom = new THREE.BoxGeometry(5.4, 1.2, 5.0)
  const quarterdeck = new THREE.Mesh(quarterdeckGeom, woodMat)
  quarterdeck.position.set(0, 4.3, -4.8)
  ship.add(quarterdeck)

  const qdeckTop = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 4.8), deckMat)
  qdeckTop.position.set(0, 4.95, -4.8)
  ship.add(qdeckTop)

  // Stern Gallery Transom Windows & Gold Trim
  const transomPanel = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.2, 0.2), woodMat)
  transomPanel.position.set(0, 4.2, -7.4)
  ship.add(transomPanel)

  for (let w = -1.8; w <= 1.8; w += 0.9) {
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.25), goldMat)
    windowMesh.position.set(w, 4.5, -7.45)
    ship.add(windowMesh)
  }

  // === 3. DECK FITTINGS (Helm, Capstan, Railings, Figurehead) ===
  // Helm (Steering wheel) on Quarterdeck
  const helmStand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.0), railMat)
  helmStand.position.set(0, 5.5, -4.2)
  ship.add(helmStand)

  const helmWheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 12), goldMat)
  helmWheel.position.set(0, 5.8, -4.1)
  ship.add(helmWheel)

  // Railing Posts & Top Rail
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 10; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0), railMat)
      post.position.set(side * 2.7, 4.3, -6.0 + i * 1.25)
      ship.add(post)
    }
    const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12.0, 8), railMat)
    railBar.rotation.x = Math.PI / 2
    railBar.position.set(side * 2.7, 4.8, -0.4)
    ship.add(railBar)
  }

  // Figurehead at Bow (Ornate Dragon Head)
  const figureheadGroup = new THREE.Group()
  const dragonBody = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 8), goldMat)
  dragonBody.rotation.x = Math.PI / 3
  figureheadGroup.add(dragonBody)
  const dragonHead = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), goldMat)
  dragonHead.position.set(0, 0.6, 1.0)
  figureheadGroup.add(dragonHead)
  figureheadGroup.position.set(0, 3.2, 8.2)
  ship.add(figureheadGroup)

  // Anchor Catheads & Anchors on Bow Sides
  for (let side = -1; side <= 1; side += 2) {
    const cathead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.5), woodMat)
    cathead.position.set(side * 2.8, 4.0, 6.5)
    cathead.rotation.y = side * 0.3
    ship.add(cathead)
  }

  // === 4. VISUAL UPGRADE: HULL ARMOR (`maxHpBonus` Lvl 1–5) ===
  if (maxHpLvl > 0) {
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.4 })
    for (let i = 0; i < Math.min(5, maxHpLvl); i++) {
      const zPos = -4 + i * 2.2
      const bandL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 1.8), armorMat)
      bandL.position.set(-3.3, 2.5, zPos)
      ship.add(bandL)
      const bandR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 1.8), armorMat)
      bandR.position.set(3.3, 2.5, zPos)
      ship.add(bandR)
    }
  }

  // === 5. VISUAL UPGRADE: CANNONS (`cannonCount` Lvl 0–3 & `cannonSpeed`) ===
  // Level 0: 3 per side, Lvl 1: 5 per side, Lvl 2: 7 per side, Lvl 3: 9 per side
  const numCannonsPerSide = 3 + cannonCountLvl * 2
  const portCannons: any[] = []
  const starboardCannons: any[] = []

  const sideCannonGeom = new THREE.CylinderGeometry(0.2, 0.28, 1.6, 10)
  const portHoleGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.4, 8)
  const portHoleMat = new THREE.MeshBasicMaterial({ color: 0x111111 })

  const startZ = -4.5
  const endZ = 3.5
  const zStep = (endZ - startZ) / (numCannonsPerSide - 1 || 1)

  for (let i = 0; i < numCannonsPerSide; i++) {
    const zPos = startZ + i * zStep

    // Port Side (-X)
    const portHoleL = new THREE.Mesh(portHoleGeom, portHoleMat)
    portHoleL.rotation.z = Math.PI / 2
    portHoleL.position.set(-3.1, 2.6, zPos)
    ship.add(portHoleL)

    const cannonL = new THREE.Mesh(sideCannonGeom, cannonBarrelMat)
    cannonL.rotation.z = -Math.PI / 2
    cannonL.rotation.y = (i - (numCannonsPerSide - 1) / 2) * (6 * Math.PI / 180)
    cannonL.position.set(-3.4, 2.6, zPos)
    ship.add(cannonL)

    portCannons.push({
      mesh: cannonL,
      zOffset: zPos,
      sideSign: -1
    })

    // Starboard Side (+X)
    const portHoleR = new THREE.Mesh(portHoleGeom, portHoleMat)
    portHoleR.rotation.z = Math.PI / 2
    portHoleR.position.set(3.1, 2.6, zPos)
    ship.add(portHoleR)

    const cannonR = new THREE.Mesh(sideCannonGeom, cannonBarrelMat)
    cannonR.rotation.z = Math.PI / 2
    cannonR.rotation.y = -(i - (numCannonsPerSide - 1) / 2) * (6 * Math.PI / 180)
    cannonR.position.set(3.4, 2.6, zPos)
    ship.add(cannonR)

    starboardCannons.push({
      mesh: cannonR,
      zOffset: zPos,
      sideSign: 1
    })
  }

  ship.userData.portCannons = portCannons
  ship.userData.starboardCannons = starboardCannons

  // Extra Ammunition Kegs on deck for `cannonSpeed` upgrade
  if (cannonSpeedLvl > 0) {
    const kegGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8)
    const kegMat = new THREE.MeshPhongMaterial({ color: 0x5c3317 })
    for (let k = 0; k < cannonSpeedLvl * 2; k++) {
      const keg = new THREE.Mesh(kegGeom, kegMat)
      keg.position.set((k % 2 === 0 ? 1 : -1) * 1.8, 4.0, -1.0 + Math.floor(k / 2) * 1.0)
      ship.add(keg)
    }
  }

  // === 6. MASTS & RIGGING ===
  const sails: THREE.Mesh[] = []

  // Main Mast (Center)
  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 18.0, 10), mastMat)
  mainMast.position.set(0, 12.0, -0.5)
  ship.add(mainMast)

  // Foremast (Front)
  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 15.0, 10), mastMat)
  foreMast.position.set(0, 10.5, 4.5)
  ship.add(foreMast)

  // Mizzenmast (Rear)
  const mizzenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 12.0, 10), mastMat)
  mizzenMast.position.set(0, 9.0, -4.8)
  ship.add(mizzenMast)

  // Bowsprit pole extending forward
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 9.0, 8), mastMat)
  bowsprit.rotation.x = Math.PI / 4
  bowsprit.position.set(0, 4.8, 10.5)
  ship.add(bowsprit)

  // Crow's Nest on Main Mast
  const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.7, 10), railMat)
  nest.position.set(0, 17.5, -0.5)
  ship.add(nest)

  // Shrouds & Ratlines (Rope ladder grids)
  for (let side = -1; side <= 1; side += 2) {
    const shroudGeom = new THREE.CylinderGeometry(0.04, 0.04, 14.0, 6)
    const shroudL = new THREE.Mesh(shroudGeom, ropeMat)
    shroudL.position.set(side * 2.5, 10.0, -0.5)
    shroudL.rotation.z = -side * 0.15
    ship.add(shroudL)
  }

  // === 7. SAILS & YARDS (With dynamic wind deformation support) ===
  function createSail(width: number, height: number, yPos: number, zPos: number, isMainSkull = false) {
    const yardGroup = new THREE.Group()
    yardGroup.position.set(0, yPos, zPos)

    const yardBarGeom = new THREE.CylinderGeometry(0.1, 0.12, width + 0.8, 8)
    const topYard = new THREE.Mesh(yardBarGeom, yardMat)
    topYard.rotation.z = Math.PI / 2
    topYard.position.y = height / 2
    yardGroup.add(topYard)

    const botYard = new THREE.Mesh(yardBarGeom, yardMat)
    botYard.rotation.z = Math.PI / 2
    botYard.position.y = -height / 2
    yardGroup.add(botYard)

    const sailGeom = new THREE.PlaneGeometry(width, height, 14, 16)
    const mat = isMainSkull ? sailMat : plainSailMat
    const sailMesh = new THREE.Mesh(sailGeom, mat)
    sailMesh.position.set(0, 0, 0.08)
    sailMesh.userData.isSail = true
    sailMesh.userData.yardGroup = yardGroup
    sailMesh.userData.originalVertices = sailGeom.attributes.position.array.slice()
    sailMesh.userData.fixedEdges = []

    for (let i = 0; i < sailGeom.attributes.position.count; i++) {
      const y = sailGeom.attributes.position.getY(i)
      sailMesh.userData.fixedEdges.push(Math.abs(y - height / 2) < 0.15 || Math.abs(y + height / 2) < 0.15)
    }

    yardGroup.add(sailMesh)
    ship.add(yardGroup)
    sails.push(sailMesh)
    return yardGroup
  }

  // Base Sails: Main, Fore, Mizzen
  createSail(8.5, 9.5, 12.0, -0.5, true)  // Main Sail with Skull Emblem!
  createSail(6.5, 7.5, 10.5, 4.5, false)  // Fore Sail
  createSail(5.0, 6.0, 9.0, -4.8, false)  // Mizzen Sail

  // VISUAL UPGRADE: Extra Sails (`sailSpeed` Lvl 1–3)
  if (sailSpeedLvl >= 1) {
    // Jib staysail on Bowsprit
    const jibGeom = new THREE.BufferGeometry()
    const vertices = new Float32Array([
      0, 4.5, 6.5,
      0, 8.5, 11.5,
      0, 4.5, 12.5
    ])
    jibGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    jibGeom.computeVertexNormals()
    const jibMesh = new THREE.Mesh(jibGeom, plainSailMat)
    ship.add(jibMesh)
  }

  if (sailSpeedLvl >= 2) {
    // Topgallant upper sails on Main & Fore masts
    createSail(6.0, 4.5, 18.0, -0.5, false)
    createSail(4.5, 3.5, 15.5, 4.5, false)
  }

  if (sailSpeedLvl >= 3) {
    // Royal sky sail on Main Mast peak
    createSail(4.0, 3.0, 21.0, -0.5, false)
  }

  ship.userData.sails = sails

  // === 8. DYNAMIC JOLLY ROGER FLAG ===
  const flagGroup = new THREE.Group()
  const flagGeom = new THREE.PlaneGeometry(2.5, 1.5, 8, 4)

  // Flag texture with small Skull & Crossbones
  const flagCanvas = document.createElement('canvas')
  flagCanvas.width = 256
  flagCanvas.height = 160
  const fctx = flagCanvas.getContext('2d')!
  fctx.fillStyle = '#0a0a0a'
  fctx.fillRect(0, 0, 256, 160)
  fctx.fillStyle = '#ffffff'
  fctx.beginPath(); fctx.arc(128, 70, 25, 0, Math.PI * 2); fctx.fill()
  fctx.fillRect(112, 90, 32, 18)
  fctx.fillStyle = '#0a0a0a'
  fctx.beginPath(); fctx.arc(118, 68, 6, 0, Math.PI * 2); fctx.arc(138, 68, 6, 0, Math.PI * 2); fctx.fill()
  const flagTexture = new THREE.CanvasTexture(flagCanvas)

  const flagMat = new THREE.MeshPhongMaterial({ map: flagTexture, side: THREE.DoubleSide })
  const flagMesh = new THREE.Mesh(flagGeom, flagMat)
  flagMesh.position.set(1.25, 0, 0)
  flagGroup.add(flagMesh)

  flagGroup.position.set(0, 20.0, -0.5)
  flagGroup.rotation.y = Math.PI / 2
  ship.add(flagGroup)
  ship.userData.flagMesh = flagMesh

  // === 9. PARROT VISUAL UPGRADE (`parrot` Lvl 1–5) ===
  if (parrotLvl > 0) {
    const parrotGroup = new THREE.Group()
    const parrotBody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshPhongMaterial({ color: 0x00cc44 }))
    parrotGroup.add(parrotBody)
    const parrotHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshPhongMaterial({ color: 0xcc0000 }))
    parrotHead.position.set(0, 0.35, 0.1)
    parrotGroup.add(parrotHead)
    parrotGroup.position.set(0.7, 17.8, -0.5)
    ship.add(parrotGroup)
  }

  ship.position.set(0, 0, 0)
  return ship
}

/**
 * Creates distinct 3D visual models for the 3 AI Enemy Ships.
 */
export function createEnemyShipMesh(shipType: any): THREE.Group {
  const mesh = new THREE.Group()
  const typeName = shipType.name ? shipType.name.toUpperCase() : 'NORMAL'
  const isRammer = typeName.includes('RAMMER')
  const isBig = typeName.includes('GALLEON') || shipType.size > 1.4

  const sizeScale = isBig ? 1.8 : (isRammer ? 1.4 : 1.3)

  // Wood & Trim Materials
  const woodColor = isRammer ? 0x221a14 : (isBig ? 0x3d2314 : 0x5c3317)
  const woodMat = new THREE.MeshPhongMaterial({ color: woodColor })
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xc4a47c })
  const railMat = new THREE.MeshPhongMaterial({ color: 0x1f140b })
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x3d2314 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.5 })

  // Emblem Sail Texture
  const sailType = isRammer ? 'rammer' : (isBig ? 'galleon' : 'sloop')
  const sailTexture = getSailTexture(sailType)
  const sailMat = new THREE.MeshPhongMaterial({
    map: sailTexture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95
  })

  // === 1. HULL STRUCTURE ===
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-2.2 * sizeScale, -6.0 * sizeScale)
  hullShape.lineTo(2.2 * sizeScale, -6.0 * sizeScale)
  hullShape.lineTo(2.6 * sizeScale, 0)
  hullShape.lineTo(2.0 * sizeScale, 5.0 * sizeScale)
  hullShape.lineTo(0.0, 7.0 * sizeScale) // Bow tip
  hullShape.lineTo(-2.0 * sizeScale, 5.0 * sizeScale)
  hullShape.lineTo(-2.6 * sizeScale, 0)
  hullShape.closePath()

  const extrudeSettings = { depth: 2.8 * sizeScale, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 }
  const hullGeom = new THREE.ExtrudeGeometry(hullShape, extrudeSettings)
  const hullMat = new THREE.MeshPhongMaterial({ color: shipType.color || woodColor })
  const hull = new THREE.Mesh(hullGeom, hullMat)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.6 * sizeScale
  mesh.add(hull)

  // Main Deck
  const deckGeom = new THREE.BoxGeometry(4.4 * sizeScale, 0.3 * sizeScale, 11.0 * sizeScale)
  const deck = new THREE.Mesh(deckGeom, deckMat)
  deck.position.set(0, 3.0 * sizeScale, 0)
  mesh.add(deck)

  // === 2. DISTINCT FACTION FEATURES ===
  const portCannons: any[] = []
  const starboardCannons: any[] = []

  if (isRammer) {
    // === CORSAIR RAMMER: Heavy iron plating & lethal spiked ramming beak ===
    const armorPlateMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.85, roughness: 0.3 })
    for (let side = -1; side <= 1; side += 2) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2 * sizeScale, 8.0 * sizeScale), armorPlateMat)
      plate.position.set(side * 2.3 * sizeScale, 2.2 * sizeScale, 0)
      mesh.add(plate)
    }

    // Heavy Spiked Ramming Beak at Bow
    const ramSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.6 * sizeScale, 5.0 * sizeScale, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 })
    )
    ramSpike.rotation.x = -Math.PI / 2
    ramSpike.position.set(0, 1.5 * sizeScale, 8.5 * sizeScale)
    mesh.add(ramSpike)

    // Side Spikes
    for (let side = -1; side <= 1; side += 2) {
      const sSpike = new THREE.Mesh(new THREE.ConeGeometry(0.3 * sizeScale, 2.0 * sizeScale, 6), armorPlateMat)
      sSpike.rotation.z = -side * Math.PI / 2
      sSpike.position.set(side * 2.4 * sizeScale, 1.8 * sizeScale, 6.0 * sizeScale)
      mesh.add(sSpike)
    }

    // 2 Heavy Side Cannons
    for (let side = -1; side <= 1; side += 2) {
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.5 * sizeScale), ironMat)
      cannon.rotation.z = side * Math.PI / 2
      cannon.position.set(side * 2.5 * sizeScale, 2.5 * sizeScale, 0)
      mesh.add(cannon)
      if (side === -1) portCannons.push({ mesh: cannon, zOffset: 0, sideSign: -1 })
      else starboardCannons.push({ mesh: cannon, zOffset: 0, sideSign: 1 })
    }
  } else if (isBig) {
    // === IMPERIAL GALLEON: High multi-tiered stern castle & double deck gun ports ===
    const sternCastle = new THREE.Mesh(new THREE.BoxGeometry(4.2 * sizeScale, 2.2 * sizeScale, 4.5 * sizeScale), woodMat)
    sternCastle.position.set(0, 4.2 * sizeScale, -3.8 * sizeScale)
    mesh.add(sternCastle)

    // Triple Stern Lanterns
    for (let l = -1.2; l <= 1.2; l += 1.2) {
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * sizeScale, 0.2 * sizeScale, 0.6 * sizeScale), goldMat)
      lantern.position.set(l * sizeScale, 5.2 * sizeScale, -6.1 * sizeScale)
      mesh.add(lantern)
    }

    // 6 Side Cannons per side (Double Deck feel)
    for (let side = -1; side <= 1; side += 2) {
      for (let c = -2; c <= 2; c += 2) {
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.4 * sizeScale), ironMat)
        cannon.rotation.z = side * Math.PI / 2
        cannon.position.set(side * 2.5 * sizeScale, 2.4 * sizeScale, c * 1.5 * sizeScale)
        mesh.add(cannon)
        if (side === -1) portCannons.push({ mesh: cannon, zOffset: c * 1.5 * sizeScale, sideSign: -1 })
        else starboardCannons.push({ mesh: cannon, zOffset: c * 1.5 * sizeScale, sideSign: 1 })
      }
    }
  } else {
    // === ROYAL NAVY SLOOP: Sleek 2-masted vessel with sharp clipper bow ===
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2 * sizeScale, 1.0 * sizeScale, 3.0 * sizeScale), woodMat)
    cabin.position.set(0, 3.5 * sizeScale, -3.5 * sizeScale)
    mesh.add(cabin)

    // 4 Side Cannons
    for (let side = -1; side <= 1; side += 2) {
      for (let c = -1; c <= 1; c += 2) {
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.3 * sizeScale), ironMat)
        cannon.rotation.z = side * Math.PI / 2
        cannon.position.set(side * 2.4 * sizeScale, 2.4 * sizeScale, c * 1.8 * sizeScale)
        mesh.add(cannon)
        if (side === -1) portCannons.push({ mesh: cannon, zOffset: c * 1.8 * sizeScale, sideSign: -1 })
        else starboardCannons.push({ mesh: cannon, zOffset: c * 1.8 * sizeScale, sideSign: 1 })
      }
    }
  }

  mesh.userData.portCannons = portCannons
  mesh.userData.starboardCannons = starboardCannons

  // === 3. MASTS & SAILS ===
  const sails: THREE.Mesh[] = []

  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * sizeScale, 0.35 * sizeScale, 14 * sizeScale, 8), mastMat)
  mainMast.position.set(0, 9.0 * sizeScale, 0)
  mesh.add(mainMast)

  // Yard 1 (Upper)
  const yard1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * sizeScale, 0.08 * sizeScale, 7.5 * sizeScale, 8), mastMat)
  yard1.rotation.z = Math.PI / 2
  yard1.position.set(0, 13.5 * sizeScale, 0)
  mesh.add(yard1)

  const sail1Geom = new THREE.PlaneGeometry(7.0 * sizeScale, 6.0 * sizeScale, 10, 10)
  const mainSail = new THREE.Mesh(sail1Geom, sailMat)
  mainSail.position.set(0, 10.5 * sizeScale, 0.05)
  mainSail.userData.isSail = true
  mainSail.userData.originalVertices = sail1Geom.attributes.position.array.slice()
  mainSail.userData.fixedEdges = []
  for (let i = 0; i < sail1Geom.attributes.position.count; i++) {
    const y = sail1Geom.attributes.position.getY(i)
    mainSail.userData.fixedEdges.push(Math.abs(y - 3.0 * sizeScale) < 0.1 || Math.abs(y + 3.0 * sizeScale) < 0.1)
  }
  mesh.add(mainSail)
  sails.push(mainSail)

  // Fore Mast
  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sizeScale, 0.28 * sizeScale, 10 * sizeScale, 8), mastMat)
  foreMast.position.set(0, 7.0 * sizeScale, 3.5 * sizeScale)
  mesh.add(foreMast)

  const foreYard = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * sizeScale, 0.07 * sizeScale, 5.5 * sizeScale, 8), mastMat)
  foreYard.rotation.z = Math.PI / 2
  foreYard.position.set(0, 10.5 * sizeScale, 3.5 * sizeScale)
  mesh.add(foreYard)

  const sail2Geom = new THREE.PlaneGeometry(5.0 * sizeScale, 4.5 * sizeScale, 8, 8)
  const foreSail = new THREE.Mesh(sail2Geom, sailMat)
  foreSail.position.set(0, 8.0 * sizeScale, 3.55 * sizeScale)
  foreSail.userData.isSail = true
  foreSail.userData.originalVertices = sail2Geom.attributes.position.array.slice()
  foreSail.userData.fixedEdges = []
  for (let i = 0; i < sail2Geom.attributes.position.count; i++) {
    const y = sail2Geom.attributes.position.getY(i)
    foreSail.userData.fixedEdges.push(Math.abs(y - 2.25 * sizeScale) < 0.1 || Math.abs(y + 2.25 * sizeScale) < 0.1)
  }
  mesh.add(foreSail)
  sails.push(foreSail)

  mesh.userData.sails = sails

  // Faction Flag on Main Topmast
  const flagColor = isRammer ? 0xb30000 : (isBig ? 0xd4af37 : 0x0a2351)
  const flagMat = new THREE.MeshBasicMaterial({ color: flagColor, side: THREE.DoubleSide })
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.0 * sizeScale, 1.2 * sizeScale), flagMat)
  flag.position.set(0, 15 * sizeScale, 0)
  flag.rotation.y = Math.PI / 2
  mesh.add(flag)

  return mesh
}
