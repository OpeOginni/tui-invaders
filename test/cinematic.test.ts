import { describe, expect, test } from "bun:test"
import { StyledText, type TextRenderable } from "@opentui/core"
import { arcadeText, BOSS_INTRO_DURATION } from "../src/cinematic.js"
import { newGame, updateGame } from "../src/game.js"
import { draw } from "../src/render.js"
import { DEEPSEEK_WHALE_PIXELS, GEMINI_COLORS, GEMINI_METEOR_PIXELS, GEMINI_STAR_PIXELS, PROVIDERS } from "../src/bosses.js"

describe("cinematic boss reveal", () => {
  test("opens from gameplay, displays large titles at all arena sizes, and reveals gameplay again", () => {
    for (const [width, height] of [[60, 24], [90, 30], [120, 40]]) {
      for (const wave of [6, 9]) {
        const state = newGame(width!, height!)
        state.wave = wave - 1
        updateGame(state, 0, state.start, width!, height!, 0)
        state.enemies[0]!.hp *= 0.75
        updateGame(state, 0, state.start, width!, height!, 0)
        const canvas = { content: new StyledText([]) } as TextRenderable
        const render = () => {
          draw({ canvas, state, width: width!, height: height!, now: state.start,
            highscores: [], paused: false, nameBuffer: "", overSaved: false,
            isHighScore: false, isTopScore: false, scoreRank: 0, stars: [] })
          return (canvas.content as StyledText).chunks.map((chunk) => chunk.text).join("")
        }
        const initial = render()
        expect(initial).toContain("[P] pause  [Space] shoot")
        state.bossIntro!.remaining = BOSS_INTRO_DURATION - 1.5
        const reveal = render()
        if (wave === 9) {
          const colors = new Set(Object.values(GEMINI_COLORS))
          const logoChunks = (canvas.content as StyledText).chunks.filter((chunk) => colors.has(chunk.fg!) || colors.has(chunk.bg!))
          expect(logoChunks.length).toBeGreaterThan(4)
        }
        expect(reveal).not.toContain("[P] pause")
        expect(reveal).toContain(wave === 6 ? "BOSS DAX" : "BOSS LUKE")
        const headline = arcadeText(wave === 6 ? "CHEEPSEEK" : "GEMINI")
        for (const row of headline) expect(reveal).toContain(row)
        expect(reveal.split("\n")).toHaveLength(height!)
        expect(reveal.split("\n").every((row) => row.length === width)).toBe(true)
        state.bossIntro!.remaining = 0.1
        expect(render()).toContain("[P] pause  [Space] shoot")
        state.bossIntro = undefined
        expect(render()).toBe(initial)
      }
    }
  })

  test("whale collision cells match its compact colored pixel silhouette", () => {
    const sprite = PROVIDERS.deepseek.sprite
    for (const [y, row] of sprite.entries()) {
      for (let x = 0; x < row.length; x++) {
        const visible = [DEEPSEEK_WHALE_PIXELS[y * 2]?.[x], DEEPSEEK_WHALE_PIXELS[y * 2 + 1]?.[x]]
          .some((pixel) => pixel !== undefined && pixel !== " ")
        expect(row[x] !== " ").toBe(visible)
      }
    }
  })

  test("Gemini artwork is a tapered four-point star instead of a plus sign", () => {
    for (const pixels of [GEMINI_STAR_PIXELS, GEMINI_METEOR_PIXELS]) {
      const visible = (row: string) => [...row].filter((pixel) => pixel !== " ").length
      const middle = Math.floor(pixels.length / 2)
      expect(visible(pixels[0]!)).toBe(1)
      expect(visible(pixels.at(-1)!)).toBe(1)
      expect(visible(pixels[1]!)).toBe(1)
      expect(visible(pixels.at(-2)!)).toBe(1)
      expect(visible(pixels[middle]!)).toBe(pixels.length)
      for (let row = 1; row <= middle; row++) expect(visible(pixels[row]!)).toBeGreaterThanOrEqual(visible(pixels[row - 1]!))
      for (let row = middle + 1; row < pixels.length; row++) expect(visible(pixels[row]!)).toBeLessThanOrEqual(visible(pixels[row - 1]!))
      expect(visible(pixels[1]!)).toBeLessThan(visible(pixels[middle - 2]!))
      expect(new Set(pixels.join("").replaceAll(" ", "")).size).toBeGreaterThan(8)
    }
  })
})
