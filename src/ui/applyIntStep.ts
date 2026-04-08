/** Integer step for arrow buttons (clamp to [min, max]). */
export function applyIntStep(value: number, min: number, max: number, delta: number): number {
  return Math.min(max, Math.max(min, value + delta))
}
