import { expect, test } from "bun:test"
import { StyledText, type TextRenderable } from "@opentui/core"
import { InvadersGame } from "../src/embed.js"
import { currentPlayerSprite, currentPlayerTopY } from "../src/game.js"
import { JUNIOR_SHIELD_SPRITE, JUNIOR_SPRITE, PLAYER_SPRITE, PLAYER_SHIELD_SPRITE, shipPixels } from "../src/sprites.js"

test("Junior wears shades in gameplay but keeps the preview's googly eyes and original inset unchanged", () => {
  expect(JUNIOR_SPRITE.join("")).not.toContain("_")
  expect(JUNIOR_SPRITE[1]).toBe("█▟▙█")
  expect(JUNIOR_SPRITE[0]).toBe(PLAYER_SPRITE[0])
  expect(JUNIOR_SPRITE[2]).toBe(PLAYER_SPRITE[2])
  expect(shipPixels(true, 0)).not.toEqual(shipPixels(true, 1))
  expect(PLAYER_SPRITE.join("")).toContain("_")
  expect(shipPixels(false).join("")).toContain("D")
  for (const glance of [0, 1]) {
    const preview = shipPixels(true, glance)
    expect(preview.join("")).not.toContain("D")
    expect(preview.join("")).toContain("K")
    expect(preview.every((row) => row.length === 12)).toBe(true)
  }
})

test("Junior matches the original 4×3 footprint, shield size and flight range", async () => {
  expect(JUNIOR_SPRITE.map((row) => row.length)).toEqual(PLAYER_SPRITE.map((row) => row.length))
  expect(JUNIOR_SHIELD_SPRITE.map((row) => row.length)).toEqual(PLAYER_SHIELD_SPRITE.map((row) => row.length))
  const game = new InvadersGame(90, 30)
  await game.press({ name: "right" })
  await game.press({ name: "return" })
  game.state.player.shieldUntil = Infinity
  const original = new InvadersGame(90, 30)
  original.start()
  for (const [width, height] of [[90, 30], [60, 24], [120, 60]]) {
    game.resize(width!, height!)
    original.resize(width!, height!)
    expect(game.state.player.y).toBe(original.state.player.y)
    const sprite = currentPlayerSprite(game.state, performance.now())
    expect(sprite.every((row) => row.length === sprite[0]!.length)).toBe(true)
    expect(currentPlayerTopY(game.state, performance.now()) + sprite.length).toBeLessThanOrEqual(height! - 2)
  }
})

test("Junior draws chunky mirrored shades with dark lenses and corner reflections", () => {
  const game = new InvadersGame(90, 30)
  game.selectedShip = "opencodejr"
  game.start()
  const canvas = { content: new StyledText([]) } as TextRenderable
  game.draw(canvas)
  let x = 0
  let y = 0
  const lenses: Array<[number, number]> = []
  for (const chunk of (canvas.content as StyledText).chunks) {
    for (const char of chunk.text) {
      if (char === "\n") { x = 0; y++; continue }
      if (y === game.state.player.y + 1 && (x === 44 || x === 45)) {
        expect(char).toBe(x === 44 ? "▟" : "▙")
        lenses.push([x, y])
        expect(chunk.fg?.toInts().slice(0, 3)).toEqual([38, 48, 65])
        expect(chunk.bg?.toInts().slice(0, 3)).toEqual([126, 143, 165])
      }
      x++
    }
  }
  expect(lenses).toEqual([[44, 25], [45, 25]])
})

test("selection freezes the run, cycles both ships, and launches without shooting or drifting", async () => {
  const game = new InvadersGame(90, 30, [], undefined, 9)
  game.step(performance.now() + 60000)
  expect(game.selectingShip).toBe(true)
  expect(game.state.elapsed).toBe(0)
  expect(game.state.enemies).toHaveLength(0)
  await game.press({ name: "left" })
  expect(game.selectedShip).toBe("opencodejr")
  await game.press({ name: "right" })
  expect(game.selectedShip).toBe("opencode")
  await game.press({ name: "d" })
  await game.press({ name: "space" })
  expect(game.selectingShip).toBe(false)
  expect(game.state.ship).toBe("opencodejr")
  expect(game.state.bullets).toHaveLength(0)
  const x = game.state.player.x
  game.step()
  expect(game.state.wave).toBe(9)
  expect(game.state.player.x).toBe(x)
  expect(currentPlayerSprite(game.state, performance.now())).toBe(JUNIOR_SPRITE)
  game.state.player.shieldUntil = Infinity
  expect(currentPlayerSprite(game.state, performance.now())).toBe(JUNIOR_SHIELD_SPRITE)
  game.restart()
  expect(game.selectingShip).toBe(true)
  expect(game.selectedShip).toBe("opencodejr")
  await game.press({ name: "return" })
  expect(game.state.ship).toBe("opencodejr")
  expect(game.state.player.hp).toBe(3)
})

test("both ship previews fit minimum and large arenas and survive resizing", async () => {
  for (const [width, height] of [[60, 24], [90, 30], [120, 60]] as const) {
    const game = new InvadersGame(width, height)
    const canvas = { content: new StyledText([]) } as TextRenderable
    for (const ship of ["OpenCode", "OpenCodeJr"]) {
      game.draw(canvas)
      const text = (canvas.content as StyledText).chunks.map((chunk) => chunk.text).join("")
      expect(text).toContain(ship)
      expect(text).toContain("Enter / Space: launch")
      expect(text.split("\n")).toHaveLength(height)
      expect(text.split("\n").every((row) => row.length === width)).toBe(true)
      await game.tap({ name: "right" })
    }
    game.resize(60, 24)
    expect(game.selectingShip).toBe(true)
    game.draw(canvas)
  }
})
