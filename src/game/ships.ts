// @ts-nocheck
import * as THREE from 'three'
import { SHIP_TYPES } from './constants'

export function createPlayerShip(): THREE.Group {
  const ship = new THREE.Group()

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
  const hullMaterial = new THREE.MeshPhongMaterial({ color: 0x5C3317 })
  const hull = new THREE.Mesh(hullGeometry, hullMaterial)
  hull.rotation.x = -Math.PI / 2
  hull.position.y = 0.5
  ship.add(hull)

  const stripeGeometry = new THREE.BoxGeometry(3.2, 0.15, 8.5)
  const stripeMaterial = new THREE.MeshPhongMaterial({ color: 0x8B0000 })
  const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial)
  stripe.position.y = 1.3
  ship.add(stripe)

  const deckGeometry = new THREE.BoxGeometry(2.8, 0.25, 7.5)
  const deckMaterial = new THREE.MeshPhongMaterial({ color: 0xDEB887 })
  const deck = new THREE.Mesh(deckGeometry, deckMaterial)
  deck.position.y = 2.1
  ship.add(deck)

  const railMaterial = new THREE.MeshPhongMaterial({ color: 0x3D2817 })
  for (let i = 0; i < 8; i++) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), railMaterial)
    railPost.position.set(-1.3, 2.7, -3 + i * 0.85)
    ship.add(railPost)
  }
  for (let i = 0; i < 8; i++) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), railMaterial)
    railPost.position.set(1.3, 2.7, -3 + i * 0.85)
    ship.add(railPost)
  }
  const railBarGeom = new THREE.CylinderGeometry(0.03, 0.03, 7, 8)
  const railBarL = new THREE.Mesh(railBarGeom, railMaterial)
  railBarL.rotation.x = Math.PI / 2
  railBarL.position.set(-1.3, 3.2, 0)
  ship.add(railBarL)
  const railBarR = new THREE.Mesh(railBarGeom, railMaterial)
  railBarR.rotation.x = Math.PI / 2
  railBarR.position.set(1.3, 3.2, 0)
  ship.add(railBarR)

  const mastMaterial = new THREE.MeshPhongMaterial({ color: 0x4A3728 })
  const mainMastGeom = new THREE.CylinderGeometry(0.25, 0.3, 12, 8)
  const mainMast = new THREE.Mesh(mainMastGeom, mastMaterial)
  mainMast.position.y = 7.5
  ship.add(mainMast)

  const crosstreeGeom = new THREE.BoxGeometry(7, 0.15, 0.15)
  const crosstree = new THREE.Mesh(crosstreeGeom, mastMaterial)
  crosstree.position.set(0, 12.5, 0)
  ship.add(crosstree)

  const nestGeom = new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8, 1, true)
  const nest = new THREE.Mesh(nestGeom, railMaterial)
  nest.position.set(0, 13, 0)
  ship.add(nest)
  const nestFloorGeom = new THREE.CircleGeometry(0.55, 8)
  const nestFloor = new THREE.Mesh(nestFloorGeom, deckMaterial)
  nestFloor.rotation.x = -Math.PI / 2
  nestFloor.position.y = -0.2
  nest.add(nestFloor)

  const foreMastGeom = new THREE.CylinderGeometry(0.18, 0.22, 7, 8)
  const foreMast = new THREE.Mesh(foreMastGeom, mastMaterial)
  foreMast.position.set(0, 5, -2.5)
  ship.add(foreMast)

  const mizzenMastGeom = new THREE.CylinderGeometry(0.12, 0.15, 5, 8)
  const mizzenMast = new THREE.Mesh(mizzenMastGeom, mastMaterial)
  mizzenMast.position.set(0, 4.5, 2.5)
  ship.add(mizzenMast)

  const figureheadMat = new THREE.MeshPhongMaterial({ color: 0xD2691E })
  const dragonHead = new THREE.Group()
  const headGeom = new THREE.ConeGeometry(0.4, 1.2, 6)
  const head = new THREE.Mesh(headGeom, figureheadMat)
  head.rotation.x = Math.PI / 2
  head.position.z = 0.4
  dragonHead.add(head)
  const snoutGeom = new THREE.ConeGeometry(0.2, 0.5, 6)
  const snout = new THREE.Mesh(snoutGeom, figureheadMat)
  snout.rotation.x = -Math.PI / 2
  snout.position.set(0, 0, 1)
  dragonHead.add(snout)
  dragonHead.position.set(0, 1.8, 4.5)
  ship.add(dragonHead)

  const sternMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 })
  const sternPanel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.1), sternMat)
  sternPanel.position.set(0, 2.8, -4)
  ship.add(sternPanel)

  const yardMat = new THREE.MeshPhongMaterial({ color: 0x654321 })

  // Main sail group
  const mainSailGroup = new THREE.Group()
  const topYardGeom = new THREE.CylinderGeometry(0.08, 0.08, 6, 8)
  const topYard = new THREE.Mesh(topYardGeom, yardMat)
  topYard.rotation.z = Math.PI / 2
  topYard.position.y = 3.5
  mainSailGroup.add(topYard)
  const botYard = new THREE.Mesh(topYardGeom, yardMat)
  botYard.rotation.z = Math.PI / 2
  botYard.position.y = -3.5
  mainSailGroup.add(botYard)

  const sailGeom = new THREE.PlaneGeometry(5.5, 7, 12, 14)
  const sailMat = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  const sail = new THREE.Mesh(sailGeom, sailMat)
  sail.position.set(0, 0, 0.05)
  sail.userData.isSail = true
  sail.userData.originalVertices = sailGeom.attributes.position.array.slice()
  sail.userData.fixedEdges = []
  for (let i = 0; i < sailGeom.attributes.position.count; i++) {
    const y = sailGeom.attributes.position.getY(i)
    sail.userData.fixedEdges.push(Math.abs(y - 3.5) < 0.1 || Math.abs(y + 3.5) < 0.1)
  }
  mainSailGroup.add(sail)
  mainSailGroup.position.set(0, 8, -1.5)
  ship.add(mainSailGroup)

  // Fore sail group
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
  ship.add(foreSailGroup)

  // Mizzen sail group
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
  ship.add(mizzenGroup)

  ship.userData.sails = [sail, foreSail, mizzen]

  // Pirate flag
  const flagGeometry = new THREE.PlaneGeometry(1.5, 1)
  const flagMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const flag = new THREE.Mesh(flagGeometry, flagMaterial)
  flag.position.set(0, 12, 0)
  flag.rotation.y = Math.PI / 2
  ship.add(flag)

  // Cannon ports and barrels
  for (let i = -1; i <= 1; i++) {
    const portGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.3)
    const portMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const portL = new THREE.Mesh(portGeometry, portMaterial)
    portL.position.set(-1.5, 1.5, i * 2)
    portL.rotation.z = Math.PI / 2
    ship.add(portL)
    const portR = new THREE.Mesh(portGeometry, portMaterial)
    portR.position.set(1.5, 1.5, i * 2)
    portR.rotation.z = Math.PI / 2
    ship.add(portR)
  }

  const sideCannonGeom = new THREE.CylinderGeometry(0.15, 0.2, 1.2)
  const sideCannonMat = new THREE.MeshPhongMaterial({ color: 0x333333 })
  for (let i = -1; i <= 1; i++) {
    const cannon = new THREE.Mesh(sideCannonGeom, sideCannonMat)
    cannon.position.set(-1.6, 1.8, i * 2)
    cannon.rotation.z = Math.PI / 2
    cannon.rotation.y = i * (10 * Math.PI / 180)
    ship.add(cannon)
  }
  for (let i = -1; i <= 1; i++) {
    const cannon = new THREE.Mesh(sideCannonGeom, sideCannonMat)
    cannon.position.set(1.6, 1.8, i * 2)
    cannon.rotation.z = Math.PI / 2
    cannon.rotation.y = i * (10 * Math.PI / 180)
    ship.add(cannon)
  }

  ship.position.set(0, 0, 0)
  return ship
}

export function createEnemyShipMesh(shipType): THREE.Group {
  const mesh = new THREE.Group()
  const size = shipType.size
  const woodMat = new THREE.MeshPhongMaterial({ color: 0x654321 })
  const sailMat = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })

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

  const stripeGeom = new THREE.BoxGeometry(3.2 * size, 0.15 * size, 8.5 * size)
  const stripeMat = new THREE.MeshPhongMaterial({ color: 0x8B0000 })
  const stripe = new THREE.Mesh(stripeGeom, stripeMat)
  stripe.position.y = 1.3 * size
  mesh.add(stripe)

  const deckGeom = new THREE.BoxGeometry(2.8 * size, 0.25 * size, 7.5 * size)
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xDEB887 })
  const deck = new THREE.Mesh(deckGeom, deckMat)
  deck.position.y = 2.1 * size
  mesh.add(deck)

  const railMat = new THREE.MeshPhongMaterial({ color: 0x3D2817 })
  for (let i = 0; i < 6; i++) {
    const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 1 * size), railMat)
    railPost.position.set(-1.3 * size, 2.7 * size, -3 + i * 1.2 * size)
    mesh.add(railPost)
    const railPost2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 1 * size), railMat)
    railPost2.position.set(1.3 * size, 2.7 * size, -3 + i * 1.2 * size)
    mesh.add(railPost2)
  }

  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * size, 0.3 * size, 12 * size, 8), woodMat)
  mainMast.position.set(0, 7.5 * size, 0)
  mesh.add(mainMast)

  const yard1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * size, 0.06 * size, 7 * size, 8), woodMat)
  yard1.rotation.z = Math.PI / 2
  yard1.position.set(0, 12 * size, 0)
  mesh.add(yard1)

  const mainSail = new THREE.Mesh(new THREE.PlaneGeometry(6 * size, 6 * size), sailMat)
  mainSail.position.set(0, 10 * size, 0)
  mainSail.rotation.y = Math.PI / 2
  mesh.add(mainSail)

  const yard2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 5 * size, 8), woodMat)
  yard2.rotation.z = Math.PI / 2
  yard2.position.set(0, 7 * size, 0)
  mesh.add(yard2)

  const lowerSail = new THREE.Mesh(new THREE.PlaneGeometry(4 * size, 4 * size), sailMat)
  lowerSail.position.set(0, 5.5 * size, 0)
  lowerSail.rotation.y = Math.PI / 2
  mesh.add(lowerSail)

  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * size, 0.22 * size, 8 * size, 8), woodMat)
  foreMast.position.set(0, 5 * size, -3 * size)
  mesh.add(foreMast)

  const foreYard = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 4 * size, 8), woodMat)
  foreYard.rotation.z = Math.PI / 2
  foreYard.position.set(0, 7.5 * size, -3 * size)
  mesh.add(foreYard)

  const foreSail = new THREE.Mesh(new THREE.PlaneGeometry(3.5 * size, 3.5 * size), sailMat)
  foreSail.position.set(0, 6 * size, -3 * size)
  foreSail.rotation.y = Math.PI / 2
  mesh.add(foreSail)

  const flagMat = new THREE.MeshBasicMaterial({
    color: shipType === SHIP_TYPES.RAMMER ? 0xff0000 : (shipType === SHIP_TYPES.BIG ? 0xffff00 : 0x0000ff)
  })
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5 * size, 1 * size), flagMat)
  flag.position.set(0, 13 * size, 0)
  flag.rotation.y = Math.PI / 2
  mesh.add(flag)

  if (shipType === SHIP_TYPES.RAMMER) {
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.35 * size, 4 * size, 6),
      new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 })
    )
    spike.rotation.x = -Math.PI / 2
    spike.position.set(0, 1 * size, 5 * size)
    mesh.add(spike)
  }

  mesh.userData.sails = []
  return mesh
}
