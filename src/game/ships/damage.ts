/** Hull integrity is measured in percent: 100 is a new ship, 0 is a wreck that sinks */
export const MAX_HEALTH = 100;

/**
 * How damaged a ship looks and behaves, from intact to sinking.
 * The client shows a different sprite for each stage, plus fire from `burning` and the sinking animation at `sinking`.
 */
export const DAMAGE_STAGES = ['intact', 'minor', 'heavy', 'burning', 'sinking'] as const;
export type DamageStage = (typeof DAMAGE_STAGES)[number];

// Lowest health of each stage, percent. Below `burning` only 0 remains, which is `sinking`
const MINOR_BELOW = 75;
const HEAVY_BELOW = 50;
const BURNING_BELOW = 25;

/**
 * Stage for a health value:
 * 100–76 intact, 75–51 minor, 50–26 heavy, 25–1 burning, 0 sinking
 */
export function damageStage(health: number): DamageStage {
  if (health <= 0) return 'sinking';
  if (health <= BURNING_BELOW) return 'burning';
  if (health <= HEAVY_BELOW) return 'heavy';
  if (health <= MINOR_BELOW) return 'minor';
  return 'intact';
}
