/**
 * Ship lines: families of ships with their own style and role (docs/ships.md lists the planned ones).
 * Every player starts in `starter`
 */
export type ShipLineId = 'starter';

/** Kinds of ships, unique across all lines. The client finds a class's art by `line` and `id` */
export type ShipClassId = 'sloop';

export interface ShipClass {
  readonly id: ShipClassId;
  readonly line: ShipLineId;
  /** Rank within the line: 1 is the first ship a player gets in it */
  readonly tier: number;
  /** Shown to players */
  readonly name: string;
  /** Collision circle, world units */
  readonly radius: number;
  /** World units per second */
  readonly maxSpeed: number;
  /** World units per second² */
  readonly acceleration: number;
  readonly deceleration: number;
  /** Radians per second */
  readonly turnSpeed: number;
}

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClass>> = {
  sloop: {
    id: 'sloop',
    line: 'starter',
    tier: 1,
    name: 'Starter Sloop',
    radius: 9,
    maxSpeed: 220,
    acceleration: 90,
    deceleration: 140,
    turnSpeed: 1.8,
  },
};

/** The ship every new player gets */
export const STARTER_SHIP: ShipClassId = 'sloop';
