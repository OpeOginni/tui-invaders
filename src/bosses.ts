import { RGBA } from "@opentui/core"
import type { Provider } from "./types.js"
import { toCollisionFrame } from "./sprites.js"

// Compact logo-inspired whale: raised flukes, curved belly, and a single eye.
export const DEEPSEEK_WHALE_PIXELS = [
  "            L   ",
  "       L   LB  L",
  "   LLLLB   LBBBL",
  " LLBBBBBLL  BBB ",
  "LBBBBBBBBBL BBB ",
  "LWWWBBBBWBBBBB  ",
  "LWWWWBBBBBBBBD  ",
  " LWWWWBBBBBBD   ",
  " LWWWWWWBBBD    ",
  "  LWWBBWWWDD    ",
  "   LBBBDWWWD    ",
  "     DDDDDD     ",
]

// A tapered four-point sparkle with single-pixel tips and the logo's gradient.
export const GEMINI_COLORS: Record<string, RGBA> = {}
function geminiPixels(size: number) {
  const anchors = [
    { x: 0.5, y: 0, rgb: [239, 77, 93] },
    { x: 0, y: 0.5, rgb: [250, 193, 52] },
    { x: 0.4, y: 1, rgb: [50, 185, 135] },
    { x: 1, y: 0.5, rgb: [49, 132, 255] },
    { x: 0.5, y: 0.5, rgb: [94, 137, 238] },
  ]
  const center = (size - 1) / 2
  const halfWidths = Array.from({ length: size }, (_, row) => {
    const distance = Math.abs(row - center)
    if (distance === 0) return center
    const normalized = 1 - distance / center
    // Preserve the original purple sprite's clean diamond-like taper. At this
    // resolution it reads as a sparkle more reliably than concave pixel arms.
    return Math.max(0, Math.round(center * normalized))
  })
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => {
    const x = col / (size - 1)
    const y = row / (size - 1)
    const horizontal = Math.abs(col - center)
    if (horizontal > halfWidths[row]! + 0.5) return " "
    const weights = anchors.map((point) => 1 / (0.008 + (x - point.x) ** 2 + (y - point.y) ** 2) ** 2)
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const rgb = [0, 1, 2].map((channel) => Math.round(anchors.reduce((sum, point, index) => sum + point.rgb[channel]! * weights[index]!, 0) / total))
    const key = String.fromCharCode(0x100 + Object.keys(GEMINI_COLORS).length)
    GEMINI_COLORS[key] = RGBA.fromHex(`#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`)
    return key
  }).join(""))
}

export const GEMINI_STAR_PIXELS = geminiPixels(13)
export const GEMINI_METEOR_PIXELS = geminiPixels(19)
export const GEMINI_ICON_PIXELS = geminiPixels(9)
export const GEMINI_METEOR_SPRITE = toCollisionFrame(GEMINI_METEOR_PIXELS)

// Playful, logo-inspired escorts. Each provider has its own firing behavior.
export const PROVIDERS: Record<Provider, { title: string; tagline: string; tip: string; sprite: string[] }> = {
  deepseek: {
    title: "Operation Cheepseek",
    tagline: "Big whale energy. Tiny inference bill.",
    tip: "Whale escorts fire converging bubble pairs.",
    sprite: toCollisionFrame(DEEPSEEK_WHALE_PIXELS),
  },
  gemini: {
    title: "Gemini For Life",
    tagline: "The Gemini defense squad has arrived.",
    tip: "Wounded stars flare, then dive. Dodge the fall!",
    sprite: toCollisionFrame(GEMINI_STAR_PIXELS),
  },
}

export function providerForBoss(level: number): Provider | undefined {
  if (level === 1) return "deepseek"
  if (level === 2) return "gemini"
  return undefined
}
