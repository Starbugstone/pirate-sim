export const appOverview = {
  title: 'Pirates of the Burning Sea',
  subtitle: 'A standalone naval combat app rebuilt from the original Starbug pirate sim demo.',
  summary:
    'Sail an infinite procedural Caribbean, hunt enemy ships, raid wrecks, dock at harbours, and prepare for the Kraken. This React app keeps the existing gameplay foundation while giving the project a cleaner product shell.'
}

export const headlineStats = [
  { label: 'World', value: '9 x 9 active chunks', note: 'Procedural sea streamed around the player' },
  { label: 'Combat', value: 'Port and starboard broadsides', note: 'Directional cannons with cooldowns and upgrades' },
  { label: 'Harbours', value: 'Dock, pause, upgrade, repair', note: 'Safe zones and progression loop' },
  { label: 'Boss', value: 'Kraken encounter', note: 'Large-creature behavior already designed into the sim' }
]

export const coreFeatures = [
  {
    title: 'Naval combat loop',
    text: 'Steer with the mouse, work the wind, line up broadside angles, and manage cooldowns under pressure.'
  },
  {
    title: 'Procedural world streaming',
    text: 'The sea is generated in chunks around the ship so the play space expands without loading screens.'
  },
  {
    title: 'Harbour progression',
    text: 'Anchor near docks to open the port shop, spend gold, repair the hull, and upgrade the ship.'
  },
  {
    title: 'Performance-first simulation',
    text: 'Enemy AI, indicators, cannonballs, and heavy systems use distance tiers and throttled updates.'
  }
]

export const controls = [
  ['Mouse', 'Steer the ship'],
  ['Left click', 'Fire starboard cannons'],
  ['Right click', 'Fire port cannons'],
  ['A', 'Drop or raise anchor'],
  ['Scroll', 'Switch camera distance and combat view']
]

export const upgrades = [
  ['Faster Sails', 'Three levels, adding up to +9 max speed'],
  ['Broadside Power', 'Three levels, growing from 3 to 9 cannons per side'],
  ['Faster Cannons', 'Three levels, reducing reload time down to 0.75s'],
  ['Max HP', 'Five levels, raising the hull cap from 100 to 150'],
  ['Repair Haul', 'Repeatable repair purchase with rising cost']
]

export const shipStats = [
  ['Base HP', '100'],
  ['Base speed', '15 knots'],
  ['Cannons', '3 per side'],
  ['Base cooldown', '1.5 seconds']
]

export const enemyTypes = [
  ['Sloop', '80 HP, medium speed, straight-fire attacker'],
  ['Galleon', '200 HP, slow heavy broadside ship'],
  ['Rammer', '150 HP, fast charger with high collision damage']
]

export const worldRules = [
  ['Chunk size', '200 x 200 world units'],
  ['Loaded zone', '9 x 9 chunks around the player'],
  ['Spawn mix', 'Islands, rocks, ships, wrecks, and harbour docks'],
  ['Safety checks', 'Ship spawns avoid islands, rocks, chunk borders, and the starting zone']
]

export const roadmap = {
  next: [
    'Visual pass for waves and ship damage feedback',
    'Re-enable the Kraken in the tuned performance budget',
    'Expand the product layer around progression and player goals'
  ],
  completed: [
    'Player ship, wind sailing, and broadside firing',
    'Enemy AI states, collision damage, and sinking behavior',
    'Treasure collection, gold economy, and harbour shop upgrades',
    'Infinite chunked world generation with cleanup rules',
    'Distance-based activation and culling for expensive systems'
  ],
  performance: [
    ['Icons', 'Render within 200 units'],
    ['Dormant enemies', 'Sleep beyond 300 units'],
    ['Full enemy activation', 'Run AI and combat within 400 units'],
    ['Kraken render distance', 'Show full creature within 300 units'],
    ['Cannonball cull distance', 'Remove beyond 300 units']
  ]
}
