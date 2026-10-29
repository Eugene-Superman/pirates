import type { GameState } from '../../../game';
import type { Painter3D } from '../../render/Painter3D';

// A boss's marks in red, a player's own bombardment's in gold
const COLORS = { ring: 0xff4a3a, fill: 0xff6a4a, ownRing: 0xffc94a, ownFill: 0xffd77a, shell: 0x2a2a2a } as const;
const FALL = { from: 0.55, height: 90 } as const; // the shell shows falling from this share of its flight, world units up
const PULSE = 9; // radians per second: the ring's beat

/**
 * A boss's barrage seen coming, or a player's bombardment (game: state.shells): every spot a shell will land on is
 * marked on the water, a ring that fills in as the shell comes down (red, gold for a player's own), and the shell
 * itself falling for the last part of its flight
 */
export class BarrageMarks {
  /** The marks on the water. Drawn with the sea */
  drawWater(p: Painter3D, state: GameState) {
    for (const shell of state.shells) {
      if (!p.isVisible(shell.x, shell.y, 0, shell.radius)) continue;
      const t = Math.min(1, (state.time - shell.firedAt) / (shell.landsAt - shell.firedAt));
      const beat = 0.75 + 0.25 * Math.sin(state.time * PULSE);
      const own = shell.ordnance !== null;
      const fill = own ? COLORS.ownFill : COLORS.fill;
      p.disc(shell.x, shell.y, 0, shell.radius, fill, 0.08 + 0.1 * t);
      p.disc(shell.x, shell.y, 0, shell.radius * t, fill, 0.22 * t);
      p.ring(shell.x, shell.y, 0, shell.radius, 1.6, own ? COLORS.ownRing : COLORS.ring, 0.85 * beat);
    }
  }

  /** The shells falling onto their marks */
  draw(p: Painter3D, state: GameState) {
    for (const shell of state.shells) {
      const t = (state.time - shell.firedAt) / (shell.landsAt - shell.firedAt);
      if (t < FALL.from || t >= 1) continue;
      const z = FALL.height * (1 - (t - FALL.from) / (1 - FALL.from));
      p.ball([shell.x, shell.y, z], 1.8, COLORS.shell);
    }
  }
}
