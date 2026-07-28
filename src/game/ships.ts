// @ts-nocheck
import * as THREE from 'three'
import { SHIP_TYPES } from './constants'

// Cache procedural sail & flag textures to avoid recreating canvas unnecessarily
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

function getJollyRogerFlagTexture(): THREE.CanvasTexture {
  if (textureCache['jolly_roger_flag']) return textureCache['jolly_roger_flag']

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const ctx = canvas.getContext('2d')!

  // Pitch black flag cloth
  ctx.fillStyle = '#0f0f0f'
  ctx.fillRect(0, 0, 256, 160)

  // White Jolly Roger Skull & Crossed Bones
  ctx.fillStyle = '#f5f5f5'
  ctx.strokeStyle = '#f5f5f5'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'

  // Crossed bones
  ctx.beginPath()
  ctx.moveTo(60, 40); ctx.lineTo(196, 120)
  ctx.moveTo(196, 40); ctx.lineTo(60, 120)
  ctx.stroke()

  const boneEnds = [[60,40],[196,120],[196,40],[60,120]]
  boneEnds.forEach(([bx, by]) => {
    ctx.beginPath()
    ctx.arc(bx - 5, by, 7, 0, Math.PI * 2)
    ctx.arc(bx + 5, by, 7, 0, Math.PI * 2)
    ctx.fill()
  })

  // Skull dome
  ctx.beginPath()
  ctx.arc(128, 75, 32, 0, Math.PI * 2)
  ctx.fill()

  // Jaw
  ctx.fillRect(112, 96, 32, 20)

  // Eye cutouts
  ctx.fillStyle = '#0f0f0f'
  ctx.beginPath()
  ctx.arc(116, 75, 8, 0, Math.PI * 2)
  ctx.arc(140, 75, 8, 0, Math.PI * 2)
  ctx.fill()

  // Nose cutout
  ctx.beginPath()
  ctx.moveTo(128, 85); ctx.lineTo(123, 93); ctx.lineTo(133, 93); ctx.closePath(); ctx.fill()

  // Teeth lines
  ctx.strokeStyle = '#0f0f0f'
  ctx.lineWidth = 3
  for (let t = 118; t <= 138; t += 7) {
    ctx.beginPath()
    ctx.moveTo(t, 96); ctx.lineTo(t, 114); ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  textureCache['jolly_roger_flag'] = texture
  return texture
}

function getRoyalNavalEnsignTexture(): THREE.CanvasTexture {
  if (textureCache['royal_navy_ensign']) return textureCache['royal_navy_ensign']

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const ctx = canvas.getContext('2d')!

  // Red Ensign field
  ctx.fillStyle = '#990000'
  ctx.fillRect(0, 0, 256, 160)

  // Union Jack in upper canton
  ctx.fillStyle = '#0a2351'
  ctx.fillRect(0, 0, 128, 80)

  // St George Cross
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(52, 0, 24, 80)
  ctx.fillRect(0, 28, 128, 24)

  ctx.fillStyle = '#cc0000'
  ctx.fillRect(58, 0, 12, 80)
  ctx.fillRect(0, 34, 128, 12)

  const texture = new THREE.CanvasTexture(canvas)
  textureCache['royal_navy_ensign'] = texture
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
  const helmStand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.0, 8), railMat)
  helmStand.position.set(0, 5.5, -4.2)
  ship.add(helmStand)

  const helmWheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 12), goldMat)
  helmWheel.position.set(0, 5.8, -4.1)
  ship.add(helmWheel)

  // Railing Posts & Top Rail
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 10; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), railMat)
      post.position.set(side * 2.7, 4.3, -6.0 + i * 1.25)
      ship.add(post)
    }
    const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12.0, 8), railMat)
    railBar.rotation.x = Math.PI / 2
    railBar.position.set(side * 2.7, 4.8, -0.4)
    ship.add(railBar)
  }

  // Figurehead at Bow (Ornate Gold Dragon Head)
  const figureheadGroup = new THREE.Group()
  const dragonBody = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 8), goldMat)
  dragonBody.rotation.x = Math.PI / 3
  figureheadGroup.add(dragonBody)
  const dragonHead = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), goldMat)
  dragonHead.position.set(0, 0.6, 1.0)
  figureheadGroup.add(dragonHead)
  figureheadGroup.position.set(0, 3.2, 8.2)
  ship.add(figureheadGroup)

  // Anchor Catheads on Bow Sides
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

    portCannons.push({ mesh: cannonL, zOffset: zPos, sideSign: -1 })

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

    starboardCannons.push({ mesh: cannonR, zOffset: zPos, sideSign: 1 })
  }

  ship.userData.portCannons = portCannons
  ship.userData.starboardCannons = starboardCannons

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

  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 18.0, 10), mastMat)
  mainMast.position.set(0, 12.0, -0.5)
  ship.add(mainMast)

  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 15.0, 10), mastMat)
  foreMast.position.set(0, 10.5, 4.5)
  ship.add(foreMast)

  const mizzenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 12.0, 10), mastMat)
  mizzenMast.position.set(0, 9.0, -4.8)
  ship.add(mizzenMast)

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 9.0, 8), mastMat)
  bowsprit.rotation.x = Math.PI / 4
  bowsprit.position.set(0, 4.8, 10.5)
  ship.add(bowsprit)

  const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.7, 10), railMat)
  nest.position.set(0, 17.5, -0.5)
  ship.add(nest)

  for (let side = -1; side <= 1; side += 2) {
    const shroudGeom = new THREE.CylinderGeometry(0.04, 0.04, 14.0, 6)
    const shroudL = new THREE.Mesh(shroudGeom, ropeMat)
    shroudL.position.set(side * 2.5, 10.0, -0.5)
    shroudL.rotation.z = -side * 0.15
    ship.add(shroudL)
  }

  // === 7. SAILS & YARDS ===
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

  createSail(8.5, 9.5, 12.0, -0.5, true)  // Main Sail with Skull Emblem!
  createSail(6.5, 7.5, 10.5, 4.5, false)  // Fore Sail
  createSail(5.0, 6.0, 9.0, -4.8, false)  // Mizzen Sail

  if (sailSpeedLvl >= 1) {
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
    createSail(6.0, 4.5, 18.0, -0.5, false)
    createSail(4.5, 3.5, 15.5, 4.5, false)
  }

  if (sailSpeedLvl >= 3) {
    createSail(4.0, 3.0, 21.0, -0.5, false)
  }

  ship.userData.sails = sails

  // === 8. DYNAMIC JOLLY ROGER PIRATE FLAG ATTACHED TO MAIN TOPMAST ===
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6), mastMat)
  flagPole.position.set(0, 22.0, -0.5)
  ship.add(flagPole)

  const truckGold = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), goldMat)
  truckGold.position.set(0, 23.75, -0.5)
  ship.add(truckGold)

  const flagGroup = new THREE.Group()
  const flagGeom = new THREE.PlaneGeometry(3.0, 1.8, 10, 5)

  const jollyTexture = getJollyRogerFlagTexture()
  const flagMat = new THREE.MeshPhongMaterial({ map: jollyTexture, side: THREE.DoubleSide })
  const flagMesh = new THREE.Mesh(flagGeom, flagMat)
  // Left edge anchored at mast center (0,0,0) inside flagGroup
  flagMesh.position.set(1.5, 0, 0)
  flagGroup.add(flagMesh)

  flagGroup.position.set(0, 22.8, -0.5)
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
 * Creates distinct, high-detail 3D visual models for Royal Naval & Pirate Warships.
 */
export function createEnemyShipMesh(shipType: any): THREE.Group {
  const typeName = shipType.name ? shipType.name.toUpperCase() : 'NORMAL'
  if (typeName.includes('RAMMER')) {
    return createCorsairRammerMesh(1.5)
  } else if (typeName.includes('GALLEON') || shipType.size > 1.4) {
    return createNavalManOfWarMesh(1.8)
  } else {
    return createNavalSloopMesh(1.4)
  }
}

/**
 * 1. Royal Navy Sloop-of-War / Corvette (Normal Enemy)
 */
function createNavalSloopMesh(scale: number): THREE.Group {
  const mesh = new THREE.Group()

  const darkHullMat = new THREE.MeshPhongMaterial({ color: 0x0c1b33 }) // Royal Navy Blue
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xd4b58c })
  const whiteStripeMat = new THREE.MeshPhongMaterial({ color: 0xf5f5f5 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 })
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x3d2314 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, metalness: 0.7, roughness: 0.4 })

  const sailTexture = getSailTexture('sloop')
  const sailMat = new THREE.MeshPhongMaterial({ map: sailTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })

  // Swept Hull
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-2.4 * scale, -6.5 * scale)
  hullShape.lineTo(2.4 * scale, -6.5 * scale)
  hullShape.lineTo(2.8 * scale, 0)
  hullShape.lineTo(2.2 * scale, 5.5 * scale)
  hullShape.lineTo(0.0, 7.5 * scale)
  hullShape.lineTo(-2.2 * scale, 5.5 * scale)
  hullShape.lineTo(-2.8 * scale, 0)
  hullShape.closePath()

  const hullGeom = new THREE.ExtrudeGeometry(hullShape, { depth: 3.0 * scale, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 })
  const hull = new THREE.Mesh(hullGeom, darkHullMat)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.7 * scale
  mesh.add(hull)

  // White Waterline Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.2 * scale, 0.3 * scale, 13.0 * scale), whiteStripeMat)
  stripe.position.set(0, 2.0 * scale, 0)
  mesh.add(stripe)

  // Main Deck & Raised Cabin
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.8 * scale, 0.3 * scale, 12.0 * scale), deckMat)
  deck.position.set(0, 3.1 * scale, 0)
  mesh.add(deck)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4 * scale, 1.2 * scale, 4.0 * scale), darkHullMat)
  cabin.position.set(0, 3.8 * scale, -4.0 * scale)
  mesh.add(cabin)

  // Gold Lion Figurehead at Bow
  const figurehead = new THREE.Mesh(new THREE.ConeGeometry(0.4 * scale, 1.8 * scale, 6), goldMat)
  figurehead.rotation.x = Math.PI / 3
  figurehead.position.set(0, 3.2 * scale, 7.2 * scale)
  mesh.add(figurehead)

  // 6 Mounted Side Cannons
  const portCannons: any[] = []
  const starboardCannons: any[] = []
  const sideCannonGeom = new THREE.CylinderGeometry(0.18 * scale, 0.24 * scale, 1.5 * scale, 8)

  for (let side = -1; side <= 1; side += 2) {
    for (let c = -1.8; c <= 1.8; c += 1.8) {
      const cannon = new THREE.Mesh(sideCannonGeom, ironMat)
      cannon.rotation.z = side * Math.PI / 2
      cannon.position.set(side * 2.6 * scale, 2.5 * scale, c * scale)
      mesh.add(cannon)
      if (side === -1) portCannons.push({ mesh: cannon, zOffset: c * scale, sideSign: -1 })
      else starboardCannons.push({ mesh: cannon, zOffset: c * scale, sideSign: 1 })
    }
  }

  mesh.userData.portCannons = portCannons
  mesh.userData.starboardCannons = starboardCannons

  // Masts & Rigging
  const sails: THREE.Mesh[] = []

  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 15 * scale, 8), mastMat)
  mainMast.position.set(0, 9.5 * scale, -0.5 * scale)
  mesh.add(mainMast)

  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, 12 * scale, 8), mastMat)
  foreMast.position.set(0, 8.0 * scale, 3.5 * scale)
  mesh.add(foreMast)

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 7 * scale, 8), mastMat)
  bowsprit.rotation.x = Math.PI / 4
  bowsprit.position.set(0, 4.0 * scale, 8.5 * scale)
  mesh.add(bowsprit)

  // Sails
  const mainSailGeom = new THREE.PlaneGeometry(7.5 * scale, 7.0 * scale, 10, 10)
  const mainSail = new THREE.Mesh(mainSailGeom, sailMat)
  mainSail.position.set(0, 10.5 * scale, -0.45 * scale)
  mainSail.userData.isSail = true
  mainSail.userData.originalVertices = mainSailGeom.attributes.position.array.slice()
  mainSail.userData.fixedEdges = []
  for (let i = 0; i < mainSailGeom.attributes.position.count; i++) {
    const y = mainSailGeom.attributes.position.getY(i)
    mainSail.userData.fixedEdges.push(Math.abs(y - 3.5 * scale) < 0.1 || Math.abs(y + 3.5 * scale) < 0.1)
  }
  mesh.add(mainSail)
  sails.push(mainSail)

  const foreSailGeom = new THREE.PlaneGeometry(5.5 * scale, 5.0 * scale, 8, 8)
  const foreSail = new THREE.Mesh(foreSailGeom, sailMat)
  foreSail.position.set(0, 8.5 * scale, 3.55 * scale)
  foreSail.userData.isSail = true
  foreSail.userData.originalVertices = foreSailGeom.attributes.position.array.slice()
  foreSail.userData.fixedEdges = []
  for (let i = 0; i < foreSailGeom.attributes.position.count; i++) {
    const y = foreSailGeom.attributes.position.getY(i)
    foreSail.userData.fixedEdges.push(Math.abs(y - 2.5 * scale) < 0.1 || Math.abs(y + 2.5 * scale) < 0.1)
  }
  mesh.add(foreSail)
  sails.push(foreSail)

  mesh.userData.sails = sails

  // === ROYAL NAVY FLAG ATTACHED DIRECTLY TO MAIN TOPMAST POLE ===
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 3.0 * scale, 6), mastMat)
  flagPole.position.set(0, 17.5 * scale, -0.5 * scale)
  mesh.add(flagPole)

  const truckGold = new THREE.Mesh(new THREE.SphereGeometry(0.15 * scale, 8, 8), goldMat)
  truckGold.position.set(0, 19.0 * scale, -0.5 * scale)
  mesh.add(truckGold)

  const ensignTex = getRoyalNavalEnsignTexture()
  const flagMat = new THREE.MeshPhongMaterial({ map: ensignTex, side: THREE.DoubleSide })
  const flagGroup = new THREE.Group()
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * scale, 1.4 * scale, 8, 4), flagMat)
  flagMesh.position.set(1.2 * scale, 0, 0)
  flagGroup.add(flagMesh)

  flagGroup.position.set(0, 18.0 * scale, -0.5 * scale)
  flagGroup.rotation.y = Math.PI / 2
  mesh.add(flagGroup)
  mesh.userData.flagMesh = flagMesh

  return mesh
}

/**
 * 2. Heavy Royal Naval Man-o'-War (Big Enemy)
 */
function createNavalManOfWarMesh(scale: number): THREE.Group {
  const mesh = new THREE.Group()

  const blackHullMat = new THREE.MeshPhongMaterial({ color: 0x141414 })
  const yellowStripeMat = new THREE.MeshPhongMaterial({ color: 0xd4a017 })
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xbf9b73 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 })
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x331c10 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.4 })

  const sailTexture = getSailTexture('galleon')
  const sailMat = new THREE.MeshPhongMaterial({ map: sailTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })

  // Massive Swept Hull
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-3.0 * scale, -8.0 * scale)
  hullShape.lineTo(3.0 * scale, -8.0 * scale)
  hullShape.lineTo(3.6 * scale, -1.0)
  hullShape.lineTo(3.0 * scale, 6.0 * scale)
  hullShape.lineTo(0.0, 8.5 * scale)
  hullShape.lineTo(-3.0 * scale, 6.0 * scale)
  hullShape.lineTo(-3.6 * scale, -1.0)
  hullShape.closePath()

  const hullGeom = new THREE.ExtrudeGeometry(hullShape, { depth: 3.8 * scale, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.3, bevelSegments: 3 })
  const hull = new THREE.Mesh(hullGeom, blackHullMat)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.8 * scale
  mesh.add(hull)

  // Nelson Checker Stripes
  const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(6.8 * scale, 0.4 * scale, 15.5 * scale), yellowStripeMat)
  stripe1.position.set(0, 2.2 * scale, -0.2 * scale)
  mesh.add(stripe1)

  const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(6.6 * scale, 0.4 * scale, 14.5 * scale), yellowStripeMat)
  stripe2.position.set(0, 3.4 * scale, -0.2 * scale)
  mesh.add(stripe2)

  // Multi-tier Deck & High Stern Castle
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.2 * scale, 0.4 * scale, 14.5 * scale), deckMat)
  deck.position.set(0, 4.0 * scale, 0)
  mesh.add(deck)

  const sternCastle = new THREE.Mesh(new THREE.BoxGeometry(5.8 * scale, 2.4 * scale, 5.5 * scale), blackHullMat)
  sternCastle.position.set(0, 5.2 * scale, -5.2 * scale)
  mesh.add(sternCastle)

  // Triple Stern Lanterns
  for (let l = -1.8; l <= 1.8; l += 1.8) {
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.2 * scale, 0.8 * scale, 8), goldMat)
    lantern.position.set(l * scale, 6.6 * scale, -8.0 * scale)
    mesh.add(lantern)
  }

  // 12 Double Deck Mounted Cannons
  const portCannons: any[] = []
  const starboardCannons: any[] = []
  const sideCannonGeom = new THREE.CylinderGeometry(0.2 * scale, 0.28 * scale, 1.8 * scale, 8)

  for (let side = -1; side <= 1; side += 2) {
    for (let c = -2.5; c <= 2.5; c += 1.6) {
      const cannonLower = new THREE.Mesh(sideCannonGeom, ironMat)
      cannonLower.rotation.z = side * Math.PI / 2
      cannonLower.position.set(side * 3.4 * scale, 2.2 * scale, c * scale)
      mesh.add(cannonLower)

      const cannonUpper = new THREE.Mesh(sideCannonGeom, ironMat)
      cannonUpper.rotation.z = side * Math.PI / 2
      cannonUpper.position.set(side * 3.3 * scale, 3.4 * scale, c * scale)
      mesh.add(cannonUpper)

      if (side === -1) portCannons.push({ mesh: cannonUpper, zOffset: c * scale, sideSign: -1 })
      else starboardCannons.push({ mesh: cannonUpper, zOffset: c * scale, sideSign: 1 })
    }
  }

  mesh.userData.portCannons = portCannons
  mesh.userData.starboardCannons = starboardCannons

  // 3 Rigged Masts
  const sails: THREE.Mesh[] = []

  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * scale, 0.5 * scale, 19 * scale, 10), mastMat)
  mainMast.position.set(0, 12.5 * scale, -0.5 * scale)
  mesh.add(mainMast)

  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.42 * scale, 16 * scale, 10), mastMat)
  foreMast.position.set(0, 11.0 * scale, 4.5 * scale)
  mesh.add(foreMast)

  const mizzenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.36 * scale, 13 * scale, 10), mastMat)
  mizzenMast.position.set(0, 9.5 * scale, -5.2 * scale)
  mesh.add(mizzenMast)

  // Sails
  const mainSailGeom = new THREE.PlaneGeometry(9.0 * scale, 8.5 * scale, 12, 12)
  const mainSail = new THREE.Mesh(mainSailGeom, sailMat)
  mainSail.position.set(0, 13.0 * scale, -0.45 * scale)
  mainSail.userData.isSail = true
  mainSail.userData.originalVertices = mainSailGeom.attributes.position.array.slice()
  mainSail.userData.fixedEdges = []
  for (let i = 0; i < mainSailGeom.attributes.position.count; i++) {
    const y = mainSailGeom.attributes.position.getY(i)
    mainSail.userData.fixedEdges.push(Math.abs(y - 4.25 * scale) < 0.1 || Math.abs(y + 4.25 * scale) < 0.1)
  }
  mesh.add(mainSail)
  sails.push(mainSail)

  const foreSailGeom = new THREE.PlaneGeometry(7.0 * scale, 6.5 * scale, 10, 10)
  const foreSail = new THREE.Mesh(foreSailGeom, sailMat)
  foreSail.position.set(0, 11.0 * scale, 4.55 * scale)
  foreSail.userData.isSail = true
  foreSail.userData.originalVertices = foreSailGeom.attributes.position.array.slice()
  foreSail.userData.fixedEdges = []
  for (let i = 0; i < foreSailGeom.attributes.position.count; i++) {
    const y = foreSailGeom.attributes.position.getY(i)
    foreSail.userData.fixedEdges.push(Math.abs(y - 3.25 * scale) < 0.1 || Math.abs(y + 3.25 * scale) < 0.1)
  }
  mesh.add(foreSail)
  sails.push(foreSail)

  mesh.userData.sails = sails

  // === ROYAL NAVY FLAG ATTACHED DIRECTLY TO MAIN TOPMAST POLE ===
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 3.5 * scale, 6), mastMat)
  flagPole.position.set(0, 22.0 * scale, -0.5 * scale)
  mesh.add(flagPole)

  const truckGold = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 8, 8), goldMat)
  truckGold.position.set(0, 23.75 * scale, -0.5 * scale)
  mesh.add(truckGold)

  const ensignTex = getRoyalNavalEnsignTexture()
  const flagMat = new THREE.MeshPhongMaterial({ map: ensignTex, side: THREE.DoubleSide })
  const flagGroup = new THREE.Group()
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0 * scale, 1.8 * scale, 10, 5), flagMat)
  flagMesh.position.set(1.5 * scale, 0, 0)
  flagGroup.add(flagMesh)

  flagGroup.position.set(0, 22.8 * scale, -0.5 * scale)
  flagGroup.rotation.y = Math.PI / 2
  mesh.add(flagGroup)
  mesh.userData.flagMesh = flagMesh

  return mesh
}

/**
 * 3. Corsair Ironclad Rammer (Rammer Enemy)
 */
function createCorsairRammerMesh(scale: number): THREE.Group {
  const mesh = new THREE.Group()

  const darkWoodMat = new THREE.MeshPhongMaterial({ color: 0x1f1914 })
  const deckMat = new THREE.MeshPhongMaterial({ color: 0x8a735c })
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.85, roughness: 0.3 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 })
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x2b1c12 })

  const sailTexture = getSailTexture('rammer')
  const sailMat = new THREE.MeshPhongMaterial({ map: sailTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })

  // Low-slung Heavy Hull
  const hullShape = new THREE.Shape()
  hullShape.moveTo(-2.5 * scale, -6.5 * scale)
  hullShape.lineTo(2.5 * scale, -6.5 * scale)
  hullShape.lineTo(2.8 * scale, 0)
  hullShape.lineTo(2.2 * scale, 5.5 * scale)
  hullShape.lineTo(0.0, 7.8 * scale)
  hullShape.lineTo(-2.2 * scale, 5.5 * scale)
  hullShape.lineTo(-2.8 * scale, 0)
  hullShape.closePath()

  const hullGeom = new THREE.ExtrudeGeometry(hullShape, { depth: 3.0 * scale, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 })
  const hull = new THREE.Mesh(hullGeom, darkWoodMat)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.6 * scale
  mesh.add(hull)

  // Iron Armor Straps Along Waterline
  for (let side = -1; side <= 1; side += 2) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.25 * scale, 1.2 * scale, 9.0 * scale), armorMat)
    plate.position.set(side * 2.5 * scale, 2.2 * scale, 0)
    mesh.add(plate)
  }

  // === REDONE MULTI-PART FORGED NAVAL RAMMING ROSTRUM (SEAMLESSLY INTEGRATED INTO HULL) ===
  const ramGroup = new THREE.Group()

  // 1. Heavy Timber Prow Extension Beam (Starts deep inside hull at Z = 4.0*scale out to Z = 11.2*scale)
  const prowBeam = new THREE.Mesh(new THREE.BoxGeometry(1.1 * scale, 1.1 * scale, 7.2 * scale), darkWoodMat)
  prowBeam.position.set(0, 0, 3.6 * scale)
  ramGroup.add(prowBeam)

  // 2. Heavy Iron Bow Reinforcement Collar (wraps around hull exit point at Z = 7.8*scale)
  const bowCollar = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 1.5 * scale, 0.8 * scale), armorMat)
  bowCollar.position.set(0, 0, 3.8 * scale)
  ramGroup.add(bowCollar)

  // 3. Iron Reinforcement Side Brackets & Bolt Rivets (Running along full prow length)
  for (let side = -1; side <= 1; side += 2) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 1.4 * scale, 6.8 * scale), armorMat)
    bracket.position.set(side * 0.6 * scale, 0, 3.4 * scale)
    ramGroup.add(bracket)

    for (let r = 0.5; r <= 6.0; r += 1.0) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 6, 6), ironMat)
      rivet.position.set(side * 0.72 * scale, 0.45 * scale, r * scale)
      ramGroup.add(rivet)
    }
  }

  // 4. Central Forged Iron Ram Blade (Faceted Triangular Wedge)
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(0, 1.0 * scale)
  bladeShape.lineTo(0.6 * scale, -0.7 * scale)
  bladeShape.lineTo(-0.6 * scale, -0.7 * scale)
  bladeShape.closePath()

  const bladeGeom = new THREE.ExtrudeGeometry(bladeShape, { depth: 3.5 * scale, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 2 })
  const ramBlade = new THREE.Mesh(bladeGeom, ironMat)
  ramBlade.position.set(0, 0, 6.8 * scale)
  ramGroup.add(ramBlade)

  // 5. Upper & Lower Sharp Barb Hook Spurs
  const spurGeom = new THREE.ConeGeometry(0.4 * scale, 2.4 * scale, 6)
  const spurTop = new THREE.Mesh(spurGeom, ironMat)
  spurTop.rotation.x = Math.PI / 2 + 0.35
  spurTop.position.set(0, 0.7 * scale, 7.8 * scale)
  ramGroup.add(spurTop)

  const spurBot = new THREE.Mesh(spurGeom, ironMat)
  spurBot.rotation.x = Math.PI / 2 - 0.35
  spurBot.position.set(0, -0.7 * scale, 7.8 * scale)
  ramGroup.add(spurBot)

  // 6. Bronze Boss Head Collar
  const ramBoss = new THREE.Mesh(new THREE.SphereGeometry(0.7 * scale, 8, 8), goldMat)
  ramBoss.position.set(0, 0, 6.6 * scale)
  ramGroup.add(ramBoss)

  // Anchor ramGroup deep inside the hull structure at Z = 4.0 * scale
  ramGroup.position.set(0, 1.6 * scale, 4.0 * scale)
  mesh.add(ramGroup)

  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.0 * scale, 0.3 * scale, 12.0 * scale), deckMat)
  deck.position.set(0, 3.1 * scale, 0)
  mesh.add(deck)

  // Mounted Cannons
  const portCannons: any[] = []
  const starboardCannons: any[] = []
  const sideCannonGeom = new THREE.CylinderGeometry(0.2 * scale, 0.28 * scale, 1.6 * scale, 8)

  for (let side = -1; side <= 1; side += 2) {
    const cannon = new THREE.Mesh(sideCannonGeom, ironMat)
    cannon.rotation.z = side * Math.PI / 2
    cannon.position.set(side * 2.6 * scale, 2.5 * scale, 0)
    mesh.add(cannon)
    if (side === -1) portCannons.push({ mesh: cannon, zOffset: 0, sideSign: -1 })
    else starboardCannons.push({ mesh: cannon, zOffset: 0, sideSign: 1 })
  }

  mesh.userData.portCannons = portCannons
  mesh.userData.starboardCannons = starboardCannons

  // Rigging & Masts
  const sails: THREE.Mesh[] = []

  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 14 * scale, 8), mastMat)
  mainMast.position.set(0, 9.0 * scale, 0)
  mesh.add(mainMast)

  const mainSailGeom = new THREE.PlaneGeometry(7.5 * scale, 6.5 * scale, 10, 10)
  const mainSail = new THREE.Mesh(mainSailGeom, sailMat)
  mainSail.position.set(0, 10.0 * scale, 0.05)
  mainSail.userData.isSail = true
  mainSail.userData.originalVertices = mainSailGeom.attributes.position.array.slice()
  mainSail.userData.fixedEdges = []
  for (let i = 0; i < mainSailGeom.attributes.position.count; i++) {
    const y = mainSailGeom.attributes.position.getY(i)
    mainSail.userData.fixedEdges.push(Math.abs(y - 3.25 * scale) < 0.1 || Math.abs(y + 3.25 * scale) < 0.1)
  }
  mesh.add(mainSail)
  sails.push(mainSail)

  mesh.userData.sails = sails

  // === CORSAIR FLAG ATTACHED DIRECTLY TO MAIN TOPMAST POLE ===
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 3.0 * scale, 6), mastMat)
  flagPole.position.set(0, 16.5 * scale, 0)
  mesh.add(flagPole)

  const truckIron = new THREE.Mesh(new THREE.SphereGeometry(0.15 * scale, 8, 8), armorMat)
  truckIron.position.set(0, 18.0 * scale, 0)
  mesh.add(truckIron)

  const flagMat = new THREE.MeshBasicMaterial({ color: 0xb30000, side: THREE.DoubleSide })
  const flagGroup = new THREE.Group()
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5 * scale, 1.4 * scale, 8, 4), flagMat)
  flagMesh.position.set(1.25 * scale, 0, 0)
  flagGroup.add(flagMesh)

  flagGroup.position.set(0, 17.0 * scale, 0)
  flagGroup.rotation.y = Math.PI / 2
  mesh.add(flagGroup)
  mesh.userData.flagMesh = flagMesh

  return mesh
}
