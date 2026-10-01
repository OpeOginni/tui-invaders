import { describe, expect, spyOn, test } from "bun:test"
import { gunCostToNext, newGame, shoot, updateGame } from "../src/game.js"
import { BRUISER_SPRITES, SCOUT_SPRITES } from "../src/sprites.js"
import type { Enemy, GameState } from "../src/types.js"

function spawn(wave = 1, width = 120, height = 60) {
  const state = newGame(width, height, wave)
  updateGame(state, 0, state.start, width, height, 0)
  return state
}

function kill(state: GameState, enemies: Enemy[], seconds = 0) {
  for (const enemy of enemies) {
    enemy.frames = undefined
    enemy.sprite = ["█"]
    enemy.fireCd = Infinity
    state.bullets.push({ x: enemy.x - 0.5, y: enemy.y, dy: 0, damage: enemy.hp, friendly: true })
  }
  updateGame(state, 0, state.start + seconds * 1000, 120, 60, 0)
}

describe("balanced progression", () => {
  test("wave clears guarantee gun progression even without any pickups", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      const expectedLevels = [2, 2, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8]
      for (const [index, expected] of expectedLevels.entries()) {
        kill(state, [...state.enemies])
        expect(state.enemies).toHaveLength(0)
        expect(state.drops).toHaveLength(0)
        expect(state.gunLevel).toBe(expected)
        expect(state.gunXP).toBeLessThan(gunCostToNext(expected) || 1)
        const xp = state.gunXP
        updateGame(state, 0, state.start, 120, 60, 0)
        expect(state.wave).toBe(index + 2)
        expect(state.gunLevel).toBe(expected)
        expect(state.gunXP).toBe(xp)
      }
      expect(state.gameOver).toBe(false)
    } finally {
      random.mockRestore()
    }
  })

  test("only surviving clears reward XP; partial waves and arrival do not", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      expect(state.gunLevel).toBe(1)
      kill(state, [state.enemies[0]!])
      expect(state.gunLevel).toBe(1)
      expect(state.gunXP).toBe(0)
      state.player.hp = 0
      kill(state, [...state.enemies])
      expect(state.gameOver).toBe(true)
      expect(state.gunLevel).toBe(1)
      expect(state.gunXP).toBe(0)
    } finally {
      random.mockRestore()
    }
  })

  test("boss clears grant two XP and overflow becomes score, not unusable XP", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const boss = spawn(3)
      kill(boss, [...boss.enemies])
      expect(boss.gunLevel).toBe(2)
      expect(boss.gunXP).toBe(1)

      const maxing = spawn(3)
      maxing.gunLevel = 7
      maxing.gunXP = 3
      kill(maxing, [...maxing.enemies])
      expect(maxing.gunLevel).toBe(8)
      expect(maxing.gunXP).toBe(0)
      expect(maxing.score).toBe(1550)

      const maxed = spawn(3)
      maxed.gunLevel = 8
      kill(maxed, [...maxed.enemies])
      expect(maxed.score).toBe(1600)
      expect(maxed.gunXP).toBe(0)
    } finally {
      random.mockRestore()
    }
  })

  test("gun pickups still accelerate the guaranteed clear progression", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      state.drops.push({ x: state.player.x, y: state.player.y, kind: "gun", ttl: 12 })
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.gunLevel).toBe(2)
      kill(state, [...state.enemies])
      expect(state.gunLevel).toBe(2)
      expect(state.gunXP).toBe(1)
      expect(state.drops).toHaveLength(0)
    } finally {
      random.mockRestore()
    }
  })

  test("formations grow slowly and stop at 24 enemies", () => {
    const counts = [1, 2, 4, 5, 8, 10, 13, 16, 25, 100].map((wave) => spawn(wave).enemies.length)
    expect(counts).toEqual([10, 10, 15, 18, 18, 21, 24, 24, 24, 24])
    expect(spawn(100, 240, 100).enemies).toHaveLength(24)
  })

  test("small terminals get formations with space to descend and no overlapping columns", () => {
    for (const wave of [1, 4, 8, 13, 25, 100]) {
      const state = spawn(wave, 60, 24)
      expect(state.enemies).toHaveLength(8)
      expect(state.gameOver).toBe(false)
      expect(state.enemies.every((enemy) => enemy.y + enemy.sprite.length < state.player.y - 3)).toBe(true)
      const row = state.enemies.filter((enemy) => enemy.baseY === 2)
      for (let i = 1; i < row.length; i++) {
        expect(row[i]!.x - row[i - 1]!.x).toBeGreaterThanOrEqual(10)
      }
    }
  })

  test("regular enemy armor increases independently of lucky gun upgrades", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const stats = [1, 4, 7, 10, 16, 19, 25].map((wave) => {
        const state = spawn(wave)
        const scout = state.enemies.find((enemy) => SCOUT_SPRITES.includes(enemy.sprite))!
        const bruiser = state.enemies.find((enemy) => BRUISER_SPRITES.includes(enemy.sprite))!
        expect(scout.hp).toBe(scout.maxHp)
        expect(bruiser.hp).toBe(bruiser.maxHp)
        return [scout.hp, bruiser.hp]
      })
      expect(stats).toEqual([[1, 2], [2, 4], [3, 5], [4, 7], [5, 8], [6, 10], [7, 12]])

      const state = newGame(120, 60, 10)
      state.gunLevel = 8
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.enemies.find((enemy) => SCOUT_SPRITES.includes(enemy.sprite))!.hp).toBe(4)
    } finally {
      random.mockRestore()
    }
  })

  test("no-pickup gun damage keeps pace with scouts through the progression curve", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      for (let wave = 1; wave <= 25; wave++) {
        shoot(state, state.start + 1000, 0)
        const damage = state.bullets[0]!.damage
        const scouts = state.enemies.filter((enemy) => SCOUT_SPRITES.includes(enemy.sprite))
        for (const scout of scouts) {
          expect(Math.ceil(scout.hp / damage)).toBe(wave < 19 ? 1 : 2)
        }
        state.bullets = []
        kill(state, [...state.enemies])
        updateGame(state, 0, state.start, 120, 60, 0)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("level 7 adds piercing without losing level 6's barrels or damage", () => {
    for (const level of [6, 7, 8]) {
      const state = newGame(120, 60)
      state.gunLevel = level
      shoot(state, 1000, 0)
      expect(state.bullets).toHaveLength(3)
      expect(state.bullets.map((bullet) => bullet.damage)).toEqual(Array(3).fill(level === 8 ? 5 : 4))
      expect(state.bullets.map((bullet) => bullet.pierce)).toEqual(Array(3).fill(level >= 7 ? 1 : undefined))
    }
  })
})

describe("modest drop increase", () => {
  test("slightly higher base odds help both unboosted and boosted players", () => {
    const random = spyOn(Math, "random")
    try {
      for (const [boosted, roll] of [[false, 0.16], [true, 0.09]] as const) {
        random.mockReturnValue(roll)
        const state = spawn()
        if (boosted) state.rapidUntil = state.start + 10000
        kill(state, [state.enemies[0]!])
        expect(state.drops).toHaveLength(1)
        expect(state.dropsThisWave).toBe(1)
        kill(state, [state.enemies[0]!], 1)
        expect(state.drops).toHaveLength(1)
        expect(state.dropsThisWave).toBe(1)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("gun pickups have a modestly higher weight without increasing the wave budget", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.26)
    try {
      const state = spawn()
      state.killsSinceDrop = 7
      kill(state, [state.enemies[0]!])
      expect(state.drops[0]!.kind).toBe("gun")
    } finally {
      random.mockRestore()
    }
  })
})
