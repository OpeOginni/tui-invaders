import { parseArgs } from "node:util"

export function parseCliArgs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      level: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  })
  const level = Number(values.level ?? "1")
  if (!/^\d+$/.test(values.level ?? "1") || !Number.isSafeInteger(level) || level < 1) {
    throw new Error("--level must be a positive whole number (for example, --level 9).")
  }
  return { level, help: values.help ?? false }
}
