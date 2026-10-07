// Five-row arcade lettering: readable even in the 60-column embedded arena.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "11111", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "11110"],
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
  U: ["10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10101", "10101", "01010"],
  Y: ["10001", "01010", "00100", "00100", "00100"],
  "?": ["11110", "00001", "00110", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00000", "00100"],
  " ": ["000", "000", "000", "000", "000"],
}

export const BOSS_INTRO_DURATION = 3.8

// Three-row lettering keeps long jokes readable in the minimum 60×24 arena.
const SMALL: Record<string, string[]> = {
  A: ["010", "111", "101"], C: ["111", "100", "111"],
  D: ["110", "101", "110"], E: ["111", "110", "111"],
  F: ["111", "110", "100"], G: ["111", "101", "111"],
  H: ["101", "111", "101"], I: ["111", "010", "111"],
  L: ["100", "100", "111"], M: ["101", "111", "101"],
  N: ["110", "101", "101"], O: ["111", "101", "111"],
  P: ["111", "111", "100"], R: ["110", "111", "101"],
  S: ["011", "010", "110"], T: ["111", "010", "010"],
  U: ["101", "101", "111"], V: ["101", "101", "010"],
  W: ["101", "111", "111"], Y: ["101", "010", "010"],
  "?": ["110", "001", "010"], "!": ["1", "1", "1"],
  " ": ["0", "0", "0"],
}

export function arcadeHeadline(text: string, width: number, height: number): string[] {
  for (const font of [FONT, SMALL]) {
    const render = (line: string) => {
      const letters = [...line.toUpperCase()].map((letter) => font[letter] ?? font[" "]!)
      return Array.from({ length: font.A!.length }, (_, row) => letters.map((letter) => letter[row]).join("0").replaceAll("1", "█").replaceAll("0", " "))
    }
    const lines: string[] = []
    for (const word of text.split(" ")) {
      const last = lines.at(-1)
      if (last && render(`${last} ${word}`)[0]!.length <= width) lines[lines.length - 1] += ` ${word}`
      else lines.push(word)
    }
    const rows = lines.flatMap((line, index) => [...(index ? [""] : []), ...render(line)])
    if (rows.length <= height && rows.every((row) => row.length <= width)) {
      const widest = Math.max(...rows.map((row) => row.length))
      return rows.map((row) => (" ".repeat(Math.floor((widest - row.length) / 2)) + row).padEnd(widest))
    }
  }
  return [text.slice(0, width)]
}

export function arcadeText(text: string): string[] {
  const letters = [...text.toUpperCase()].map((letter) => FONT[letter] ?? FONT[" "]!)
  return Array.from({ length: 5 }, (_, row) => letters.map((letter) => letter[row]).join("0").replaceAll("1", "█").replaceAll("0", " "))
}

export function introCoverage(remaining: number): number {
  const elapsed = BOSS_INTRO_DURATION - remaining
  const progress = Math.max(0, Math.min(1, elapsed / 0.55, remaining / 0.65))
  return progress * progress * (3 - 2 * progress)
}
