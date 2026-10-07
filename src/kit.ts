import { RGBA } from "@opentui/core"
import { BOSS_INTRO_DURATION } from "./cinematic.js"
import { aimVelocity } from "./combat.js"
import { toCollisionFrame } from "./sprites.js"
import type { Enemy, GameState } from "./types.js"

export const KIT_COLORS: Record<string, RGBA> = {
  H: RGBA.fromHex("#382b30"), h: RGBA.fromHex("#79616e"),
  S: RGBA.fromHex("#f0bf99"), J: RGBA.fromHex("#899061"),
  D: RGBA.fromHex("#c78970"), B: RGBA.fromHex("#50383b"),
  P: RGBA.fromHex("#10151d"),
  K: RGBA.fromHex("#182433"), W: RGBA.fromHex("#efffff"),
  T: RGBA.fromHex("#26394c"), C: RGBA.fromHex("#67e8ce"),
}

// Effect's stacked-diamond logo, adapted from effect.website/favicon.svg.
// All helpers share one silhouette and name; no library vocabulary required.
export const EFFECT_EXTENSION_PIXELS = [
  "     W     ",
  "    WWW    ",
  "  WWWWWWW  ",
  " WWWWWWWWW ",
  " W WWWWW W ",
  "  W  W  W  ",
  "   W   W   ",
  "  W  W  W  ",
  "   WW WW   ",
  "     W     ",
]
export const EFFECT_EXTENSION_SPRITE = toCollisionFrame(EFFECT_EXTENSION_PIXELS)
export const EFFECT_EXTENSION_COLORS = { W: RGBA.fromHex("#efffff") }

export const KIT_PHASES = {
  1: { title: "Rewrite in Effect!", tagline: "", tip: "Destroy the Extensions to break Kit's shield." },
  2: { title: "Endomorphisms are inherently monoidal!", tagline: "", tip: "Shield restored! Destroy all three Extensions." },
} as const

export function kitDamageFloor(boss: Enemy) {
  return boss.kitPhase === undefined ? boss.maxHp * 0.75 : boss.kitPhase === 1 ? boss.maxHp * 0.5 : 0
}

export function cancelKitBullets(state: GameState, owner: Enemy) {
  state.bullets = state.bullets.filter((bullet) => bullet.owner !== owner)
}

export function closeKitScope(state: GameState) {
  for (const enemy of state.enemies) if (enemy.kitModule) enemy.hp = 0
  state.bullets = state.bullets.filter((bullet) => !bullet.owner?.kitModule && bullet.owner?.bossCharacter !== "kit")
}

export function beginKitPhase(state: GameState, boss: Enemy, phase: 1 | 2) {
  closeKitScope(state)
  boss.kitPhase = phase
  boss.kitVolley = 0
  boss.kitClock = 0
  boss.kitAim = undefined
  boss.kitAimY = undefined
  boss.fireCd = 2
  state.bossIntro = { bossName: "KIT // OVER 9,000x DEV", ...KIT_PHASES[phase], remaining: BOSS_INTRO_DURATION }
}

export function spawnKitModules(state: GameState, boss: Enemy, width: number, height: number) {
  const count = boss.kitPhase === 1 ? 2 : 3
  state.enemies = state.enemies.filter((enemy) => !enemy.kitModule)
  for (let slot = 0; slot < count; slot++) {
    const x = width * (slot + 1) / (count + 1)
    const y = Math.min(boss.y + boss.sprite.length + 2, height - 13)
    const hp = boss.kitPhase === 1 ? 48 : 36
    state.enemies.push({
      x, y, baseX: x, baseY: y, hp, maxHp: hp, speed: 0,
      sprite: EFFECT_EXTENSION_SPRITE, points: 150, fireCd: 1.8 + slot * 0.7,
      kitModule: "extension", kitSlot: slot, kitClock: 0,
    })
  }
  state.encounterNotice = { text: KIT_PHASES[boss.kitPhase!].tip, until: state.elapsed + 5 }
}

export function positionKitModule(enemy: Enemy, boss: Enemy, dt: number, width: number, height: number) {
  enemy.kitClock = (enemy.kitClock ?? 0) + dt
  const count = boss.kitPhase === 1 ? 2 : 3
  const lane = width * ((enemy.kitSlot ?? 0) + 1) / (count + 1)
  const swing = Math.min(7, width / 18)
  enemy.x = lane + Math.sin(enemy.kitClock * 1.2 + (enemy.kitSlot ?? 0) * 2) * swing
  enemy.y = Math.min(boss.y + boss.sprite.length + 2, height - 13)
  enemy.baseX = enemy.x
  enemy.baseY = enemy.y
}

export function fireKit(state: GameState, enemy: Enemy) {
  if (enemy.fireCd > 0) return
  const x = enemy.x
  const y = enemy.y + enemy.sprite.length
  const fire = (offset: number, dx: number, dy = 13) => {
    state.bullets.push({ x: x + offset, y, dx, dy, damage: 1, friendly: false, owner: enemy })
  }
  if (enemy.kitModule) {
    const boss = state.enemies.find((candidate) => candidate.bossCharacter === "kit")
    if (boss?.kitPhase === 1) {
      fire(0, 0, 11)
      enemy.fireCd = 3.8
    } else {
      fire(-1, -4, 12)
      fire(1, 4, 12)
      enemy.fireCd = 3.2
    }
    return
  }
  const phase = enemy.kitPhase ?? 1
  const volley = enemy.kitVolley ?? 0
  // One aimed point per volley: subsequent retries use the SAME target.
  // The warning marker locks it before the first shot, leaving room to dodge.
  const aim = enemy.kitAim ?? state.player.x
  const targetY = enemy.kitAimY ?? state.player.y
  const { dx, dy } = aimVelocity(x, y, aim, targetY, 14)
  if (phase === 1) {
    fire(-4, dx - 4, dy)
    fire(0, dx, dy)
    fire(4, dx + 4, dy)
    enemy.fireCd = 2.8
    enemy.kitAim = undefined
    enemy.kitAimY = undefined
  } else {
    // Retry twice with backoff; the long final rest is a damage window.
    fire(-2, dx, dy)
    fire(2, dx, dy)
    enemy.fireCd = volley % 3 === 0 ? 0.55 : volley % 3 === 1 ? 0.85 : 2.8
    if (volley % 3 === 2) {
      enemy.kitAim = undefined
      enemy.kitAimY = undefined
    }
  }
  enemy.kitVolley = volley + 1
}
