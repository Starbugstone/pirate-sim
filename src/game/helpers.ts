// @ts-nocheck
import * as THREE from 'three'

export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from)
}

export function disposeMesh(mesh, scene: THREE.Scene) {
  if (!mesh) return
  if (mesh.geometry) mesh.geometry.dispose()
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

export function disposeGroup(group, scene: THREE.Scene) {
  if (!group) return
  group.traverse(child => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
        } else {
          if (child.material.map) child.material.map.dispose()
          child.material.dispose()
        }
      }
    }
  })
  scene.remove(group)
}
