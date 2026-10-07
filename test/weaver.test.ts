import { expect, test } from "bun:test"
import { newGame, updateGame } from "../src/game.js"
import { WEAVER_SPRITE } from "../src/weaver.js"

test("Weavers arrive from wave 10 and alternate fans with crossing shots and a dodge window", () => {
  const early = newGame(120, 60, 8)
  updateGame(early, 0, early.start, 120, 60, 0)
  expect(early.enemies.some((enemy) => enemy.fireType === "weave")).toBe(false)
  const state = newGame(120, 60, 10)
  updateGame(state, 0, state.start, 120, 60, 0)
  const weaver = state.enemies.find((enemy) => enemy.fireType === "weave")!
  expect(weaver.sprite).toBe(WEAVER_SPRITE)
  expect(weaver.hp).toBe(12)
  state.enemies = [weaver]
  weaver.fireCd = 0
  updateGame(state, 0, state.start, 120, 60, 0)
  expect(state.bullets.map((bullet) => bullet.dx)).toEqual([-6, 6, undefined])
  expect(weaver.fireCd).toBe(2.8)
  state.bullets = []
  updateGame(state, 1, state.start + 1000, 120, 60, 0)
  expect(state.bullets).toHaveLength(0)
  weaver.fireCd = 0
  updateGame(state, 0, state.start + 1000, 120, 60, 0)
  expect(state.bullets.map((bullet) => bullet.dx)).toEqual([6, -6])
  const [left, right] = state.bullets
  expect(left!.x).toBeLessThan(right!.x)
  expect(left!.x + left!.dx! * 0.5).toBe(right!.x + right!.dx! * 0.5)
})
