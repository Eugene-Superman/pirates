import type { GameState, Shell } from '../../../game';
import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';
import type { ShotEffects } from './ShotEffects';

// A boss's grapeshot: iron balls dark against the sea, a glint of the fire that threw them on each, a streak of smoke
// behind; a player's bombardment's spot glows gold on the water (a boss's glows red in the sea's own light, Beacon.ts)
const COLORS = { iron: 0x2a2520, glint: 0xff9440, streak: 0xe6e0d6, shadow: 0x000000, red: 0xff5a40, gold: 0xffd77a };
// A boss's shell is a canister of this many balls, landing within this share of its blast's radius of its middle, the
// first of them this many seconds before the last, which lands with the shell (game: the shell's damage is one blow)
const GRAPESHOT = { balls: 7, spread: 0.85, stagger: 0.16 } as const;
// The balls show from this share of the shell's flight, this many world units up, coming down steeper and steeper
// from the side of the ship that fired them: `slant` world units sideways for every one up. Bunched together at the top
// (`bunch` of the way out), they fan out as they fall, the canister's shot spreading
const FALL = { from: 0.45, height: 120, slant: 0.55, bunch: 0.15 } as const;
// World units: a ball of grapeshot, a bombardment's shell; the glint round each, as a share of it, and how bright
const SIZE = { ball: 1.5, shell: 2.1 } as const;
const GLINT = { size: 1.6, alpha: 0.3 } as const;
const STREAK = { back: 0.07, width: 0.9, alpha: 0.45 } as const; // its streak: the share of its fall it reaches back
// The shadow each throws on its spot, darker and tighter as it comes down: its opacity there, how much wider than the
// ball it starts, and its soft rim, wider by this share and as much fainter
const SHADOW = { alpha: 0.55, wide: 3.5, rim: 1.7 } as const;
// A spot the sea doesn't light (a bombardment's, or any till the sea's maps load): a soft glow, discs one in another,
// each this opaque at first and at its landing; no outline
const GLOW = { discs: 4, alpha: [0.03, 0.07] } as const;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // radians: balls set round by it cover a disc evenly

/** One ball of a shell's shot, where and when it lands */
interface Ball {
  readonly x: number;
  readonly y: number;
  readonly landsAt: number;
  landed: boolean;
}

/** A shell as it is drawn, kept till its last ball has landed (the game takes the shell out as it lands) */
interface Volley {
  readonly shell: Shell;
  /** A player's bombardment's: one heavy shell, gold; a boss's: grapeshot, red */
  readonly own: boolean;
  /** Which way, on the water, the ship that fired it was: its shot comes down from there */
  readonly fromX: number;
  readonly fromY: number;
  readonly balls: readonly Ball[];
}

/**
 * A boss's barrage seen coming, or a player's bombardment (game: state.shells). A boss's shell is grapeshot: its balls
 * come down out of the sky from the boss's side, bunched and fanning out over its spot, each with its shadow on the
 * water darkening as it nears, and land one after another, each throwing up its own spout (ShotEffects); the sea
 * lights the spot red (Beacon.ts, SpotBeacons). A bombardment's shell comes down alone, onto a soft gold glow
 */
export class BarrageMarks {
  private readonly volleys = new Map<number, Volley>();

  /** New shells taken in, and balls landed this frame thrown into the sea */
  update(state: GameState, shots: ShotEffects) {
    for (const shell of state.shells) if (!this.volleys.has(shell.id)) this.volleys.set(shell.id, takeIn(shell, state));
    for (const [id, { own, balls }] of this.volleys) {
      let falling = 0;
      for (const ball of balls) {
        if (ball.landed) continue;
        if (state.time < ball.landsAt) {
          falling++;
          continue;
        }
        ball.landed = true;
        shots.shellSplash(ball.x, ball.y, !own);
      }
      if (falling === 0) this.volleys.delete(id);
    }
  }

  /** The shadows of the shot on the water, and the glow where the sea doesn't light it. Drawn with the sea */
  drawWater(p: Painter3D, time: number, seaLit: boolean) {
    for (const { shell, own, balls } of this.volleys.values()) {
      if (!p.isVisible(shell.x, shell.y, 0, shell.radius)) continue;
      const near = flight(shell, time);
      if (near < 1 && (own || !seaLit)) {
        const alpha = GLOW.alpha[0] + (GLOW.alpha[1] - GLOW.alpha[0]) * near;
        for (let i = GLOW.discs; i > 0; i--) {
          p.disc(shell.x, shell.y, 0, (shell.radius * i) / GLOW.discs, own ? COLORS.gold : COLORS.red, alpha);
        }
      }
      const size = own ? SIZE.shell : SIZE.ball;
      for (const ball of balls) {
        if (ball.landed) continue;
        const k = Math.min(1, (time - shell.firedAt) / (ball.landsAt - shell.firedAt));
        const radius = size * (1 + (SHADOW.wide - 1) * (1 - k));
        const alpha = SHADOW.alpha * k * k;
        if (alpha < 0.01) continue;
        p.disc(ball.x, ball.y, 0, radius * SHADOW.rim, COLORS.shadow, alpha / SHADOW.rim);
        p.disc(ball.x, ball.y, 0, radius, COLORS.shadow, alpha);
      }
    }
  }

  /** The shot coming down onto its spots. A few dozen balls at most: not culled, as the fire layer's painter isn't */
  draw(p: Painter3D, time: number) {
    for (const volley of this.volleys.values()) {
      const { shell, own, balls } = volley;
      const showFrom = shell.firedAt + FALL.from * (shell.landsAt - shell.firedAt);
      const size = own ? SIZE.shell : SIZE.ball;
      for (const ball of balls) {
        if (ball.landed || time < showFrom) continue;
        const s = (time - showFrom) / (ball.landsAt - showFrom);
        const at = ballAt(volley, ball, s);
        if (s > STREAK.back)
          p.line(ballAt(volley, ball, s - STREAK.back), at, STREAK.width, COLORS.streak, STREAK.alpha);
        p.ball(at, size * GLINT.size, COLORS.glint, GLINT.alpha);
        p.ball(at, size, COLORS.iron);
      }
    }
  }
}

/** How far a shell has come, 0 as it is fired, 1 as it lands */
function flight(shell: Shell, time: number) {
  return Math.min(1, Math.max(0, (time - shell.firedAt) / (shell.landsAt - shell.firedAt)));
}

/** Where a ball is `s` of the way down its fall (0 at the top, 1 on the water) */
function ballAt({ shell, fromX, fromY }: Volley, ball: Ball, s: number): Vec3 {
  const z = FALL.height * (1 - s * s);
  const out = FALL.bunch + (1 - FALL.bunch) * s;
  const side = z * FALL.slant;
  return [shell.x + (ball.x - shell.x) * out + fromX * side, shell.y + (ball.y - shell.y) * out + fromY * side, z];
}

/** A shell as it is drawn: a boss's grapeshot's balls set evenly over its spot, a little at random; a bombardment's one */
function takeIn(shell: Shell, state: GameState): Volley {
  const own = shell.ordnance !== null;
  const owner = state.ships.find((ship) => ship.id === shell.ownerId);
  const dx = owner ? owner.x - shell.x : 0;
  const dy = owner ? owner.y - shell.y : 0;
  const away = Math.hypot(dx, dy);
  const count = own ? 1 : GRAPESHOT.balls;
  const turn = Math.random() * Math.PI * 2;
  const balls: Ball[] = [];
  for (let i = 0; i < count; i++) {
    const out = own ? 0 : shell.radius * GRAPESHOT.spread * Math.sqrt((i + 0.5) / count) * (0.85 + 0.3 * Math.random());
    const angle = turn + i * GOLDEN_ANGLE + (Math.random() - 0.5) * 0.6;
    balls.push({
      x: shell.x + Math.cos(angle) * out,
      y: shell.y + Math.sin(angle) * out,
      // The last of them lands with the shell, when the game strikes what is under it
      landsAt: shell.landsAt - (own || i === 0 ? 0 : Math.random() * GRAPESHOT.stagger),
      landed: false,
    });
  }
  return { shell, own, fromX: away > 1 ? dx / away : 0, fromY: away > 1 ? dy / away : 0, balls };
}
