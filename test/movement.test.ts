import { describe, expect, spyOn, test } from "bun:test"
import { aimVelocity } from "../src/combat.js"
import { InvadersGame } from "../src/embed.js"
import { currentPlayerSprite, currentPlayerTopY, defenseLine, newGame, playerBounds, resizeGameState, shoot, updateGame } from "../src/game.js"
import { BOSS_INTRO_DURATION } from "../src/cinematic.js"
import type { Enemy, GameState } from "../src/types.js"

function target(x: number, y: number, isBoss = false): Enemy {
  return { x, y, baseX: x, baseY: y, hp: 100, maxHp: 100, speed: 0, sprite: ["█"], points: 25, fireCd: Infinity, isBoss }
}

function arena(width = 120, height = 60) {
  const state = newGame(width, height)
  updateGame(state, 0, state.start, width, height, 0)
  for (const enemy of state.enemies) enemy.fireCd = Infinity
  return state
}

function hitPlayer(state: GameState, now: number) {
  state.bullets.push({ x: state.player.x, y: state.player.y, dy: 0, damage: 1, friendly: false })
  updateGame(state, 0, now, 120, 60, 0)
}

describe("four-direction flight", () => {
  test("moves both axes while preserving horizontal-only engine calls", () => {
    const state = arena()
    const x = state.player.x
    const y = state.player.y
    updateGame(state, 0.05, state.start + 50, 120, 60, 1)
    expect(state.player.x).toBeCloseTo(x + 1.6)
    expect(state.player.y).toBe(y)
    updateGame(state, 0.05, state.start + 100, 120, 60, 0, -1)
    expect(state.player.y).toBeCloseTo(y - 0.8)
    updateGame(state, 0.05, state.start + 150, 120, 60, -1, 1)
    expect(state.player.x).toBeCloseTo(x + 1.6 - 1.6 / Math.SQRT2)
    expect(state.player.y).toBeCloseTo(y - 0.8 + 0.8 / Math.SQRT2)
  })

  test("diagonal flight is not faster than straight flight in terminal-cell proportions", () => {
    const state = arena()
    const x = state.player.x
    const y = state.player.y
    updateGame(state, 0.05, state.start + 50, 120, 60, 1, -1)
    expect(Math.hypot(state.player.x - x, (state.player.y - y) * 2)).toBeCloseTo(1.6)
  })

  test("all arena sizes keep the ship and shield inside the lower-half flight area", () => {
    for (const [width, height] of [[60, 24], [90, 30], [120, 60]] as const) {
      const state = arena(width, height)
      state.player.shieldUntil = Infinity
      const bounds = playerBounds(width, height)
      updateGame(state, 10, state.start + 10000, width, height, -1, -1)
      expect(state.player.x).toBe(bounds.minX)
      expect(state.player.y).toBe(bounds.minY)
      const sprite = currentPlayerSprite(state, state.start)
      expect(currentPlayerTopY(state, state.start)).toBeGreaterThan(2)
      expect(Math.round(state.player.x - sprite[0]!.length / 2)).toBeGreaterThan(0)
      updateGame(state, 10, state.start + 20000, width, height, 1, 1)
      expect(state.player.x).toBe(bounds.maxX)
      expect(state.player.y).toBe(bounds.maxY)
      expect(currentPlayerTopY(state, state.start) + sprite.length).toBeLessThanOrEqual(height - 2)
      expect(state.gameOver).toBe(false)
    }
  })

  test("shots and pickups follow the ship's current altitude", () => {
    const state = arena()
    state.player.y = 35
    shoot(state, 1000, 0)
    expect(state.bullets[0]!.y).toBe(34)
    state.bullets = []
    state.drops.push({ x: state.player.x, y: 35, kind: "gun", ttl: 12 })
    updateGame(state, 0, state.start, 120, 60, 0)
    expect(state.gunLevel).toBe(2)
    expect(state.drops).toHaveLength(0)
  })

  test("resizing preserves relative altitude instead of resetting to the bottom", () => {
    const state = arena()
    state.player.y = 42 // Halfway between 30 and 54.
    resizeGameState(state, 120, 80, 30)
    expect(state.player.x).toBe(40)
    expect(state.player.y).toBe(19.5) // Halfway between 15 and 24.
    resizeGameState(state, 80, 120, 60)
    expect(state.player.y).toBe(42)
    state.player.y = playerBounds(120, 60).minY
    resizeGameState(state, 120, 60, 24)
    expect(state.player.y).toBe(12)
  })

  test("boss intros freeze both movement axes and preserve remaining hit protection", () => {
    const state = newGame(120, 60, 12)
    updateGame(state, 0, state.start, 120, 60, 0)
    state.enemies[0]!.hp *= 0.75
    updateGame(state, 0, state.start, 120, 60, 0)
    state.player.hurtUntil = state.start + 800
    const { x, y } = state.player
    updateGame(state, 1, state.start + 1000, 120, 60, 1, -1)
    expect(state.player.x).toBe(x)
    expect(state.player.y).toBe(y)
    expect(state.player.hurtUntil).toBe(state.start + 1800)
    updateGame(state, BOSS_INTRO_DURATION - 1, state.start + BOSS_INTRO_DURATION * 1000, 120, 60, 1, -1)
    expect(state.bossIntro).toBeUndefined()
    expect(state.player.hurtUntil! - (state.start + BOSS_INTRO_DURATION * 1000)).toBeCloseTo(800)
  })
})

describe("held and tap controls", () => {
  test("arrows and WASD support diagonal holds and independent immediate releases", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(10000)
    try {
      for (const [up, right] of [["up", "right"], ["w", "d"]]) {
        let now = 10000
        clock.mockReturnValue(now)
        const game = new InvadersGame(120, 60)
        game.start()
        const advance = () => {
          clock.mockReturnValue(now += 50)
          game.step(now)
        }
        await game.press({ name: up! })
        await game.press({ name: right! })
        advance()
        expect(game.state.player.x).toBeGreaterThan(60)
        expect(game.state.player.y).toBeLessThan(54)
        const y = game.state.player.y
        const x = game.state.player.x
        game.release({ name: up! })
        advance()
        expect(game.state.player.y).toBe(y)
        expect(game.state.player.x).toBeCloseTo(x + 1.6)
        game.release({ name: right! })
        const stopped = game.state.player.x
        advance()
        expect(game.state.player.x).toBe(stopped)
      }
    } finally {
      clock.mockRestore()
    }
  })

  test("opposite directions cancel, and releasing one alias preserves the other held key", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(10000)
    try {
      const game = new InvadersGame(120, 60)
      game.start()
      await game.press({ name: "a" })
      await game.press({ name: "left" })
      await game.press({ name: "d" })
      await game.press({ name: "w" })
      await game.press({ name: "s" })
      game.step(10050)
      expect(game.state.player.x).toBe(60)
      expect(game.state.player.y).toBe(54)
      game.release({ name: "a" })
      game.release({ name: "d" })
      game.release({ name: "s" })
      game.step(10100)
      expect(game.state.player.x).toBeLessThan(60)
      expect(game.state.player.y).toBeLessThan(54)
    } finally {
      clock.mockRestore()
    }
  })

  test("raw-terminal taps expire without releases, while repeats extend movement", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(10000)
    try {
      const game = new InvadersGame(120, 60)
      game.start()
      await game.tap({ name: "w" })
      game.step(10050)
      const y = game.state.player.y
      clock.mockReturnValue(10100)
      await game.tap({ name: "w" })
      game.step(10150)
      expect(game.state.player.y).toBeLessThan(y)
      const stopped = game.state.player.y
      game.step(10250)
      expect(game.state.player.y).toBe(stopped)
    } finally {
      clock.mockRestore()
    }
  })

  test("pause and restart clear held keys and pending taps", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(10000)
    try {
      const game = new InvadersGame(120, 60)
      game.start()
      await game.press({ name: "up" })
      await game.tap({ name: "d" })
      game.pause()
      game.step(10025)
      await game.press({ name: "p" })
      game.step(10050)
      expect(game.state.player).toMatchObject({ x: 60, y: 54 })
      await game.press({ name: "left" })
      await game.press({ name: "w" })
      game.restart()
      game.start()
      game.step(10100)
      expect(game.state.player).toMatchObject({ x: 60, y: 54 })
    } finally {
      clock.mockRestore()
    }
  })

  test("embedded resizing preserves altitude", () => {
    const game = new InvadersGame(120, 60)
    game.state.player.y = 42
    game.resize(90, 30)
    expect(game.state.player.y).toBe(19.5)
  })
})

describe("invasions, collisions and retreat windows", () => {
  test("flying above distant enemies does not cause a game over", () => {
    const state = arena()
    state.player.y = 30
    state.enemies = [target(10, 40)]
    updateGame(state, 0, state.start + 1000, 120, 60, 0)
    expect(state.gameOver).toBe(false)
    expect(state.player.hp).toBe(3)
  })

  test("crossing the fixed defense line ends a wave regardless of player altitude", () => {
    for (const y of [30, 54]) {
      const state = arena()
      state.player.y = y
      state.enemies = [target(10, defenseLine(60) - 2)]
      updateGame(state, 0, state.start + 1000, 120, 60, 0)
      expect(state.gameOver).toBe(false)
      state.enemies[0]!.baseY += 1
      updateGame(state, 0, state.start + 1000, 120, 60, 0)
      expect(state.gameOver).toBe(true)
    }
  })

  test("a real close-range collision costs a life rather than ending the game", () => {
    const state = arena()
    state.player.y = 35
    const enemy = target(state.player.x, 35)
    state.enemies = [enemy, target(10, 2)]
    updateGame(state, 0, state.start + 1000, 120, 60, 0)
    expect(state.player.hp).toBe(2)
    expect(state.enemies).not.toContain(enemy)
    expect(state.gameOver).toBe(false)
    expect(state.score).toBe(0)
    expect(state.drops).toHaveLength(0)
  })

  test("ramming real bosses does not kill them or drain every life in consecutive frames", () => {
    for (const wave of [3, 6, 9]) {
      const state = newGame(120, 30, wave)
      updateGame(state, 0, state.start, 120, 30, 0)
      const boss = state.enemies[0]!
      boss.fireCd = Infinity
      state.player.y = 15
      updateGame(state, 0, state.start + 1000, 120, 30, 0)
      expect(state.player.hp).toBe(2)
      expect(boss.hp).toBe(boss.maxHp)
      expect(state.enemies).toContain(boss)
      updateGame(state, 0, state.start + 1050, 120, 30, 0)
      expect(state.player.hp).toBe(2)
      expect(state.score).toBe(0)
      expect(state.gameOver).toBe(false)
    }
  })

  test("a hit provides an 800ms retreat window before another hit can damage the ship", () => {
    const state = arena()
    state.player.y = 35
    hitPlayer(state, state.start + 1000)
    expect(state.player.hp).toBe(2)
    hitPlayer(state, state.start + 1100)
    expect(state.player.hp).toBe(2)
    hitPlayer(state, state.start + 1800)
    expect(state.player.hp).toBe(1)
    expect(state.bullets).toHaveLength(0)
  })

  test("hit protection cannot be used to ram through a whole formation for free", () => {
    const state = arena()
    state.player.y = 35
    const first = target(state.player.x, 35)
    const second = target(state.player.x, 35)
    state.enemies = [first, second, target(10, 2)]
    updateGame(state, 0, state.start + 1000, 120, 60, 0)
    expect(state.player.hp).toBe(2)
    expect(state.enemies).not.toContain(first)
    expect(state.enemies).toContain(second)
    expect(second.hp).toBe(second.maxHp)
  })
})

describe("two-dimensional targeting", () => {
  test("aiming keeps constant speed inside a downward cone even above or beside the muzzle", () => {
    for (const [x, y] of [[10, 40], [30, 10], [30, 50], [0, 30]]) {
      const shot = aimVelocity(30, 30, x!, y!, 28)
      expect(Math.hypot(shot.dx, shot.dy)).toBeCloseTo(28)
      expect(shot.dy).toBeGreaterThan(0)
      expect(Math.abs(shot.dx)).toBeLessThanOrEqual(shot.dy)
    }
    expect(aimVelocity(30, 30, 30, 30, 28)).toEqual({ dx: 0, dy: 28 })
  })

  test("snipers keep firing downward when the pilot is far sideways or above them", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      for (const playerY of [30, 50]) {
        const state = arena()
        state.player.x = 85
        state.player.y = playerY
        const sniper = target(20, 40)
        sniper.fireType = "aimed"
        sniper.fireCd = 0
        state.enemies = [sniper]
        updateGame(state, 0, state.start, 120, 60, 0)
        const bullet = state.bullets[0]!
        expect(bullet.dy).toBeGreaterThan(0)
        expect(Math.abs(bullet.dx!)).toBeLessThanOrEqual(bullet.dy)
        expect(Math.hypot(bullet.dx!, bullet.dy)).toBeCloseTo(28)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("aimed bosses cannot fire sideways or upward at a pilot above the muzzle", () => {
    const state = newGame(120, 30, 6)
    updateGame(state, 0, state.start, 120, 30, 0)
    const boss = state.enemies[0]!
    boss.backupCalled = true
    boss.summonCd = Infinity
    boss.fireCd = 0
    state.player.x = 85
    state.player.y = 15
    updateGame(state, 0, state.start, 120, 30, 0)
    const bullet = state.bullets[0]!
    expect(bullet.dy).toBeGreaterThan(0)
    expect(Math.hypot(bullet.dx!, bullet.dy)).toBeCloseTo(17)
    expect(Math.abs(bullet.dx!)).toBeLessThanOrEqual(bullet.dy)
    expect(state.player.hp).toBe(3)
  })
})
