// @ts-nocheck
export const SHIP_TYPES = {
  RAMMER: { name: 'Rammer', hp: 150, speed: 10, turnSpeed: 0.5, rammingDamage: 20, cannonDamage: 5, color: 0x333333, size: 1.2 },
  NORMAL: { name: 'Sloop', hp: 80, speed: 6, turnSpeed: 2.0, rammingDamage: 10, cannonDamage: 10, color: 0x8B0000, size: 1.0 },
  BIG: { name: 'Galleon', hp: 200, speed: 4, turnSpeed: 1.0, rammingDamage: 10, cannonDamage: 15, color: 0x000080, size: 1.8 }
}

export const OCEAN_SIZE = 2000
export const OCEAN_SEGMENTS = 500

export const MAX_TREASURES = 10
export const MAX_CANNONBALLS = 40
export const MAX_WAKE_PARTICLES = 35
export const MAX_ISLANDS = 15
export const MAX_ROCKS = 12
export const MAX_DISPOSE_PER_FRAME = 3
export const MAX_WIND_PARTICLES = 280

export const CHUNK_SIZE = 200

export const HARBOUR_RANGE = 15

export const ICON_RENDER_DIST = 200
export const INACTIVE_DIST = 300
export const ACTIVE_DIST = 400
export const KRAKEN_INACTIVE_DIST = 300
export const KRAKEN_RENDER_DIST = 300
export const CANNONBALL_CULL_DIST = 300

export const ENEMY_IDLE_DIST = 200
export const ENEMY_ALERT_DIST = 120
export const ENEMY_ATTACK_DIST = 100
