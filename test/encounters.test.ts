import { describe, expect, spyOn, test } from "bun:test"
import { newGame, resizeGameState, shoot, updateGame } from "../src/game.js"
import { GEMINI_METEOR_SPRITE, PROVIDERS } from "../src/bosses.js"
import { bossArt } from "../src/sprites.js"
import { BOSS_INTRO_DURATION } from "../src/cinematic.js"
import type { Enemy, GameState } from "../src/types.js"

function spawnBoss(wave: number, width = 120, height = 60) {
  const state = newGame(width, height)
  state.wave = wave - 1
  updateGame(state, 0, state.start, width, height, 0)
  return state
}

function hit(state: GameState, enemy: Enemy, damage: number, seconds: number) {
  // A one-cell target isolates reward/collision behavior from animation frames.
  enemy.frames = undefined
  enemy.sprite = ["█"]
  enemy.fireCd = 999
  state.bullets = [{ x: Math.round(enemy.x - 0.5), y: enemy.y, dy: 0, damage, friendly: true }]
  updateGame(state, 0, state.start + seconds * 1000, 120, 60, 0)
}

function callBackup(state: GameState) {
  state.enemies[0]!.hp = state.enemies[0]!.maxHp * 0.75
  updateGame(state, 0, state.start, 120, 60, 0)
}

function finishBackupCall(state: GameState) {
  callBackup(state)
  updateGame(state, BOSS_INTRO_DURATION, state.start + BOSS_INTRO_DURATION * 1000, 120, 60, 0)
}

describe("boss operations", () => {
  test("Luke fires a sweeping volley, then leaves a two-second return-fire window", () => {
    const state = spawnBoss(9)
    const boss = state.enemies[0]!
    boss.fireCd = 0
    state.player.x = 5
    updateGame(state, 0, state.start, 120, 60, 0)
    updateGame(state, 0.31, state.start + 310, 120, 60, 0)
    updateGame(state, 0.31, state.start + 620, 120, 60, 0)
    expect(state.bullets.map((bullet) => bullet.dx).sort((a, b) => a! - b!)).toEqual([-8, -8, 0, 0, 8, 8])
    expect(boss.fireCd).toBe(2.2)
    state.bullets = []
    updateGame(state, 2, state.start + 2620, 120, 60, 0)
    expect(state.bullets).toHaveLength(0)
    updateGame(state, 0.21, state.start + 2830, 120, 60, 0)
    expect(state.bullets).toHaveLength(2)
  })

  test("Luke can start a volley in any direction, with each direction used once", () => {
    const random = spyOn(Math, "random")
    try {
      for (const [roll, firstDx] of [[0, -8], [0.5, 0], [0.99, 8]]) {
        random.mockReturnValue(roll!)
        const state = spawnBoss(9)
        const boss = state.enemies[0]!
        boss.fireCd = 0
        updateGame(state, 0, state.start, 120, 60, 0)
        expect(state.bullets[0]!.dx).toBe(firstDx!)
        updateGame(state, 0.31, state.start + 310, 120, 60, 0)
        updateGame(state, 0.31, state.start + 620, 120, 60, 0)
        expect(new Set(state.bullets.map((bullet) => bullet.dx))).toEqual(new Set([-8, 0, 8]))
        expect(boss.fireCd).toBe(2.2)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("Gemini stars dive only after a surviving hit and grow away from the player", () => {
    const state = spawnBoss(9)
    finishBackupCall(state)
    const boss = state.enemies[0]!
    boss.summonCd = Infinity
    for (const enemy of state.enemies) {
      enemy.fireCd = Infinity
    }
    updateGame(state, 12, state.start + 16000, 120, 60, 0)
    expect(state.enemies.some((enemy) => enemy.meteorPhase)).toBe(false)
    const star = state.enemies[1]!
    state.bullets.push({ x: star.x, y: star.y + 2, dy: 0, damage: 1, friendly: true })
    updateGame(state, 0, state.start + 16000, 120, 60, 0)
    expect(star.hp).toBe(star.maxHp - 1)
    const bottom = star.y + star.sprite.length
    const x = star.x
    expect(star.meteorPhase).toBe("warning")
    expect(state.enemies.filter((enemy) => enemy.meteorPhase)).toHaveLength(1)
    const warningHp = star.hp
    state.bullets.push({ x: star.x, y: star.y + 2, dy: 0, damage: 99, friendly: true })
    updateGame(state, 0.6, state.start + 16600, 120, 60, 0)
    expect(star.meteorPhase).toBe("warning")
    expect(star.hp).toBe(warningHp)
    expect(star.x).toBe(x)
    updateGame(state, 0.51, state.start + 17110, 120, 60, 0)
    expect(star.meteorPhase).toBe("falling")
    expect(star.sprite).toBe(GEMINI_METEOR_SPRITE)
    expect(star.maxHp).toBeGreaterThanOrEqual(13)
    expect(star.y + star.sprite.length).toBe(bottom)
    expect(state.bullets).toHaveLength(0)
    expect(state.enemies.filter((enemy) => enemy.meteorPhase)).toHaveLength(1)

    for (const enemy of state.enemies) if (enemy !== star) enemy.meteorCd = Infinity
    state.player.x = 115
    for (let tick = 1; tick <= 200; tick++) updateGame(state, 0.05, state.start + 17110 + tick * 50, 120, 60, 0)
    expect(state.enemies).not.toContain(star)
    expect(state.gameOver).toBe(false)
    expect(state.player.hp).toBe(3)
    expect(state.drops).toHaveLength(0)
  })

  test("a falling star collision costs one life rather than ending the game at the player line", () => {
    const state = spawnBoss(9)
    finishBackupCall(state)
    for (const enemy of state.enemies) {
      enemy.fireCd = Infinity
      enemy.meteorCd = Infinity
    }
    const star = state.enemies[1]!
    star.meteorPhase = "falling"
    star.sprite = GEMINI_METEOR_SPRITE
    star.x = state.player.x
    star.y = state.player.y - 4
    updateGame(state, 0, state.start + 4000, 120, 60, 0)
    expect(state.player.hp).toBe(2)
    expect(state.enemies).not.toContain(star)
    expect(state.gameOver).toBe(false)
  })

  test("backup starts once after 25% damage, never on arrival or after a lethal hit", () => {
    for (const wave of [6, 9]) {
      const state = spawnBoss(wave)
      const boss = state.enemies[0]!
      boss.summonCd = 0
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.enemies).toHaveLength(1)
      expect(state.bossIntro).toBeUndefined()
      hit(state, boss, boss.maxHp * 0.25 - 1, 1)
      expect(state.bossIntro).toBeUndefined()
      hit(state, boss, 1, 2)
      expect(state.bossIntro).toBeDefined()
      expect(boss.backupCalled).toBe(true)
      expect(state.enemies).toHaveLength(1)
      updateGame(state, BOSS_INTRO_DURATION, state.start + 5800, 120, 60, 0)
      expect(state.enemies).toHaveLength(wave === 9 ? 5 : 4)
      hit(state, boss, 1, 6)
      expect(state.bossIntro).toBeUndefined()

      const lethal = spawnBoss(wave)
      hit(lethal, lethal.enemies[0]!, lethal.enemies[0]!.hp, 1)
      expect(lethal.bossIntro).toBeUndefined()
      expect(lethal.enemies).toHaveLength(0)
    }
  })

  test("round 9 is Hona's Gemini operation; later encounters return to regular Dax", () => {
    const hona = spawnBoss(9)
    expect(hona.bossIntro).toBeUndefined()
    callBackup(hona)
    expect(hona.bossIntro?.title).toBe("Gemini For Life")
    expect(hona.bossIntro?.bossName).toBe("LUKE")
    expect(hona.enemies[0]!.bossCharacter).toBe("hona")
    expect(hona.enemies[0]!.frames).toBe(bossArt("hona", 60).frames)
    resizeGameState(hona, 120, 60, 24)
    expect(hona.enemies[0]!.frames).toBe(bossArt("hona", 24).frames)

    for (const wave of [12, 15, 18, 21, 24, 27, 30]) {
      const state = spawnBoss(wave)
      const boss = state.enemies[0]!
      expect(boss.bossCharacter).toBe("dax")
      expect(boss.name).toStartWith("DAX")
      expect(boss.provider).toBeUndefined()
      expect(state.bossIntro).toBeUndefined()
      boss.summonCd = 0
      updateGame(state, 0, state.start, 120, 60, 0)
      expect(state.enemies).toHaveLength(1)
    }
  })

  test("later bosses announce the operation and freeze combat during its title card", () => {
    const state = spawnBoss(6)
    callBackup(state)
    expect(state.bossIntro?.title).toBe("Operation Cheepseek")
    expect(state.enemies[0]!.provider).toBe("deepseek")
    const x = state.player.x
    state.rapidUntil = state.start + 9000
    state.bullets.push({ x: 10, y: 10, dy: 10, friendly: false, damage: 1 })
    updateGame(state, 1, state.start + 1000, 120, 60, 1)
    expect(state.bullets.find((bullet) => !bullet.friendly)!.y).toBe(10)
    expect(state.player.x).toBe(x)
    expect(shoot(state, state.start + 1000, 0)).toBe(0)
    updateGame(state, 3, state.start + 4000, 120, 60, 0)
    expect(state.bossIntro).toBeUndefined()
    expect(state.enemies).toHaveLength(4)
    expect(state.rapidUntil - (state.start + 4000)).toBeCloseTo(9000)
    expect(shoot(state, state.start + 4000, 0)).toBe(state.start + 4000)
  })

  test("each provider brings its own escort sprite and attack", () => {
    for (const [index, provider] of (["deepseek", "gemini"] as const).entries()) {
      const state = spawnBoss(6 + index * 3)
      finishBackupCall(state)
      const boss = state.enemies[0]!
      boss.fireCd = 999
      updateGame(state, 0, state.start, 120, 60, 0)
      const escorts = state.enemies.filter((enemy) => !enemy.isBoss)
      expect(escorts).toHaveLength(provider === "gemini" ? 4 : 3)
      expect(escorts[0]!.sprite).toEqual(PROVIDERS[provider].sprite)
      escorts[0]!.fireCd = 0
      updateGame(state, 0, state.start, 120, 60, 0)
      const shots = state.bullets.filter((bullet) => !bullet.friendly)
      expect(shots).toHaveLength(2)
      if (provider === "deepseek") expect(shots.map((shot) => shot.dx)).toEqual([4, -4])
      if (provider === "gemini") expect(shots.map((shot) => shot.dx)).toEqual([-5, 5])
    }
  })

  test("Luke replenishes four stars more frequently than Dax's three whales", () => {
    for (const wave of [6, 9]) {
      const state = spawnBoss(wave)
      finishBackupCall(state)
      const boss = state.enemies[0]!
      state.player.shieldUntil = Infinity
      boss.fireCd = Infinity
      let seconds = BOSS_INTRO_DURATION
      const interval = wave === 9 ? 5.5 : 9
      const squadSize = wave === 9 ? 5 : 4
      for (let cycle = 0; cycle < 5; cycle++) {
        expect(state.enemies).toHaveLength(squadSize)
        state.enemies = [boss]
        updateGame(state, interval - 0.1, state.start + (seconds += interval - 0.1) * 1000, 120, 60, 0)
        expect(state.enemies).toHaveLength(1)
        updateGame(state, 0.11, state.start + (seconds += 0.11) * 1000, 120, 60, 0)
        expect(state.enemies).toHaveLength(squadSize)
      }
      boss.summonCd = 0
      updateGame(state, 0, state.start + seconds * 1000, 120, 60, 0)
      expect(state.enemies).toHaveLength(squadSize)
      hit(state, boss, boss.hp, seconds + 1)
      expect(state.enemies).toHaveLength(0)
      updateGame(state, 0, state.start + (seconds + 2) * 1000, 120, 60, 0)
      expect(state.wave).toBe(wave + 1)
    }
  })

  test("a lone escort patrols both arena edges; a full squad uses smaller lanes", () => {
    for (const wave of [6, 9]) {
      const state = spawnBoss(wave)
      finishBackupCall(state)
      resizeGameState(state, 120, 60, 60)
      const boss = state.enemies[0]!
      boss.summonCd = Infinity
      for (const enemy of state.enemies) {
        enemy.fireCd = Infinity
        enemy.meteorCd = Infinity
      }
      const escort = state.enemies[1]!
      const halfWidth = Math.ceil(Math.max(...escort.sprite.map((row) => row.length)) / 2)
      const track = (start: number) => {
        let min = Infinity
        let max = -Infinity
        for (let tick = 1; tick <= 600; tick++) {
          updateGame(state, 0.05, state.start + (start + tick * 0.05) * 1000, 60, 60, 0)
          min = Math.min(min, escort.x)
          max = Math.max(max, escort.x)
        }
        return { min, max }
      }
      const crowded = track(4)
      state.enemies = [boss, escort]
      const alone = track(34)
      expect(alone.min).toBeCloseTo(halfWidth + 1)
      expect(alone.max).toBeCloseTo(60 - halfWidth - 2)
      expect(alone.max - alone.min).toBeGreaterThan((crowded.max - crowded.min) * 2)
    }
  })

  test("escorts roll for pickups only on direct kills, not damage or the boss death cascade", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      for (const wave of [6, 9]) {
        const state = spawnBoss(wave)
        finishBackupCall(state)
        const boss = state.enemies[0]!
        const escort = state.enemies[1]!
        hit(state, escort, 1, 5)
        expect(state.drops).toHaveLength(0)
        random.mockReturnValue(0.99)
        const untouched = state.enemies.find((enemy) => !enemy.isBoss && enemy !== escort)!
        hit(state, untouched, untouched.hp, 6)
        expect(state.drops).toHaveLength(0)
        random.mockReturnValue(0)
        const nextUntouched = state.enemies.find((enemy) => !enemy.isBoss && enemy !== escort)!
        hit(state, nextUntouched, 100, 9)
        expect(state.drops).toHaveLength(1)
        state.drops = []
        hit(state, boss, boss.hp, 20)
        expect(state.enemies).toHaveLength(0)
        expect(state.drops).toHaveLength(0)
      }
    } finally {
      random.mockRestore()
    }
  })

  test("boss and escorts fit the smallest arena, including after a resize", () => {
    for (const wave of [3, 6, 9, 12, 15]) {
      const state = spawnBoss(wave)
      if (state.enemies[0]!.provider) finishBackupCall(state)
      resizeGameState(state, 120, 60, 24)
      const boss = state.enemies[0]!
      boss.summonCd = 0
      updateGame(state, 0.05, state.start + 50, 60, 24, 0)
      expect(state.gameOver).toBe(false)
      expect(state.enemies.every((enemy) => enemy.y + enemy.sprite.length < state.player.y - 1)).toBe(true)
      const small = spawnBoss(wave, 60, 24)
      expect(small.gameOver).toBe(false)
    }
  })
})

describe("pickup pacing", () => {
  test("boss hits can reward progress before a kill, with cooldown and encounter budget", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      const state = spawnBoss(3)
      const boss = state.enemies[0]!
      expect(boss.maxHp).toBeGreaterThan(100)
      hit(state, boss, 9, 1)
      expect(boss.hp).toBeGreaterThan(0)
      expect(state.drops).toHaveLength(1)
      state.drops = []
      hit(state, boss, 9, 2)
      expect(state.drops).toHaveLength(0)
      for (const seconds of [4, 7, 10, 13, 16, 19]) {
        state.drops = []
        hit(state, boss, 9, seconds)
      }
      expect(state.dropsThisWave).toBe(6)
      state.drops = []
      hit(state, boss, 9, 23)
      expect(state.drops).toHaveLength(0)
    } finally {
      random.mockRestore()
    }
  })

  test("boss rewards are random, not automatic for every damage milestone", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.99)
    try {
      const state = spawnBoss(3)
      hit(state, state.enemies[0]!, 20, 1)
      expect(state.drops).toHaveLength(0)
    } finally {
      random.mockRestore()
    }
  })

  test("dense regular waves cannot flood the screen or exceed their drop budget", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      const state = newGame(120, 60)
      state.wave = 7
      updateGame(state, 0, state.start, 120, 60, 0)
      const targets = [...state.enemies].slice(0, 15)
      for (const [index, enemy] of targets.entries()) hit(state, enemy, 100, index * 5)
      expect(state.drops).toHaveLength(2)
      expect(new Set(state.drops.map((drop) => drop.kind)).size).toBe(2)
      state.drops = []
      for (const [index, enemy] of [...state.enemies].slice(0, 10).entries()) {
        hit(state, enemy, 100, 80 + index * 5)
        state.drops = []
      }
      expect(state.dropsThisWave).toBe(4)
    } finally {
      random.mockRestore()
    }
  })

  test("dry streaks improve regular-wave odds", () => {
    const random = spyOn(Math, "random").mockReturnValue(0.23)
    try {
      const state = newGame(120, 60)
      updateGame(state, 0, state.start, 120, 60, 0)
      for (const [index, enemy] of [...state.enemies].slice(0, 7).entries()) {
        hit(state, enemy, 100, index * 5)
        if (index < 6) expect(state.drops).toHaveLength(0)
      }
      expect(state.drops).toHaveLength(1)
    } finally {
      random.mockRestore()
    }
  })

  test("does not offer upgrades that are already active or maxed", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      const state = spawnBoss(3)
      state.gunLevel = 8
      state.rapidUntil = state.spreadUntil = state.tripleUntil = state.pierceUntil = state.player.shieldUntil = state.start + 100000
      hit(state, state.enemies[0]!, 9, 1)
      expect(state.drops).toHaveLength(0)
    } finally {
      random.mockRestore()
    }
  })
})
