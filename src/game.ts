import { RGBA } from "@opentui/core"
import { ORANGE, RED, YELLOW } from "./colors"
import { BRUISER_SPRITES, DAX_BOSS_FRAMES, DREADNOUGHT_SPRITES, PLAYER_SHIELD_SPRITE, PLAYER_SPRITE, SCOUT_SPRITES, hitSprite, spritesOverlap } from "./sprites"
import type { Drop, GameState } from "./types"

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
    rapidUntil: 0,
    spreadUntil: 0,
    tripleUntil: 0,
    wave: 0,
    waveDirection: 1,
    waveLeft: 2,
    waveRight: width - 2,
    gameOver: false,
  }
}

export function updateGame(state: GameState, dt: number, now: number, width: number, height: number, direction: number) {
  state.elapsed = (now - state.start) / 1000
  const difficulty = 1 + state.elapsed / 35

  state.player.x = clamp(state.player.x + direction * 32 * dt, 4, width - 5)

  if (state.enemies.length === 0) spawnWave(state, difficulty, width)
  updateWave(state, dt, difficulty, width)

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
  state.bullets = state.bullets.filter((b) => b.y > 1 && b.y < height - 1)
  state.drops = state.drops.filter((d) => d.ttl > 0 && d.y < height - 2)
  state.particles = state.particles.filter((p) => p.ttl > 0)
  if (state.player.hp <= 0) state.gameOver = true
}

export function shoot(state: GameState, now: number, lastShot: number) {
  const rapid = now < state.rapidUntil
  const cooldown = rapid ? 95 : Math.max(140, 280 - state.gunLevel * 28)
  if (now - lastShot < cooldown) return lastShot
  const damage = 1 + Math.floor(state.gunLevel / 3)
  const triple = now < state.tripleUntil
  const spread = now < state.spreadUntil

  // center shot always
  state.bullets.push({ x: state.player.x, y: state.player.y - 1, dy: -26, damage, friendly: true })

  if (triple) {
    state.bullets.push({ x: state.player.x - 2, y: state.player.y - 1, dy: -26, damage, friendly: true })
    state.bullets.push({ x: state.player.x + 2, y: state.player.y - 1, dy: -26, damage, friendly: true })
  }
  if (spread) {
    state.bullets.push({ x: state.player.x - 1, y: state.player.y - 1, dx: -14, dy: -22, damage, friendly: true })
    state.bullets.push({ x: state.player.x + 1, y: state.player.y - 1, dx: 14, dy: -22, damage, friendly: true })
  }
  return now
}

export function resizeGameState(state: GameState, oldWidth: number, width: number, height: number) {
  state.player.x = clamp((state.player.x / oldWidth) * width, 2, width - 4)
  state.player.y = height - 6
  state.waveLeft = clamp((state.waveLeft / oldWidth) * width, 2, width - 4)
  state.waveRight = clamp((state.waveRight / oldWidth) * width, 4, width - 2)
  for (const enemy of state.enemies) enemy.x = clamp((enemy.x / oldWidth) * width, 2, width - 4)
  for (const bullet of state.bullets) bullet.x = clamp((bullet.x / oldWidth) * width, 1, width - 2)
  for (const drop of state.drops) drop.x = clamp((drop.x / oldWidth) * width, 1, width - 2)
  for (const p of state.particles) p.x = clamp((p.x / oldWidth) * width, 1, width - 2)
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

function spawnWave(state: GameState, difficulty: number, width: number) {
  state.wave += 1
  state.waveDirection = 1

  if (state.wave % 5 === 0) {
    spawnBoss(state, width)
    return
  }

  const columns = clamp(4 + Math.floor(state.wave / 2), 5, Math.min(12, Math.floor(width / 10)))
  const rows = Math.min(5, 2 + Math.floor((state.wave - 1) / 2))
  const spacingX = Math.max(8, Math.floor((width - 12) / columns))
  const startX = Math.floor((width - spacingX * (columns - 1)) / 2)
  state.waveLeft = Math.max(2, startX - spacingX / 2)
  state.waveRight = Math.min(width - 2, startX + spacingX * (columns - 1) + spacingX / 2)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const dreadnought = row === 0 && state.wave >= 4 && col % 4 === state.wave % 4
      const tough = dreadnought || row === 0 || (state.wave >= 3 && row === 1 && col % 3 === 0)
      const sprite = dreadnought ? randomFrom(DREADNOUGHT_SPRITES) : tough ? randomFrom(BRUISER_SPRITES) : randomFrom(SCOUT_SPRITES)
      const hp = dreadnought ? 7 + Math.floor(difficulty * 1.4) : tough ? 3 + Math.floor(difficulty * 0.8) : 1
      state.enemies.push({
        x: startX + col * spacingX,
        y: 2 + row * 6,
        hp,
        maxHp: hp,
        speed: 0,
        sprite,
        points: dreadnought ? 175 : tough ? 75 : 25,
        fireCd: 0.7 + Math.random() * 2.5,
      })
    }
  }
}

function spawnBoss(state: GameState, width: number) {
  state.waveLeft = 8
  state.waveRight = width - 8
  const hp = 60 + state.wave * 8
  state.enemies.push({
    x: Math.floor(width / 2),
    y: 3,
    hp,
    maxHp: hp,
    speed: 0,
    sprite: DAX_BOSS_FRAMES[0]!,
    frames: DAX_BOSS_FRAMES,
    points: 1500,
    fireCd: 1.2,
    isBoss: true,
    name: "DAX",
  })
}

function updateWave(state: GameState, dt: number, difficulty: number, width: number) {
  const dx = state.waveDirection * (2.2 + state.wave * 0.75 + difficulty * 0.35) * dt
  const leftEdge = Math.min(...state.enemies.map((enemy) => spriteLeft(enemy.x, enemy.sprite)))
  const rightEdge = Math.max(...state.enemies.map((enemy) => spriteRight(enemy.x, enemy.sprite)))
  const shouldDrop = (state.waveDirection > 0 && rightEdge + dx >= state.waveRight) || (state.waveDirection < 0 && leftEdge + dx <= state.waveLeft)

  for (const enemy of state.enemies) {
    enemy.x += shouldDrop ? 0 : dx
    if (shouldDrop) enemy.y += 1
    enemy.fireCd -= dt
    if (enemy.frames && enemy.frames.length > 1) {
      const frame = Math.floor(state.elapsed * 1.5) % enemy.frames.length
      enemy.sprite = enemy.frames[frame]!
    }
  }
  if (shouldDrop) state.waveDirection *= -1

  const shooters = bottomEnemiesByColumn(state)
  const fireChance = Math.min(0.75, 0.12 + state.wave * 0.025 + difficulty * 0.02)
  for (const enemy of shooters) {
    if (enemy.isBoss) {
      if (enemy.fireCd <= 0) {
        const baseY = Math.round(enemy.y + enemy.sprite.length)
        const baseX = Math.round(enemy.x)
        state.bullets.push({ x: baseX, y: baseY, dy: 14, damage: 1, friendly: false })
        state.bullets.push({ x: baseX - 4, y: baseY, dy: 12, damage: 1, friendly: false })
        state.bullets.push({ x: baseX + 4, y: baseY, dy: 12, damage: 1, friendly: false })
        enemy.fireCd = 1.4
      }
      continue
    }
    if (enemy.fireCd <= 0 && Math.random() < fireChance) {
      state.bullets.push({ x: Math.round(enemy.x), y: Math.round(enemy.y + enemy.sprite.length), dy: 12 + difficulty * 1.4, damage: 1, friendly: false })
      enemy.fireCd = Math.max(0.7, 2.8 - difficulty * 0.2) + Math.random() * 1.4
    }
  }
}

function collide(state: GameState, now: number, height: number) {
  for (const bullet of state.bullets) {
    if (bullet.friendly) {
      for (const enemy of state.enemies) {
        if (hitSprite(bullet.x, bullet.y, enemy.x, enemy.y, enemy.sprite)) {
          bullet.y = -99
          enemy.hp -= bullet.damage
          burst(state, enemy.x, enemy.y, enemy.hp <= 0 ? ORANGE : YELLOW)
          if (enemy.hp <= 0) {
            state.score += enemy.points
            if (enemy.isBoss) bigExplosion(state, enemy.x, enemy.y + enemy.sprite.length / 2)
            else maybeDrop(state, enemy.x, enemy.y)
          }
          break
        }
      }
    } else if (hitSprite(bullet.x, bullet.y, state.player.x, currentPlayerTopY(state, now), currentPlayerSprite(state, now))) {
      bullet.y = height + 99
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
    if (enemy.y + enemy.sprite.length >= height - 2) state.gameOver = true
    if (enemy.y + enemy.sprite.length >= state.player.y - 1) state.gameOver = true
  }

  for (const drop of state.drops) {
    if (Math.abs(drop.x - state.player.x) <= 5 && Math.abs(drop.y - state.player.y) <= 4) {
      drop.ttl = 0
      if (drop.kind === "gun") state.gunLevel = Math.min(8, state.gunLevel + 1)
      if (drop.kind === "rapid") state.rapidUntil = now + 9000
      if (drop.kind === "spread") state.spreadUntil = now + 10000
      if (drop.kind === "triple") state.tripleUntil = now + 10000
      if (drop.kind === "shield") state.player.shieldUntil = now + 11000
      if (drop.kind === "life") state.player.hp = Math.min(9, state.player.hp + 1)
      state.score += 10
    }
  }
}

function maybeDrop(state: GameState, x: number, y: number) {
  const roll = Math.random()
  if (roll > 0.25) return
  // life is rare (~3% of kills); other drops share the rest
  if (roll < 0.03) {
    state.drops.push({ x, y, kind: "life", ttl: 12 })
    return
  }
  const kinds: Drop["kind"][] = ["gun", "rapid", "shield", "spread", "triple"]
  state.drops.push({ x, y, kind: kinds[Math.floor(Math.random() * kinds.length)]!, ttl: 10 })
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
  // shockwave ring particles
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

function spriteLeft(centerX: number, sprite: string[]) {
  return centerX - Math.max(...sprite.map((line) => line.length)) / 2
}

function spriteRight(centerX: number, sprite: string[]) {
  return centerX + Math.max(...sprite.map((line) => line.length)) / 2
}

function bottomEnemiesByColumn(state: GameState) {
  const columns = new Map<number, (typeof state.enemies)[number]>()
  for (const enemy of state.enemies) {
    const key = Math.round(enemy.x / 6)
    const existing = columns.get(key)
    if (!existing || enemy.y > existing.y) columns.set(key, enemy)
  }
  return [...columns.values()]
}
