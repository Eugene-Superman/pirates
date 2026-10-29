import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { SHIP_CLASSES, type ShipClassId } from '../../../game';
import { Camera3D } from '../../render/Camera3D';
import { Painter3D } from '../../render/Painter3D';
import { CAMERA } from '../SceneView';
import { drawBotShip, type ShipPose } from './botShip3d';
import { drawMonster, drawMonsterWater, isMonsterModel } from './monster3d';
import { SPINE, drawSerpent, drawSerpentWater, type SpinePoint } from './serpent3d';
import { SerpentSprite } from './SerpentSprite';
import { frameOf, hasShipArt, shipAtlases, type Atlases } from './ShipSprite';
import { drawTurtle, drawTurtleWater } from './turtle3d';

const FILL = 0.86; // of the portrait's box the picture takes, at most, either way
// The bow to the left and a little towards the viewer, on the screen: as a ship lies in a picture
const BOW = { left: 0.87, near: 0.5 } as const;
const SWAY = 4; // world units a serpent's body sways off a straight line in its portrait
// World units a serpent is raised in its portrait: as it swims, half its body is under the water between its humps
const RISE = 4;

/**
 * A hull's picture for the HUD, `size` pixels square and centred in it: from its atlases, as it sails in the game (a
 * serpent's pieces laid along its body, as SerpentSprite lays them), or from its vector model for a class without
 * them, and until they have loaded. Never stretched
 */
export class HullPortrait {
  readonly container = new Container();
  private readonly classId: ShipClassId;
  private readonly size: number;
  private readonly camera = new Camera3D(CAMERA);
  private readonly heading: number;
  /** The art the picture waits for: a ship's or a monster's atlases, or a serpent's; null once it is shown */
  private art: Atlases | SerpentSprite | null;
  private model: Graphics | null = null;

  constructor(classId: ShipClassId, size: number) {
    this.classId = classId;
    this.size = size;
    const { camera } = this;
    this.heading = Math.atan2(
      -camera.rightY * BOW.left - camera.fwdY * BOW.near,
      -camera.rightX * BOW.left - camera.fwdX * BOW.near,
    );
    this.art = !hasShipArt(classId)
      ? null
      : classId === 'seaSerpent'
        ? new SerpentSprite(0)
        : shipAtlases(SHIP_CLASSES[classId]);
    if (!this.showArt()) this.showModel();
  }

  /** While shown: the art takes the model's place once it has loaded */
  update() {
    if (this.art && this.showArt()) {
      this.model?.destroy();
      this.model = null;
    }
  }

  private showArt() {
    const { art } = this;
    if (art instanceof SerpentSprite) {
      if (!art.loaded) return false;
      const spine = portraitSpine(this.heading);
      this.fit(art.container, () => art.update(spine, this.camera, 0, 'intact', 0, 0, null, -RISE));
      this.container.addChild(art.container);
    } else {
      const set = art?.intact;
      if (!set) return false;
      const texture = frameOf(set, this.camera, this.heading);
      const sprite = new Sprite(texture);
      // Fitted by its trimmed picture, from the frame's corner: the atlas's anchor is the hull's waterline
      sprite.anchor.set(0);
      const shown = texture.trim ?? new Rectangle(0, 0, texture.orig.width, texture.orig.height);
      const scale = (this.size * FILL) / Math.max(shown.width, shown.height);
      sprite.scale.set(scale);
      sprite.position.set(
        this.size / 2 - (shown.x + shown.width / 2) * scale,
        this.size / 2 - (shown.y + shown.height / 2) * scale,
      );
      this.container.addChild(sprite);
    }
    this.art = null;
    return true;
  }

  private showModel() {
    const g = new Graphics();
    const painter = new Painter3D(g, this.camera);
    this.fit(g, () => {
      g.clear();
      drawHull(painter, this.classId, this.heading);
    });
    this.model = g;
    this.container.addChild(g);
  }

  /**
   * Lays `part` out at the zoom of 1 to measure it, then again at the zoom that fits it in the box, centred: a model's
   * curves are laid out at the zoom it is drawn at, so scaling a small drawing up would show their corners
   */
  private fit(part: Container, layOut: () => void) {
    const { camera } = this;
    camera.zoom = 1;
    camera.originX = 0;
    camera.originY = 0;
    layOut();
    const bounds = part.getLocalBounds();
    const zoom = (this.size * FILL) / Math.max(bounds.width, bounds.height, 1);
    camera.zoom = zoom;
    camera.originX = this.size / 2 - (bounds.x + bounds.width / 2) * zoom;
    camera.originY = this.size / 2 - (bounds.y + bounds.height / 2) * zoom;
    layOut();
  }
}

/** A bot's hull at rest at the world's origin, with the water round a monster's body */
function drawHull(p: Painter3D, classId: ShipClassId, heading: number) {
  const pose: ShipPose = { id: 0, x: 0, y: 0, heading, speed: 0 };
  if (classId === 'seaSerpent') {
    const spine = portraitSpine(heading);
    drawSerpentWater(p, spine, 0);
    drawSerpent(p, spine, 0, 0, 0, -RISE);
  } else if (classId === 'seaTurtle') {
    drawTurtleWater(p, pose, 0);
    drawTurtle(p, pose, 0, 0, 0);
  } else if (isMonsterModel(classId)) {
    drawMonsterWater(p, pose, classId, 0);
    drawMonster(p, pose, classId, 0, 0, 0);
  } else drawBotShip(p, pose, classId, SHIP_CLASSES[classId].slots.cannon, 0, 0);
}

/** A serpent's spine for its portrait, head first: its middle at the origin, swaying a little as if it swam */
function portraitSpine(heading: number): SpinePoint[] {
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  const { points, spacing } = SPINE;
  const half = ((points - 1) * spacing) / 2;
  return Array.from({ length: points }, (_, i) => {
    const along = half - i * spacing;
    const side = SWAY * Math.sin((i / (points - 1)) * Math.PI * 2);
    return { x: dx * along - dy * side, y: dy * along + dx * side };
  });
}
