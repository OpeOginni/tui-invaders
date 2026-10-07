import type { TextRenderable } from "@opentui/core"
import { newGame, resizeGameState, shoot, updateGame } from "./game.js"
import { isHighScore, isTopScore, loadHighScores, rankFor, saveHighScore } from "./highscores.js"
import { createStars, draw, type Star } from "./render.js"
import type { GameState, HighScore } from "./types.js"

export type InvadersInput = {
  name: string
  sequence?: string
}

export type HighScoreWriter = (
  name: string,
  state: GameState,
  highscores: HighScore[],
) => Promise<HighScore[]>

export class InvadersGame {
  readonly minWidth = 60
  readonly minHeight = 24

  state: GameState
  highscores: HighScore[]
  paused = false
  selectingShip = true
  selectedShip: "opencode" | "opencodejr" = "opencode"

  private width: number
  private height: number
  private stars: Star[]
  private nameBuffer = ""
  private overSaved = false
  private lastShot = 0
  private last = performance.now()
  private heldMovement = new Set<string>()
  private movementUntil = new Map<string, number>()
  private readonly save: HighScoreWriter

  constructor(width: number, height: number, highscores: HighScore[] = [], save: HighScoreWriter = saveHighScore, private readonly startLevel = 1) {
    this.width = Math.max(this.minWidth, width)
    this.height = Math.max(this.minHeight, height)
    this.highscores = highscores
    this.save = save
    this.state = newGame(this.width, this.height, this.startLevel)
    this.stars = createStars(this.width, this.height)
  }

  static async load(width: number, height: number, startLevel = 1) {
    return new InvadersGame(width, height, await loadHighScores(), saveHighScore, startLevel)
  }

  get level() {
    return Math.max(this.startLevel, this.state.wave)
  }

  get size() {
    return { width: this.width, height: this.height }
  }

  step(now = performance.now()) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
    this.last = now
    if (this.selectingShip || this.paused || this.state.gameOver) return
    const moving = (...names: string[]) => names.some((name) => this.heldMovement.has(name) || now < (this.movementUntil.get(name) ?? 0))
    const horizontal = Number(moving("right", "d")) - Number(moving("left", "a"))
    const vertical = Number(moving("down", "s")) - Number(moving("up", "w"))
    updateGame(this.state, dt, now, this.width, this.height, horizontal, vertical)
  }

  draw(canvas: TextRenderable, now = performance.now()) {
    draw({
      canvas,
      state: this.state,
      highscores: this.highscores,
      width: this.width,
      height: this.height,
      now,
      paused: this.paused,
      nameBuffer: this.nameBuffer,
      overSaved: this.overSaved,
      isHighScore: isHighScore(this.state.score, this.highscores),
      isTopScore: isTopScore(this.state.score, this.highscores),
      scoreRank: rankFor(this.state.score, this.highscores),
      stars: this.stars,
      selectingShip: this.selectingShip,
      selectedShip: this.selectedShip,
    })
  }

  async press(key: InvadersInput, held = true) {
    if (this.selectingShip) {
      if (["left", "right", "a", "d"].includes(key.name)) {
        this.selectedShip = this.selectedShip === "opencode" ? "opencodejr" : "opencode"
      } else if (["return", "enter", "space"].includes(key.name)) this.start()
      return
    }
    if (this.state.gameOver) {
      await this.handleGameOverInput(key)
      return
    }
    if (key.name === "p" || key.name === "escape") {
      this.paused = !this.paused
      this.clearMovement()
      return
    }
    if (this.paused) return
    if (key.name === "space") this.lastShot = shoot(this.state, performance.now(), this.lastShot)
    if (["left", "right", "up", "down", "a", "d", "w", "s"].includes(key.name)) {
      if (held) this.heldMovement.add(key.name)
      else this.movementUntil.set(key.name, performance.now() + 130)
    }
  }

  tap(key: InvadersInput) {
    return this.press(key, false)
  }

  release(key: InvadersInput) {
    this.heldMovement.delete(key.name)
    this.movementUntil.delete(key.name)
  }

  resize(width: number, height: number) {
    const oldWidth = this.width
    const oldHeight = this.height
    this.width = Math.max(this.minWidth, width)
    this.height = Math.max(this.minHeight, height)
    resizeGameState(this.state, oldWidth, this.width, this.height, oldHeight)
    this.stars = createStars(this.width, this.height)
  }

  pause() {
    this.paused = true
    this.clearMovement()
  }

  restart() {
    this.selectingShip = true
    this.resetRun()
  }

  start() {
    this.selectingShip = false
    this.resetRun()
  }

  private resetRun() {
    this.state = newGame(this.width, this.height, this.startLevel)
    this.state.ship = this.selectedShip
    resizeGameState(this.state, this.width, this.width, this.height)
    this.nameBuffer = ""
    this.overSaved = false
    this.paused = false
    this.clearMovement()
    this.lastShot = 0
    this.last = performance.now()
  }

  private clearMovement() {
    this.heldMovement.clear()
    this.movementUntil.clear()
  }

  private async handleGameOverInput(key: InvadersInput) {
    if (key.name === "r" && (!isHighScore(this.state.score, this.highscores) || this.overSaved)) {
      this.restart()
      return
    }
    if (!isHighScore(this.state.score, this.highscores) || this.overSaved) return
    if (key.name === "backspace") this.nameBuffer = this.nameBuffer.slice(0, -1)
    else if (key.name === "return" && this.nameBuffer.trim()) {
      this.highscores = await this.save(this.nameBuffer.trim(), this.state, this.highscores)
      this.overSaved = true
    } else if (/^[a-z0-9]$/i.test(key.sequence ?? "") && this.nameBuffer.length < 10) {
      this.nameBuffer += key.sequence!.toUpperCase()
    }
  }
}

export type { GameState, HighScore } from "./types.js"
