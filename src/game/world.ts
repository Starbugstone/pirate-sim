// @ts-nocheck
import * as THREE from 'three'
import { generateIslandMesh, IslandArchetype, getTerrainNormalMap, fbm } from './terrain'

export function createSky(scene: THREE.Scene): THREE.Group {
  // A procedural sky dome avoids a texture seam and can follow the player
  // forever in the procedural world. The sun is drawn into the sky itself so
  // it can never drift behind the dome or disappear beyond the camera far plane.
  const atmosphere = new THREE.Group()
  atmosphere.name = 'Caribbean atmosphere'

  const skyGeometry = new THREE.SphereGeometry(1150, 40, 24)
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      // Keep the visible disc close to the sea horizon, which is the portion of
      // sky shown by the game's deliberately downward-angled chase camera.
      sunDirection: { value: new THREE.Vector3(0.55, 0.035, 0.83).normalize() }
    },
    vertexShader: `
      varying vec3 vSkyDirection;

      void main() {
        vSkyDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      varying vec3 vSkyDirection;

      void main() {
        vec3 dir = normalize(vSkyDirection);
        float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        float horizonBand = exp(-abs(dir.y) * 7.0);

        vec3 horizon = vec3(0.64, 0.84, 0.91);
        vec3 tropicalBlue = vec3(0.10, 0.48, 0.78);
        vec3 zenith = vec3(0.025, 0.22, 0.55);
        vec3 sky = mix(horizon, tropicalBlue, smoothstep(0.48, 0.72, height));
        sky = mix(sky, zenith, smoothstep(0.70, 1.0, height));

        // Warm humid air at the horizon, with a soft solar halo and crisp core.
        sky = mix(sky, vec3(0.82, 0.89, 0.84), horizonBand * 0.24);
        float sunAmount = max(dot(dir, sunDirection), 0.0);
        float halo = pow(sunAmount, 48.0);
        float sunDisc = smoothstep(0.99935, 0.99972, sunAmount);
        sky += vec3(1.0, 0.67, 0.30) * halo * 0.34;
        sky = mix(sky, vec3(1.0, 0.93, 0.68), sunDisc);

        // Very subtle screen-space dither prevents visible bands in the gradient.
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        sky += (dither - 0.5) / 255.0;
        gl_FragColor = vec4(sky, 1.0);
      }
    `
  })

  const sky = new THREE.Mesh(skyGeometry, skyMaterial)
  sky.name = 'Procedural Caribbean skybox'
  sky.renderOrder = -1000
  sky.frustumCulled = false
  atmosphere.add(sky)

  const hemisphereLight = new THREE.HemisphereLight(0x9bd5ff, 0x31534b, 1.15)
  atmosphere.add(hemisphereLight)

  const sunLight = new THREE.DirectionalLight(0xfff0c2, 2.2)
  sunLight.position.set(340, 500, 420)
  sunLight.target.position.set(0, 0, 0)
  atmosphere.add(sunLight, sunLight.target)

  scene.add(atmosphere)
  return atmosphere
}

export function updateSky(atmosphere: THREE.Group, x: number, z: number) {
  // Moving only in X/Z preserves the lighting direction while keeping the dome
  // centred on the camera throughout the infinite procedural world.
  atmosphere.position.set(x, 0, z)
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
    const normY = trunkHeight > 0.0001 ? (y + trunkHeight / 2) / trunkHeight : 0
    const offset = Math.pow(Math.max(0, normY), 1.8) * curveAmt
    const nx = pos.getX(i) + Math.cos(curveDir) * offset
    const nz = pos.getZ(i) + Math.sin(curveDir) * offset
    pos.setX(i, isFinite(nx) ? nx : 0)
    pos.setZ(i, isFinite(nz) ? nz : 0)
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

// ── 3b. Visually Rich Pirate Port Generator ──
export function createPiratePort(
  spot: { x: number; z: number; angle: number },
  radius: number,
  heightmapFn: (x: number, z: number) => number
) {
  const portGroup = new THREE.Group()

  // Deck elevation: elevated to y = 4.8 to prevent wave clipping under max Gerstner wave crests (+4.35)
  const deckY = 4.8
  const dockLength = 22 + radius * 0.15
  const dockWidth = 6.0

  // Materials
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.85 })
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.9 })
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x6e4e37, roughness: 0.8 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 })
  const thatchRoofMat = new THREE.MeshStandardMaterial({ color: 0x8b7d6b, roughness: 0.95 })
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, side: THREE.DoubleSide })
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 })
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x997a54, roughness: 0.9 })

  // Outer quay end center position relative to spot
  const endX = spot.x + Math.cos(spot.angle) * dockLength
  const endZ = spot.z + Math.sin(spot.angle) * dockLength

  // Main Walkway Deck (Slab)
  const walkwayGeom = new THREE.BoxGeometry(dockLength, 0.5, dockWidth)
  const walkwayMesh = new THREE.Mesh(walkwayGeom, woodMat)
  walkwayMesh.castShadow = true
  walkwayMesh.receiveShadow = true

  const midX = spot.x + Math.cos(spot.angle) * (dockLength / 2)
  const midZ = spot.z + Math.sin(spot.angle) * (dockLength / 2)
  walkwayMesh.position.set(midX, deckY, midZ)
  walkwayMesh.rotation.y = -spot.angle
  portGroup.add(walkwayMesh)

  // Individual Plank Deck Details on top of walkway
  const numPlanks = Math.floor(dockLength / 1.2)
  for (let p = 0; p < numPlanks; p++) {
    const pOffset = -dockLength / 2 + (p + 0.5) * 1.2
    const plankGeom = new THREE.BoxGeometry(1.1, 0.1, dockWidth - 0.2)
    const plankMesh = new THREE.Mesh(plankGeom, p % 2 === 0 ? plankMat : darkWoodMat)
    plankMesh.position.set(pOffset, 0.3, (Math.random() - 0.5) * 0.05)
    walkwayMesh.add(plankMesh)
  }

  // T-Head Quay Platform at the end of the walkway
  const tHeadWidth = 14.0
  const tHeadDepth = 7.0
  const tHeadGeom = new THREE.BoxGeometry(tHeadDepth, 0.5, tHeadWidth)
  const tHeadMesh = new THREE.Mesh(tHeadGeom, woodMat)
  tHeadMesh.castShadow = true
  tHeadMesh.receiveShadow = true
  tHeadMesh.position.set(endX, deckY, endZ)
  tHeadMesh.rotation.y = -spot.angle
  portGroup.add(tHeadMesh)

  // T-Head Plank Details
  const numTPlanks = Math.floor(tHeadWidth / 1.2)
  for (let tp = 0; tp < numTPlanks; tp++) {
    const tpOffset = -tHeadWidth / 2 + (tp + 0.5) * 1.2
    const tPlankMesh = new THREE.Mesh(new THREE.BoxGeometry(tHeadDepth - 0.2, 0.1, 1.1), tp % 2 === 0 ? plankMat : darkWoodMat)
    tPlankMesh.position.set(0, 0.3, tpOffset)
    tHeadMesh.add(tPlankMesh)
  }

  // Support Stilts / Pilings extending deep into water bed (y = -15 to deckY)
  const numPiles = Math.floor(dockLength / 4) + 1
  for (let i = 0; i < numPiles; i++) {
    const pDist = (i / (numPiles - 1)) * dockLength
    const px = spot.x + Math.cos(spot.angle) * pDist
    const pz = spot.z + Math.sin(spot.angle) * pDist
    const perpAngle = spot.angle + Math.PI / 2
    const halfW = dockWidth / 2 - 0.4

    for (const side of [-1, 1]) {
      const pileX = px + Math.cos(perpAngle) * (side * halfW)
      const pileZ = pz + Math.sin(perpAngle) * (side * halfW)
      const pileHeight = deckY + 16.0
      const pileGeom = new THREE.CylinderGeometry(0.35, 0.45, pileHeight, 8)
      const pile = new THREE.Mesh(pileGeom, darkWoodMat)
      pile.position.set(pileX, deckY - pileHeight / 2 + 0.2, pileZ)
      portGroup.add(pile)

      // Iron band near water surface
      const bandGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8)
      const band = new THREE.Mesh(bandGeom, metalMat)
      band.position.set(pileX, 1.0, pileZ)
      portGroup.add(band)
    }
  }

  // Additional Support Stilts under T-Head Quay
  for (const side of [-1, 1]) {
    for (const depthOffset of [-2, 2]) {
      const perpAngle = spot.angle + Math.PI / 2
      const pileX = endX + Math.cos(perpAngle) * (side * (tHeadWidth / 2 - 0.8)) + Math.cos(spot.angle) * depthOffset
      const pileZ = endZ + Math.sin(perpAngle) * (side * (tHeadWidth / 2 - 0.8)) + Math.sin(spot.angle) * depthOffset
      const pileHeight = deckY + 16.0
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, pileHeight, 8), darkWoodMat)
      pile.position.set(pileX, deckY - pileHeight / 2 + 0.2, pileZ)
      portGroup.add(pile)
    }
  }

  // ── Port Master Trading Shack & Storehouse (At Shore End) ──
  const shackGroup = new THREE.Group()
  const shackW = 6.0
  const shackD = 5.0
  const shackH = 4.2

  // Shack Walls
  const shackWalls = new THREE.Mesh(new THREE.BoxGeometry(shackW, shackH, shackD), woodMat)
  shackWalls.position.y = shackH / 2
  shackWalls.castShadow = true
  shackWalls.receiveShadow = true
  shackGroup.add(shackWalls)

  // Shack Roof (Thatched Pyramid)
  const shackRoof = new THREE.Mesh(new THREE.ConeGeometry(shackW * 0.9, 2.8, 4), thatchRoofMat)
  shackRoof.position.y = shackH + 1.4
  shackRoof.rotation.y = Math.PI / 4
  shackGroup.add(shackRoof)

  // Merchant Counter Window cutout
  const counterGeom = new THREE.BoxGeometry(3.5, 0.8, 0.6)
  const counter = new THREE.Mesh(counterGeom, darkWoodMat)
  counter.position.set(0, 1.5, shackD / 2 + 0.2)
  shackGroup.add(counter)

  // Wooden Signboard "PORT SHOP" over counter
  const signGroup = new THREE.Group()
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 0.2), darkWoodMat)
  signBoard.position.set(0, 3.2, shackD / 2 + 0.3)
  signGroup.add(signBoard)
  // Decorative sign emblem
  const signEmblem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8), lanternMat)
  signEmblem.rotation.x = Math.PI / 2
  signEmblem.position.set(0, 3.2, shackD / 2 + 0.45)
  signGroup.add(signEmblem)
  shackGroup.add(signGroup)

  // Hanging Lantern on Shack Post
  const shackLantern = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lanternMat)
  shackLantern.position.set(-shackW / 2 - 0.2, 3.0, shackD / 2 + 0.4)
  shackGroup.add(shackLantern)

  // Place Shack on Shore / Deck Root
  const shackShoreY = heightmapFn(spot.x, spot.z)
  shackGroup.position.set(spot.x, Math.max(shackShoreY, deckY), spot.z)
  shackGroup.rotation.y = -spot.angle + Math.PI / 2
  portGroup.add(shackGroup)

  // ── Port Props & Cargo Goods on Deck ──
  // 1. Stacked Cargo Crates
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6d51, roughness: 0.8 })
  for (let c = 0; c < 4; c++) {
    const crateSize = 1.0 + (c % 2) * 0.3
    const crate = new THREE.Mesh(new THREE.BoxGeometry(crateSize, crateSize, crateSize), crateMat)
    const cSide = (c % 2 === 0 ? 1 : -1) * (dockWidth / 2 - 1.2)
    const cOffset = 4.0 + c * 2.5
    const cx = spot.x + Math.cos(spot.angle) * cOffset + Math.cos(spot.angle + Math.PI / 2) * cSide
    const cz = spot.z + Math.sin(spot.angle) * cOffset + Math.sin(spot.angle + Math.PI / 2) * cSide
    crate.position.set(cx, deckY + crateSize / 2 + 0.25, cz)
    crate.rotation.y = Math.random() * Math.PI
    portGroup.add(crate)
  }

  // 2. Rum Barrels
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.85 })
  for (let b = 0; b < 3; b++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), barrelMat)
    const bOffset = dockLength * 0.7 + b * 1.2
    const bx = spot.x + Math.cos(spot.angle) * bOffset + Math.cos(spot.angle + Math.PI / 2) * 2.0
    const bz = spot.z + Math.sin(spot.angle) * bOffset + Math.sin(spot.angle + Math.PI / 2) * 2.0
    barrel.position.set(bx, deckY + 0.6 + 0.25, bz)
    portGroup.add(barrel)
  }

  // 3. Iron Anchor Prop on Deck
  const anchorGroup = new THREE.Group()
  const anchorStock = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), metalMat)
  anchorStock.rotation.z = Math.PI / 2
  anchorGroup.add(anchorStock)
  const anchorFluke = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 12, Math.PI), metalMat)
  anchorFluke.position.y = -0.9
  anchorGroup.add(anchorFluke)
  anchorGroup.position.set(endX - Math.cos(spot.angle) * 2.0, deckY + 0.5, endZ - Math.sin(spot.angle) * 2.0)
  anchorGroup.rotation.y = -spot.angle
  portGroup.add(anchorGroup)

  // 4. Wooden Cargo Crane Hoist
  const craneGroup = new THREE.Group()
  const craneMast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 6.0, 8), darkWoodMat)
  craneMast.position.y = 3.0
  craneGroup.add(craneMast)

  const craneBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5.0, 8), darkWoodMat)
  craneBoom.rotation.z = Math.PI / 4
  craneBoom.position.set(1.6, 4.8, 0)
  craneGroup.add(craneBoom)

  // Hanging Rope & Suspended Barrel
  const craneRope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.5, 6), ropeMat)
  craneRope.position.set(3.2, 2.8, 0)
  craneGroup.add(craneRope)

  const cargoBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), barrelMat)
  cargoBarrel.position.set(3.2, 0.8, 0)
  craneGroup.add(cargoBarrel)

  craneGroup.position.set(endX + Math.cos(spot.angle + Math.PI / 2) * 4.0, deckY + 0.25, endZ + Math.sin(spot.angle + Math.PI / 2) * 4.0)
  craneGroup.rotation.y = -spot.angle
  portGroup.add(craneGroup)

  // 5. Pirate Flag Mast
  const flagMastGroup = new THREE.Group()
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9.0, 8), darkWoodMat)
  flagPole.position.y = 4.5
  flagMastGroup.add(flagPole)

  const pirateFlag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), fabricMat)
  pirateFlag.position.set(1.2, 7.8, 0)
  flagMastGroup.add(pirateFlag)

  const topGold = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), lanternMat)
  topGold.position.y = 9.0
  flagMastGroup.add(topGold)

  flagMastGroup.position.set(endX - Math.cos(spot.angle + Math.PI / 2) * 4.0, deckY + 0.25, endZ - Math.sin(spot.angle + Math.PI / 2) * 4.0)
  flagMastGroup.rotation.y = -spot.angle
  portGroup.add(flagMastGroup)

  // 6. Wooden Mooring Bollards along Pier
  for (const bSide of [-1, 1]) {
    const bollardX = endX + Math.cos(spot.angle + Math.PI / 2) * (bSide * (tHeadWidth / 2 - 0.6))
    const bollardZ = endZ + Math.sin(spot.angle + Math.PI / 2) * (bSide * (tHeadWidth / 2 - 0.6))
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.2, 8), darkWoodMat)
    bollard.position.set(bollardX, deckY + 0.85, bollardZ)
    portGroup.add(bollard)
  }

  // ── 7. Floating Harbor Mooring Buoys & Docking Ring ──
  const dockEndRingGeom = new THREE.RingGeometry(14, 16.5, 48)
  const dockEndRingMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  })
  const dockEndRing = new THREE.Mesh(dockEndRingGeom, dockEndRingMat)
  dockEndRing.rotation.x = -Math.PI / 2
  dockEndRing.position.set(endX, 0.2, endZ)
  portGroup.add(dockEndRing)

  // Floating Mooring Buoys around berth perimeter
  const buoys: THREE.Group[] = []
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.6 })
  const buoyLanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 })

  for (let b = 0; b < 4; b++) {
    const bAngle = (b / 4) * Math.PI * 2
    const buoyDist = 15.0
    const buoyX = endX + Math.cos(bAngle) * buoyDist
    const buoyZ = endZ + Math.sin(bAngle) * buoyDist

    const buoyGroup = new THREE.Group()
    const buoyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), buoyMat)
    buoyMesh.scale.set(1.0, 0.8, 1.0)
    buoyGroup.add(buoyMesh)

    const buoyTopLight = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), buoyLanternMat)
    buoyTopLight.position.y = 0.9
    buoyGroup.add(buoyTopLight)

    buoyGroup.position.set(buoyX, 0.2, buoyZ)
    buoyGroup.userData.localX = buoyX
    buoyGroup.userData.localZ = buoyZ
    portGroup.add(buoyGroup)
    buoys.push(buoyGroup)
  }

  dockEndRing.userData.buoys = buoys

  return {
    portGroup,
    dockEndX: endX,
    dockEndZ: endZ,
    dockEndRing
  }
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

    // Only plant trees between y = 0.8 (above water line) and y = 65.0 (below high volcanic peaks)
    if (groundY >= 0.8 && groundY <= 65.0) {
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
    
    const portData = createPiratePort(spot, radius, islandData.heightmapFn)
    islandGroup.add(portData.portGroup)

    dockEndX = portData.dockEndX
    dockEndZ = portData.dockEndZ
    dockEndRing = portData.dockEndRing

    // Add 2 Coastal Cannons near the port entrance
    for (let c = 0; c < 2; c++) {
      const cannon = createCannon()
      const cOffset = (c === 0 ? 7 : -7)
      const cx = spot.x + Math.cos(spot.angle + Math.PI / 2) * cOffset
      const cz = spot.z + Math.sin(spot.angle + Math.PI / 2) * cOffset
      cannon.position.set(cx, islandData.heightmapFn(cx, cz), cz)
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

  // ── Place 3D Coral Reef Clusters underwater around shallow island perimeter ──
  const numCorals = Math.floor(8 + radius * 0.12)
  for (let c = 0; c < numCorals; c++) {
    const cAngle = Math.random() * Math.PI * 2
    const cDist = radius * (0.75 + Math.random() * 0.2)
    const cx = Math.cos(cAngle) * cDist
    const cz = Math.sin(cAngle) * cDist
    const cy = islandData.heightmapFn(cx, cz)

    if (cy <= 0.2 && cy >= -6.0) {
      const coralCluster = createCoralReefCluster()
      coralCluster.position.set(cx, Math.max(-4.5, cy), cz)
      coralCluster.rotation.y = Math.random() * Math.PI * 2
      islandGroup.add(coralCluster)
    }
  }

  islandGroup.position.set(x, 0, z)
  scene.add(islandGroup)

  islandGroup.userData.dockEndX = dockEndX
  islandGroup.userData.dockEndZ = dockEndZ
  islandGroup.userData.dockWorldX = x + dockEndX
  islandGroup.userData.dockWorldZ = z + dockEndZ
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

  // Helper to create organic bulky rock mesh with rounded weathered top & flared underwater footing
  const createRockMesh = (r: number, scaleY: number, noiseAmp: number) => {
    const height = r * scaleY * 1.5
    const geom = new THREE.CylinderGeometry(r * 0.88, r * 1.30, height, 20, 24)
    const posAttr = geom.attributes.position
    const seed = Math.random() * 1000

    const halfH = height * 0.5
    for (let i = 0; i < posAttr.count; i++) {
      let vx = posAttr.getX(i)
      let vy = posAttr.getY(i)
      let vz = posAttr.getZ(i)

      const normY = halfH > 0.0001 ? vy / halfH : 0 // -1.0 at bottom base, +1.0 at top rim

      // Multi-octave 3D noise for organic rocky ledges
      const n1 = fbm(vx * 0.07 + seed, vy * 0.07 + seed, 4) * noiseAmp * 1.8
      const n2 = fbm(vz * 0.10 + seed, vy * 0.09 + seed, 3) * noiseAmp * 1.5
      
      // Bulging lower cliff footing & flared underwater base (vy < 0)
      const absNormY = halfH > 0.0001 ? Math.abs(vy) / halfH : 0
      const baseFlare = vy < 0 ? 1.0 + Math.pow(absNormY, 1.3) * 0.45 : 1.0
      
      // Weathered Rounded Dome Top (prevents cone spikes, creates rounded worn table top)
      let topDome = 1.0
      if (normY > 0.25) {
        const topRatio = (normY - 0.25) / 0.75 // 0.0 to 1.0 at top cap
        topDome = Math.cos(topRatio * Math.PI * 0.48) // Curves smoothly into rounded worn top
        vy -= Math.pow(topRatio, 2.0) * (height * 0.12) // Slightly depresses & rounds top center
      }

      vx = (vx + (isNaN(n1) ? 0 : n1)) * baseFlare * topDome
      vz = (vz + (isNaN(n2) ? 0 : n2)) * baseFlare * topDome

      if (!isFinite(vx) || isNaN(vx)) vx = 0
      if (!isFinite(vy) || isNaN(vy)) vy = 0
      if (!isFinite(vz) || isNaN(vz)) vz = 0

      posAttr.setXYZ(i, vx, vy, vz)
    }

    geom.computeVertexNormals()
    geom.computeBoundingSphere()
    geom.computeBoundingBox()
    const normAttr = geom.attributes.normal

    const colors: number[] = []
    const wetStone = new THREE.Color(0x24201d)   // Dark wet shoreline stone
    const cliffStone = new THREE.Color(0x524a44) // Volcanic gray rock cliff
    const mossGreen = new THREE.Color(0x38522b)  // Mossy green ledge top

    for (let i = 0; i < posAttr.count; i++) {
      const vy = posAttr.getY(i)
      const ny = normAttr.getY(i)
      const vColor = new THREE.Color()

      if (vy <= 0.5) {
        vColor.copy(wetStone)
      } else if (ny > 0.55 && vy > 2.0) {
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

  // 1. Central Towering Bulky Sea Stack Pinnacle
  const mainHeightScale = 1.8 + Math.random() * 1.0
  const mainRock = createRockMesh(rockRadius, mainHeightScale, 3.5)
  mainRock.position.y = (rockRadius * mainHeightScale * 2.0) * 0.25 - 5.0
  mainRock.rotation.y = Math.random() * Math.PI * 2
  rockGroup.add(mainRock)

  // 2. Asymmetric Sea Cove Side Buttress Cliffs
  const numButtresses = 2 + Math.floor(Math.random() * 2)
  for (let b = 0; b < numButtresses; b++) {
    const bRadius = rockRadius * (0.6 + Math.random() * 0.3)
    const bHeightScale = 1.2 + Math.random() * 0.8
    const bMesh = createRockMesh(bRadius, bHeightScale, 2.8)
    const angle = (b / numButtresses) * Math.PI * 2 + (Math.random() - 0.5) * 0.8
    const dist = rockRadius * 0.75
    bMesh.position.set(Math.cos(angle) * dist, (bRadius * bHeightScale * 2.0) * 0.22 - 5.0, Math.sin(angle) * dist)
    bMesh.rotation.y = Math.random() * Math.PI * 2
    rockGroup.add(bMesh)
  }

  // 3. Jagged Satellite Boulders & Reef Pillars
  const numSat = 3 + Math.floor(Math.random() * 3)
  for (let s = 0; s < numSat; s++) {
    const satRadius = rockRadius * (0.35 + Math.random() * 0.3)
    const satHeightScale = 1.0 + Math.random() * 0.8
    const satMesh = createRockMesh(satRadius, satHeightScale, 2.0)
    const angle = Math.random() * Math.PI * 2
    const dist = rockRadius * 1.3 + Math.random() * 6
    satMesh.position.set(Math.cos(angle) * dist, (satRadius * satHeightScale * 2.0) * 0.20 - 4.5, Math.sin(angle) * dist)
    satMesh.rotation.y = Math.random() * Math.PI * 2
    rockGroup.add(satMesh)
  }

  // 3D Coral Reef Clusters around rock base
  const numRockCorals = 3 + Math.floor(Math.random() * 3)
  for (let c = 0; c < numRockCorals; c++) {
    const cAngle = Math.random() * Math.PI * 2
    const cDist = rockRadius * (1.1 + Math.random() * 0.5)
    const coralCluster = createCoralReefCluster()
    coralCluster.position.set(Math.cos(cAngle) * cDist, -2.5, Math.sin(cAngle) * cDist)
    coralCluster.rotation.y = Math.random() * Math.PI * 2
    rockGroup.add(coralCluster)
  }

  rockGroup.position.set(x, 0, z)
  scene.add(rockGroup)
  return { x, z, radius: rockRadius + 12, mesh: rockGroup }
}

export function createCoralReefCluster(): THREE.Group {
  const coralGroup = new THREE.Group()

  const staghornMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.7 })
  const brainMat    = new THREE.MeshStandardMaterial({ color: 0x9b51e0, roughness: 0.85 })
  const fanMat      = new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.6, side: THREE.DoubleSide })
  const magentaMat  = new THREE.MeshStandardMaterial({ color: 0xff2288, roughness: 0.75 })

  // 1. Staghorn Coral Branches
  const numBranches = 4 + Math.floor(Math.random() * 4)
  for (let b = 0; b < numBranches; b++) {
    const height = 1.2 + Math.random() * 1.5
    const branchGeom = new THREE.ConeGeometry(0.25, height, 5)
    const branch = new THREE.Mesh(branchGeom, Math.random() > 0.5 ? staghornMat : magentaMat)
    const bAngle = (b / numBranches) * Math.PI * 2 + Math.random() * 0.4
    const bDist = Math.random() * 0.8
    branch.position.set(Math.cos(bAngle) * bDist, height / 2, Math.sin(bAngle) * bDist)
    branch.rotation.set((Math.random() - 0.5) * 0.5, bAngle, (Math.random() - 0.5) * 0.5)
    coralGroup.add(branch)
  }

  // 2. Brain / Dome Coral
  const brainRadius = 0.6 + Math.random() * 0.7
  const brainGeom = new THREE.DodecahedronGeometry(brainRadius, 1)
  const brain = new THREE.Mesh(brainGeom, brainMat)
  brain.position.set((Math.random() - 0.5) * 1.8, brainRadius * 0.6, (Math.random() - 0.5) * 1.8)
  coralGroup.add(brain)

  // 3. Sea Fan Coral Ledge
  const fanGeom = new THREE.CircleGeometry(0.8 + Math.random() * 0.6, 6)
  fanGeom.rotateX(-Math.PI / 3)
  const fan = new THREE.Mesh(fanGeom, fanMat)
  fan.position.set((Math.random() - 0.5) * 2.2, 0.4, (Math.random() - 0.5) * 2.2)
  coralGroup.add(fan)

  return coralGroup
}

export function spawnSunkenShip(scene: THREE.Scene, x: number, z: number) {
  const shipwreckGroup = new THREE.Group()
  const heading = Math.random() * Math.PI * 2
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
  shipwreckGroup.rotation.y = heading
  scene.add(shipwreckGroup)

  return {
    x,
    z,
    heading,
    radius: 6,
    mesh: shipwreckGroup,
    beaconMesh,
    physicsState: { currentY: 0, currentPitch: 0, currentRoll: 0 },
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
