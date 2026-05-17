import { homedir, platform } from "node:os"
import { join } from "node:path"
import type { GameState, HighScore } from "./types"

function resolveDataDir() {
  if (platform() === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "tui-invaders")
  }
  if (platform() === "darwin") {
    return join(process.env.XDG_DATA_HOME || join(homedir(), "Library", "Application Support"), "tui-invaders")
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "tui-invaders")
}

const SAVE_FILE = join(resolveDataDir(), "highscores.json")

export async function loadHighScores(): Promise<HighScore[]> {
  try {
    const data = await Bun.file(SAVE_FILE).json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function isHighScore(score: number, highscores: HighScore[]) {
  return score > 0 && (highscores.length < 10 || score > highscores.at(-1)!.score)
}

export async function saveHighScore(name: string, state: GameState, highscores: HighScore[]) {
  const next = [...highscores, { name, score: state.score, seconds: Math.floor(state.elapsed), date: new Date().toISOString() }]
  next.sort((a, b) => b.score - a.score)
  const top = next.slice(0, 10)
  await Bun.write(SAVE_FILE, JSON.stringify(top, null, 2))
  return top
}
