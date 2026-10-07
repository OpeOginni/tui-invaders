import { describe, expect, spyOn, test } from "bun:test"
import { StyledText, type TextRenderable } from "@opentui/core"
import { arcadeHeadline, BOSS_INTRO_DURATION } from "../src/cinematic.js"
import { newGame, resizeGameState, shoot, updateGame } from "../src/game.js"
import { draw } from "../src/render.js"
import { bossArt, toCollisionFrame } from "../src/sprites.js"
import { EFFECT_EXTENSION_PIXELS, EFFECT_EXTENSION_SPRITE } from "../src/kit.js"
import type { Enemy, GameState } from "../src/types.js"

function arena(width = 120, height = 60) {
  const state = newGame(width, height, 12)
  updateGame(state, 0, state.start, width, height, 0)
  state.enemies[0]!.hp *= 0.75
  updateGame(state, 0, state.start, width, height, 0)
  return state
}

function step(state: GameState, dt = 0, width = 120, height = 60) {
  updateGame(state, dt, state.start + (state.elapsed + dt) * 1000, width, height, 0)
}

function reveal(state: GameState, width = 120, height = 60) {
  step(state, BOSS_INTRO_DURATION, width, height)
}

function hit(state: GameState, enemy: Enemy, damage: number) {
  enemy.frames = undefined
  enemy.sprite = ["█"]
  state.bullets.unshift({ x: Math.round(enemy.x - 0.5), y: enemy.y, dy: 0, friendly: true, damage })
  step(state)
}

function render(state: GameState, width: number, height: number) {
  const canvas = { content: new StyledText([]) } as TextRenderable
  draw({ canvas, state, width, height, now: state.start + state.elapsed * 1000,
    highscores: [], paused: false, nameBuffer: "", overSaved: false,
    isHighScore: false, isTopScore: false, scoreRank: 0, stars: [] })
  return (canvas.content as StyledText).chunks.map((chunk) => chunk.text).join("")
}

function breakShield(state: GameState) {
  for (const module of [...state.enemies].filter((enemy) => enemy.kitModule)) hit(state, module, module.hp)
}

describe("Kit's hot-reloaded encounter", () => {
  test("Kit enters without an intro and triggers his first shield cinematic only at 75% health", () => {
    const state = newGame(120, 60, 12)
    step(state)
    const boss = state.enemies[0]!
    expect(state.bossIntro).toBeUndefined()
    expect(boss.kitPhase).toBeUndefined()
    expect(state.enemies).toHaveLength(1)
    hit(state, boss, 374)
    expect(state.bossIntro).toBeUndefined()
    hit(state, boss, 9999)
    expect(boss.hp).toBe(1125)
    expect(boss.kitPhase).toBe(1)
    expect(state.bossIntro?.title).toBe("Rewrite in Effect!")
    reveal(state)
    expect(boss.hp).toBe(1350)
    expect(state.enemies.filter((enemy) => enemy.kitModule)).toHaveLength(2)
    hit(state, boss, 9999)
    expect(boss.hp).toBe(1350)
    breakShield(state)
    hit(state, boss, 9999)
    expect(boss.hp).toBe(750)
    expect(boss.kitPhase).toBe(2)
    expect(state.bossIntro?.title).toBe("Endomorphisms are inherently monoidal!")
    reveal(state)
    expect(boss.hp).toBe(975)
    expect(state.enemies.filter((enemy) => enemy.kitModule)).toHaveLength(3)
  })

  test("defeat shows a crying portrait and speech bubble, freezes play, and resumes without duplicate rewards", () => {
    for (const [width, height] of [[60, 24], [90, 30], [120, 60]] as const) {
      const state = arena(width, height)
      reveal(state, width, height)
      const boss = state.enemies[0]!
      // Set up the final unshielded hit; stage gating is covered separately.
      state.enemies = [boss]
      boss.kitPhase = 2
      boss.frames = undefined
      boss.sprite = ["█"]
      boss.fireCd = Infinity
      state.bullets = [{ x: Math.round(boss.x - 0.5), y: boss.y, dy: 0, damage: boss.hp, friendly: true }]
      step(state, 0, width, height)
      expect(state.kitOutro).toBeDefined()
      const score = state.score
      const xp = state.gunXP
      const level = state.gunLevel
      const hp = state.player.hp
      const x = state.player.x
      const now = state.start + state.elapsed * 1000
      state.rapidUntil = now + 5000
      expect(shoot(state, now + 1000, 0)).toBe(0)
      updateGame(state, 1, now + 1000, width, height, 1, -1)
      expect(state.player.x).toBe(x)
      expect(state.player.hp).toBe(hp)
      expect(state.rapidUntil).toBe(now + 6000)
      const scene = render(state, width, height)
      expect(scene).toContain("Fine. I'll blog about this.")
      expect(scene).toContain("╭")
      expect(scene).toContain("▀")
      expect(scene.split("\n").every((row) => row.length === width)).toBe(true)
      expect(state.wave).toBe(12)
      step(state, 2.8, width, height)
      expect(state.kitOutro).toBeUndefined()
      step(state, 0, width, height)
      expect(state.wave).toBe(13)
      expect(state.score).toBe(score)
      expect(state.gunXP).toBe(xp)
      expect(state.gunLevel).toBe(level)
    }
  })

  test("level 11 foreshadows Kit, level 12 introduces him, and level 15 remains Dax", () => {
    const lead = newGame(120, 60, 11)
    step(lead)
    expect(lead.encounterNotice?.text).toContain("Kit")
    const state = arena()
    expect(state.enemies[0]!.bossCharacter).toBe("kit")
    expect(state.enemies[0]!.maxHp).toBe(1500)
    expect(state.bossIntro?.title).toBe("Rewrite in Effect!")
    expect(state.enemies).toHaveLength(1)
    const later = newGame(120, 60, 15)
    step(later)
    expect(later.enemies[0]!.bossCharacter).toBe("dax")
  })

  test("arrival freezes combat and boosts, then provides exactly two matching Extensions once", () => {
    const state = arena()
    const now = state.start
    state.rapidUntil = now + 9000
    state.player.shieldUntil = now + 11000
    const x = state.player.x
    updateGame(state, 1, now + 1000, 120, 60, 1)
    expect(state.player.x).toBe(x)
    expect(shoot(state, now + 1000, 0)).toBe(0)
    expect(state.enemies).toHaveLength(1)
    step(state, BOSS_INTRO_DURATION - 1)
    expect(state.bossIntro).toBeUndefined()
    expect(state.rapidUntil - (state.start + state.elapsed * 1000)).toBeCloseTo(9000)
    expect(state.player.shieldUntil - (state.start + state.elapsed * 1000)).toBeCloseTo(11000)
    const extensions = state.enemies.filter((enemy) => enemy.kitModule === "extension")
    expect(extensions).toHaveLength(2)
    expect(extensions.every((enemy) => enemy.sprite === EFFECT_EXTENSION_SPRITE)).toBe(true)
    expect(EFFECT_EXTENSION_SPRITE).toEqual(toCollisionFrame(EFFECT_EXTENSION_PIXELS))
    step(state)
    expect(state.enemies).toHaveLength(3)
  })

  test("opening Extensions block all damage and breaking both restores full gun damage", () => {
    const state = arena()
    reveal(state)
    const boss = state.enemies[0]!
    hit(state, boss, 20)
    expect(boss.hp).toBe(1350)
    for (const module of [...state.enemies].filter((enemy) => enemy.kitModule)) hit(state, module, module.hp)
    const hp = boss.hp
    hit(state, boss, 20)
    expect(boss.hp).toBe(hp - 20)
    expect(state.enemies).toHaveLength(1)
    boss.fireCd = Infinity
    step(state, 20)
    expect(state.enemies).toHaveLength(1) // No endless shield replacement.
  })

  test("even overpowered volleys cannot skip the single half-health reload", () => {
    const state = arena()
    reveal(state)
    const boss = state.enemies[0]!
    breakShield(state)
    for (const [phase, hp, kinds] of [
      [2, 750, ["extension", "extension", "extension"]],
    ] as const) {
      const old = [...state.enemies]
      for (const owner of old) state.bullets.push({ x: 5, y: 5, dy: 1, friendly: false, damage: 1, owner })
      // Multiple lethal shots in one frame must stop at the same threshold.
      boss.frames = undefined
      boss.sprite = ["█"]
      for (let shot = 0; shot < 10; shot++) state.bullets.push({ x: boss.x - 0.5, y: boss.y, dy: 0, friendly: true, damage: 9999 })
      step(state)
      expect(boss.kitPhase).toBe(phase)
      expect(boss.hp).toBe(hp)
      expect(state.bossIntro).toBeDefined()
      expect(state.enemies).toHaveLength(1)
      expect(state.bullets.some((bullet) => !bullet.friendly)).toBe(false)
      reveal(state)
      expect(boss.hp).toBe(hp + 225)
      expect(state.enemies.filter((enemy) => enemy.kitModule).map((enemy) => enemy.kitModule)).toEqual([...kinds])
      expect(state.enemies.slice(1).every((enemy) => !old.includes(enemy))).toBe(true)
    }
    expect(state.bossIntro).toBeUndefined()
    const shieldedHp = boss.hp
    hit(state, boss, 9999)
    expect(boss.hp).toBe(shieldedHp)
    breakShield(state)
    hit(state, boss, 575)
    expect(boss.hp).toBe(400) // Passing the old 35% threshold does not interrupt.
    expect(state.bossIntro).toBeUndefined()
    expect(boss.kitPhase).toBe(2)
    const score = state.score
    hit(state, boss, 9999)
    expect(state.enemies).toHaveLength(0)
    expect(state.score).toBe(score + 3000)
    expect(state.encounterNotice?.text).toContain("I'll blog about this")
    expect(state.gunLevel).toBe(2)
    expect(state.gunXP).toBe(1)
    step(state)
    expect(state.wave).toBe(12)
    expect(state.kitOutro).toBeDefined()
    reveal(state)
    step(state)
    expect(state.wave).toBe(13)
  })

  test("destroying an Extension cancels its queued hits without cancelling another Extension", () => {
    const state = arena()
    reveal(state)
    const boss = state.enemies[0]!
    breakShield(state)
    hit(state, boss, 9999)
    reveal(state)
    const extension = state.enemies[1]!
    const other = state.enemies[2]!
    state.bullets = [
      { x: state.player.x, y: state.player.y, dy: 0, damage: 1, friendly: false, owner: extension },
      { x: 5, y: 5, dy: 0, damage: 1, friendly: false, owner: other },
    ]
    hit(state, extension, extension.hp)
    expect(state.player.hp).toBe(3)
    expect(state.bullets.some((bullet) => bullet.owner === extension)).toBe(false)
    expect(state.bullets.some((bullet) => bullet.owner === other)).toBe(true)
    expect(state.encounterNotice?.text).toContain("Extension removed")
    expect(state.score).toBe(450)
  })

  test("Kit's volleys keep a downward component even when the locked target is beside the muzzle", () => {
    for (const phase of [1, 2] as const) {
      const state = arena()
      reveal(state)
      const boss = state.enemies[0]!
      boss.kitPhase = phase
      boss.kitAim = boss.x - 100
      boss.kitAimY = boss.y + boss.sprite.length
      boss.fireCd = 0
      step(state)
      const shots = state.bullets.filter((bullet) => bullet.owner === boss)
      expect(shots.length).toBeGreaterThan(0)
      for (const shot of shots) expect(shot.dy).toBeGreaterThanOrEqual(14 / Math.SQRT2 - 0.001)
    }
  })

  test("aim locks both coordinates during the warning and both retries keep that point", () => {
    const state = arena()
    reveal(state)
    const boss = state.enemies[0]!
    breakShield(state)
    hit(state, boss, 9999)
    reveal(state)
    for (const module of state.enemies) if (module.kitModule) module.fireCd = Infinity
    state.player.x = 85
    state.player.y = 40
    boss.fireCd = 0.9
    step(state)
    expect(boss.kitAim).toBe(85)
    expect(boss.kitAimY).toBe(40)
    state.player.x = 20
    state.player.y = 50
    const warning = render(state, 120, 60).split("\n")
    expect(warning[38]![85]).toBe("▼")
    for (const rest of [0.55, 0.85, 2.8]) {
      state.bullets = []
      boss.fireCd = 0
      step(state)
      expect(boss.fireCd).toBe(rest)
      const shots = state.bullets.filter((bullet) => bullet.owner === boss)
      expect(shots).toHaveLength(2)
      const impacts = shots.map((bullet) => bullet.x + bullet.dx! * (40 - bullet.y) / bullet.dy)
      expect((impacts[0]! + impacts[1]!) / 2).toBeCloseTo(85)
    }
    expect(boss.kitAim).toBeUndefined()
    expect(boss.kitAimY).toBeUndefined()
    boss.fireCd = 0.9
    step(state)
    expect(boss.kitAim).toBe(20)
    expect(boss.kitAimY).toBe(50)
  })

  test("the blog's advertised update changes spread shots into bursts and upgrades matching Extensions", () => {
    const state = arena()
    reveal(state)
    const boss = state.enemies[0]!
    for (const enemy of state.enemies) enemy.fireCd = Infinity
    boss.fireCd = 0
    step(state)
    const openingShots = state.bullets.filter((bullet) => bullet.owner === boss)
    expect(openingShots).toHaveLength(3)
    expect(new Set(openingShots.map((bullet) => bullet.dx)).size).toBe(3)
    const extension = state.enemies[1]!
    extension.fireCd = 0
    step(state)
    expect(state.bullets.filter((bullet) => bullet.owner === extension)).toHaveLength(1)

    breakShield(state)
    hit(state, boss, 9999)
    reveal(state)
    expect(state.enemies.filter((enemy) => enemy.kitModule).every((enemy) => enemy.sprite === EFFECT_EXTENSION_SPRITE)).toBe(true)
    for (const enemy of state.enemies) enemy.fireCd = Infinity
    state.bullets = []
    boss.fireCd = 0
    step(state)
    const reloadedShots = state.bullets.filter((bullet) => bullet.owner === boss)
    expect(reloadedShots).toHaveLength(2)
    expect(reloadedShots[0]!.dx).toBe(reloadedShots[1]!.dx)
    expect(boss.fireCd).toBe(0.55)
    const upgraded = state.enemies[1]!
    upgraded.fireCd = 0
    step(state)
    expect(state.bullets.filter((bullet) => bullet.owner === upgraded).map((bullet) => bullet.dx)).toEqual([-4, 4])
  })

  test("modules share the boss pickup budget and transition cleanup gives no kill rewards", () => {
    const random = spyOn(Math, "random").mockReturnValue(0)
    try {
      const state = arena()
      reveal(state)
      const boss = state.enemies[0]!
      state.dropsThisWave = 6
      hit(state, state.enemies[1]!, 1000)
      expect(state.drops).toHaveLength(0)
      expect(state.score).toBe(150)
      hit(state, boss, 9999)
      expect(state.dropsThisWave).toBe(6)
      expect(state.score).toBe(150)
      reveal(state)
      expect(state.dropsThisWave).toBe(6)
    } finally {
      random.mockRestore()
    }
  })

  test("Kit art, titles, health and modules fit small and large arenas, including resizes", () => {
    for (const [width, height] of [[60, 24], [90, 30], [120, 60]] as const) {
      const state = arena(width, height)
      const boss = state.enemies[0]!
      for (const phase of [1, 2]) {
        state.bossIntro!.remaining = BOSS_INTRO_DURATION - 1.5
        const intro = render(state, width, height)
        expect(intro).toContain("BOSS KIT")
        expect(intro).toContain(state.bossIntro!.tagline)
        expect(intro).toContain("KIT // OVER 9,000x DEV")
        for (const row of arcadeHeadline(state.bossIntro!.title, width - 6, height - 8)) expect(intro).toContain(row)
        expect(intro).not.toContain(state.bossIntro!.tip)
        expect(intro).not.toContain("POWERED BY EFFECT")
        expect(intro).not.toContain("POST:")
        expect(intro).not.toContain("GEMINI")
        for (const jargon of ["LAYER", "FORK", "PIPE", "Fiber", "Scope", "ABSTRACTION"]) {
          expect(intro).not.toContain(jargon)
        }
        if (phase === 2) {
          expect(state.bossIntro!.title).toBe("Endomorphisms are inherently monoidal!")
        }
        expect(intro.split("\n").every((row) => row.length === width)).toBe(true)
        reveal(state, width, height)
        const play = render(state, width, height)
        const notice = state.encounterNotice!.text
        expect(play.split("\n")[1]).toContain(notice)
        expect(play.split("\n").slice(2).join("\n")).not.toContain(notice)
        const hud = play.split("\n")[0]!
        expect(hud).toContain(width < 100 ? "HP 3" : "Lives 3")
        expect(hud).toContain(width < 100 ? "Gun 1 (0/1)" : "Gun Lv.1 (0/1)")
        expect(play).toContain(`v${phase}.0`)
        expect(play).toContain(`EXTENSIONS ${phase === 1 ? 2 : 3}`)
        for (const jargon of ["LAYER", "FORK", "PIPE", "Fiber", "Scope"]) expect(play).not.toContain(jargon)
        expect(state.enemies.every((enemy) => enemy.y + enemy.sprite.length < state.player.y - 1)).toBe(true)
        expect(state.gameOver).toBe(false)
        if (phase === 1) {
          boss.hp = boss.maxHp * 0.5
          step(state, 0, width, height)
        }
      }
      resizeGameState(state, width, 60, 24)
      step(state, 0, 60, 24)
      expect(boss.frames).toBe(bossArt("kit", 24).frames)
      expect(state.gameOver).toBe(false)
      expect(state.enemies.every((enemy) => enemy.y + enemy.sprite.length < state.player.y - 1)).toBe(true)
    }
  })

  test("upgraded guns can finish the real encounter; max level remains a meaningful advantage", () => {
    const durations: number[] = []
    for (const level of [5, 8]) {
      const state = arena()
      const boss = state.enemies[0]!
      state.gunLevel = level
      state.player.shieldUntil = Infinity // Measure offense, not this bot's dodging.
      let lastShot = state.start - 1000
      for (let tick = 1; tick <= 120 * 60 && boss.hp > 0; tick++) {
        const now = state.start + tick * 1000 / 60
        const target = state.enemies.find((enemy) => enemy.kitModule) ?? boss
        // Lead moving targets: shots take almost two seconds to reach the
        // top of a tall terminal, so chasing their current x mostly misses.
        const travel = Math.max(0, (state.player.y - 1 - target.y - target.sprite.length / 2) / 26)
        let aim: number
        if (target.kitModule) {
          const count = boss.kitPhase === 1 ? 2 : 3
          aim = 120 * ((target.kitSlot ?? 0) + 1) / (count + 1)
            + Math.sin(((target.kitClock ?? 0) + travel) * 1.2 + (target.kitSlot ?? 0) * 2) * (120 / 18)
        } else {
          const speed = 3.5 + 7 * 0.55 + (1 + state.elapsed / 60) * 0.25
          let offset = state.waveOffsetX + state.waveDirection * speed * travel
          if (offset > state.waveSwingMax) offset = 2 * state.waveSwingMax - offset
          if (offset < state.waveSwingMin) offset = 2 * state.waveSwingMin - offset
          aim = boss.baseX + offset
        }
        const direction = Math.abs(aim - state.player.x) < 0.6 ? 0 : Math.sign(aim - state.player.x)
        lastShot = shoot(state, now, lastShot)
        updateGame(state, 1 / 60, now, 120, 60, direction)
        state.drops = [] // Neither random supplies nor temporary boosts help.
      }
      expect(boss.hp).toBeLessThanOrEqual(0)
      expect(state.gameOver).toBe(false)
      expect(state.enemies).toHaveLength(0)
      expect(state.bullets.some((bullet) => !bullet.friendly)).toBe(false)
      expect(state.elapsed).toBeGreaterThan(20)
      expect(state.elapsed).toBeLessThan(120)
      durations.push(state.elapsed)
    }
    expect(durations[1]!).toBeLessThan(durations[0]! * 0.8)
  })
})
