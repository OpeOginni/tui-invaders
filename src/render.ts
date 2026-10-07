import { RGBA, StyledText, type TextChunk, type TextRenderable } from "@opentui/core"
import { currentPlayerSprite, currentPlayerTopY, gunCostToNext } from "./game.js"
import { DEEPSEEK_WHALE_PIXELS, GEMINI_COLORS, GEMINI_ICON_PIXELS, GEMINI_METEOR_PIXELS, GEMINI_STAR_PIXELS, PROVIDERS } from "./bosses.js"
import { arcadeText, arcadeHeadline, BOSS_INTRO_DURATION, introCoverage } from "./cinematic.js"
import { bossArt, DROP_SPRITES, KIT_DEFEATED_PIXELS, shipPixels } from "./sprites.js"
import { EFFECT_EXTENSION_COLORS, EFFECT_EXTENSION_PIXELS, KIT_COLORS } from "./kit.js"
import type { GameState, HighScore } from "./types.js"

type Tone =
  | "space"
  | "star"
  | "starBright"
  | "dim"
  | "hud"
  | "frame"
  | "player"
  | "playerDark"
  | "enemy"
  | "heavy"
  | "drop"
  | "bullet"
  | "danger"
  | "dangerBright"
  | "dangerTrail"
  | "boost"
  | "deepseek"
  | "gemini"
  | "kit"

type Cell = { char: string; fg: RGBA; bg: RGBA }

const PALETTE: Record<Tone, RGBA> = {
  space: RGBA.fromHex("#03060f"),
  star: RGBA.fromHex("#5a6a90"),
  starBright: RGBA.fromHex("#cfd8ff"),
  dim: RGBA.fromHex("#465069"),
  hud: RGBA.fromHex("#e8f1ff"),
  frame: RGBA.fromHex("#2f3a55"),
  player: RGBA.fromHex("#dde3ec"),
  playerDark: RGBA.fromHex("#2a2f3a"),
  enemy: RGBA.fromHex("#ff9f43"),
  heavy: RGBA.fromHex("#b388ff"),
  drop: RGBA.fromHex("#72ff7d"),
  bullet: RGBA.fromHex("#fff89c"),
  danger: RGBA.fromHex("#ff4d6d"),
  dangerBright: RGBA.fromHex("#ff2030"),
  dangerTrail: RGBA.fromHex("#a02838"),
  boost: RGBA.fromHex("#ffe66d"),
  deepseek: RGBA.fromHex("#559dff"),
  gemini: RGBA.fromHex("#b29aff"),
  kit: RGBA.fromHex("#67e8ce"),
}

const SPACE_BG = PALETTE.space
const SHADES_COLOR = RGBA.fromHex("#263041")
const SHADES_REFLECTION = RGBA.fromHex("#7e8fa5")
const TRANSPARENT_PIXEL: RGBA | null = null

// Dax pixel art color palette (real per-pixel colors)
const DAX_COLORS: Record<string, RGBA> = {
  ".": RGBA.fromHex("#f0d6b4"), // dome shine highlight
  S: RGBA.fromHex("#d8a880"), // skin light
  s: RGBA.fromHex("#b07b54"), // skin mid
  D: RGBA.fromHex("#724a2a"), // skin shadow (nose, under-eye)
  B: RGBA.fromHex("#0d0703"), // beard darkest / brow underline
  b: RGBA.fromHex("#2a1812"), // beard mid
  W: RGBA.fromHex("#f1e8d2"), // eye white
  K: RGBA.fromHex("#070707"), // eye pupil
  M: RGBA.fromHex("#3a1a14"), // mouth
  T: RGBA.fromHex("#10131a"), // shirt dark
  t: RGBA.fromHex("#1d232f"), // shirt highlight
}

const HONA_COLORS: Record<string, RGBA> = {
  H: RGBA.fromHex("#295676"),
  O: RGBA.fromHex("#ef4271"),
  N: RGBA.fromHex("#ffd568"),
  A: RGBA.fromHex("#00cca1"),
}

const WHALE_COLORS: Record<string, RGBA> = {
  B: RGBA.fromHex("#4d6bfe"),
  L: RGBA.fromHex("#8ba6ff"),
  D: RGBA.fromHex("#3046b5"),
  W: RGBA.fromHex("#d7ebff"),
}

export type RenderOptions = {
  selectingShip?: boolean
  selectedShip?: "opencode" | "opencodejr"
  canvas: TextRenderable
  state: GameState
  highscores: HighScore[]
  width: number
  height: number
  now: number
  paused: boolean
  nameBuffer: string
  overSaved: boolean
  isHighScore: boolean
  isTopScore: boolean
  scoreRank: number
  stars: Star[]
}

export type Star = { x: number; y: number; phase: number; bright: boolean }

export function createStars(width: number, height: number, count = 80): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.floor(Math.random() * (width - 2)) + 1,
      y: Math.floor(Math.random() * (height - 2)) + 1,
      phase: Math.random() * Math.PI * 2,
      bright: Math.random() < 0.25,
    })
  }
  return stars
}

export function draw(options: RenderOptions) {
  const painter = new Painter(options.width, options.height)
  drawStars(painter, options.stars, options.now)
  painter.drawFrame()
  if (options.selectingShip) {
    drawShipSelection(painter, options)
    options.canvas.content = painter.toStyledText()
    return
  }

  for (const drop of options.state.drops) painter.drawSprite(DROP_SPRITES[drop.kind], Math.round(drop.x), Math.round(drop.y), dropTone(drop.kind))
  for (const bullet of options.state.bullets) {
    const x = Math.round(bullet.x)
    const y = Math.round(bullet.y)
    if (bullet.friendly) {
      painter.drawText("┃", x, y, "bullet")
    } else {
      // enemy shots: bright head + dim trail for visibility
      const pulse = Math.floor(options.now / 120) % 2 === 0
      const horizontal = Math.abs(bullet.dx ?? 0) > Math.abs(bullet.dy)
      const stepX = horizontal ? Math.sign(bullet.dx ?? 0) : 0
      const stepY = horizontal ? 0 : Math.sign(bullet.dy)
      const head = horizontal ? (stepX > 0 ? "▶" : "◀") : (stepY < 0 ? "▲" : "▼")
      painter.drawText(horizontal ? "─" : "│", x - stepX, y - stepY, "dangerTrail")
      painter.drawText(pulse ? head : "◆", x, y, "dangerBright")
    }
  }
  for (const enemy of options.state.enemies) {
    if (enemy.isBoss) {
      const frameIdx = Math.max(0, enemy.frames?.indexOf(enemy.sprite) ?? 0)
      const { pixels } = bossArt(enemy.bossCharacter, options.height)
      const pixelFrame = pixels[frameIdx] ?? pixels[0]!
      painter.drawPixelArt(pixelFrame, enemy.bossCharacter === "kit" ? KIT_COLORS : enemy.bossCharacter === "hona" ? HONA_COLORS : DAX_COLORS, Math.round(enemy.x), Math.round(enemy.y))
      drawBossBar(painter, enemy, options.width)
      if (enemy.bossCharacter === "kit") {
        const extensions = options.state.enemies.filter((module) => module.kitModule && module.hp > 0).length
        const armored = extensions > 0
        if (armored) {
          const halfWidth = Math.ceil(Math.max(...enemy.sprite.map((row) => row.length)) / 2) + 1
          const left = Math.round(enemy.x) - halfWidth
          const right = Math.round(enemy.x) + halfWidth
          const top = Math.round(enemy.y) - 1
          const bottom = Math.round(enemy.y) + enemy.sprite.length
          const tone: Tone = Math.floor(options.now / 220) % 2 ? "kit" : "starBright"
          painter.drawText("╭" + "─".repeat(right - left - 1) + "╮", left, top, tone)
          painter.drawText("╰" + "─".repeat(right - left - 1) + "╯", left, bottom, tone)
          for (let y = top + 1; y < bottom; y++) {
            painter.drawText("│", left, y, tone)
            painter.drawText("│", right, y, tone)
          }
        }
        const label = `v${enemy.kitPhase ?? 0}.0  EXTENSIONS ${extensions} / ${armored ? "SHIELDED" : "VULNERABLE"}`
        painter.drawText(label, Math.floor((options.width - label.length) / 2), 3 + enemy.sprite.length, "kit")
        // Lock-on is visible for 0.9s before a volley. Retried shots keep it.
        if (enemy.kitAim !== undefined) {
          const x = Math.round(enemy.kitAim)
          const y = Math.round(enemy.kitAimY ?? options.state.player.y)
          painter.drawText("▼", x, y - 2, "dangerBright")
        }
      }
    } else if (enemy.kitModule) {
      const x = Math.round(enemy.x)
      const y = Math.round(enemy.y)
      const charging = enemy.fireCd <= 0.8
      painter.drawPixelArt(EFFECT_EXTENSION_PIXELS, charging ? { W: PALETTE.boost } : EFFECT_EXTENSION_COLORS, x, y)
      const remaining = Math.ceil(5 * enemy.hp / enemy.maxHp)
      painter.drawText("━".repeat(remaining) + "·".repeat(5 - remaining), x - 2, y + enemy.sprite.length, charging ? "boost" : "dim")
    } else if (enemy.provider === "deepseek") {
      painter.drawPixelArt(DEEPSEEK_WHALE_PIXELS, WHALE_COLORS, Math.round(enemy.x), Math.round(enemy.y))
    } else if (enemy.provider === "gemini") {
      const x = Math.round(enemy.x)
      const y = Math.round(enemy.y)
      const falling = enemy.meteorPhase === "falling"
      if (falling) {
        for (let trail = 1; trail <= 4; trail++) {
          painter.drawText("│", x, y - trail, trail < 3 ? "gemini" : "dim")
          if (trail < 3) painter.drawText("╎   ╎", x - 2, y - trail, "dim")
        }
      }
      if (enemy.meteorPhase === "warning") {
        // Keep the gradient visible; pulse the marker, not the whole star.
        const pulse = Math.floor((enemy.meteorCd ?? 0) * 6) % 2 === 0
        painter.drawText("▼", x, y + enemy.sprite.length, pulse ? "dangerBright" : "boost")
        for (let laneY = y + enemy.sprite.length + 2; laneY < options.state.player.y; laneY += 3) {
          painter.drawText("┆", x, laneY, "dangerTrail")
        }
      }
      painter.drawPixelArt(falling ? GEMINI_METEOR_PIXELS : GEMINI_STAR_PIXELS, GEMINI_COLORS, x, y)
    } else {
      const tone: Tone = enemy.provider ?? (enemy.hp > 3 ? "heavy" : "enemy")
      painter.drawLogoSprite(enemy.sprite, Math.round(enemy.x), Math.round(enemy.y), tone)
    }
  }
  for (const p of options.state.particles) painter.drawTextRaw(p.glyph, Math.round(p.x), Math.round(p.y), p.color)

  const hurt = options.now < (options.state.player.hurtUntil ?? 0) && Math.floor(options.now / 100) % 2 === 0
  painter.drawLogoSprite(currentPlayerSprite(options.state, options.now), Math.round(options.state.player.x), Math.round(currentPlayerTopY(options.state, options.now)), hurt ? "dangerBright" : "player")
  if (options.state.ship === "opencodejr") {
    const left = Math.round(Math.round(options.state.player.x) - 2)
    const y = Math.round(options.state.player.y) + 1
    for (const [col, glyph] of [..."▟▙"].entries()) {
      painter.drawTextRaw(glyph, left + col + 1, y, SHADES_COLOR, SHADES_REFLECTION)
    }
  }
  drawHud(painter, options)
  if (options.state.encounterNotice && options.state.encounterNotice.until > options.state.elapsed) {
    const text = options.state.encounterNotice.text.slice(0, options.width - 4)
    // Temporarily replace the boss-name row, keeping health and player space
    // unobstructed. Clear it first so longer names cannot bleed through.
    painter.drawText(" ".repeat(options.width - 2), 1, 1, "space")
    painter.drawText(text, Math.floor((options.width - text.length) / 2), 1, "kit")
  }

  if (options.state.bossIntro && !options.state.gameOver) drawBossIntro(painter, options)
  if (options.state.kitOutro && !options.state.gameOver) drawKitOutro(painter, options)

  if (options.paused && !options.state.gameOver) drawPauseDialog(painter, options.width, options.height)
  if (options.state.gameOver) drawGameOver(painter, options)
  options.canvas.content = painter.toStyledText()
}

function drawStars(painter: Painter, stars: Star[], now: number) {
  for (const star of stars) {
    const flicker = (Math.sin(now / 600 + star.phase) + 1) / 2
    if (flicker < 0.35) continue
    const char = star.bright ? (flicker > 0.85 ? "✦" : "✧") : flicker > 0.7 ? "·" : "."
    const tone: Tone = star.bright ? "starBright" : "star"
    painter.drawText(char, star.x, star.y, tone)
  }
}

function dropTone(kind: keyof typeof DROP_SPRITES): Tone {
  if (kind === "gun") return "boost"
  if (kind === "rapid") return "bullet"
  if (kind === "shield") return "player"
  if (kind === "spread") return "heavy"
  if (kind === "triple") return "drop"
  if (kind === "pierce") return "starBright"
  return "danger"
}

class Painter {
  private screen: Cell[][]

  constructor(private width: number, private height: number) {
    this.screen = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: " ", fg: PALETTE.hud, bg: SPACE_BG })))
  }

  drawFrame() {
    for (let x = 0; x < this.width; x++) {
      this.put(x, 0, "━", "frame")
      this.put(x, this.height - 1, "━", "frame")
    }
    for (let y = 0; y < this.height; y++) {
      this.put(0, y, "┃", "frame")
      this.put(this.width - 1, y, "┃", "frame")
    }
    this.put(0, 0, "┏", "frame")
    this.put(this.width - 1, 0, "┓", "frame")
    this.put(0, this.height - 1, "┗", "frame")
    this.put(this.width - 1, this.height - 1, "┛", "frame")
  }

  overlayRows(overlay: Painter, top: number, bottom: number) {
    for (let y = Math.max(0, top); y < Math.min(this.height, bottom); y++) {
      this.screen[y] = overlay.screen[y]!
    }
  }

  drawText(text: string, x: number, y: number, tone: Tone = "hud") {
    if (y < 0 || y >= this.height) return
    for (let i = 0; i < text.length; i++) this.put(x + i, y, text[i]!, tone)
  }

  drawTextRaw(char: string, x: number, y: number, fg: RGBA, bg = SPACE_BG) {
    this.putRaw(x, y, char, fg, bg)
  }

  drawSprite(sprite: readonly string[], centerX: number, topY: number, tone: Tone = "hud") {
    const width = Math.max(...sprite.map((line) => line.length))
    const left = Math.round(centerX - width / 2)
    for (let row = 0; row < sprite.length; row++) {
      const line = sprite[row]!
      for (let col = 0; col < line.length; col++) {
        const char = line[col]!
        if (char !== " ") this.drawText(char, left + col, topY + row, tone)
      }
    }
  }

  drawLogoSprite(sprite: readonly string[], centerX: number, topY: number, tone: Tone = "player") {
    const width = Math.max(...sprite.map((line) => line.length))
    const left = Math.round(centerX - width / 2)
    for (let row = 0; row < sprite.length; row++) {
      const line = sprite[row]!
      for (let col = 0; col < line.length; col++) {
        const char = line[col]!
        if (char === " ") continue
        if (char === "_") this.put(left + col, topY + row, "░", tone)
        else if (char === "^") this.put(left + col, topY + row, "▀", tone)
        else if (char === "~") this.put(left + col, topY + row, "▀", "dim")
        else this.put(left + col, topY + row, char, tone)
      }
    }
  }

  /**
   * Render a 2D pixel grid via the half-block trick. Two vertical pixels per
   * terminal cell. Each cell uses "▀" with FG = top pixel, BG = bottom pixel.
   */
  drawPixelArt(grid: string[], colors: Record<string, RGBA>, centerX: number, topY: number) {
    const w = Math.max(...grid.map((row) => row.length))
    const left = Math.round(centerX - w / 2)
    for (let row = 0; row < grid.length; row += 2) {
      const topRow = grid[row] ?? ""
      const botRow = grid[row + 1] ?? ""
      const cellY = topY + Math.floor(row / 2)
      for (let col = 0; col < w; col++) {
        const topCh = topRow[col] ?? " "
        const botCh = botRow[col] ?? " "
        const topColor = topCh === " " ? TRANSPARENT_PIXEL : (colors[topCh] ?? null)
        const botColor = botCh === " " ? TRANSPARENT_PIXEL : (colors[botCh] ?? null)
        if (!topColor && !botColor) continue
        if (topColor && botColor) {
          this.putRaw(left + col, cellY, "▀", topColor, botColor)
        } else if (topColor) {
          this.putRaw(left + col, cellY, "▀", topColor, SPACE_BG)
        } else if (botColor) {
          this.putRaw(left + col, cellY, "▄", botColor, SPACE_BG)
        }
      }
    }
  }

  drawBox(x: number, y: number, w: number, h: number, tone: Tone = "dim") {
    for (let i = 1; i < w - 1; i++) {
      this.put(x + i, y, "─", tone)
      this.put(x + i, y + h - 1, "─", tone)
    }
    for (let j = 1; j < h - 1; j++) {
      this.put(x, y + j, "│", tone)
      this.put(x + w - 1, y + j, "│", tone)
      for (let i = 1; i < w - 1; i++) this.put(x + i, y + j, " ", "space")
    }
    this.put(x, y, "╭", tone)
    this.put(x + w - 1, y, "╮", tone)
    this.put(x, y + h - 1, "╰", tone)
    this.put(x + w - 1, y + h - 1, "╯", tone)
  }

  center(text: string, offset = 0, tone: Tone = "hud") {
    this.drawText(text, Math.floor((this.width - text.length) / 2), Math.floor(this.height / 2) + offset, tone)
  }

  put(x: number, y: number, char: string, tone: Tone) {
    this.putRaw(x, y, char, PALETTE[tone], SPACE_BG)
  }

  putRaw(x: number, y: number, char: string, fg: RGBA, bg: RGBA) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.screen[y]![x] = { char, fg, bg }
  }

  toStyledText() {
    const chunks: TextChunk[] = []
    for (let y = 0; y < this.height; y++) {
      const row = this.screen[y]!
      let runStart = 0
      while (runStart < row.length) {
        const first = row[runStart]!
        let runEnd = runStart + 1
        while (runEnd < row.length && row[runEnd]!.fg === first.fg && row[runEnd]!.bg === first.bg) runEnd++
        let text = ""
        for (let i = runStart; i < runEnd; i++) text += row[i]!.char
        chunks.push({ __isChunk: true, text, fg: first.fg, bg: first.bg })
        runStart = runEnd
      }
      if (y < this.height - 1) chunks.push({ __isChunk: true, text: "\n" })
    }
    return new StyledText(chunks)
  }
}

function drawBossBar(painter: Painter, enemy: GameState["enemies"][number], width: number) {
  const label = `── ${enemy.provider && enemy.backupCalled ? `${enemy.name} // ${PROVIDERS[enemy.provider].title}` : `BOSS: ${enemy.name ?? "???"}`} ──`
  const barWidth = Math.min(40, width - 8)
  const left = Math.floor((width - barWidth) / 2)
  const ratio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const filled = Math.floor(barWidth * ratio)
  painter.drawText(label, Math.floor((width - label.length) / 2), 1, "danger")
  for (let i = 0; i < barWidth; i++) {
    painter.drawText(i < filled ? "█" : "░", left + i, 2, i < filled ? "danger" : "dim")
  }
}

function drawHud(painter: Painter, { state, highscores, width, height, now }: RenderOptions) {
  const hi = highscores[0]
  const boosts: Array<[keyof typeof DROP_SPRITES, number]> = [
    ["rapid", state.rapidUntil],
    ["spread", state.spreadUntil],
    ["triple", state.tripleUntil],
    ["pierce", state.pierceUntil],
    ["shield", state.player.shieldUntil],
  ]
  const next = gunCostToNext(state.gunLevel)
  const compact = width < 100
  const stats: Array<[string, Tone]> = [
    [compact ? `Lv${state.wave}` : `Level ${state.wave}`, "boost"],
    [`Score ${state.score}`, "hud"],
    [compact ? `HP ${state.player.hp}` : `Lives ${state.player.hp}`, "danger"],
    [`Gun ${compact ? "" : "Lv."}${state.gunLevel} ${next > 0 ? `(${state.gunXP}/${next})` : "MAX"}`, "player"],
    [compact ? formatTime(state.elapsed) : `Time ${formatTime(state.elapsed)}`, "drop"],
    [hi ? `Best ${hi.score} ${hi.name}` : "Best none", "boost"],
  ]
  let statX = 2
  for (const [text, tone] of stats) {
    if (statX + text.length > width - 2) break
    painter.drawText(text, statX, 0, tone)
    statX += text.length + 2
  }
  const controls = "[P] pause  [Space] shoot  [WASD/Arrows] move"
  painter.drawText(controls, 3, height - 1, "hud")
  const legend = ["gun ▟█▙", "rapid ▌▌▌", "shield ◖█◗", "spread ╲█╱", "triple ▌█▐", "pierce ▶█▶", "life ♥"]
  const legendX = Math.max(3 + controls.length + 3, width - 71)
  while (legend.length && legend.join(" ").length > width - legendX - 2) legend.pop()
  painter.drawText(legend.join(" "), legendX, height - 1, "drop")

  let boostX = 3
  let boostY = height - 2
  for (const [kind, until] of boosts) {
    if (now >= until) continue
    const badge = ` [${kind.toUpperCase()}] `
    if (boostX + badge.length > width - 2) {
      boostX = 3
      boostY -= 1
    }
    painter.drawText(badge, boostX, boostY, dropTone(kind))
    boostX += badge.length + 1
  }
}

function drawBossIntro(painter: Painter, { state, width, height }: RenderOptions) {
  const intro = state.bossIntro!
  const elapsed = BOSS_INTRO_DURATION - intro.remaining
  const coverage = introCoverage(intro.remaining)
  if (coverage <= 0) return
  const scene = new Painter(width, height)
  const boss = state.enemies.find((enemy) => enemy.isBoss)
  const tone: Tone = boss?.bossCharacter === "kit" ? "kit" : boss?.provider ?? "boost"
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)

  // Layered warp-speed streaks: longer, brighter trails sweep past faster.
  const streakCount = Math.min(12, Math.max(8, Math.floor(height * 0.3)))
  for (let i = 0; i < streakCount; i++) {
    const layer = i % 3
    const length = 6 + layer * 5 + i % 4
    const speed = width * (0.65 + layer * 0.45)
    const x = Math.floor((i * 31 + elapsed * speed) % (width + length)) - length
    const y = 2 + (i * 7 + Math.floor(i / 3)) % Math.max(1, height - 4)
    scene.drawText("─".repeat(length), x, y, layer === 0 ? "frame" : "dim")
    scene.drawText("━━", x + length - 2, y, layer === 2 ? "starBright" : "star")
  }
  scene.drawText("━".repeat(width), 0, 1, tone)
  scene.drawText("━".repeat(width), 0, height - 2, tone)

  const fullTitle = arcadeText(intro.title)
  const titles = fullTitle[0]!.length <= width - 6
    ? [intro.title]
    : intro.title.startsWith("Operation ") ? ["OPERATION", intro.title.slice(10)] : intro.title === "Gemini For Life" ? ["GEMINI", "FOR LIFE"] : intro.title.split(" ")
  const headline = tone === "kit" ? arcadeHeadline(intro.title, width - 6, height - 8) : undefined
  const titleHeight = headline?.length ?? titles.length * 6 - 1
  const titleTop = Math.floor((height - titleHeight) / 2)
  const settle = Math.max(0, 1 - (elapsed - 0.25) / 0.6)
  for (const [index, title] of (headline ? [intro.title] : titles).entries()) {
    const rows = headline ?? arcadeText(title)
    const slide = Math.round(settle * settle * 8) * (index % 2 === 0 ? -1 : 1)
    const left = Math.floor((width - rows[0]!.length) / 2) + slide
    for (const [row, text] of rows.entries()) {
      scene.drawText(text, left, titleTop + index * 6 + row, index === titles.length - 1 ? tone : "hud")
    }
  }
  const name = `BOSS ${intro.bossName}`
  scene.drawText(name, Math.floor((width - name.length) / 2), titleTop - 2, "starBright")
  // A visual signature, rather than another paragraph to read.
  const emblemY = titleTop + titleHeight + 1
  if (emblemY + Math.ceil(DEEPSEEK_WHALE_PIXELS.length / 2) < height - 2 && tone === "deepseek") {
    scene.drawPixelArt(DEEPSEEK_WHALE_PIXELS, WHALE_COLORS, centerX, emblemY)
  } else if (tone === "gemini") {
    const pixels = emblemY + GEMINI_STAR_PIXELS.length / 2 <= height - 2 ? GEMINI_STAR_PIXELS : GEMINI_ICON_PIXELS
    scene.drawPixelArt(pixels, GEMINI_COLORS, centerX, emblemY)
  } else if (tone === "kit") {
    // The joke is the headline; no duplicate caption or operation label.
  } else {
    scene.drawText("── ◆ ──", centerX - 4, emblemY, tone)
  }

  const bandHeight = Math.ceil(height * coverage / 2)
  painter.overlayRows(scene, centerY - bandHeight, centerY + bandHeight + (height % 2))
  if (coverage < 1) {
    painter.drawText("━".repeat(width), 0, centerY - bandHeight, tone)
    painter.drawText("━".repeat(width), 0, centerY + bandHeight - 1, tone)
  }
}

function drawShipSelection(painter: Painter, { width, height, selectedShip, now }: RenderOptions) {
  const center = Math.floor(width / 2)
  const title = arcadeHeadline("TUI INVADERS", width - 6, 5)
  for (const [row, line] of title.entries()) painter.drawText(line, Math.floor((width - line.length) / 2), 2 + row, "boost")
  const junior = selectedShip === "opencodejr"
  const top = Math.max(9, Math.floor(height / 2) - 3)
  painter.drawPixelArt(shipPixels(junior, Math.floor(now / 450) % 2), { W: PALETTE.player, D: RGBA.fromHex("#4b4b48"), G: PALETTE.star, K: SPACE_BG }, center, top)
  painter.drawText("◀", center - 14, top + 3, "boost")
  painter.drawText("▶", center + 13, top + 3, "boost")
  const name = junior ? "OpenCodeJr" : "OpenCode"
  painter.drawText(name, center - Math.floor(name.length / 2), top + 8, "player")
  const controls = "← / → or A / D: choose    Enter / Space: launch"
  painter.drawText(controls, Math.floor((width - controls.length) / 2), height - 3, "hud")
  const caption = junior ? "Big eyes. Same firepower." : "The original pilot."
  painter.drawText(caption, center - Math.floor(caption.length / 2), height - 5, "dim")
}

function drawKitOutro(painter: Painter, { state, width, height }: RenderOptions) {
  const scene = new Painter(width, height)
  scene.drawFrame()
  const center = Math.floor(width / 2)
  const top = Math.max(3, Math.floor((height - 16) / 2))
  scene.drawPixelArt(KIT_DEFEATED_PIXELS, { ...KIT_COLORS, C: RGBA.fromHex("#79cfff") }, center, top)
  const elapsed = 3.8 - state.kitOutro!.remaining
  const tearY = top + 7 + Math.floor(elapsed * 3) % 3
  scene.drawText("╵", center - 4, tearY, "deepseek")
  scene.drawText("╵", center + 3, tearY, "deepseek")
  const quote = "Fine. I'll blog about this."
  const boxWidth = quote.length + 4
  const left = Math.floor((width - boxWidth) / 2)
  const bubbleY = top + 12
  scene.drawText("╱", center + 3, bubbleY - 1, "kit")
  scene.drawBox(left, bubbleY, boxWidth, 3, "kit")
  scene.drawText(quote, left + 2, bubbleY + 1, "hud")
  painter.overlayRows(scene, 0, height)
}

function drawPauseDialog(painter: Painter, width: number, height: number) {
  const lines = [
    "PAUSED",
    "",
    "↑ ↓ ← → / WASD   move",
    "Space  shoot",
    "P      resume",
    "Ctrl+C quit",
  ]
  const innerWidth = Math.max(...lines.map((line) => line.length), 18)
  const boxWidth = innerWidth + 6
  const boxHeight = lines.length + 2
  const left = Math.floor((width - boxWidth) / 2)
  const top = Math.floor((height - boxHeight) / 2)
  painter.drawBox(left, top, boxWidth, boxHeight, "boost")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const tone: Tone = i === 0 ? "boost" : "hud"
    painter.drawText(line, Math.floor((width - line.length) / 2), top + 1 + i, tone)
  }
}

function drawGameOver(painter: Painter, { state, highscores, nameBuffer, overSaved, isHighScore, isTopScore, scoreRank, now, width, height }: RenderOptions) {
  const askingName = isHighScore && !overSaved
  const cursor = askingName && Math.floor(now / 500) % 2 === 0 ? "_" : " "
  const prompt = askingName ? `Type name: ${nameBuffer}${cursor}` : "Press R to restart or Ctrl+C to quit"
  const rankBanner = askingName ? (isTopScore ? "NEW HIGH SCORE!" : `Top 10 — rank #${scoreRank}`) : ""
  const lines = [
    "GAME OVER",
    "",
    `Score ${state.score}   Time ${formatTime(state.elapsed)}`,
    rankBanner,
    prompt,
    "",
    "── HIGH SCORES ──",
    ...highscores.slice(0, 5).map((h, i) => `${i + 1}. ${h.name.padEnd(10)} ${String(h.score).padStart(5)}  ${formatTime(h.seconds)}`),
  ].filter((line, i, all) => !(line === "" && all[i - 1] === ""))

  const innerWidth = Math.max(...lines.map((line) => line.length), 30)
  const boxWidth = innerWidth + 4
  const boxHeight = lines.length + 2
  const left = Math.floor((width - boxWidth) / 2)
  const top = Math.floor((height - boxHeight) / 2)
  painter.drawBox(left, top, boxWidth, boxHeight, "danger")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const tone: Tone = i === 0 ? "danger" : line.startsWith("──") ? "boost" : askingName && line.startsWith("Type name") ? "boost" : "hud"
    painter.drawText(line, Math.floor((width - line.length) / 2), top + 1 + i, tone)
  }
}

function formatTime(seconds: number) {
  const s = Math.floor(seconds % 60).toString().padStart(2, "0")
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  return `${m}:${s}`
}
