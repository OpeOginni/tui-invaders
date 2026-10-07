import { describe, expect, spyOn, test } from "bun:test"
import { InvadersGame } from "../src/embed.js"
import { gunCostToNext, newGame, resizeGameState, shoot, updateGame } from "../src/game.js"

describe("game progression", () => {
  test("spawns bosses at rounds 3, 6, 9 and preserves the pattern rotation", () => {
    const state = newGame(120, 60)
    const bosses: Array<[number, string | undefined]> = []
    for (let wave = 1; wave <= 18; wave++) {
      state.enemies = []
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.wave).toBe(wave)
      const boss = state.enemies.find((enemy) => enemy.isBoss)
      if (boss) bosses.push([wave, boss.bossPattern])
    }
    expect(bosses).toEqual([
      [3, "spread3"], [6, "aimed"], [9, "rapidCenter"],
      [12, "wide5"], [15, "burst"], [18, "spread3"],
    ])
  })

  test("Dax staggers all three lanes, randomizes the first shot, and rests between volleys", () => {
    const random = spyOn(Math, "random")
    try {
      for (const [roll, firstDx] of [[0, -8], [0.5, 0], [0.99, 8]]) {
        random.mockReturnValue(roll!)
        const state = newGame(120, 80)
        state.wave = 2
        updateGame(state, 0, state.start, 120, 80, 0)
        const boss = state.enemies[0]!
        boss.fireCd = 0
        let time = state.start
        const advance = (dt: number) => {
          time += dt * 1000
          updateGame(state, dt, time, 120, 80, 0)
        }
        advance(0)
        expect(state.bullets).toHaveLength(1)
        expect(state.bullets[0]!.dx).toBe(firstDx!)
        advance(0.2)
        expect(state.bullets).toHaveLength(1)
        advance(0.26)
        expect(state.bullets).toHaveLength(2)
        advance(0.46)
        expect(state.bullets).toHaveLength(3)
        expect(state.bullets.map((bullet) => bullet.dx).sort((a, b) => a! - b!)).toEqual([-8, 0, 8])
        advance(1)
        expect(state.bullets).toHaveLength(3)
        advance(0.61)
        expect(state.bullets).toHaveLength(4)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("the second boss aims at distant player lanes and recovers faster below half health", () => {
    for (const [health, rest] of [[1, 1.8], [0.5, 1.35]] as const) {
      const state = newGame(120, 60, 6)
      updateGame(state, 0, state.start, 120, 60, 0)
      const boss = state.enemies[0]!
      boss.hp = boss.maxHp * health
      // Isolate shooting from the provider's separate backup transition.
      boss.backupCalled = true
      boss.summonCd = Infinity
      state.player.x = 85
      for (let shot = 0; shot < 3; shot++) {
        boss.fireCd = 0
        updateGame(state, 0, state.start, 120, 60, 0)
        const bullet = state.bullets[shot]!
        const travelTime = (state.player.y - bullet.y) / bullet.dy
        expect(bullet.x + bullet.dx! * travelTime).toBeCloseTo(state.player.x)
        expect(boss.fireCd).toBe(shot < 2 ? 0.45 : rest)
      }
      state.player.x = 20
      boss.fireCd = 0
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.bullets[3]!.dx).toBeLessThan(0)
      // Dodging does not retarget bullets already in flight.
      expect(state.bullets[0]!.dx).toBeGreaterThan(0)
    }
  })

  test("sniper projectiles travel faster than other regular shots throughout a run", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      for (const seconds of [0, 600, 1800]) {
        const state = newGame(120, 60, 8)
        updateGame(state, 0, state.start, 120, 60, 0)
        const sniper = state.enemies.find((enemy) => enemy.fireType === "aimed")!
        const burster = state.enemies.find((enemy) => enemy.fireType === "burst")!
        const standard = state.enemies.filter((enemy) => enemy.fireType === "standard").at(-1)!
        state.enemies = [sniper, burster, standard]
        for (const enemy of state.enemies) enemy.fireCd = 0
        const now = state.start + seconds * 1000
        updateGame(state, 0, now, 120, 60, 0)
        expect(state.bullets).toHaveLength(3)
        const bulletFor = (enemy: typeof sniper) => state.bullets.find((bullet) =>
          bullet.x === Math.round(enemy.x) && bullet.y === Math.round(enemy.y + enemy.sprite.length))!
        const sniperBullet = bulletFor(sniper)
        const standardBullet = bulletFor(standard)
        const bursterBullet = bulletFor(burster)
        const sniperSpeed = Math.hypot(sniperBullet.dx ?? 0, sniperBullet.dy)
        expect(sniperSpeed).toBeGreaterThanOrEqual(28 - 1e-6)
        expect(sniperSpeed).toBeGreaterThan(standardBullet.dy)
        expect(sniperSpeed).toBeGreaterThan(bursterBullet.dy)
        expect(sniperBullet.damage).toBe(1)
        expect(sniperBullet.friendly).toBe(false)
        expect(sniper.fireCd).toBe(1.6)
        const y = sniperBullet.y
        updateGame(state, 0.25, now + 250, 120, 60, 0)
        expect(sniperBullet.y - y).toBeCloseTo(sniperBullet.dy * 0.25)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("creates a centered player and clamps it when resized", () => {
    const state = newGame(80, 30)
    expect(state.player.x).toBe(40)
    resizeGameState(state, 80, 60, 24)
    expect(state.player.x).toBe(30)
    expect(state.player.y).toBe(18)
  })

  test("respects shot cooldown and permanent gun levels", () => {
    const state = newGame(80, 30)
    const first = shoot(state, 1_000, 0)
    expect(first).toBe(1_000)
    expect(state.bullets).toHaveLength(1)
    expect(shoot(state, 1_050, first)).toBe(first)
    expect(state.bullets).toHaveLength(1)

    state.gunLevel = 5
    shoot(state, 2_000, first)
    expect(state.bullets).toHaveLength(3)
    expect(gunCostToNext(8)).toBe(0)
  })
})

describe("embeddable session", () => {
  test("supports host-driven input, resize, pause, and restart", async () => {
    const game = new InvadersGame(80, 30)
    game.start()
    await game.tap({ name: "p" })
    expect(game.paused).toBe(true)
    await game.tap({ name: "space" })
    expect(game.state.bullets).toHaveLength(0)
    await game.tap({ name: "escape" })
    expect(game.paused).toBe(false)
    await game.tap({ name: "escape" })
    expect(game.paused).toBe(true)
    game.resize(100, 40)
    expect(game.size).toEqual({ width: 100, height: 40 })
    game.state.gameOver = true
    await game.tap({ name: "r" })
    expect(game.state.gameOver).toBe(false)
    expect(game.paused).toBe(false)
  })
})
