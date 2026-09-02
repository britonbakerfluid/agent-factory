import Phaser from 'phaser';
import type { SubagentInfo } from '@shared/types';
import { GrabMotion } from '../grab/GrabMotion';
import type { Grabbable } from '../grab/GrabMotion';
import { resolveSheetGrabAnchor, shadeColor } from '../grab/anchors';
import type { GrabAnchor } from '../grab/anchors';
import { GRAB_REST_LENGTH, elasticBand } from '../grab/physics';
import type { Point } from '../grab/physics';

const SUBAGENT_SCALE = 0.5;
const SUBAGENT_RETURN_SPEED = 70; // px/s walking back into orbit after a drop

// Distinct colors for each subagent so they're visually distinguishable
const SUBAGENT_COLORS = [
  0xaa88ff, // purple
  0x88ffaa, // mint
  0xff88aa, // pink
  0x88aaff, // light blue
  0xffaa88, // peach
  0xaaff88, // lime
  0xff88ff, // magenta
  0x88ffff, // cyan
];

export class SubagentSprite extends Phaser.GameObjects.Container implements Grabbable {
  private sprite: Phaser.GameObjects.Sprite;
  private nametag: Phaser.GameObjects.Text;
  private orbitAngle: number;
  private orbitRadius: number;
  private orbitSpeed: number;

  public info: SubagentInfo;
  public parentSessionId: string;

  private parentX = 0;
  private parentY = 0;

  public isZombie = false;

  private spriteIndex: number;
  private tint: number;

  // Tactile grab state (mirrors AgentSprite at half scale, returning to the orbit slot instead of a floor spot).
  private grab: GrabMotion | null = null;
  private grabBand: Phaser.GameObjects.Graphics | null = null;
  private grabKnot: Phaser.GameObjects.Graphics | null = null;
  private grabAnchor: GrabAnchor | null = null;
  private grabSettling = false;
  private returning = false;

  constructor(
    scene: Phaser.Scene,
    info: SubagentInfo,
    parentSessionId: string,
    spriteIndex: number,
    siblingIndex: number,
    siblingCount: number,
    isZombie = false,
  ) {
    super(scene, 0, 0);

    this.info = info;
    this.parentSessionId = parentSessionId;
    this.isZombie = isZombie;

    // Evenly space subagents around the orbit
    this.orbitAngle = (siblingIndex / Math.max(siblingCount, 1)) * Math.PI * 2;
    // Widen orbit as more subagents spawn so they don't overlap
    this.orbitRadius = 30 + siblingCount * 4;
    // Slightly different speeds so they don't lock in sync
    this.orbitSpeed = 0.6 + siblingIndex * 0.15;

    // Zombie subagents get the sickly green tint, normal ones get distinct colors
    const tint = isZombie ? 0x448833 : SUBAGENT_COLORS[siblingIndex % SUBAGENT_COLORS.length];
    this.spriteIndex = spriteIndex;
    this.tint = tint;

    const spriteKey = `agent_${spriteIndex % 8}`;
    this.sprite = scene.add.sprite(0, 0, spriteKey, 1);
    this.sprite.setScale(SUBAGENT_SCALE);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setTint(tint);
    this.sprite.setAlpha(isZombie ? 0.75 : 0.85);
    this.sprite.setInteractive({ useHandCursor: true });
    this.add(this.sprite);

    // Nametag with agent type + index — zombie subagents get skull markers
    const tintHex = isZombie ? '#33ff00' : '#' + tint.toString(16).padStart(6, '0');
    const baseName = siblingCount > 1
      ? `${info.agentType || 'sub'} #${siblingIndex + 1}`
      : (info.agentType || 'sub');
    const label = isZombie ? `\u2620 ${baseName} \u2620` : baseName;
    this.nametag = scene.add.text(0, -14, label, {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: tintHex,
      backgroundColor: isZombie ? 'rgba(20, 40, 10, 0.9)' : 'rgba(10, 10, 26, 0.8)',
      padding: { x: 2, y: 1 },
      align: 'center',
    });
    this.nametag.setOrigin(0.5, 1);
    this.add(this.nametag);

    // Play work animation
    const workAnim = `${spriteKey}_work`;
    if (scene.anims.exists(workAnim)) {
      this.sprite.play(workAnim);
    }

    // Spawn effect
    this.setAlpha(0);
    this.setScale(0.3);
    scene.tweens.add({
      targets: this,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    scene.add.existing(this);
  }

  update(_time: number, delta: number) {
    if (this.grab) {
      this.stepGrab(delta / 1000);
      return;
    }
    if (this.grabSettling) return;

    if (this.returning) {
      // Walk back to the exact orbit slot we were lifted from, then rejoin the orbit.
      const slot = this.orbitPoint();
      const dx = slot.x - this.x;
      const dy = slot.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (SUBAGENT_RETURN_SPEED * delta) / 1000;
      if (dist <= step) {
        this.setPosition(slot.x, slot.y);
        this.returning = false;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
      return;
    }

    // Orbit around parent position
    this.orbitAngle += (this.orbitSpeed * delta) / 1000;
    const orbit = this.orbitPoint();
    this.x = orbit.x;
    this.y = orbit.y;
  }

  /** Position on the elliptical orbit for the current angle. */
  private orbitPoint(): Point {
    return {
      x: this.parentX + Math.cos(this.orbitAngle) * this.orbitRadius,
      y: this.parentY + Math.sin(this.orbitAngle) * (this.orbitRadius * 0.4),
    };
  }

  setParentPosition(x: number, y: number) {
    this.parentX = x;
    this.parentY = y;
  }

  despawn(onComplete?: () => void) {
    this.cancelGrab();
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        onComplete?.();
        this.destroy();
      },
    });
  }

  // ── Tactile grab: lift, dangle, drop, walk back into orbit ────────

  /** True while held, falling, or recovering from the landing. Orbiting is suspended. */
  get isGrabbed(): boolean {
    return this.grab !== null || this.grabSettling;
  }

  get isHeld(): boolean {
    return this.grab?.phase === 'held';
  }

  beginGrab(pointer: Point) {
    if (this.grab) {
      this.grab.begin(pointer, { x: this.x, y: this.y });
      return;
    }
    if (this.grabSettling) this.cancelGrab();

    this.returning = false; // the frozen orbit angle is the exact slot we return to
    this.grabAnchor = resolveSheetGrabAnchor(this.spriteIndex, this.tint);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0).setPosition(0, 0).setScale(SUBAGENT_SCALE);
    this.scene.tweens.killTweensOf(this.nametag);
    this.scene.tweens.add({ targets: this.nametag, alpha: 0, duration: 150 });

    this.grabBand = this.scene.add.graphics();
    this.addAt(this.grabBand, 0);
    this.grabKnot = this.scene.add.graphics();
    this.add(this.grabKnot);

    this.grab = new GrabMotion(this.grabAnchor.offsetY, SUBAGENT_SCALE);
    this.grab.begin(pointer, { x: this.x, y: this.y });
  }

  moveGrab(pointer: Point) {
    if (this.grab?.phase === 'held') this.grab.setPointer(pointer);
  }

  releaseGrab(pointer?: Point) {
    if (this.grab?.phase !== 'held') return;
    this.grab.release(pointer);
    this.grabBand?.clear();
    this.grabKnot?.clear();
    this.sprite.setAngle(0);
  }

  showGrabHint(text: string) {
    const label = this.scene.add.text(0, -22, text, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#ff6688',
    }).setOrigin(0.5);
    this.add(label);
    this.scene.tweens.add({
      targets: label,
      y: label.y - 12,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => label.destroy(),
    });
  }

  private stepGrab(dt: number) {
    const grab = this.grab!;
    const result = grab.step(dt);
    this.setPosition(grab.body.x, grab.body.y);

    if (result === 'held') {
      this.sprite.setAngle(Phaser.Math.Clamp(-grab.body.vx * 0.06, -14, 14));
      this.drawGrabBand(grab);
    } else if (result === 'landed') {
      this.onGrabLanded();
    }
  }

  private drawGrabBand(grab: GrabMotion) {
    if (!this.grabBand || !this.grabKnot || !this.grabAnchor) return;
    const anchor = this.grabAnchor;
    const from = { x: Math.round(grab.pointer.x), y: Math.round(grab.pointer.y) };
    const to = {
      x: Math.round(this.x + anchor.offsetX * SUBAGENT_SCALE),
      y: Math.round(this.y + anchor.offsetY * SUBAGENT_SCALE),
    };
    const band = elasticBand(from, to, GRAB_REST_LENGTH * SUBAGENT_SCALE);
    const ox = -this.x;
    const oy = -this.y;
    const highlight = shadeColor(anchor.color, 1.35);
    const shadow = shadeColor(anchor.color, 0.55);

    const g = this.grabBand;
    g.clear();
    g.fillStyle(anchor.color, 1);
    for (const px of band.pixels) g.fillRect(px.x + ox, px.y + oy, 1, 1);
    // Grip knot under the pointer (smaller than the full-size avatar's), drawn on the front layer.
    const k = this.grabKnot;
    k.clear();
    k.fillStyle(shadow, 1);
    k.fillRect(from.x + ox - 1, from.y + oy - 1, 3, 3);
    k.fillStyle(highlight, 1);
    k.fillRect(from.x + ox, from.y + oy, 1, 1);
  }

  private onGrabLanded() {
    this.grab = null;
    this.grabSettling = true;
    this.destroyGrabGraphics();
    this.sprite.setAngle(0).setPosition(0, 0);
    this.landSquash();
  }

  /** Landing stage 1: squash on impact. */
  private landSquash() {
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SUBAGENT_SCALE * 1.3,
      scaleY: SUBAGENT_SCALE * 0.7,
      y: 2,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.landHop(),
    });
  }

  /** Landing stage 2: a small recovery hop. */
  private landHop() {
    this.scene.tweens.add({
      targets: this.sprite,
      y: -2,
      duration: 110,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => this.landSettle(),
    });
  }

  /** Landing stage 3: walk back to the orbit slot we were lifted from. */
  private landSettle() {
    this.grabSettling = false;
    this.grabAnchor = null;
    this.sprite.setAngle(0).setPosition(0, 0).setScale(SUBAGENT_SCALE);
    this.scene.tweens.add({ targets: this.nametag, alpha: 1, duration: 200 });
    this.returning = true;
  }

  /** Abort a grab instantly (despawning): snap to the floor and resume orbiting from the slot. */
  private cancelGrab() {
    if (!this.grab && !this.grabSettling) return;
    if (this.grab) {
      if (this.grab.phase !== 'idle') this.setPosition(this.grab.floor.x, this.grab.floor.y);
      this.grab.cancel();
      this.grab = null;
    }
    this.grabSettling = false;
    this.grabAnchor = null;
    this.destroyGrabGraphics();
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.nametag);
    this.sprite.setAngle(0).setPosition(0, 0).setScale(SUBAGENT_SCALE);
    this.nametag.setAlpha(1);
    this.returning = true;
  }

  private destroyGrabGraphics() {
    this.grabBand?.destroy();
    this.grabBand = null;
    this.grabKnot?.destroy();
    this.grabKnot = null;
  }
}
