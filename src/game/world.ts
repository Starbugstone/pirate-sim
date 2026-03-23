// @ts-nocheck
import * as THREE from 'three'

export function createSky(scene: THREE.Scene) {
  const sunGeometry = new THREE.CircleGeometry(10, 32)
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 })
  const sun = new THREE.Mesh(sunGeometry, sunMaterial)
  sun.position.set(100, 80, -100)
  sun.lookAt(0, 0, 0)
  scene.add(sun)
}

export function spawnIsland(scene: THREE.Scene, x: number, z: number) {
  const islandGroup = new THREE.Group()
  const islandSize = 20 + Math.random() * 25
  const islandHeight = 6 + islandSize * 0.3

  const sandGeom = new THREE.ConeGeometry(islandSize, islandHeight, 8)
  const sandMat = new THREE.MeshPhongMaterial({ color: 0xF4A460 })
  const sand = new THREE.Mesh(sandGeom, sandMat)
  sand.position.y = islandHeight / 2
  islandGroup.add(sand)

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

  if (Math.random() < 0.3) {
    const dockLength = 12 + islandSize * 0.4
    const dockGeom = new THREE.BoxGeometry(dockLength, 0.3, 4)
    const dockMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    const dock = new THREE.Mesh(dockGeom, dockMat)
    dock.position.set(islandSize + dockLength / 2, 0.2, 0)
    islandGroup.add(dock)

    for (let p = 0; p < 3; p++) {
      const postGeom = new THREE.CylinderGeometry(0.2, 0.2, 1.5)
      const post = new THREE.Mesh(postGeom, dockMat)
      post.position.set(islandSize + 3 + p * 4, 0.9, 0)
      islandGroup.add(post)
    }

    const dockEndX = islandSize + dockLength
    const dockEndRingGeom = new THREE.RingGeometry(6, 8, 32)
    const dockEndRingMat = new THREE.MeshBasicMaterial({
      color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide
    })
    const dockEndRing = new THREE.Mesh(dockEndRingGeom, dockEndRingMat)
    dockEndRing.rotation.x = -Math.PI / 2
    dockEndRing.position.set(dockEndX, 0.2, 0)
    islandGroup.add(dockEndRing)

    islandGroup.userData.dockEndX = dockEndX
    islandGroup.userData.hasHarbor = true
  }

  islandGroup.position.set(x, 0, z)
  scene.add(islandGroup)
  return { x, z, radius: islandSize, mesh: islandGroup }
}

export function spawnRock(scene: THREE.Scene, x: number, z: number) {
  const rockGeom = new THREE.DodecahedronGeometry(2 + Math.random() * 3)
  const rockMat = new THREE.MeshPhongMaterial({ color: 0x696969 })
  const rock = new THREE.Mesh(rockGeom, rockMat)
  rock.position.set(x, 0.5, z)
  rock.rotation.set(Math.random(), Math.random(), Math.random())
  scene.add(rock)
  return { x, z, radius: 3, mesh: rock }
}

export function spawnSunkenShip(scene: THREE.Scene, x: number, z: number) {
  const shipwreckGroup = new THREE.Group()

  const hullGeom = new THREE.BoxGeometry(3, 1.5, 8)
  const hullMat = new THREE.MeshPhongMaterial({ color: 0x4a3728 })
  const hull = new THREE.Mesh(hullGeom, hullMat)
  hull.position.y = -0.3
  hull.rotation.x = 0.3
  hull.rotation.z = (Math.random() - 0.5) * 0.2
  shipwreckGroup.add(hull)

  const mastGeom = new THREE.CylinderGeometry(0.15, 0.2, 6)
  const mastMat = new THREE.MeshPhongMaterial({ color: 0x3d2817 })
  const mast = new THREE.Mesh(mastGeom, mastMat)
  mast.position.set(0, 2, 1)
  mast.rotation.x = -0.4
  shipwreckGroup.add(mast)

  shipwreckGroup.position.set(x, 0, z)
  scene.add(shipwreckGroup)

  return { x, z, radius: 5, mesh: shipwreckGroup }
}

export function createKraken(scene: THREE.Scene, krakenRef) {
  const krakenMesh = new THREE.Group()

  const bodyGeometry = new THREE.SphereGeometry(12, 20, 20)
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x1a3030 })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.scale.y = 0.6
  body.position.y = 3
  krakenMesh.add(body)

  const eyeGeometry = new THREE.SphereGeometry(2, 12, 12)
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333 })
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
    const tentMat = new THREE.MeshPhongMaterial({ color: 0x1a3030 })
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
    color: 0x4488ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide
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
