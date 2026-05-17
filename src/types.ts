import type { RGBA } from "@opentui/core"

export type Bullet = { x: number; y: number; dx?: number; dy: number; damage: number; friendly: boolean }
export type Enemy = { x: number; y: number; hp: number; maxHp: number; speed: number; sprite: string[]; frames?: string[][]; points: number; fireCd: number; isBoss?: boolean; name?: string }
export type Drop = { x: number; y: number; kind: "gun" | "rapid" | "shield" | "spread" | "triple" | "life"; ttl: number }
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
  rapidUntil: number
  spreadUntil: number
  tripleUntil: number
  wave: number
  waveDirection: number
  waveLeft: number
  waveRight: number
  gameOver: boolean
}
