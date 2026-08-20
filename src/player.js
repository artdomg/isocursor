import { PLAYER_SPEED } from "./config.js";
import { inBounds, isWalkable, tileAt } from "./city.js";
import { animateWalk } from "./models.js";
import { tileHeight } from "./terrain.js";

function lerpAngle(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

export class Player {
  constructor(rig, start, city = null) {
    this.rig = rig;
    this.gx = start.x;
    this.gy = start.y;
    this.dir = "se";
    this.moving = false;
    this.anim = 0;
    this.angle = Math.PI;
    this.city = city;
    this.sync();
  }

  update(dt, city, blockers, wishX = 0, wishZ = 0) {
    let ix = wishX;
    let iy = wishZ;

    this.moving = ix !== 0 || iy !== 0;
    if (this.moving) {
      const len = Math.hypot(ix, iy);
      ix /= len;
      iy /= len;
      const want = Math.atan2(ix, iy);
      this.angle = lerpAngle(this.angle, want, Math.min(1, dt * 14));
      if (Math.abs(ix) > Math.abs(iy)) this.dir = ix > 0 ? "se" : "nw";
      else this.dir = iy > 0 ? "sw" : "ne";

      const step = PLAYER_SPEED * dt;
      const nx = this.gx + ix * step;
      const ny = this.gy + iy * step;
      const pad = 0.18;
      if (isWalkable(city, nx, this.gy, blockers) && inBounds(nx, this.gy)) this.gx = nx;
      else if (isWalkable(city, nx + Math.sign(ix) * pad, this.gy, blockers)) this.gx = nx;
      if (isWalkable(city, this.gx, ny, blockers) && inBounds(this.gx, ny)) this.gy = ny;
      else if (isWalkable(city, this.gx, ny + Math.sign(iy) * pad, blockers)) this.gy = ny;

      this.anim += dt * 9;
    }

    this.city = city;
    animateWalk(this.rig, this.moving, dt, this.anim);
    this.sync();
  }

  sync() {
    const tile = this.city ? tileAt(this.city, this.gx, this.gy) : null;
    this.rig.root.position.set(this.gx, tileHeight(tile?.type), this.gy);
    this.rig.root.rotation.y = this.angle;
  }
}
