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

  private width: number
  private height: number
  private stars: Star[]
  private nameBuffer = ""
  private overSaved = false
  private lastShot = 0
  private last = performance.now()
  private moveLeftUntil = 0
  private moveRightUntil = 0
  private moveDirection = 0
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
    if (this.paused || this.state.gameOver) return
    const direction = this.moveDirection || (now < this.moveRightUntil ? 1 : 0) - (now < this.moveLeftUntil ? 1 : 0)
    updateGame(this.state, dt, now, this.width, this.height, direction)
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
    })
  }

  async press(key: InvadersInput, held = true) {
    if (this.state.gameOver) {
      await this.handleGameOverInput(key)
      return
    }
    if (key.name === "p" || key.name === "escape") {
      this.paused = !this.paused
      return
    }
    if (this.paused) return
    if (key.name === "space") this.lastShot = shoot(this.state, performance.now(), this.lastShot)
    if (key.name === "left" || key.name === "a") {
      this.moveDirection = held ? -1 : 0
      this.moveLeftUntil = performance.now() + 130
    }
    if (key.name === "right" || key.name === "d") {
      this.moveDirection = held ? 1 : 0
      this.moveRightUntil = performance.now() + 130
    }
  }

  tap(key: InvadersInput) {
    return this.press(key, false)
  }

  release(key: InvadersInput) {
    if ((key.name === "left" || key.name === "a") && this.moveDirection === -1) this.moveDirection = 0
    if ((key.name === "right" || key.name === "d") && this.moveDirection === 1) this.moveDirection = 0
  }

  resize(width: number, height: number) {
    const oldWidth = this.width
    this.width = Math.max(this.minWidth, width)
    this.height = Math.max(this.minHeight, height)
    resizeGameState(this.state, oldWidth, this.width, this.height)
    this.stars = createStars(this.width, this.height)
  }

  pause() {
    this.paused = true
  }

  restart() {
    this.state = newGame(this.width, this.height, this.startLevel)
    this.nameBuffer = ""
    this.overSaved = false
    this.paused = false
    this.last = performance.now()
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
