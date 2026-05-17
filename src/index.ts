import { createCliRenderer, TextRenderable, type KeyEvent } from "@opentui/core"
import { newGame, resizeGameState, shoot, updateGame } from "./game"
import { isHighScore, isTopScore, loadHighScores, rankFor, saveHighScore } from "./highscores"
import { createStars, draw, type Star } from "./render"

let width = 90
let height = 30

const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30, consoleMode: "disabled", useKittyKeyboard: { events: true } })
renderer.setTerminalTitle("TUI Invaders | Level 1")

width = Math.max(60, rendererWidth())
height = Math.max(24, rendererHeight())

const canvas = new TextRenderable(renderer, { id: "game", width: "100%", height: "100%", content: "", fg: "#e8f1ff", bg: "#050712", wrapMode: "none" })
renderer.root.add(canvas)
renderer.start()

let highscores = await loadHighScores()
let state = newGame(width, height)
let stars: Star[] = createStars(width, height)
let nameBuffer = ""
let overSaved = false
let lastShot = 0
let last = performance.now()
let paused = false
let moveLeftUntil = 0
let moveRightUntil = 0
let moveDirection = 0
const MOVE_HOLD_MS = 130
let titleLevel = 1

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (state.gameOver) {
    void handleGameOverInput(key)
    return
  }

  if (key.name === "p") paused = !paused
  if (key.name === "space") lastShot = shoot(state, performance.now(), lastShot)
  if (key.name === "left" || key.name === "a") {
    moveDirection = -1
    moveLeftUntil = performance.now() + MOVE_HOLD_MS
  }
  if (key.name === "right" || key.name === "d") {
    moveDirection = 1
    moveRightUntil = performance.now() + MOVE_HOLD_MS
  }
})

renderer.keyInput.on("keyrelease", (key: KeyEvent) => {
  if ((key.name === "left" || key.name === "a") && moveDirection === -1) moveDirection = 0
  if ((key.name === "right" || key.name === "d") && moveDirection === 1) moveDirection = 0
})

renderer.on("resize", resizeGame)

const tick = setInterval(() => {
  if (renderer.isDestroyed) return
  const now = performance.now()
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (!paused && !state.gameOver) {
    const direction = moveDirection || (now < moveRightUntil ? 1 : 0) - (now < moveLeftUntil ? 1 : 0)
    updateGame(state, dt, now, width, height, direction)
    updateTitle()
  }

  draw({
    canvas,
    state,
    highscores,
    width,
    height,
    now,
    paused,
    nameBuffer,
    overSaved,
    isHighScore: isHighScore(state.score, highscores),
    isTopScore: isTopScore(state.score, highscores),
    scoreRank: rankFor(state.score, highscores),
    stars,
  })
}, 33)

renderer.on("destroy", () => clearInterval(tick))

async function handleGameOverInput(key: KeyEvent) {
  if (key.name === "r" && (!isHighScore(state.score, highscores) || overSaved)) {
    state = newGame(width, height)
    nameBuffer = ""
    overSaved = false
    return
  }

  if (!isHighScore(state.score, highscores) || overSaved) return
  if (key.name === "backspace") nameBuffer = nameBuffer.slice(0, -1)
  else if (key.name === "return" && nameBuffer.trim()) {
    highscores = await saveHighScore(nameBuffer.trim(), state, highscores)
    overSaved = true
  } else if (/^[a-z0-9]$/i.test(key.sequence) && nameBuffer.length < 10) {
    nameBuffer += key.sequence.toUpperCase()
  }
}

function resizeGame() {
  const oldWidth = width
  width = Math.max(60, rendererWidth())
  height = Math.max(24, rendererHeight())
  resizeGameState(state, oldWidth, width, height)
  stars = createStars(width, height)
}

function updateTitle() {
  const level = Math.max(1, state.wave)
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
