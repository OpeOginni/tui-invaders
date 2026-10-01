import { describe, expect, test } from "bun:test"
import { GEMINI_COLORS, GEMINI_ICON_PIXELS, GEMINI_METEOR_PIXELS, GEMINI_METEOR_SPRITE, GEMINI_STAR_PIXELS, PROVIDERS } from "../src/bosses.js"
import { BOSS_INTRO_DURATION } from "../src/cinematic.js"
import { newGame, resizeGameState, updateGame } from "../src/game.js"
import { toCollisionFrame } from "../src/sprites.js"
import type { Enemy, GameState } from "../src/types.js"

function arena() {
  const state = newGame(120, 60, 9)
  updateGame(state, 0, state.start, 120, 60, 0)
  const boss = state.enemies[0]!
  boss.hp = boss.maxHp * 0.75
  updateGame(state, 0, state.start, 120, 60, 0)
  updateGame(state, BOSS_INTRO_DURATION, state.start + BOSS_INTRO_DURATION * 1000, 120, 60, 0)
  boss.summonCd = Infinity
  for (const enemy of state.enemies) enemy.fireCd = Infinity
  return state
}

function advance(state: GameState, dt: number) {
  updateGame(state, dt, state.start + (state.elapsed + dt) * 1000, 120, 60, 0)
}

function shootStar(state: GameState, star: Enemy, damage: number, pierce?: number) {
  state.bullets.push({ x: star.x, y: star.y + Math.floor(star.sprite.length / 2), dy: 0, damage, friendly: true, pierce })
  advance(state, 0)
}

describe("Gemini star silhouettes", () => {
  for (const [name, pixels] of [["icon", GEMINI_ICON_PIXELS], ["escort", GEMINI_STAR_PIXELS], ["meteor", GEMINI_METEOR_PIXELS]] as const) {
    test(`${name} is a connected, symmetric four-point sparkle with matching collision art`, () => {
      const size = pixels.length
      const center = Math.floor(size / 2)
      const filled = (row: number, col: number) => pixels[row]![col] !== " "
      expect(pixels.every((row) => row.length === size)).toBe(true)
      expect([...pixels[0]!].filter((pixel) => pixel !== " ")).toHaveLength(1)
      expect([...pixels[1]!].filter((pixel) => pixel !== " ")).toHaveLength(3)
      expect([...pixels[size - 2]!].filter((pixel) => pixel !== " ")).toHaveLength(3)
      expect([...pixels[center]!].every((pixel) => pixel !== " ")).toBe(true)
      // Fuller arms still curve inward rather than becoming a filled diamond.
      const shoulderRow = Math.floor(center / 2)
      expect([...pixels[shoulderRow]!].filter((pixel) => pixel !== " ").length).toBeLessThan(shoulderRow * 2 + 1)
      const collision = toCollisionFrame([...pixels])
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          expect(filled(row, col)).toBe(filled(col, row))
          expect(filled(row, col)).toBe(filled(size - 1 - row, col))
          expect(filled(row, col)).toBe(filled(row, size - 1 - col))
          if (filled(row, col)) {
            expect(GEMINI_COLORS[pixels[row]![col]!]).toBeDefined()
            const towardCenter = row === center ? col + Math.sign(center - col) : col
            expect(filled(row + Math.sign(center - row), towardCenter)).toBe(true)
          }
        }
      }
      for (let row = 0; row < collision.length; row++) {
        for (let col = 0; col < size; col++) {
          expect(collision[row]![col] !== " ").toBe(filled(row * 2, col) || (row * 2 + 1 < size && filled(row * 2 + 1, col)))
        }
      }
    })
  }

  test("escort and meteor hitboxes are exactly the visible pixel masks", () => {
    expect(PROVIDERS.gemini.sprite).toEqual(toCollisionFrame(GEMINI_STAR_PIXELS))
    expect(GEMINI_METEOR_SPRITE).toEqual(toCollisionFrame(GEMINI_METEOR_PIXELS))
  })
})

describe("readable Gemini movement", () => {
  test("patrol velocity eases through turns and lane expansion without teleporting", () => {
    const state = arena()
    const star = state.enemies[1]!
    let turns = 0
    for (let tick = 0; tick < 600; tick++) {
      if (tick === 300) state.enemies = [state.enemies[0]!, star]
      const x = star.x
      const velocity = star.patrolSpeed ?? 0
      const direction = star.patrolDirection
      advance(state, 0.05)
      expect(Math.abs(star.x - x)).toBeLessThanOrEqual(8.8 * 0.05 + 1e-6)
      expect(Math.abs((star.patrolSpeed ?? 0) - velocity)).toBeLessThanOrEqual(12 * 0.05 + 1e-6)
      if (star.patrolDirection !== direction) turns++
    }
    expect(turns).toBeGreaterThan(3)
  })

  test("a dive locks its warned lane and accelerates without frame-rate dependence", () => {
    const falls = [0.01, 0.05, 0.2].map((dt) => {
      const state = arena()
      const star = state.enemies[1]!
      shootStar(state, star, 1)
      const x = star.x
      const bottom = star.y + star.sprite.length
      advance(state, 1.1)
      expect(star.meteorPhase).toBe("falling")
      expect(star.x).toBe(x)
      expect(star.y + star.sprite.length).toBe(bottom)
      const y = star.y
      for (let tick = 0; tick < Math.round(0.2 / dt); tick++) advance(state, dt)
      const earlyDistance = star.y - y
      expect(earlyDistance).toBeCloseTo(0.96)
      for (let tick = 0; tick < Math.round(1.8 / dt); tick++) advance(state, dt)
      expect(star.x).toBe(x)
      expect(star.y - y).toBeCloseTo(20)
      return star.y
    })
    expect(falls[0]).toBeCloseTo(falls[1]!)
    expect(falls[1]).toBeCloseTo(falls[2]!)
  })

  test("small arenas and resizes keep the future meteor inside the frame", () => {
    const state = arena()
    resizeGameState(state, 120, 60, 24)
    for (const star of state.enemies.filter((enemy) => !enemy.isBoss)) {
      expect(star.x).toBeGreaterThanOrEqual(11)
      expect(star.x).toBeLessThanOrEqual(48)
    }
  })
})

describe("dodge-only dives", () => {
  test("committed stars ignore lethal shots in both phases, including piercing bullets", () => {
    const state = arena()
    const star = state.enemies[1]!
    shootStar(state, star, 1)
    expect(star.meteorPhase).toBe("warning")
    const hp = star.hp
    const score = state.score
    for (const phase of ["warning", "falling"] as const) {
      if (phase === "falling") advance(state, 1.1)
      state.bullets = []
      shootStar(state, star, 999, 3)
      expect(star.hp).toBe(hp)
      expect(state.enemies).toContain(star)
      expect(state.bullets).toHaveLength(1)
      expect(state.bullets[0]!.pierce).toBe(3)
      expect(state.score).toBe(score)
      expect(state.drops).toHaveLength(0)
    }
  })

  test("uncommitted stars can still be killed outright", () => {
    const state = arena()
    const star = state.enemies[1]!
    shootStar(state, star, star.hp)
    expect(state.enemies).not.toContain(star)
    expect(state.enemies.some((enemy) => enemy.meteorPhase)).toBe(false)
    expect(state.score).toBe(star.points)
  })

  test("only one damaged star commits at a time", () => {
    const state = arena()
    const first = state.enemies[1]!
    const second = state.enemies[2]!
    shootStar(state, first, 1)
    shootStar(state, second, 1)
    expect(first.meteorPhase).toBe("warning")
    expect(second.hp).toBe(second.maxHp - 1)
    expect(second.meteorPhase).toBeUndefined()
    state.bullets = []
    state.player.x = 115
    advance(state, 1.1)
    expect(state.enemies.filter((enemy) => enemy.meteorPhase)).toHaveLength(1)
    for (let tick = 0; tick < 120; tick++) advance(state, 0.05)
    expect(state.enemies).not.toContain(first)
    expect(second.meteorPhase).toBeDefined()
  })

  test("shields protect against a falling star, without awarding kill rewards", () => {
    const state = arena()
    const star = state.enemies[1]!
    shootStar(state, star, 1)
    advance(state, 1.1)
    state.player.shieldUntil = Infinity
    star.x = state.player.x
    star.y = state.player.y - 4
    advance(state, 0)
    expect(state.enemies).not.toContain(star)
    expect(state.player.hp).toBe(3)
    expect(state.gameOver).toBe(false)
    expect(state.score).toBe(0)
    expect(state.drops).toHaveLength(0)
  })

  test("defeating HONA clears even committed stars", () => {
    const state = arena()
    shootStar(state, state.enemies[1]!, 1)
    advance(state, 1.1)
    const boss = state.enemies[0]!
    boss.frames = undefined
    boss.sprite = ["█"]
    state.bullets = [{ x: Math.round(boss.x - 0.5), y: boss.y, dy: 0, damage: boss.hp, friendly: true }]
    advance(state, 0)
    expect(state.enemies).toHaveLength(0)
    expect(state.gameOver).toBe(false)
    expect(state.score).toBe(boss.points)
  })
})
