import type { RGBA } from "@opentui/core"

export type EnemyFireType = "standard" | "aimed" | "burst" | "weave"
export type BossPattern = "spread3" | "aimed" | "rapidCenter" | "wide5" | "burst"
export type Provider = "deepseek" | "gemini"
export type BossCharacter = "dax" | "hona" | "kit"

export type Bullet = {
  x: number
  y: number
  dx?: number
  dy: number
  damage: number
  friendly: boolean
  pierce?: number
  hitEnemies?: Set<Enemy>
  owner?: Enemy
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
  spreadQueue?: number[]
  fireType?: EnemyFireType
  isBoss?: boolean
  name?: string
  bossPattern?: BossPattern
  bossCharacter?: BossCharacter
  provider?: Provider
  backupCalled?: boolean
  summonCd?: number
  patrolDirection?: number
  patrolSpeed?: number
  meteorCd?: number
  meteorPhase?: "warning" | "falling"
  meteorElapsed?: number
  rewardDamage?: number
  kitPhase?: 1 | 2
  kitModule?: "extension"
  kitSlot?: number
  kitClock?: number
  kitVolley?: number
  kitAim?: number
  kitAimY?: number
}
export type Drop = { x: number; y: number; kind: "gun" | "rapid" | "shield" | "spread" | "triple" | "pierce" | "life"; ttl: number }
export type Particle = { x: number; y: number; glyph: string; ttl: number; color: RGBA }
export type HighScore = { name: string; score: number; seconds: number; date: string }

export type GameState = {
  ship?: "opencode" | "opencodejr"
  kitOutro?: { remaining: number }
  player: { x: number; y: number; hp: number; shieldUntil: number; hurtUntil?: number }
  bullets: Bullet[]
  enemies: Enemy[]
  drops: Drop[]
  particles: Particle[]
  score: number
  start: number
  elapsed: number
  arenaHeight?: number
  spawnTimer: number
  gunLevel: number
  gunXP: number
  rapidUntil: number
  spreadUntil: number
  tripleUntil: number
  pierceUntil: number
  lifeDroppedThisWave: boolean
  dropsThisWave: number
  killsSinceDrop: number
  lastDropAt: number
  bossIntro?: { bossName: string; title: string; tagline: string; tip: string; remaining: number }
  encounterNotice?: { text: string; until: number }
  wave: number
  waveDirection: number
  waveOffsetX: number
  waveOffsetY: number
  waveSwingMin: number
  waveSwingMax: number
  gameOver: boolean
}
