# 🛸 TUI Invaders

The classic Space Invaders experience, rebuilt for your terminal.

Built with [OpenTUI](https://github.com/anomalyco/opentui) for buttery-smooth terminal rendering.

![TUI Invaders gameplay](docs/screenshot.png)

## Features

- 🎨 **True pixel-art ships** — half-block rendering with per-cell colors for crisp visuals
- 👾 **Boss fights** — starting at level 3, then every 3 levels, with health bars and explosive finales
- 🐋 **Special operations** — after losing 25% health, Dax at level 6 calls in Operation Cheepseek's whale escorts, while Luke / Hona at level 9 calls in Gemini For Life's twin stars. Cinematic backup calls transition automatically back into combat. Later bosses return to Dax with rotating shooting styles
- 🛸 **Boss reinforcements** — Dax refills three whales every nine seconds; Luke refills four Gemini stars every 5.5 seconds. Fewer survivors get wider patrol routes; defeating the boss takes down the whole squad. Boss fights allow up to six pickups, with a three-second drop cooldown
- 🌠 **Gemini For Life** — Luke fires left/center/right twin volleys in randomized order, with a return-fire window. Four-point stars ease through patrol turns; wounded stars mark a fixed dive lane, then grow into smoothly accelerating falling stars. Once a dive is signaled, shots pass through: dodge the star! Stars are killable before committing, and defeating Luke clears all remaining stars
- ⚡ **Power-up drops** — gun upgrade, rapid fire, shield, spread, triple shot, and the elusive extra life
- 🎯 **Earn your upgrades** — clearing a wave grants 1 permanent gun XP (2 for bosses); gun pickups add extra XP. Boss damage can shake loose supplies, with paced, need-aware drops rather than a loot shower
- 💪 **Stronger, not just more** — regular formations grow slowly to at most 24 ships (fewer in small terminals). Enemy armor scales alongside earned gun upgrades, with gradual health increases after the gun caps; extra pickups give you an edge
- ✨ **Starfield background** with animated particles for that arcade atmosphere
- 🏆 **Persistent high scores** — compete with yourself (or your friends)
- ⏸️ **Pause anytime** — because life happens

## Requirements

- [Bun](https://bun.sh) `>=1.3.0`

## Quick Start

```sh
# Play instantly (no install required)
bunx tui-invaders

# Or install globally
bun install -g tui-invaders
tui-invaders
```

Jump straight to a level with `--level` (Hona is level **9**):

```sh
tui-invaders --level 9
# From this repository:
bun run start --level 9
```

Restarting returns to the selected level. You begin with the usual starting lives
and gun; the boss's backup cinematic still triggers after losing 25% health.

## Controls

| Key      | Action           |
| -------- | ---------------- |
| `← / A`  | Move left        |
| `→ / D`  | Move right       |
| `Space`  | Shoot            |
| `P`      | Pause / resume   |
| `R`      | Restart (on game over) |
| `Ctrl+C` | Quit             |

## High Scores

Your best scores are saved automatically:

| Platform | Location                                                          |
| -------- | ----------------------------------------------------------------- |
| Linux    | `$XDG_DATA_HOME/tui-invaders/highscores.json` (or `~/.local/share/tui-invaders/`) |
| macOS    | `~/Library/Application Support/tui-invaders/highscores.json`      |
| Windows  | `%APPDATA%\tui-invaders\highscores.json`                          |

## Development

```sh
# Install dependencies
bun install

# Run in development mode
bun run start

# Type-check
bun run check

# Run tests
bun test
```

## Embedding

The standalone game and embedded integrations share the same host-driven game
session. Import `InvadersGame`, provide dimensions, forward input, and render it
into an OpenTUI `TextRenderable` owned by your application:

```ts
import { InvadersGame } from "tui-invaders/embed"

const game = await InvadersGame.load(width, height)
game.step()
game.draw(canvas)
```

## License

MIT

bright rules
