// Five-row arcade lettering: readable even in the 60-column embedded arena.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "11111", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000"],
  G: ["01111", "10000", "10111", "10001", "01110"],
  H: ["10001", "10001", "11111", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "11100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "11110", "10000", "10000"],
  R: ["11110", "10001", "11110", "10010", "10001"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100"],
  " ": ["000", "000", "000", "000", "000"],
}

export const BOSS_INTRO_DURATION = 3.8

export function arcadeText(text: string): string[] {
  const letters = [...text.toUpperCase()].map((letter) => FONT[letter] ?? FONT[" "]!)
  return Array.from({ length: 5 }, (_, row) => letters.map((letter) => letter[row]).join("0").replaceAll("1", "█").replaceAll("0", " "))
}

export function introCoverage(remaining: number): number {
  const elapsed = BOSS_INTRO_DURATION - remaining
  const progress = Math.max(0, Math.min(1, elapsed / 0.55, remaining / 0.65))
  return progress * progress * (3 - 2 * progress)
}
