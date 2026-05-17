export const PLAYER_SPRITE = ["█▀▀█", "█__█", "▀▀▀▀"]
export const PLAYER_SHIELD_SPRITE = [
  " ▄▀▀▀▀▄ ",
  "▌ █▀▀█ ▐",
  "▌ █__█ ▐",
  "▌ ▀▀▀▀ ▐",
  " ▀▄▄▄▄▀ ",
]

export const DROP_SPRITES = {
  gun: ["▟█▙"],
  rapid: ["▟▙", "▜▛"],
  shield: ["◖█◗"],
  spread: ["╲█╱"],
  triple: ["▌█▐"],
  life: ["♥"],
} as const

export const SCOUT_SPRITES = [
  ["▄▀▀▄", "█__█", "▝▀▀▘"],
  ["▟▀▀▙", "█__█", " ▀▀ "],
  ["▗▄▄▖", "▟__▙", "▝▀▀▘"],
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
function toCollisionFrame(pixel: string[]): string[] {
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
