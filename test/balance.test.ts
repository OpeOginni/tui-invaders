import { describe, expect, spyOn, test } from "bun:test"
import { gunCostToNext, newGame, shoot, updateGame } from "../src/game.js"
import { BRUISER_SPRITES, BURSTER_SPRITES, DREADNOUGHT_SPRITES, SCOUT_SPRITES, SNIPER_SPRITES, hitSprite } from "../src/sprites.js"
import type { Enemy, GameState } from "../src/types.js"
import { BOSS_INTRO_DURATION } from "../src/cinematic.js"

function spawn(wave = 1, width = 120, height = 60) {
  const state = newGame(width, height, wave)
  updateGame(state, 0, state.start, width, height, 0)
  return state
}

function kill(state: GameState, enemies: Enemy[], seconds = 0) {
  const kit = enemies.find((enemy) => enemy.bossCharacter === "kit")
  if (kit) {
    // Progression checks clear both authored stages, not just one hit.
    for (let phase = 0; phase < 3 && kit.hp > 0; phase++) {
      if (state.bossIntro) updateGame(state, BOSS_INTRO_DURATION, state.start + seconds * 1000, 120, 60, 0)
      for (const module of state.enemies) if (module.kitModule) module.hp = 0
      kit.frames = undefined
      kit.sprite = ["█"]
      kit.fireCd = Infinity
      state.bullets = [{ x: kit.x - 0.5, y: kit.y, dy: 0, damage: kit.hp, friendly: true }]
      updateGame(state, 0, state.start + seconds * 1000, 120, 60, 0)
    }
    if (state.kitOutro) updateGame(state, state.kitOutro.remaining, state.start + seconds * 1000, 120, 60, 0)
    return
  }
  for (const enemy of enemies) {
    enemy.frames = undefined
    enemy.sprite = ["█"]
    enemy.fireCd = Infinity
    state.bullets.push({ x: enemy.x - 0.5, y: enemy.y, dy: 0, damage: enemy.hp, friendly: true })
  }
  updateGame(state, 0, state.start + seconds * 1000, 120, 60, 0)
}

describe("balanced progression", () => {
  test("every permanent gun stage respects the two-shot / four-damage cap and its firing interval", () => {
    const stages = [
      [1, 1, 280], [1, 2, 280], [1, 3, 280], [2, 3, 280],
      [2, 4, 280], [2, 4, 220], [2, 4, 190], [2, 4, 170],
    ] as const
    for (const [index, [shots, damage, cooldown]] of stages.entries()) {
      const state = newGame(120, 60)
      state.gunLevel = index + 1
      shoot(state, 1000, 0)
      expect(state.bullets).toHaveLength(shots)
      expect(state.bullets.every((bullet) => bullet.damage === damage)).toBe(true)
      state.bullets = []
      expect(shoot(state, 1000 + cooldown - 1, 1000)).toBe(1000)
      expect(state.bullets).toHaveLength(0)
      expect(shoot(state, 1000 + cooldown, 1000)).toBe(1000 + cooldown)
      expect(state.bullets).toHaveLength(shots)
    }
  })

  test("wave clears guarantee gun progression even without any pickups", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      const expectedLevels = [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 8]
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
      maxing.gunXP = 6
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

  test("one gun pickup per wave reaches level 4 before the second boss", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      for (let wave = 1; wave < 6; wave++) {
        state.drops.push({ x: state.player.x, y: state.player.y, kind: "gun", ttl: 12 })
        updateGame(state, 0, state.start, 120, 60, 0)
        kill(state, [...state.enemies])
        updateGame(state, 0, state.start, 120, 60, 0)
      }
      expect(state.wave).toBe(6)
      expect(state.gunLevel).toBe(4)
      expect(state.gunXP).toBe(3)
      // Pickups still give an advantage over the no-pickup level 3 gun.
      for (let pickup = 0; pickup < 2; pickup++) {
        state.drops.push({ x: state.player.x, y: state.player.y, kind: "gun", ttl: 12 })
        updateGame(state, 0, state.start, 120, 60, 0)
      }
      expect(state.gunLevel).toBe(5)
      expect(state.gunXP).toBe(0)
    } finally {
      random.mockRestore()
    }
  })

  test("boss health grows faster early without counter-scaling gun pickups", () => {
    const health = [3, 6, 9, 12, 15, 18].map((wave) => spawn(wave).enemies[0]!.maxHp)
    expect(health).toEqual([120, 360, 600, 1500, 1080, 1200])
    for (const level of [1, 5, 8]) {
      const state = newGame(120, 60, 6)
      state.gunLevel = level
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.enemies[0]!.hp).toBe(360)
      expect(state.enemies[0]!.maxHp).toBe(360)
    }
  })

  test("the second boss has forty-five level-5 volleys of base health before its recovery", () => {
    const state = spawn(6)
    state.gunLevel = 5
    shoot(state, 1000, 0)
    const damage = state.bullets.reduce((sum, bullet) => sum + bullet.damage, 0)
    expect(damage).toBe(8)
    expect(Math.ceil(state.enemies[0]!.hp / damage)).toBe(45)
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
      expect(stats).toEqual([[1, 2], [3, 12], [3, 12], [3, 12], [4, 16], [5, 16], [6, 16]])

      const state = newGame(120, 60, 10)
      state.gunLevel = 8
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.enemies.find((enemy) => SCOUT_SPRITES.includes(enemy.sprite))!.hp).toBe(3)
    } finally {
      random.mockRestore()
    }
  })

  test("armored ships take two or three full volleys from capped two-barrel guns", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.1)
    try {
      for (const [wave, level] of [[5, 5], [8, 5], [14, 6], [19, 7], [25, 8]] as const) {
        for (const [sprites, volleys] of [
          [BRUISER_SPRITES, 2], [SNIPER_SPRITES, 2],
          [BURSTER_SPRITES, 3], [DREADNOUGHT_SPRITES, 3],
        ] as const) {
          random.mockReturnValue(sprites === BRUISER_SPRITES ? 0.99 : 0.1)
          const state = spawn(wave)
          state.gunLevel = level
          shoot(state, state.start + 1000, 0)
          const damage = state.bullets.reduce((sum, bullet) => sum + bullet.damage, 0)
          const enemies = state.enemies.filter((enemy) => sprites.includes(enemy.sprite))
          // Bruisers and snipers appear at wave 5; heavier ships join later.
          if (wave >= 8 || volleys === 2) expect(enemies.length).toBeGreaterThan(0)
          for (const enemy of enemies) expect(Math.ceil(enemy.hp / damage)).toBe(volleys)
          const target = enemies[0]
          if (!target) continue
          // Exercise both bullets against the real sprite/collision path.
          const row = target.sprite.findIndex((_, y) => [-1, 1].every((dx) =>
            hitSprite(target.x + dx, target.y + y, target.x, target.y, target.sprite)))
          expect(row).toBeGreaterThanOrEqual(0)
          state.enemies = [target]
          target.fireCd = Infinity
          state.player.x = target.x
          for (let volley = 1; volley <= volleys; volley++) {
            state.bullets = []
            const now = state.start + volley * 1000
            shoot(state, now, 0)
            for (const bullet of state.bullets) {
              bullet.y = target.y + row
              bullet.dy = 0
            }
            updateGame(state, 0, now, 120, 60, 0)
            if (volley < volleys) expect(target.hp).toBe(target.maxHp - volley * damage)
            else expect(target.hp).toBeLessThanOrEqual(0)
            expect(state.enemies.includes(target)).toBe(volley < volleys)
          }
        }
      }
    } finally {
      random.mockRestore()
    }
  })

  test("even an early max-level gun cannot one-volley armored ships", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.1)
    try {
      const state = newGame(120, 60, 8)
      state.gunLevel = 8
      updateGame(state, 0, state.start, 120, 60, 0)
      shoot(state, state.start + 1000, 0)
      const damage = state.bullets.reduce((sum, bullet) => sum + bullet.damage, 0)
      for (const enemy of state.enemies) {
        if (!SCOUT_SPRITES.includes(enemy.sprite)) expect(enemy.hp).toBeGreaterThan(damage)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("no-pickup gun damage keeps pace with scouts through the progression curve", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawn()
      for (let wave = 1; wave <= 25; wave++) {
        if (state.bossIntro) updateGame(state, BOSS_INTRO_DURATION, state.start, 120, 60, 0)
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
      expect(state.bullets).toHaveLength(2)
      expect(state.bullets.map((bullet) => bullet.damage)).toEqual(Array(2).fill(4))
      expect(state.bullets.map((bullet) => bullet.pierce)).toEqual(Array(2).fill(level >= 7 ? 1 : undefined))
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
