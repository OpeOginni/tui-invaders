// Aim within a downward cone. Wide arenas and pilots near/above the muzzle
// must not turn enemy fire into horizontal streams. Keep speed constant.
export function aimVelocity(x: number, y: number, targetX: number, targetY: number, speed: number) {
  const dy = Math.max(1, targetY - y)
  const dx = Math.max(-dy, Math.min(dy, targetX - x))
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { dx: 0, dy: speed }
  return { dx: dx / distance * speed, dy: dy / distance * speed }
}
