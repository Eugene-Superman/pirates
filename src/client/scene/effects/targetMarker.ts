import type { Vec3 } from '../../render/Camera3D';
import type { Painter3D } from '../../render/Painter3D';

const COLORS = {
  glow: 0x3ee85a, // the light's halo, its glow on the water, the ripples
  core: 0xb8ffb0, // its bright heart
  shine: 0xffffff, // the glint on it
  splash: 0xd8ffd2, // the splash as it comes up
};
// A light coming up out of the water where the mouse let go: two rings thrown out one after the other, drops of water
// flying up and falling back. World units, seconds
const SPLASH = { time: 0.55, from: 2, to: 22, delay: 0.12, shrink: 0.35, width: 1.6, alpha: 0.85 };
const DROPLETS = { count: 7, time: 0.42, speed: 32, rise: 30, gravity: 140, radius: 0.9 };
// Then it hangs over the water: bounced up to `hover`, bobbing, its heart breathing
const ORB = { hover: 3.5, bounce: 6, wobble: 9, bob: 1, bobRate: 2.3, halo: 4.4, body: 2.6, core: 1.4, shine: 0.6 };
const PULSE = { amount: 0.14, rate: 5 };
// Its light on the water under it
const POOL = { radius: 8, inner: 3.6, alpha: 0.2, innerAlpha: 0.32 };
// Rings running out from it over the water, one after another
const RIPPLES = { count: 2, rate: 0.75, from: 4, to: 19, width: 1.2, alpha: 0.6 };
// Sparks circling it like fireflies, each with a fading tail
const SPARKS = { count: 3, radius: 6.5, rate: 2.4, wobble: 0.9, size: 0.8, tail: 4, tailStep: 0.2, alpha: 0.9 };
const FADE_IN = 0.3; // seconds for its glow, ripples and sparks to come in

/** 0 at `from`, 1 at `to`, eased out: fast at first, settling */
function easeOut(from: number, to: number, x: number) {
  const t = Math.min(Math.max((x - from) / (to - from), 0), 1);
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/**
 * Where the ship is heading, once the mouse has let go: a green light coming up out of the water there (`since`: the
 * game time it was let go) with a splash, then hanging over the spot till the ship gets there
 */
export function drawTargetMarker(p: Painter3D, target: { x: number; y: number }, time: number, since: number) {
  const { x, y } = target;
  const age = time - since;
  drawSplash(p, x, y, age);
  const shown = easeOut(0, FADE_IN, age);
  const pulse = 1 + PULSE.amount * Math.sin(time * PULSE.rate);

  p.disc(x, y, 0, POOL.radius * pulse, COLORS.glow, POOL.alpha * shown);
  p.disc(x, y, 0, POOL.inner * pulse, COLORS.glow, POOL.innerAlpha * shown);
  for (let i = 0; i < RIPPLES.count; i++) {
    const k = (time * RIPPLES.rate + i / RIPPLES.count) % 1;
    const radius = RIPPLES.from + (RIPPLES.to - RIPPLES.from) * k;
    p.ring(x, y, 0, radius, RIPPLES.width, COLORS.glow, RIPPLES.alpha * (1 - k) * (1 - k) * shown);
  }

  // Bounced up off the water to its height, a damped spring settling into a bob
  const settle = Math.exp(-ORB.bounce * age);
  const z =
    ORB.hover * (1 - settle * Math.cos(ORB.wobble * age)) + ORB.bob * Math.sin(time * ORB.bobRate) * (1 - settle);

  // The sparks behind the light are drawn before it, the ones in front after it
  const sparks = sparkPoints(x, y, z, time);
  const center = p.depth([x, y, z]);
  for (const s of sparks) if (p.depth(s.at) > center) p.ball(s.at, s.size, COLORS.core, s.alpha * shown);
  drawOrb(p, [x, y, z], pulse);
  for (const s of sparks) if (p.depth(s.at) <= center) p.ball(s.at, s.size, COLORS.core, s.alpha * shown);
}

/** The light itself: a halo, its green body, a bright heart and a glint up on its left */
function drawOrb(p: Painter3D, at: Vec3, pulse: number) {
  p.ball(at, ORB.halo * pulse, COLORS.glow, 0.28);
  p.ball(at, ORB.body, COLORS.glow, 0.95);
  p.ball(at, ORB.core * pulse, COLORS.core);
  p.ball([at[0] - ORB.shine, at[1] - ORB.shine, at[2] + ORB.body * 0.5], ORB.shine, COLORS.shine, 0.85);
}

/** Two rings thrown out where it comes up, and drops of water flying up and falling back round it */
function drawSplash(p: Painter3D, x: number, y: number, age: number) {
  for (let i = 0; i < 2; i++) {
    const t = age - i * SPLASH.delay;
    if (t < 0 || t >= SPLASH.time) continue;
    const k = easeOut(0, SPLASH.time, t);
    const reach = SPLASH.to * (1 - i * SPLASH.shrink);
    const radius = SPLASH.from + (reach - SPLASH.from) * k;
    p.ring(x, y, 0, radius, SPLASH.width * (1 - k * 0.5), COLORS.splash, SPLASH.alpha * (1 - k));
  }
  if (age >= DROPLETS.time) return;
  const out = DROPLETS.speed * age;
  const z = Math.max(DROPLETS.rise * age - 0.5 * DROPLETS.gravity * age * age, 0);
  const alpha = 1 - age / DROPLETS.time;
  for (let i = 0; i < DROPLETS.count; i++) {
    // Uneven angles and speeds, the same every time, so the splash doesn't look stamped
    const a = (i / DROPLETS.count) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4;
    const r = out * (0.75 + 0.25 * Math.sin(i * 3.1));
    p.ball([x + Math.cos(a) * r, y + Math.sin(a) * r, z], DROPLETS.radius, COLORS.splash, alpha);
  }
}

/** Each spark and its tail, round the light at height z */
function sparkPoints(x: number, y: number, z: number, time: number) {
  const points: { at: Vec3; size: number; alpha: number }[] = [];
  for (let i = 0; i < SPARKS.count; i++) {
    for (let j = 0; j < SPARKS.tail; j++) {
      const a = time * SPARKS.rate + (i / SPARKS.count) * Math.PI * 2 - j * SPARKS.tailStep;
      const fade = 1 - j / SPARKS.tail;
      points.push({
        at: [x + Math.cos(a) * SPARKS.radius, y + Math.sin(a) * SPARKS.radius, z + SPARKS.wobble * Math.sin(a * 2)],
        size: SPARKS.size * (0.5 + 0.5 * fade),
        alpha: SPARKS.alpha * fade,
      });
    }
  }
  return points;
}
