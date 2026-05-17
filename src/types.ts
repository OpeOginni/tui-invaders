import type { RGBA } from "@opentui/core"

export type EnemyFireType = "standard" | "aimed" | "burst"
export type BossPattern = "spread3" | "aimed" | "rapidCenter" | "wide5" | "burst"

export type Bullet = {
  x: number
  y: number
  dx?: number
  dy: number
  damage: number
  friendly: boolean
  pierce?: number
  hitEnemies?: Set<Enemy>
}
export type Enemy = {
  x: number
  y: number
  baseX: number
  baseY: number
  hp: number
  maxHp: number
  speed: number
  sprite: string[]
  frames?: string[][]
  points: number
  fireCd: number
  burstCount?: number
  fireType?: EnemyFireType
  isBoss?: boolean
  name?: string
  bossPattern?: BossPattern
}
export type Drop = { x: number; y: number; kind: "gun" | "rapid" | "shield" | "spread" | "triple" | "pierce" | "life"; ttl: number }
export type Particle = { x: number; y: number; glyph: string; ttl: number; color: RGBA }
export type HighScore = { name: string; score: number; seconds: number; date: string }

export type GameState = {
  player: { x: number; y: number; hp: number; shieldUntil: number }
  bullets: Bullet[]
  enemies: Enemy[]
  drops: Drop[]
  particles: Particle[]
  score: number
  start: number
  elapsed: number
  spawnTimer: number
  gunLevel: number
  gunXP: number
  rapidUntil: number
  spreadUntil: number
  tripleUntil: number
  pierceUntil: number
  lifeDroppedThisWave: boolean
  wave: number
  waveDirection: number
  waveOffsetX: number
  waveOffsetY: number
  waveSwingMin: number
  waveSwingMax: number
  gameOver: boolean
}
