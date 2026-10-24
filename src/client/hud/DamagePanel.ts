import type { DamageStage } from '../../game';
import { ButtonRow, type ButtonSpec } from './ButtonRow';
import { t } from '../i18n/i18n';

// A testing tool, not a game control: sets the ship's hull integrity so every damage stage can be looked at
const PRESETS: readonly { label: string; health: number; stage: DamageStage }[] = [
  { label: 'Intact 100%', health: 100, stage: 'intact' },
  { label: 'Minor 70%', health: 70, stage: 'minor' },
  { label: 'Heavy 45%', health: 45, stage: 'heavy' },
  { label: 'Burning 20%', health: 20, stage: 'burning' },
  { label: 'Sunk 0%', health: 0, stage: 'sinking' },
];
const STEP = 10; // percent, for the −/+ buttons

export interface DamageActions {
  /** Absolute hull integrity, percent */
  setHealth: (health: number) => void;
  /** Change of hull integrity, percent */
  changeHealth: (delta: number) => void;
}

// State presets, then −10% and +10%. The pressed preset follows the ship's actual stage
export class DamagePanel {
  private readonly row: ButtonRow<DamageStage>;

  constructor(actions: DamageActions) {
    const specs: ButtonSpec<DamageStage>[] = PRESETS.map((preset) => ({
      label: t(preset.label),
      key: preset.stage,
      onTap: () => actions.setHealth(preset.health),
    }));
    specs.push(
      { label: `−${STEP}%`, key: null, onTap: () => actions.changeHealth(-STEP) },
      { label: `+${STEP}%`, key: null, onTap: () => actions.changeHealth(STEP) },
    );
    this.row = new ButtonRow(specs);
  }

  get container() {
    return this.row.container;
  }

  update(stage: DamageStage) {
    this.row.setActive(stage);
  }
}
