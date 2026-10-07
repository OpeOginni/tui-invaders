import type { BossCharacter } from "./types.js"

export const PLAYER_SPRITE = ["█▀▀█", "█__█", "▀▀▀▀"]
export function shipPixels(junior: boolean, glance = 0) {
  const pixels = [
    "WWWWWWWWWWWW", "WWWWWWWWWWWW", "WW        WW", "WW        WW",
    "WW        WW", "WW        WW", "WWDDDDDDDDWW", "WWDDDDDDDDWW",
    "WWDDDDDDDDWW", "WWDDDDDDDDWW", "WWDDDDDDDDWW", "WWDDDDDDDDWW",
    "WWWWWWWWWWWW", "WWWWWWWWWWWW",
  ].map((line) => [...line])
  if (junior) {
    for (const row of pixels) {
      for (let col = 0; col < row.length; col++) if (row[col] === "D") row[col] = " "
    }
    for (const [x, y, shift] of [[3, 3, glance], [6, 7, 1 - glance]] as const) {
      const eye = [" GG ", "GWWG", "GWWG", " GG "]
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        if (eye[row]![col] !== " ") pixels[y + row]![x + col] = eye[row]![col]!
      }
      pixels[y + 2]![x + 1 + shift] = "K"
      pixels[y + 3]![x + 1 + shift] = "K"
    }
  }
  return pixels.map((row) => row.join(""))
}
// Original-sized frame with chunky lenses. The renderer colors these mirrored
// quadrants as dark glass with small outer-corner reflections, not thin slits.
// The larger selection portrait deliberately retains its googly eyes.
export const JUNIOR_SPRITE = ["█▀▀█", "█▟▙█", "▀▀▀▀"]
export const JUNIOR_SHIELD_SPRITE = [" ▄▀▀▀▀▄ ", ...JUNIOR_SPRITE.map((row) => `▌ ${row} ▐`), " ▀▄▄▄▄▀ "]
export const PLAYER_SHIELD_SPRITE = [
  " ▄▀▀▀▀▄ ",
  "▌ █▀▀█ ▐",
  "▌ █__█ ▐",
  "▌ ▀▀▀▀ ▐",
  " ▀▄▄▄▄▀ ",
]

export const DROP_SPRITES = {
  gun: ["▟█▙"],
  rapid: ["▌▌▌"],
  shield: ["◖█◗"],
  spread: ["╲█╱"],
  triple: ["▌█▐"],
  pierce: ["▶█▶"],
  life: ["♥"],
} as const

export const SCOUT_SPRITES = [
  ["▄▀▀▄", "█__█", "▝▀▀▘"],
  ["▟▀▀▙", "█__█", " ▀▀ "],
  ["▗▄▄▖", "▟__▙", "▝▀▀▘"],
]

// Sniper: slim ship with a long targeting prong; fires aimed shots
export const SNIPER_SPRITES = [
  [" ▗█▖ ", " ▟█▙ ", "▝███▘", "  ▼  "],
  ["  █  ", " ▟█▙ ", "▝▀█▀▘", "  ▼  "],
]

// Burster: wide, multi-barreled chunky ship; fires 3-shot bursts
export const BURSTER_SPRITES = [
  ["▄▀█▀▀█▀▄", "█_█__█_█", "▝▀▀▀▀▀▀▘"],
  ["▗▄█▀▀█▄▖", "█▀█__█▀█", "▝▀▀▀▀▀▀▘"],
]

export const BRUISER_SPRITES = [
  ["▄▀▀▀▀▄", "█_██_█", "█____█", "▝▀▀▀▀▘"],
  ["▗▄▄▄▄▖", "█▀██▀█", "█_██_█", "▝▀▀▀▀▘"],
  ["▄▄▀▀▄▄", "█_██_█", "█▄__▄█", "▝▀▀▀▀▘"],
]

export const DREADNOUGHT_SPRITES = [
  ["▄▀▀▀▀▀▀▀▀▄", "█_█▀▀▀▀█_█", "█_█____█_█", "█__▀▀▀▀__█", "▝▀▀▀▀▀▀▀▀▘"],
  ["▗▄▄▀▀▀▀▄▄▖", "█▀_█▀▀█_▀█", "█__█__█__█", "█▄_▀▀▀▀_▄█", "▝▀▀▀▀▀▀▀▀▘"],
]

// Dax boss - true pixel art with per-pixel color via half-block rendering.
// Each row is one pixel tall. Two rows are merged into a single terminal cell
// using "▀" (top pixel = FG color, bottom pixel = BG color).
//                                  1111111111222222
//                        0123456789012345678901234
const DAX_FRAME_LOOK_FORWARD = [
  "                        ",
  "        ........        ",
  "       sSSSSSSSSs       ",
  "      sSSSSSSSSSSs      ",
  "     sSSSSSSSSSSSSs     ",
  "    sSSSSSSSSSSSSSSs    ",
  "    sssssSSSSSSssssss   ",
  "   ssssssssssssssssss   ",
  "   ssBBBBsssssBBBBsss   ",
  "   ssbbbbsssssbbbbsss   ",
  "   ssWWKWsssssWWKWsss   ",
  "   ssWWWWsssssWWWWsss   ",
  "   ssssssssssssssssss   ",
  "   sssssssDDDDsssssss   ",
  "   sssssssDssDsssssss   ",
  "   ssssssDssssDssssss   ",
  "   ssssssssDDssssssss   ",
  "   sssBBBBBBBBBBBBsss   ",
  "   ssbbbbbbMMMMbbbbbss  ",
  "  bbbbbbbbbbbbbbbbbbbb  ",
  "  BbbbbbbbbbbbbbbbbbbB  ",
  "  BbbbbbbbbbbbbbbbbbbB  ",
  "   BbbbbbbbbbbbbbbbB    ",
  "    BBbbbbbbbbbbbBB     ",
  "      sssssssssss       ",
  "    TTTTTTTTTTTTTTTT    ",
  "   TTTTTTTTTTTTTTTTT    ",
  "  TTttttttTTTTttttttTT  ",
  "  TtttttttTTTTtttttttT  ",
  "  TtttttttTTTTtttttttT  ",
]

const DAX_FRAME_LOOK_LEFT = [
  "                        ",
  "        ........        ",
  "       sSSSSSSSSs       ",
  "      sSSSSSSSSSSs      ",
  "     sSSSSSSSSSSSSs     ",
  "    sSSSSSSSSSSSSSSs    ",
  "    sssssSSSSSSssssss   ",
  "   ssssssssssssssssss   ",
  "   ssBBBBsssssBBBBsss   ",
  "   ssbbbbsssssbbbbsss   ",
  "   ssKWWWsssssKWWWsss   ",
  "   ssWWWWsssssWWWWsss   ",
  "   ssssssssssssssssss   ",
  "   sssssssDDDDsssssss   ",
  "   sssssssDssDsssssss   ",
  "   ssssssDssssDssssss   ",
  "   ssssssssDDssssssss   ",
  "   sssBBBBBBBBBBBBsss   ",
  "   ssbbbbbbMMMMbbbbbss  ",
  "  bbbbbbbbbbbbbbbbbbbb  ",
  "  BbbbbbbbbbbbbbbbbbbB  ",
  "  BbbbbbbbbbbbbbbbbbbB  ",
  "   BbbbbbbbbbbbbbbbB    ",
  "    BBbbbbbbbbbbbBB     ",
  "      sssssssssss       ",
  "    TTTTTTTTTTTTTTTT    ",
  "   TTTTTTTTTTTTTTTTT    ",
  "  TTttttttTTTTttttttTT  ",
  "  TtttttttTTTTtttttttT  ",
  "  TtttttttTTTTtttttttT  ",
]

export const DAX_PIXEL_FRAMES = [DAX_FRAME_LOOK_FORWARD, DAX_FRAME_LOOK_LEFT]

// Collision/logical frames are half-height versions of the pixel art so the
// game treats Dax as the size he actually appears on screen (half-block render).
export function toCollisionFrame(pixel: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < pixel.length; i += 2) {
    const top = pixel[i] ?? ""
    const bot = pixel[i + 1] ?? ""
    const w = Math.max(top.length, bot.length)
    let row = ""
    for (let c = 0; c < w; c++) {
      const t = top[c] ?? " "
      const b = bot[c] ?? " "
      row += t !== " " || b !== " " ? "█" : " "
    }
    out.push(row)
  }
  return out
}

export const DAX_BOSS_FRAMES = DAX_PIXEL_FRAMES.map(toCollisionFrame)
// Keep the arena playable in short embedded terminals without changing the art's width.
export const DAX_COMPACT_PIXEL_FRAMES = DAX_PIXEL_FRAMES.map((frame) => frame.filter((_, row) => row % 2 === 0))
export const DAX_COMPACT_FRAMES = DAX_COMPACT_PIXEL_FRAMES.map(toCollisionFrame)

// The supplied HONA mark: blue H / pink circle above yellow N / green triangle.
const HONA_FRAME = Array.from({ length: 28 }, (_, y) =>
  Array.from({ length: 24 }, (_, x) => {
    if (y < 12) {
      if (x < 11 && (x < 4 || x >= 7 || (y >= 4 && y < 8))) return "H"
      if ((x - 17.5) ** 2 + (y - 5.5) ** 2 <= 35) return "O"
    }
    if (y >= 14) {
      const row = y - 14
      if (x < 11 && (x < 4 || x >= 7 || Math.abs(x - (2 + row * 6 / 13)) < 2)) return "N"
      if (x >= 12 && Math.abs(x - 17.5) <= 0.5 + row * 5.5 / 13) return "A"
    }
    return " "
  }).join(""),
)
const HONA_PIXEL_FRAMES = [HONA_FRAME]
const HONA_BOSS_FRAMES = HONA_PIXEL_FRAMES.map(toCollisionFrame)
const HONA_COMPACT_PIXEL_FRAMES = HONA_PIXEL_FRAMES.map((frame) => frame.filter((_, row) => row % 2 === 0))
const HONA_COMPACT_FRAMES = HONA_COMPACT_PIXEL_FRAMES.map(toCollisionFrame)

// Based on Kit's curly-haired, googly-glasses portrait: highlighted curls,
// round lenses, dark beard, olive jacket and a checked shirt / Effect core.
const KIT_PIXELS = [
  "      hHh   hHh       ",
  "   hHHhHh hHHhHHh     ",
  "  hHhHHHHhHHhHHHhHh   ",
  " hHHHhHhHHHHHhHhHHHh  ",
  " HHhHHHSSSSSSHHHhHHH  ",
  "hHHhHHSSSSSSSSHHhHHHh ",
  " HHhHSSKKKSSKKKSSHhHH ",
  "hHHHSKWWWWKKWWWWKSHHh ",
  " HHHSKWPPWKKWPPWKSHHH ",
  " hHHSKWWWWSSWWWWKSHHh ",
  "  HHSSSKKKSSKKKSSSHH  ",
  "   HSSSSSSDDSSSSSHH   ",
  "    BSSSSBBBBSSSSB    ",
  "    BBSSSDDDSSSSBB    ",
  "     BBBSSSSSSBBB     ",
  "      SBBBBBBBSS      ",
  "    JJJSSSSSSJJJJ     ",
  "  JJJJJWKWWKWJJJJJJ   ",
  " JJJJJJKWCCWKJJJJJJJ  ",
  "  JJJJJWKCWKWJJJJJJ   ",
]
// The googly pupils glance sideways; whites and hair retain their colors.
const KIT_PIXEL_FRAMES = [KIT_PIXELS, KIT_PIXELS.map((row) => row.replaceAll("WPPW", "PPWW"))]
const KIT_FRAMES = KIT_PIXEL_FRAMES.map(toCollisionFrame)
// Cracked glasses, tear trails, a bruised cheek and a downturned mouth.
export const KIT_DEFEATED_PIXELS = KIT_PIXELS.map((line, row) => {
  const pixels = [...line]
  if (row === 8) { pixels[7] = "K"; pixels[14] = "K" }
  if (row >= 9 && row <= 13) { pixels[7] = "C"; pixels[14] = "C" }
  if (row === 11) { pixels[16] = "h"; pixels[17] = "h" }
  if (row === 13) { pixels[9] = "B"; pixels[10] = "B"; pixels[11] = "B" }
  if (row === 14) { pixels[8] = "B"; pixels[9] = "S"; pixels[10] = "S"; pixels[11] = "S"; pixels[12] = "B" }
  return pixels.join("")
})
// Preserve curls, round lenses and beard in the six-cell compact portrait.
const KIT_COMPACT_PIXELS = KIT_PIXEL_FRAMES.map((frame) => [0, 2, 3, 5, 6, 7, 8, 10, 12, 14, 17, 19].map((row) => frame[row]!))
const KIT_COMPACT_FRAMES = KIT_COMPACT_PIXELS.map(toCollisionFrame)

export function bossArt(character: BossCharacter = "dax", height: number) {
  if (character === "kit") {
    return height < 28
      ? { frames: KIT_COMPACT_FRAMES, pixels: KIT_COMPACT_PIXELS }
      : { frames: KIT_FRAMES, pixels: KIT_PIXEL_FRAMES }
  }
  if (character === "hona") {
    return height < 28
      ? { frames: HONA_COMPACT_FRAMES, pixels: HONA_COMPACT_PIXEL_FRAMES }
      : { frames: HONA_BOSS_FRAMES, pixels: HONA_PIXEL_FRAMES }
  }
  return height < 28
    ? { frames: DAX_COMPACT_FRAMES, pixels: DAX_COMPACT_PIXEL_FRAMES }
    : { frames: DAX_BOSS_FRAMES, pixels: DAX_PIXEL_FRAMES }
}

export function hitSprite(x: number, y: number, centerX: number, topY: number, sprite: string[]) {
  const width = Math.max(...sprite.map((line) => line.length))
  const left = Math.round(centerX - width / 2)
  const localY = Math.round(y - topY)
  const localX = Math.round(x - left)
  return localY >= 0 && localY < sprite.length && localX >= 0 && localX < (sprite[localY]?.length ?? 0) && sprite[localY]![localX] !== " "
}

export function spritesOverlap(ax: number, ay: number, a: string[], bx: number, by: number, b: string[]) {
  const left = Math.round(ax - Math.max(...a.map((part) => part.length)) / 2)
  for (let row = 0; row < a.length; row++) {
    const line = a[row]!
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== " " && hitSprite(left + col, ay + row, bx, by, b)) return true
    }
  }
  return false
}
