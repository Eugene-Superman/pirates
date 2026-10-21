export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Приводить кут до діапазону [-PI, PI]
export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
