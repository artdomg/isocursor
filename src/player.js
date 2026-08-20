import { PLAYER_SPEED } from "./config.js";
import { inBounds, isWalkable, tileAt } from "./city.js";
import { animateWalk } from "./models.js";
import { tileHeight } from "./terrain.js";

const keys = new Set();
if (typeof window !== "undefined" && !window.__isoKeysBound) {
  window.__isoKeysBound = true;
  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
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

  update(dt, city, blockers) {
    let ix = 0;
    let iy = 0;
    if (keys.has("w") || keys.has("arrowup")) {
      ix -= 1;
      iy -= 1;
    }
    if (keys.has("s") || keys.has("arrowdown")) {
      ix += 1;
      iy += 1;
    }
    if (keys.has("a") || keys.has("arrowleft")) {
      ix += 1;
      iy -= 1;
    }
    if (keys.has("d") || keys.has("arrowright")) {
      ix -= 1;
      iy += 1;
    }

    this.moving = ix !== 0 || iy !== 0;
    if (this.moving) {
      const len = Math.hypot(ix, iy);
      ix /= len;
      iy /= len;
      this.angle = Math.atan2(ix, iy);
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
