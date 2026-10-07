import { createCliRenderer, TextRenderable, type KeyEvent } from "@opentui/core"
import { InvadersGame } from "./embed.js"
import { parseCliArgs } from "./cli.js"

let options: ReturnType<typeof parseCliArgs>
try {
  options = parseCliArgs(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
if (options.help) {
  console.log("Usage: tui-invaders [--level <number>]\n\n  --level  Start at a specific level (default: 1; Hona: 9)\n  --help   Show this help")
  process.exit(0)
}

let width = 90
let height = 30

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30, consoleMode: "disabled", useKittyKeyboard: { events: true } })
renderer.setTerminalTitle(`TUI Invaders | Level ${options.level}`)

width = Math.max(60, rendererWidth())
height = Math.max(24, rendererHeight())

const canvas = new TextRenderable(renderer, { id: "game", width: "100%", height: "100%", content: "", fg: "#e8f1ff", bg: "#050712", wrapMode: "none" })
renderer.root.add(canvas)
renderer.start()

const game = await InvadersGame.load(width, height, options.level)
let titleLevel = options.level

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  // Raw terminals do not report releases: expire movement between repeats.
  // Kitty events support independent held keys and immediate release.
  void game.press(key, key.source === "kitty")
})

renderer.keyInput.on("keyrelease", (key: KeyEvent) => {
  game.release(key)
})

renderer.on("resize", resizeGame)

const tick = setInterval(() => {
  if (renderer.isDestroyed) return
  const now = performance.now()
  game.step(now)
  game.draw(canvas, now)
  updateTitle()
}, 33)

renderer.on("destroy", () => clearInterval(tick))

function resizeGame() {
  width = Math.max(60, rendererWidth())
  height = Math.max(24, rendererHeight())
  game.resize(width, height)
}

function updateTitle() {
  const level = game.level
  if (level === titleLevel) return
  titleLevel = level
  renderer.setTerminalTitle(`TUI Invaders | Level ${level}`)
}

function rendererWidth() {
  return Math.max(1, Math.floor(renderer.width || process.stdout.columns || width))
}

function rendererHeight() {
  return Math.max(1, Math.floor(renderer.height || process.stdout.rows || height))
}
