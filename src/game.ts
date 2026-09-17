import { RGBA } from "@opentui/core"
import { ORANGE, RED, YELLOW } from "./colors.js"
import { GEMINI_METEOR_SPRITE, PROVIDERS, providerForBoss } from "./bosses.js"
import { BOSS_INTRO_DURATION } from "./cinematic.js"
import {
  BRUISER_SPRITES,
  BURSTER_SPRITES,
  bossArt,
  DREADNOUGHT_SPRITES,
  PLAYER_SHIELD_SPRITE,
  PLAYER_SPRITE,
  SCOUT_SPRITES,
  SNIPER_SPRITES,
  hitSprite,
  spritesOverlap,
} from "./sprites.js"
import type { BossPattern, Drop, GameState } from "./types.js"

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

export function newGame(width: number, height: number, startLevel = 1): GameState {
  if (!Number.isSafeInteger(startLevel) || startLevel < 1) throw new Error("Starting level must be a positive whole number.")
  return {
    player: { x: Math.floor(width / 2), y: height - 6, hp: 3, shieldUntil: 0 },
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
    dropsThisWave: 0,
    killsSinceDrop: 0,
    lastDropAt: -Infinity,
    wave: startLevel - 1,
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

  if (state.enemies.length === 0) spawnWave(state, width, height)
  if (state.bossIntro) {
    // The automatic reveal must not consume the player's remaining boost time.
    const frozenMs = Math.max(0, dt) * 1000
    for (const key of ["rapidUntil", "spreadUntil", "tripleUntil", "pierceUntil"] as const) {
      if (state[key] > now - frozenMs) state[key] += frozenMs
    }
    if (state.player.shieldUntil > now - frozenMs) state.player.shieldUntil += frozenMs
    state.bossIntro.remaining -= dt
    if (state.bossIntro.remaining <= 0) {
      state.bossIntro = undefined
      const boss = state.enemies.find((enemy) => enemy.isBoss && enemy.provider && enemy.backupCalled && enemy.hp > 0)
      if (boss) {
        summonEscorts(state, boss, width, height)
        boss.fireCd = Math.max(boss.fireCd, 1.2)
      }
    }
    return
  }
  state.player.x = clamp(state.player.x + direction * 32 * dt, 4, width - 5)
  updateWave(state, dt, difficulty, width, height)

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
  if (!state.gameOver) {
    // A surviving hit primes a Gemini dive. Queue damaged stars one at a time.
    if (!state.enemies.some((enemy) => enemy.meteorPhase)) {
      const star = state.enemies.find((enemy) => !enemy.isBoss && enemy.provider === "gemini" && enemy.hp < enemy.maxHp)
      if (star) {
        star.meteorPhase = "warning"
        star.meteorCd = 1.1
      }
    }
    const boss = state.enemies.find((enemy) => enemy.isBoss && enemy.provider && !enemy.backupCalled && enemy.hp <= enemy.maxHp * 0.75)
    if (boss) {
      boss.backupCalled = true
      const operation = PROVIDERS[boss.provider!]
      state.bossIntro = {
        bossName: boss.bossCharacter === "hona" ? "LUKE" : "DAX",
        title: operation.title, tagline: operation.tagline, tip: operation.tip,
        remaining: BOSS_INTRO_DURATION,
      }
    }
  }
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
  if (state.bossIntro) return lastShot
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
    if (enemy.isBoss) {
      const frame = Math.max(0, enemy.frames?.indexOf(enemy.sprite) ?? 0)
      enemy.frames = bossArt(enemy.bossCharacter, height).frames
      enemy.sprite = enemy.frames[frame]!
    }
    if (enemy.provider && !enemy.isBoss) enemy.baseY = Math.min(enemy.baseY, height - 8 - enemy.sprite.length)
    enemy.baseX = clamp((enemy.baseX / oldWidth) * width, 2, width - 4)
    enemy.x = enemy.provider && !enemy.isBoss ? enemy.baseX : enemy.baseX + state.waveOffsetX
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

function spawnWave(state: GameState, width: number, height: number) {
  state.wave += 1
  state.waveDirection = 1
  state.waveOffsetX = 0
  state.waveOffsetY = 0
  state.lifeDroppedThisWave = false
  state.dropsThisWave = 0
  state.killsSinceDrop = 0
  state.bossIntro = undefined

  if (state.wave % 3 === 0) {
    spawnBoss(state, width, height)
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

function spawnBoss(state: GameState, width: number, height: number) {
  const bossLevel = Math.floor(state.wave / 3) - 1
  const pattern = BOSS_PATTERN_ROTATION[bossLevel % BOSS_PATTERN_ROTATION.length]!
  const hp = 90 + state.wave * 10 + bossLevel * 25
  const provider = providerForBoss(bossLevel)
  const baseX = Math.floor(width / 2)
  const baseY = 3
  const bossCharacter = bossLevel === 2 ? "hona" : "dax"
  const frames = bossArt(bossCharacter, height).frames
  state.enemies.push({
    x: baseX,
    y: baseY,
    baseX,
    baseY,
    hp,
    maxHp: hp,
    speed: 0,
    sprite: frames[0]!,
    frames,
    points: 1500,
    fireCd: 1.5,
    isBoss: true,
    name: bossNameFor(bossLevel),
    bossPattern: pattern,
    bossCharacter,
    provider,
    summonCd: 2.5,
    rewardDamage: 0,
  })
  recomputeWaveSwing(state, width)
}

function bossNameFor(bossLevel: number) {
  if (bossLevel === 1) return "DAX"
  if (bossLevel === 2) return "LUKE / HONA"
  const labels = ["DAX", "DAX // AIMED", "DAX // RAPID", "DAX // SPREAD-5", "DAX // BURST"]
  return labels[bossLevel % labels.length]!
}

function recomputeWaveSwing(state: GameState, width: number) {
  const formation = state.enemies.filter((enemy) => !enemy.provider || enemy.isBoss)
  if (formation.length === 0) return
  const halfSprite = (sprite: string[]) => Math.max(...sprite.map((line) => line.length)) / 2
  const minBaseLeft = Math.min(...formation.map((e) => e.baseX - halfSprite(e.sprite)))
  const maxBaseRight = Math.max(...formation.map((e) => e.baseX + halfSprite(e.sprite)))
  state.waveSwingMin = 2 - minBaseLeft
  state.waveSwingMax = width - 2 - maxBaseRight
}

function updateWave(state: GameState, dt: number, difficulty: number, width: number, height: number) {
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
    // Boss arenas stay airborne: tougher fights must still fit short terminals.
    if (wave % 3 !== 0) state.waveOffsetY += 1
  } else {
    state.waveOffsetX = nextOffset
  }

  const escorts = state.enemies.filter((enemy) => enemy.provider && !enemy.isBoss && enemy.hp > 0 && !enemy.meteorPhase).sort((a, b) => a.x - b.x)
  for (const enemy of state.enemies) {
    if (enemy.meteorPhase) {
      updateMeteor(enemy, dt, width, height)
      continue
    }
    if (enemy.provider && !enemy.isBoss) {
      const halfWidth = Math.ceil(Math.max(...enemy.sprite.map((row) => row.length)) / 2)
      const lane = escorts.indexOf(enemy)
      const laneWidth = (width - 3) / Math.max(1, escorts.length)
      const left = 1 + lane * laneWidth + halfWidth
      const right = Math.max(left, 1 + (lane + 1) * laneWidth - halfWidth)
      if (enemy.x <= left) enemy.patrolDirection = 1
      if (enemy.x >= right) enemy.patrolDirection = -1
      const step = (7 + wave * 0.2) * dt
      // When another escort dies, smoothly travel into the newly expanded lane.
      const target = (enemy.patrolDirection ?? 1) > 0 ? right : left
      enemy.x += clamp(target - enemy.x, -step, step)
      enemy.x = clamp(enemy.x, halfWidth + 1, width - halfWidth - 2)
      enemy.baseX = enemy.x
      enemy.y = Math.min(enemy.baseY, height - 8 - enemy.sprite.length)
    } else {
      enemy.x = enemy.baseX + state.waveOffsetX
      enemy.y = enemy.baseY + state.waveOffsetY
    }
    enemy.fireCd -= dt
    if (enemy.frames && enemy.frames.length > 1) {
      const frame = Math.floor(state.elapsed * 1.5) % enemy.frames.length
      enemy.sprite = enemy.frames[frame]!
    }
  }

  const boss = state.enemies.find((enemy) => enemy.isBoss && enemy.provider && enemy.backupCalled)
  if (boss) {
    boss.summonCd = (boss.summonCd ?? 0) - dt
    if (boss.summonCd <= 0) summonEscorts(state, boss, width, height)
  }

  const shooters = activeShooters(state)
  const fireChance = Math.min(0.6, 0.08 + Math.max(0, wave - 2) * 0.018 + difficulty * 0.01)
  for (const enemy of shooters) {
    if (enemy.hp <= 0 || enemy.meteorPhase) continue
    if (enemy.isBoss) {
      fireBossPattern(state, enemy)
      continue
    }
    if (enemy.fireCd > 0) continue
    if (enemy.provider) {
      fireEscort(state, enemy)
      continue
    }
    fireEnemy(state, enemy, fireChance, difficulty)
  }
}

function updateMeteor(enemy: GameState["enemies"][number], dt: number, width: number, height: number) {
  if (enemy.meteorPhase === "warning") {
    enemy.meteorCd = (enemy.meteorCd ?? 0) - dt
    if (enemy.meteorCd <= 0) {
      // Grow upwards so the larger hitbox never jumps towards the player.
      enemy.y += enemy.sprite.length - GEMINI_METEOR_SPRITE.length
      enemy.sprite = GEMINI_METEOR_SPRITE
      enemy.x = clamp(enemy.x, 10, width - 11)
      enemy.baseX = enemy.x
      enemy.meteorPhase = "falling"
    }
    return
  }
  enemy.y += 9 * dt
  if (enemy.y >= height - 1) enemy.hp = 0
}

function summonEscorts(state: GameState, boss: GameState["enemies"][number], width: number, height: number) {
  boss.summonCd = boss.provider === "gemini" ? 5.5 : 9
  const escorts = state.enemies.filter((enemy) => enemy.provider && !enemy.isBoss)
  const provider = boss.provider!
  const sprite = PROVIDERS[provider].sprite
  const halfWidth = Math.ceil(Math.max(...sprite.map((row) => row.length)) / 2)
  // Refill the squad while the boss lives; shared pickup budgets prevent farming.
  const limit = provider === "gemini" ? 4 : 3
  const available = Math.max(0, limit - escorts.length)
  for (let slot = 0; slot < available; slot++) {
    const lanes = Array.from({ length: limit }, (_, lane) => clamp(Math.round(width * (lane + 0.5) / limit), halfWidth + 1, width - halfWidth - 2))
    // Choose the largest opening so replacements do not stack on a survivor.
    const baseX = lanes.sort((a, b) => {
      const distance = (x: number) => Math.min(...escorts.map((enemy) => Math.abs(enemy.x - x)), width)
      return distance(b) - distance(a)
    })[0]!
    const baseY = Math.min(boss.y + boss.sprite.length + 1, height - 8 - sprite.length)
    const hp = provider === "gemini" ? 10 + Math.floor(state.wave / 3) : 3 + Math.floor(state.wave / 6)
    const escort: GameState["enemies"][number] = {
      x: baseX, y: baseY, baseX, baseY, hp, maxHp: hp, speed: 0,
      sprite, provider, patrolDirection: slot % 2 === 0 ? 1 : -1, points: 100, fireCd: 1.2 + slot * 0.35,
    }
    state.enemies.push(escort)
    escorts.push(escort)
  }
}

function fireEscort(state: GameState, enemy: GameState["enemies"][number]) {
  const x = Math.round(enemy.x)
  const y = Math.round(enemy.y + enemy.sprite.length)
  const fire = (offset: number, dx: number, dy: number) => {
    state.bullets.push({ x: x + offset, y, dx, dy, damage: 1, friendly: false })
  }
  switch (enemy.provider) {
    case "deepseek":
      // Two cheap tokens converge below the whale, then cross.
      fire(-3, 4, 11)
      fire(3, -4, 11)
      enemy.fireCd = 2.8
      break
    case "gemini": {
      const split = (enemy.burstCount ?? 0) % 2 === 0
      fire(-2, split ? -5 : 5, 13)
      fire(2, split ? 5 : -5, 13)
      enemy.burstCount = (enemy.burstCount ?? 0) + 1
      enemy.fireCd = 2.6
      break
    }
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
  if (boss.bossCharacter === "hona") {
    // Each direction fires once in a random order, followed by a return-fire window.
    if (!boss.spreadQueue?.length) boss.spreadQueue = [-1, 0, 1]
    const index = Math.floor(Math.random() * boss.spreadQueue.length)
    const dx = boss.spreadQueue.splice(index, 1)[0]! * 8
    for (const offset of [-3, 3]) {
      state.bullets.push({ x: baseX + offset, y: baseY, dx, dy: 18, damage: 1, friendly: false })
    }
    boss.fireCd = boss.spreadQueue.length === 0 ? 2.2 : 0.3
    return
  }
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
      if (!boss.spreadQueue?.length) boss.spreadQueue = [-1, 0, 1]
      const index = Math.floor(Math.random() * boss.spreadQueue.length)
      const lane = boss.spreadQueue.splice(index, 1)[0]!
      state.bullets.push({ x: baseX + lane * 4, y: baseY, dx: lane * 8, dy: lane === 0 ? 14 : 12, damage: 1, friendly: false })
      boss.fireCd = boss.spreadQueue.length > 0 ? 0.45 : 1.6
      return
    }
  }
}

function anyEnemyAtPlayerLine(state: GameState, height: number) {
  const ground = height - 2
  for (const enemy of state.enemies) {
    if (enemy.meteorPhase === "falling") continue
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
        if (enemy.hp <= 0 || bullet.hitEnemies?.has(enemy)) continue
        // Once wounded, a Gemini star is guaranteed to complete its warning
        // and begin the dive. It becomes shootable again while falling.
        if (enemy.meteorPhase === "warning" && hitSprite(bullet.x, bullet.y, enemy.x, enemy.y, enemy.sprite)) {
          bullet.y = -99
          continue
        }
        if (hitSprite(bullet.x, bullet.y, enemy.x, enemy.y, enemy.sprite)) {
          enemy.hp -= bullet.damage
          if (enemy.isBoss && enemy.hp > 0) {
            enemy.rewardDamage = (enemy.rewardDamage ?? 0) + bullet.damage
            if (enemy.rewardDamage >= Math.max(6, Math.floor(enemy.maxHp * 0.07))) {
              enemy.rewardDamage = 0
              maybeDrop(state, enemy.x, enemy.y + enemy.sprite.length, now, true)
            }
          }
          burst(state, enemy.x, enemy.y, enemy.hp <= 0 ? ORANGE : YELLOW)
          if (enemy.hp <= 0) {
            state.score += enemy.points
            if (enemy.isBoss) {
              bigExplosion(state, enemy.x, enemy.y + enemy.sprite.length / 2)
              destroyEscorts(state)
            }
            else maybeDrop(state, enemy.x, enemy.y, now)
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
    if (enemy.hp <= 0) continue
    if (spritesOverlap(enemy.x, enemy.y, enemy.sprite, state.player.x, currentPlayerTopY(state, now), currentPlayerSprite(state, now))) {
      enemy.hp = 0
      if (enemy.isBoss) destroyEscorts(state)
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

function destroyEscorts(state: GameState) {
  for (const escort of state.enemies) {
    if (!escort.provider || escort.isBoss || escort.hp <= 0) continue
    escort.hp = 0
    burst(state, escort.x, escort.y, ORANGE)
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

function activeDrop(state: GameState, kind: Drop["kind"], now: number) {
  switch (kind) {
    case "rapid": return now < state.rapidUntil
    case "spread": return now < state.spreadUntil
    case "triple": return now < state.tripleUntil
    case "pierce": return now < state.pierceUntil
    case "shield": return now < state.player.shieldUntil
    case "gun": return state.gunLevel >= GUN_MAX_LEVEL
    case "life": return state.player.hp >= 3 || state.lifeDroppedThisWave
  }
}

function pickDropKind(state: GameState, now: number): Drop["kind"] | undefined {
  const pool = DROP_WEIGHTS.filter(([kind]) => !activeDrop(state, kind, now) && !state.drops.some((drop) => drop.ttl > 0 && drop.kind === kind))
  if (!activeDrop(state, "life", now) && !state.drops.some((drop) => drop.kind === "life") && Math.random() < (state.player.hp === 1 ? 0.08 : 0.03)) return "life"
  const total = pool.reduce((sum, [, w]) => sum + w, 0)
  let r = Math.random() * total
  for (const [kind, w] of pool) {
    r -= w
    if (r <= 0) return kind
  }
  return undefined
}

function maybeDrop(state: GameState, x: number, y: number, now: number, bossHit = false) {
  if (!bossHit) state.killsSinceDrop += 1
  const bossWave = state.wave % 3 === 0
  const budget = bossWave ? 6 : Math.min(4, 2 + Math.floor(state.wave / 4))
  const cooldown = bossWave ? 3 : 4
  if (state.dropsThisWave >= budget || state.elapsed - state.lastDropAt < cooldown) return
  if (state.drops.filter((drop) => drop.ttl > 0).length >= 2) return

  const armed = ["rapid", "spread", "triple", "pierce"].some((kind) => activeDrop(state, kind as Drop["kind"], now))
  const baseChance = bossWave ? (armed ? 0.15 : 0.25) : (armed ? 0.08 : 0.14)
  // Dry streaks gently improve the odds; an already boosted player needs less help.
  const chance = bossHit ? (armed ? 0.55 : 0.9)
    : Math.min(bossWave ? 0.5 : 0.38, baseChance + Math.max(0, state.killsSinceDrop - 3) * 0.025)
  if (Math.random() >= chance) return
  const kind = pickDropKind(state, now)
  if (!kind) return
  state.drops.push({ x, y, kind, ttl: 12 })
  state.dropsThisWave += 1
  state.killsSinceDrop = 0
  state.lastDropAt = state.elapsed
  if (kind === "life") state.lifeDroppedThisWave = true
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
    if (enemy.isBoss || enemy.provider) {
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
