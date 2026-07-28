// @ts-nocheck
import * as THREE from 'three'

// ── 1. Fast 2D Simplex / Value Noise implementation ──
function grad2(hash: number, x: number, y: number): number {
  const h = hash & 7
  const u = h < 4 ? x : y
  const v = h < 4 ? y : x
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

const PERM = new Uint8Array(512)
const P = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
]
for (let i = 0; i < 512; i++) PERM[i] = P[i & 255]

export function noise2D(xin: number, yin: number): number {
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0)
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0
  let n0 = 0, n1 = 0, n2 = 0
  const s = (xin + yin) * F2
  const i = Math.floor(xin + s)
  const j = Math.floor(yin + s)
  const t = (i + j) * G2
  const X0 = i - t
  const Y0 = j - t
  const x0 = xin - X0
  const y0 = yin - Y0
  let i1 = 0, j1 = 1
  if (x0 > y0) { i1 = 1; j1 = 0 }
  const x1 = x0 - i1 + G2
  const y1 = y0 - j1 + G2
  const x2 = x0 - 1.0 + 2.0 * G2
  const y2 = y0 - 1.0 + 2.0 * G2
  const ii = i & 255
  const jj = j & 255
  let t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 >= 0) {
    t0 *= t0
    n0 = t0 * t0 * grad2(PERM[ii + PERM[jj]], x0, y0)
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 >= 0) {
    t1 *= t1
    n1 = t1 * t1 * grad2(PERM[ii + i1 + PERM[jj + j1]], x1, y1)
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 >= 0) {
    t2 *= t2
    n2 = t2 * t2 * grad2(PERM[ii + 1 + PERM[jj + 1]], x2, y2)
  }
  return 70.0 * (n0 + n1 + n2)
}

export function fbm(x: number, y: number, octaves = 4, persistence = 0.5, lacunarity = 2.0): number {
  let total = 0
  let frequency = 1.0
  let amplitude = 1.0
  let maxValue = 0
  for (let i = 0; i < octaves; i++) {
    total += noise2D(x * frequency, y * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }
  return total / maxValue
}

// ── 2. Canvas Detail Normal Map Generator ──
let terrainNormalMap: THREE.CanvasTexture | null = null

export function getTerrainNormalMap(): THREE.CanvasTexture {
  if (terrainNormalMap) return terrainNormalMap

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(256, 256)
  const data = imgData.data

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n1 = fbm(x * 0.05, y * 0.05, 3)
      const nx = fbm((x + 1) * 0.05, y * 0.05, 3) - n1
      const ny = fbm(x * 0.05, (y + 1) * 0.05, 3) - n1

      const dx = nx * 8.0
      const dy = ny * 8.0
      const dz = 1.0
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

      const idx = (y * 256 + x) * 4
      data[idx] = Math.floor(((dx / len) * 0.5 + 0.5) * 255)
      data[idx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255)
      data[idx + 2] = Math.floor((dz / len) * 255)
      data[idx + 3] = 255
    }
  }
  ctx.putImageData(imgData, 0, 0)
  terrainNormalMap = new THREE.CanvasTexture(canvas)
  terrainNormalMap.wrapS = THREE.RepeatWrapping
  terrainNormalMap.wrapT = THREE.RepeatWrapping
  terrainNormalMap.repeat.set(8, 8)
  return terrainNormalMap
}

// ── 3. Island Archetypes Definitions ──
export enum IslandArchetype {
  Atoll = 0,
  VolcanicPeak = 1,
  PirateBay = 2,
  TreasureCay = 3
}

// ── 4. Main Heightmap Terrain Generator ──
export function generateIslandMesh(
  radius: number,
  archetype: IslandArchetype,
  seed: number
): {
  group: THREE.Group
  heightmapFn: (x: number, z: number) => number
  maxHeight: number
  beachPoints: Array<{ x: number; y: number; z: number; normal: THREE.Vector3 }>
  dockSpot: { x: number; z: number; angle: number } | null
} {
  const group = new THREE.Group()

  // High detail radial disc grid
  const segments = Math.min(80, Math.floor(radius * 1.6))
  const geometry = new THREE.PlaneGeometry(radius * 2.2, radius * 2.2, segments, segments)
  geometry.rotateX(-Math.PI / 2) // Lay flat on XZ plane

  const posAttr = geometry.attributes.position
  const vertexCount = posAttr.count

  const colors: number[] = []
  const tempNormal = new THREE.Vector3()

  // Base colors in HSL / RGB
  const sandColor = new THREE.Color(0xf5e6be)     // Soft golden white Caribbean sand
  const wetSandColor = new THREE.Color(0xd2b48c)  // Wet shoreline sand
  const grassLight = new THREE.Color(0x56ab2f)    // Bright tropical palm green
  const grassDark = new THREE.Color(0x285913)     // Deep jungle green
  const cliffColor = new THREE.Color(0x5a524c)    // Volcanic gray rock
  const peakColor = new THREE.Color(0x3a332e)     // Dark granite cliff

  let maxHeight = 0
  const beachPoints: Array<{ x: number; y: number; z: number; normal: THREE.Vector3 }> = []
  let dockSpot: { x: number; z: number; angle: number } | null = null

  // Height function based on archetype
  const heightmapFn = (localX: number, localZ: number): number => {
    const dist = Math.sqrt(localX * localX + localZ * localZ)
    const normDist = dist / radius
    if (normDist >= 1.05) return -12.0

    const angle = Math.atan2(localZ, localX)
    const nx = localX * 0.02 + seed
    const nz = localZ * 0.02 + seed

    let baseHeight = 0
    const islandNoise = fbm(nx, nz, 4, 0.5, 2.1)
    const edgeFalloff = Math.pow(Math.max(0, 1.0 - normDist), 0.85)

    switch (archetype) {
      case IslandArchetype.Atoll: {
        // Ring shape with central lagoon
        const ringDist = Math.abs(normDist - 0.55)
        const ringShape = Math.exp(-ringDist * ringDist * 12.0)
        baseHeight = (ringShape * 18.0 + islandNoise * 6.0) * edgeFalloff
        if (normDist < 0.35) {
          baseHeight = -1.5 + islandNoise * 1.0 // Shallow inner lagoon
        }
        break
      }

      case IslandArchetype.VolcanicPeak: {
        // Towering volcanic mountain with steep rugged crater ridges
        const peakCone = Math.pow(Math.max(0, 1.0 - normDist), 1.2)
        const ridgeNoise = Math.abs(fbm(nx * 2, nz * 2, 4))
        const craterCut = (normDist < 0.15) ? (1.0 - Math.exp(-Math.pow(normDist / 0.15, 2) * 3)) : 1.0
        baseHeight = (peakCone * 110.0 + ridgeNoise * 25.0 + islandNoise * 10.0) * craterCut * edgeFalloff
        break
      }

      case IslandArchetype.PirateBay: {
        // Horseshoe / Crescent island with deep sheltered bay and coastal cliffs
        const bayAngle = Math.PI * 0.2
        const angleDiff = Math.abs(Math.atan2(Math.sin(angle - bayAngle), Math.cos(angle - bayAngle)))
        let bayFactor = 1.0
        if (angleDiff < 0.95 && normDist < 0.75) {
          bayFactor = Math.pow(angleDiff / 0.95, 2.0) * 0.3 // Cut bay out
        }
        const hillCone = Math.pow(Math.max(0, 1.0 - normDist), 1.1)
        baseHeight = (hillCone * 45.0 + islandNoise * 18.0) * bayFactor * edgeFalloff
        break
      }

      case IslandArchetype.TreasureCay:
      default: {
        // Rolling tropical island with lush elevated ridges
        const rollingHills = Math.pow(Math.max(0, 1.0 - normDist), 1.1)
        baseHeight = (rollingHills * 32.0 + islandNoise * 14.0) * edgeFalloff
        break
      }
    }

    // Blend underwater skirt smoothly to y = -14
    if (normDist > 0.88) {
      const t = (normDist - 0.88) / 0.17
      baseHeight = THREE.MathUtils.lerp(baseHeight, -14.0, t)
    }

    return baseHeight
  }

  // Pass 1: Apply vertex displacement
  for (let i = 0; i < vertexCount; i++) {
    const vx = posAttr.getX(i)
    const vz = posAttr.getZ(i)
    const vy = heightmapFn(vx, vz)

    posAttr.setY(i, vy)
    if (vy > maxHeight) maxHeight = vy

    // Collect potential beach/dock points near water line (y = 0.5 .. 2.2)
    const dist = Math.sqrt(vx * vx + vz * vz)
    if (vy >= 0.5 && vy <= 2.2 && dist < radius * 0.85) {
      beachPoints.push({ x: vx, y: vy, z: vz, normal: tempNormal.clone() })
    }
  }

  geometry.computeVertexNormals()
  const normAttr = geometry.attributes.normal

  // Pass 2: Calculate biome vertex colors based on height, slope, and noise
  for (let i = 0; i < vertexCount; i++) {
    const vx = posAttr.getX(i)
    const vy = posAttr.getY(i)
    const vz = posAttr.getZ(i)

    const ny = normAttr.getY(i) // 1.0 = flat ground, 0.0 = vertical wall
    const slope = 1.0 - ny       // 0.0 = flat, 1.0 = steep cliff

    const microNoise = fbm(vx * 0.1 + seed, vz * 0.1 + seed, 2) * 0.2
    const vColor = new THREE.Color()

    if (vy <= 0.3) {
      // Underwater / Shoreline sand
      vColor.copy(wetSandColor).lerp(sandColor, Math.max(0, (vy + 2.0) / 2.3))
    } else if (vy <= 2.5 + microNoise * 3.0 && slope < 0.45) {
      // Warm Beach Sand zone
      vColor.copy(sandColor)
      vColor.r += microNoise * 0.05
      vColor.g += microNoise * 0.05
    } else if (slope > 0.55 || (vy > 18.0 && slope > 0.38)) {
      // Steep Cliff / Volcanic Rock zone
      vColor.copy(cliffColor).lerp(peakColor, Math.min(1, (vy - 10.0) / 25.0))
      vColor.r += microNoise * 0.08
    } else {
      // Lush Tropical Jungle zone
      const heightFactor = Math.min(1.0, (vy - 2.0) / 12.0)
      vColor.copy(grassLight).lerp(grassDark, heightFactor + microNoise)
    }

    colors.push(vColor.r, vColor.g, vColor.b)
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  // Material with vertex colors & normal map for rich lighting detail
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    normalMap: getTerrainNormalMap(),
    normalScale: new THREE.Vector2(0.6, 0.6),
    flatShading: false,
    polygonOffset: true,
    polygonOffsetFactor: -2.0,
    polygonOffsetUnits: -2.0
  })

  const terrainMesh = new THREE.Mesh(geometry, terrainMaterial)
  terrainMesh.renderOrder = 2
  terrainMesh.receiveShadow = true
  terrainMesh.castShadow = true
  group.add(terrainMesh)

  // ── 5. Shallow Turquoise Reef Apron & Shoreline Foam ──
  const reefGroup = createReefApron(radius, archetype)
  group.add(reefGroup)

  // Determine best dock spot if applicable (PirateBay or TreasureCay)
  if (beachPoints.length > 0 && (archetype === IslandArchetype.PirateBay || archetype === IslandArchetype.TreasureCay)) {
    const bestBeach = beachPoints[Math.floor(beachPoints.length * 0.5)]
    const angle = Math.atan2(bestBeach.z, bestBeach.x)
    dockSpot = { x: bestBeach.x, z: bestBeach.z, angle }
  }

  return {
    group,
    heightmapFn,
    maxHeight,
    beachPoints,
    dockSpot
  }
}

// ── 6. Shallow Turquoise Reef & Shoreline Foam Mesh ──
function createReefApron(islandRadius: number, archetype: IslandArchetype): THREE.Group {
  const reefGroup = new THREE.Group()

  // Outer Turquoise Reef Skirt
  const reefRadius = islandRadius * 1.35
  const reefGeom = new THREE.RingGeometry(islandRadius * 0.4, reefRadius, 48, 8)
  reefGeom.rotateX(-Math.PI / 2)

  const reefMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, // Bright Caribbean turquoise cyan
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false
  })

  const reefMesh = new THREE.Mesh(reefGeom, reefMat)
  reefMesh.position.y = 0.12 // Just below water surface
  reefGroup.add(reefMesh)

  // Shoreline White Foam Ring
  const foamGeom = new THREE.RingGeometry(islandRadius * 0.72, islandRadius * 0.88, 64)
  foamGeom.rotateX(-Math.PI / 2)
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const foamMesh = new THREE.Mesh(foamGeom, foamMat)
  foamMesh.position.y = 0.18
  reefGroup.add(foamMesh)

  return reefGroup
}
