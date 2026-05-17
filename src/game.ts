import { RGBA } from "@opentui/core"
import { ORANGE, RED, YELLOW } from "./colors"
import {
  BRUISER_SPRITES,
  BURSTER_SPRITES,
  DAX_BOSS_FRAMES,
  DREADNOUGHT_SPRITES,
  PLAYER_SHIELD_SPRITE,
  PLAYER_SPRITE,
  SCOUT_SPRITES,
  SNIPER_SPRITES,
  hitSprite,
  spritesOverlap,
} from "./sprites"
import type { BossPattern, Drop, GameState } from "./types"

const BOSS_PATTERN_ROTATION: BossPattern[] = ["spread3", "aimed", "rapidCenter", "wide5", "burst"]

// Drops needed to advance from level N → N+1. Cool upgrades cost more.
//  L1→L2 damage++         : 1
//  L2→L3 two-shot         : 2
//  L3→L4 damage++         : 2
//  L4→L5 three-shot       : 3
//  L5→L6 damage++ faster  : 3
//  L6→L7 piercing         : 4
//  L7→L8 final stack      : 4
const GUN_LEVEL_COSTS = [1, 2, 2, 3, 3, 4, 4]
const GUN_MAX_LEVEL = 8

export function gunCostToNext(level: number) {
  if (level >= GUN_MAX_LEVEL) return 0
  return GUN_LEVEL_COSTS[level - 1] ?? 0
}

function upgradeGun(state: GameState) {
  if (state.gunLevel >= GUN_MAX_LEVEL) {
    state.score += 50 // overflow into bonus score once maxed
    return
  }
  state.gunXP += 1
  while (state.gunLevel < GUN_MAX_LEVEL && state.gunXP >= gunCostToNext(state.gunLevel)) {
    state.gunXP -= gunCostToNext(state.gunLevel)
    state.gunLevel += 1
  }
}

export function newGame(width: number, height: number): GameState {
  return {
    player: { x: Math.floor(width / 2), y: height - 5, hp: 3, shieldUntil: 0 },
    bullets: [],
    enemies: [],
    drops: [],
    particles: [],
    score: 0,
    start: performance.now(),
    elapsed: 0,
    spawnTimer: 0,
    gunLevel: 1,
    gunXP: 0,
    rapidUntil: 0,
    spreadUntil: 0,
    tripleUntil: 0,
    pierceUntil: 0,
    lifeDroppedThisWave: false,
    wave: 0,
    waveDirection: 1,
    waveOffsetX: 0,
    waveOffsetY: 0,
    waveSwingMin: 0,
    waveSwingMax: 0,
    gameOver: false,
  }
}

export function updateGame(state: GameState, dt: number, now: number, width: number, height: number, direction: number) {
  state.elapsed = (now - state.start) / 1000
  const difficulty = 1 + state.elapsed / 60

  state.player.x = clamp(state.player.x + direction * 32 * dt, 4, width - 5)

  if (state.enemies.length === 0) spawnWave(state, width)
  updateWave(state, dt, difficulty)

  for (const bullet of state.bullets) {
    bullet.y += bullet.dy * dt
    if (bullet.dx) bullet.x += bullet.dx * dt
  }
  for (const drop of state.drops) {
    drop.y += 6 * dt
    drop.ttl -= dt
  }
  for (const p of state.particles) p.ttl -= dt

  collide(state, now, height)

  state.enemies = state.enemies.filter((e) => e.hp > 0)
  state.bullets = state.bullets.filter((b) => b.y > 1 && b.y < height - 1 && b.x > 0 && b.x < width)
  state.drops = state.drops.filter((d) => d.ttl > 0 && d.y < height - 2)
  state.particles = state.particles.filter((p) => p.ttl > 0)
  if (state.player.hp <= 0) state.gameOver = true
  if (anyEnemyAtPlayerLine(state, height)) state.gameOver = true
}

/**
 * Permanent gun progression. Stacks ON TOP of temporary power-ups.
 *
 *  Lv | shots             | damage | notes
 *  ---+-------------------+--------+----------------------
 *   1 | 1 center          |   1    | starting
 *   2 | 1 center          |   2    | stronger bullet
 *   3 | 2 close-parallel  |   2    | wider hit area
 *   4 | 2 close-parallel  |   3    | damage++
 *   5 | 3 forward (close) |   3    | three barrels
 *   6 | 3 forward (close) |   4    | damage++, baseline cd faster
 *   7 | 1 center, pierce  |   4    | bullets pierce 1
 *   8 | 3 forward, pierce |   5    | three barrels + pierce 1
 */
export function shoot(state: GameState, now: number, lastShot: number) {
  const rapid = now < state.rapidUntil
  const pierceTemp = now < state.pierceUntil
  const lvl = state.gunLevel
  const baseCd = Math.max(170, 280 - lvl * 14) - (lvl >= 6 ? 30 : 0)
  const cooldown = rapid ? 95 : baseCd
  if (now - lastShot < cooldown) return lastShot

  const damage = baseDamageForLevel(lvl)
  const baselineShots = baseShotsForLevel(lvl)
  const baselinePierce = lvl >= 7 ? 1 : 0
  const triple = now < state.tripleUntil
  const spread = now < state.spreadUntil
  const pierce = baselinePierce + (pierceTemp ? 2 : 0)

  const px = state.player.x
  const py = state.player.y - 1

  for (const dx of baselineShots) {
    pushFriendly(state, px + dx, py, 0, -26, damage, pierce)
  }

  if (triple) {
    pushFriendly(state, px - 3, py, 0, -26, damage, pierce)
    pushFriendly(state, px + 3, py, 0, -26, damage, pierce)
  }
  if (spread) {
    pushFriendly(state, px - 1, py, -14, -22, damage, pierce)
    pushFriendly(state, px + 1, py, 14, -22, damage, pierce)
  }
  return now
}

function pushFriendly(state: GameState, x: number, y: number, dx: number, dy: number, damage: number, pierce: number) {
  state.bullets.push({
    x,
    y,
    dx: dx || undefined,
    dy,
    damage,
    friendly: true,
    pierce: pierce > 0 ? pierce : undefined,
  })
}

function baseDamageForLevel(lvl: number): number {
  if (lvl >= 8) return 5
  if (lvl >= 6) return 4
  if (lvl >= 4) return 3
  if (lvl >= 2) return 2
  return 1
}

function baseShotsForLevel(lvl: number): number[] {
  if (lvl >= 8) return [-1, 0, 1]
  if (lvl === 7) return [0]
  if (lvl >= 5) return [-1, 0, 1]
  if (lvl >= 3) return [-1, 1]
  return [0]
}

export function resizeGameState(state: GameState, oldWidth: number, width: number, height: number) {
  state.player.x = clamp((state.player.x / oldWidth) * width, 2, width - 4)
  state.player.y = height - 6
  for (const enemy of state.enemies) {
    enemy.baseX = clamp((enemy.baseX / oldWidth) * width, 2, width - 4)
    enemy.x = enemy.baseX + state.waveOffsetX
  }
  for (const bullet of state.bullets) bullet.x = clamp((bullet.x / oldWidth) * width, 1, width - 2)
  for (const drop of state.drops) drop.x = clamp((drop.x / oldWidth) * width, 1, width - 2)
  for (const p of state.particles) p.x = clamp((p.x / oldWidth) * width, 1, width - 2)
  recomputeWaveSwing(state, width)
  state.enemies = state.enemies.filter((e) => e.y < height - 2)
  state.bullets = state.bullets.filter((b) => b.y > 1 && b.y < height - 1)
  state.drops = state.drops.filter((d) => d.y < height - 2)
}

export function currentPlayerSprite(state: GameState, now: number) {
  return now < state.player.shieldUntil ? PLAYER_SHIELD_SPRITE : PLAYER_SPRITE
}

export function currentPlayerTopY(state: GameState, now: number) {
  return now < state.player.shieldUntil ? state.player.y - 1 : state.player.y
}

function spawnWave(state: GameState, width: number) {
  state.wave += 1
  state.waveDirection = 1
  state.waveOffsetX = 0
  state.waveOffsetY = 0
  state.lifeDroppedThisWave = false

  if (state.wave % 5 === 0) {
    spawnBoss(state, width)
    return
  }

  const wave = state.wave
  const columns = clamp(4 + Math.floor(wave / 1.5), 5, Math.min(13, Math.floor(width / 9)))
  const rows = Math.min(5, 2 + Math.floor(wave / 2))
  const spacingX = Math.max(8, Math.floor((width - 12) / columns))
  const startX = Math.floor((width - spacingX * (columns - 1)) / 2)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const enemy = pickEnemy(wave, row, col)
      const baseX = startX + col * spacingX
      const baseY = 2 + row * 6
      state.enemies.push({
        x: baseX,
        y: baseY,
        baseX,
        baseY,
        hp: enemy.hp,
        maxHp: enemy.hp,
        speed: 0,
        sprite: enemy.sprite,
        points: enemy.points,
        fireCd: 0.7 + Math.random() * 2.5,
        fireType: enemy.fireType,
      })
    }
  }
  recomputeWaveSwing(state, width)
}

function pickEnemy(wave: number, row: number, col: number) {
  const dreadnought = row === 0 && wave >= 7 && col % 4 === wave % 4
  if (dreadnought) {
    return { sprite: randomFrom(DREADNOUGHT_SPRITES), hp: 6 + Math.floor(wave * 0.6), points: 175, fireType: "standard" as const }
  }
  const sniper = wave >= 5 && row === 0 && Math.random() < 0.18
  if (sniper) {
    return { sprite: randomFrom(SNIPER_SPRITES), hp: 2 + Math.floor(wave * 0.4), points: 110, fireType: "aimed" as const }
  }
  const burster = wave >= 8 && row === 1 && Math.random() < 0.2
  if (burster) {
    return { sprite: randomFrom(BURSTER_SPRITES), hp: 3 + Math.floor(wave * 0.5), points: 130, fireType: "burst" as const }
  }
  const tough = row === 0 || (wave >= 3 && row === 1 && col % 3 === 0)
  if (tough) {
    return { sprite: randomFrom(BRUISER_SPRITES), hp: 2 + Math.floor(wave * 0.4), points: 75, fireType: "standard" as const }
  }
  return { sprite: randomFrom(SCOUT_SPRITES), hp: 1, points: 25, fireType: "standard" as const }
}

function spawnBoss(state: GameState, width: number) {
  const bossLevel = Math.floor(state.wave / 5) - 1
  const pattern = BOSS_PATTERN_ROTATION[bossLevel % BOSS_PATTERN_ROTATION.length]!
  const hp = 50 + state.wave * 6
  const baseX = Math.floor(width / 2)
  const baseY = 3
  state.enemies.push({
    x: baseX,
    y: baseY,
    baseX,
    baseY,
    hp,
    maxHp: hp,
    speed: 0,
    sprite: DAX_BOSS_FRAMES[0]!,
    frames: DAX_BOSS_FRAMES,
    points: 1500,
    fireCd: 1.5,
    isBoss: true,
    name: bossNameFor(bossLevel),
    bossPattern: pattern,
  })
  recomputeWaveSwing(state, width)
}

function bossNameFor(bossLevel: number) {
  const labels = ["DAX", "DAX // AIMED", "DAX // RAPID", "DAX // SPREAD-5", "DAX // BURST"]
  return labels[bossLevel % labels.length]!
}

function recomputeWaveSwing(state: GameState, width: number) {
  if (state.enemies.length === 0) return
  const halfSprite = (sprite: string[]) => Math.max(...sprite.map((line) => line.length)) / 2
  const minBaseLeft = Math.min(...state.enemies.map((e) => e.baseX - halfSprite(e.sprite)))
  const maxBaseRight = Math.max(...state.enemies.map((e) => e.baseX + halfSprite(e.sprite)))
  state.waveSwingMin = 2 - minBaseLeft
  state.waveSwingMax = width - 2 - maxBaseRight
}

function updateWave(state: GameState, dt: number, difficulty: number) {
  const wave = state.wave
  const speedBase = 3.5
  const speedFromWave = Math.max(0, wave - 5) * 0.55
  const speedFromTime = difficulty * 0.25
  const speed = speedBase + speedFromWave + speedFromTime
  const dx = state.waveDirection * speed * dt

  const nextOffset = state.waveOffsetX + dx
  const shouldDrop = (state.waveDirection > 0 && nextOffset >= state.waveSwingMax) || (state.waveDirection < 0 && nextOffset <= state.waveSwingMin)

  if (shouldDrop) {
    state.waveDirection *= -1
    state.waveOffsetY += 1
  } else {
    state.waveOffsetX = nextOffset
  }

  for (const enemy of state.enemies) {
    enemy.x = enemy.baseX + state.waveOffsetX
    enemy.y = enemy.baseY + state.waveOffsetY
    enemy.fireCd -= dt
    if (enemy.frames && enemy.frames.length > 1) {
      const frame = Math.floor(state.elapsed * 1.5) % enemy.frames.length
      enemy.sprite = enemy.frames[frame]!
    }
  }

  const shooters = activeShooters(state)
  const fireChance = Math.min(0.6, 0.08 + Math.max(0, wave - 2) * 0.018 + difficulty * 0.01)
  for (const enemy of shooters) {
    if (enemy.isBoss) {
      fireBossPattern(state, enemy)
      continue
    }
    if (enemy.fireCd > 0) continue
    fireEnemy(state, enemy, fireChance, difficulty)
  }
}

function fireEnemy(state: GameState, enemy: GameState["enemies"][number], fireChance: number, difficulty: number) {
  const baseX = Math.round(enemy.x)
  const baseY = Math.round(enemy.y + enemy.sprite.length)
  switch (enemy.fireType) {
    case "aimed": {
      // sniper: less random, fires aimed shot when off-cooldown
      if (Math.random() < fireChance + 0.1) {
        const dx = clamp(state.player.x - baseX, -8, 8) * 0.7
        state.bullets.push({ x: baseX, y: baseY, dx, dy: 18, damage: 1, friendly: false })
        enemy.fireCd = 1.6 + Math.random() * 1.4
      } else {
        enemy.fireCd = 0.6
      }
      return
    }
    case "burst": {
      // burster: fires 3 quick shots
      const remaining = enemy.burstCount ?? 0
      if (remaining > 0) {
        state.bullets.push({ x: baseX, y: baseY, dy: 16, damage: 1, friendly: false })
        enemy.burstCount = remaining - 1
        enemy.fireCd = 0.16
        return
      }
      if (Math.random() < fireChance) {
        state.bullets.push({ x: baseX, y: baseY, dy: 16, damage: 1, friendly: false })
        enemy.burstCount = 2
        enemy.fireCd = 0.16
      } else {
        enemy.fireCd = 0.8
      }
      return
    }
    default: {
      if (Math.random() < fireChance) {
        state.bullets.push({ x: baseX, y: baseY, dy: 12 + difficulty * 1.2, damage: 1, friendly: false })
        enemy.fireCd = Math.max(0.7, 2.8 - difficulty * 0.15) + Math.random() * 1.4
      } else {
        enemy.fireCd = 0.4
      }
    }
  }
}

function fireBossPattern(state: GameState, boss: GameState["enemies"][number]) {
  if (boss.fireCd > 0) return
  const baseX = Math.round(boss.x)
  const baseY = Math.round(boss.y + boss.sprite.length)
  const playerX = state.player.x
  switch (boss.bossPattern) {
    case "aimed": {
      // 3-shot aimed burst with a long rest in between so player can reposition.
      const dx = clamp(playerX - baseX, -10, 10) * 0.85
      state.bullets.push({ x: baseX, y: baseY, dx, dy: 17, damage: 1, friendly: false })
      if (!boss.burstCount) {
        boss.burstCount = 2 // 2 more shots will follow this one
        boss.fireCd = 0.45
      } else {
        boss.burstCount -= 1
        boss.fireCd = boss.burstCount === 0 ? 1.8 : 0.45
      }
      return
    }
    case "rapidCenter": {
      state.bullets.push({ x: baseX, y: baseY, dy: 22, damage: 1, friendly: false })
      boss.fireCd = 0.45
      return
    }
    case "wide5": {
      state.bullets.push({ x: baseX, y: baseY, dy: 14, damage: 1, friendly: false })
      state.bullets.push({ x: baseX - 3, y: baseY, dx: -6, dy: 13, damage: 1, friendly: false })
      state.bullets.push({ x: baseX + 3, y: baseY, dx: 6, dy: 13, damage: 1, friendly: false })
      state.bullets.push({ x: baseX - 6, y: baseY, dx: -12, dy: 12, damage: 1, friendly: false })
      state.bullets.push({ x: baseX + 6, y: baseY, dx: 12, dy: 12, damage: 1, friendly: false })
      boss.fireCd = 2.2
      return
    }
    case "burst": {
      const count = boss.burstCount ?? 0
      state.bullets.push({ x: baseX, y: baseY, dy: 18, damage: 1, friendly: false })
      if (count + 1 >= 5) {
        boss.burstCount = 0
        boss.fireCd = 2.2
      } else {
        boss.burstCount = count + 1
        boss.fireCd = 0.18
      }
      return
    }
    case "spread3":
    default: {
      state.bullets.push({ x: baseX, y: baseY, dy: 14, damage: 1, friendly: false })
      state.bullets.push({ x: baseX - 4, y: baseY, dx: -8, dy: 12, damage: 1, friendly: false })
      state.bullets.push({ x: baseX + 4, y: baseY, dx: 8, dy: 12, damage: 1, friendly: false })
      boss.fireCd = 1.6
      return
    }
  }
}

function anyEnemyAtPlayerLine(state: GameState, height: number) {
  const ground = height - 2
  for (const enemy of state.enemies) {
    const bottom = enemy.y + enemy.sprite.length
    if (bottom >= ground || bottom >= state.player.y - 1) return true
  }
  return false
}

function collide(state: GameState, now: number, height: number) {
  void height
  for (const bullet of state.bullets) {
    if (bullet.friendly) {
      for (const enemy of state.enemies) {
        if (bullet.hitEnemies?.has(enemy)) continue
        if (hitSprite(bullet.x, bullet.y, enemy.x, enemy.y, enemy.sprite)) {
          enemy.hp -= bullet.damage
          burst(state, enemy.x, enemy.y, enemy.hp <= 0 ? ORANGE : YELLOW)
          if (enemy.hp <= 0) {
            state.score += enemy.points
            if (enemy.isBoss) bigExplosion(state, enemy.x, enemy.y + enemy.sprite.length / 2)
            else maybeDrop(state, enemy.x, enemy.y)
          }
          if (bullet.pierce && bullet.pierce > 0) {
            bullet.pierce -= 1
            if (!bullet.hitEnemies) bullet.hitEnemies = new Set()
            bullet.hitEnemies.add(enemy)
          } else {
            bullet.y = -99
          }
          break
        }
      }
    } else if (hitSprite(bullet.x, bullet.y, state.player.x, currentPlayerTopY(state, now), currentPlayerSprite(state, now))) {
      bullet.y = 9999
      if (now > state.player.shieldUntil) state.player.hp -= 1
      burst(state, state.player.x, state.player.y, RED)
    }
  }

  for (const enemy of state.enemies) {
    if (spritesOverlap(enemy.x, enemy.y, enemy.sprite, state.player.x, currentPlayerTopY(state, now), currentPlayerSprite(state, now))) {
      enemy.hp = 0
      if (now > state.player.shieldUntil) state.player.hp -= 1
      burst(state, state.player.x, state.player.y, RED)
    }
  }

  for (const drop of state.drops) {
    if (Math.abs(drop.x - state.player.x) <= 5 && Math.abs(drop.y - state.player.y) <= 4) {
      drop.ttl = 0
      if (drop.kind === "gun") upgradeGun(state)
      if (drop.kind === "rapid") state.rapidUntil = now + 9000
      if (drop.kind === "spread") state.spreadUntil = now + 10000
      if (drop.kind === "triple") state.tripleUntil = now + 10000
      if (drop.kind === "pierce") state.pierceUntil = now + 10000
      if (drop.kind === "shield") state.player.shieldUntil = now + 11000
      if (drop.kind === "life") state.player.hp = Math.min(9, state.player.hp + 1)
      state.score += 10
    }
  }
}

// Weighted drop pool: pierce is intentionally rare; others share evenly.
const DROP_WEIGHTS: Array<[Drop["kind"], number]> = [
  ["gun", 4],
  ["rapid", 3],
  ["shield", 3],
  ["spread", 3],
  ["triple", 3],
  ["pierce", 1],
]

function pickDropKind(): Drop["kind"] {
  const total = DROP_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)
  let r = Math.random() * total
  for (const [kind, w] of DROP_WEIGHTS) {
    r -= w
    if (r <= 0) return kind
  }
  return "gun"
}

function maybeDrop(state: GameState, x: number, y: number) {
  const roll = Math.random()
  if (roll > 0.22) return
  // life is very rare (~0.8%) and capped at one per wave
  if (roll < 0.008 && !state.lifeDroppedThisWave) {
    state.drops.push({ x, y, kind: "life", ttl: 12 })
    state.lifeDroppedThisWave = true
    return
  }
  state.drops.push({ x, y, kind: pickDropKind(), ttl: 10 })
}

function burst(state: GameState, x: number, y: number, color: typeof RED) {
  for (const glyph of ["*", "+", ".", "'"]) {
    state.particles.push({ x: x + Math.random() * 4 - 2, y: y + Math.random() * 2 - 1, glyph, ttl: 0.25 + Math.random() * 0.35, color })
  }
}

function bigExplosion(state: GameState, x: number, y: number) {
  const glyphs = ["*", "+", "✦", "✶", "✸", "★", "·", "•", "◉", "▒", "▓", "█"]
  const colors = [
    RGBA.fromHex("#ffd166"),
    RGBA.fromHex("#ff7b54"),
    RGBA.fromHex("#ff3a4a"),
    RGBA.fromHex("#ffe66d"),
    RGBA.fromHex("#ff9f43"),
  ]
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * 14
    state.particles.push({
      x: x + Math.cos(angle) * radius * 1.4,
      y: y + Math.sin(angle) * radius * 0.7,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)]!,
      ttl: 0.6 + Math.random() * 1.4,
      color: colors[Math.floor(Math.random() * colors.length)]!,
    })
  }
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2
    state.particles.push({
      x: x + Math.cos(angle) * 4,
      y: y + Math.sin(angle) * 2.2,
      glyph: "●",
      ttl: 0.4 + Math.random() * 0.3,
      color: RGBA.fromHex("#ffffff"),
    })
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function randomFrom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]!
}

// Classic Space Invaders: only the bottom enemy per column can shoot.
// Exception: enemies with a special fire type (sniper/burster) ignore this rule
// — that's their whole gimmick: firing over their teammates.
function activeShooters(state: GameState) {
  const bottom = new Map<number, (typeof state.enemies)[number]>()
  const specials: (typeof state.enemies)[number][] = []
  for (const enemy of state.enemies) {
    if (enemy.isBoss) {
      specials.push(enemy)
      continue
    }
    const key = Math.round(enemy.baseX / 6)
    const existing = bottom.get(key)
    if (!existing || enemy.y > existing.y) bottom.set(key, enemy)
    if (enemy.fireType === "aimed" || enemy.fireType === "burst") {
      // also collect for shooting regardless of column position
      specials.push(enemy)
    }
  }
  // de-dupe: a special that is also the bottom of its column shouldn't fire twice
  const seen = new Set<(typeof state.enemies)[number]>(bottom.values())
  for (const s of specials) seen.add(s)
  return [...seen]
}
