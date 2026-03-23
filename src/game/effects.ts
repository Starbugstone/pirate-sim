// @ts-nocheck
import * as THREE from 'three'
import { disposeMesh } from './helpers'
import { MAX_WAKE_PARTICLES } from './constants'

export function createFire(scene: THREE.Scene, x: number, z: number) {
  const fireGroup = new THREE.Group()
  const flames = []

  for (let i = 0; i < 5; i++) {
    const flameGeom = new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 6, 6)
    const flameMat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0xff6600 : 0xff3300,
      transparent: true, opacity: 0.8
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

  for (let i = 0; i < 3; i++) {
    const smokeGeom = new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 5, 5)
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x444444, transparent: true, opacity: 0.4
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

export function spawnWakeParticle(scene: THREE.Scene, wakeArray, x, z, angle, _isEnemy) {
  if (wakeArray.length >= MAX_WAKE_PARTICLES) {
    const old = wakeArray.shift()
    if (old && old.mesh) disposeMesh(old.mesh, scene)
  }

  const wakeGeom = new THREE.SphereGeometry(0.15, 4, 4)
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
  const wakeMesh = new THREE.Mesh(wakeGeom, wakeMat)

  const spread = (Math.random() - 0.5) * 2
  const behind = -3 - Math.random() * 2
  wakeMesh.position.set(
    x + Math.sin(angle + Math.PI) * behind + Math.sin(angle + Math.PI / 2) * spread,
    0.3,
    z + Math.cos(angle + Math.PI) * behind + Math.cos(angle + Math.PI / 2) * spread
  )
  wakeMesh.scale.setScalar(0.5 + Math.random() * 1.5)

  scene.add(wakeMesh)
  wakeArray.push({
    mesh: wakeMesh,
    life: 2 + Math.random() * 1.5,
    vx: (Math.random() - 0.5) * 0.5,
    vz: (Math.random() - 0.5) * 0.5
  })
}

export function updateWakeParticles(scene: THREE.Scene, wakeArray, dt) {
  for (let i = wakeArray.length - 1; i >= 0; i--) {
    const w = wakeArray[i]
    w.life -= dt
    if (w.life <= 0) {
      disposeMesh(w.mesh, scene)
      wakeArray.splice(i, 1)
      continue
    }
    w.mesh.position.x += w.vx * dt
    w.mesh.position.z += w.vz * dt
    w.mesh.scale.multiplyScalar(1 + dt * 0.3)
    w.mesh.material.opacity = Math.min(0.4, w.life * 0.25)
  }
}
