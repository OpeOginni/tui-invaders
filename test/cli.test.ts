import { describe, expect, test } from "bun:test"
import { parseCliArgs } from "../src/cli.js"
import { InvadersGame } from "../src/embed.js"

describe("starting level", () => {
  test("defaults to level 1 and accepts both flag forms", () => {
    expect(parseCliArgs([]).level).toBe(1)
    expect(parseCliArgs(["--level", "9"]).level).toBe(9)
    expect(parseCliArgs(["--level=6"]).level).toBe(6)
    expect(parseCliArgs(["-h"]).help).toBe(true)
  })

  test("rejects invalid levels and missing values", () => {
    for (const value of ["0", "-1", "1.5", "nine", "Infinity", "", "9007199254740992"]) {
      expect(() => parseCliArgs(["--level", value])).toThrow()
    }
    expect(() => parseCliArgs(["--level"])).toThrow()
  })

  test("starts at Hona and restarts there without resetting progression rules", () => {
    const game = new InvadersGame(120, 60, [], undefined, 9)
    expect(game.level).toBe(9)
    game.step()
    expect(game.state.wave).toBe(9)
    expect(game.state.enemies[0]!.bossCharacter).toBe("hona")
    expect(game.state.bossIntro).toBeUndefined()
    game.state.enemies = []
    game.step()
    expect(game.level).toBe(10)
    game.restart()
    game.step()
    expect(game.level).toBe(9)
    expect(game.state.enemies[0]!.bossCharacter).toBe("hona")
  })
})
