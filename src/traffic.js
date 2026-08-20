import { MAP_SIZE } from "./config.js";
import { inBounds, tileAt } from "./city.js";
import { pick } from "./rng.js";
import { tileHeight } from "./terrain.js";
import { animateWalk, cloneTpl, createPlayer, paintByMaterial } from "./models.js";

export const CAR_COLORS = {
  car_taxi: "#e8b830",
  car_red: "#c83c38",
  car_blue: "#3c74c8",
  car_van: "#ececec",
};

const PED_PALETTES = [
  { skin: "#e4b494", hair: "#2a1c14", shirt: "#3a6ea8", shirtDark: "#2c5280", pants: "#2c2c30", shoe: "#1c1c20" },
  { skin: "#c68e5f", hair: "#4a3220", shirt: "#4c7834", shirtDark: "#3a5c28", pants: "#33415c", shoe: "#22242a" },
  { skin: "#e0b088", hair: "#8a6a3c", shirt: "#d8b13a", shirtDark: "#a8871e", pants: "#3d4148", shoe: "#1c1c20" },
  { skin: "#8a5c3c", hair: "#1c1c20", shirt: "#7a4a8c", shirtDark: "#5c386a", pants: "#2c2c30", shoe: "#22242a" },
  { skin: "#e8c098", hair: "#b03a2e", shirt: "#c1682f", shirtDark: "#96502a", pants: "#33415c", shoe: "#1c1c20" },
  { skin: "#e4b494", hair: "#2a1c14", shirt: "#ececec", shirtDark: "#b8b8b8", pants: "#2c3c5c", shoe: "#1a1410" },
];

const PED_WALK = new Set(["sidewalk", "plaza", "grass"]);
const MAX_CARS = 36;
const PED_COUNT = 18;
const LANE = 0.1;
const CAR_R = 0.18;

function isRoad(city, x, y) {
  const t = tileAt(city, x, y);
  return t && t.type === "road";
}

function roadFootprint(city, x, z, r = CAR_R) {
  return isRoad(city, x, z) && isRoad(city, x - r, z) && isRoad(city, x + r, z) && isRoad(city, x, z - r) && isRoad(city, x, z + r);
}

function isJunction(city, x, y) {
  const t = tileAt(city, x, y);
  if (!t || t.type !== "road") return false;
  if (t.tex === "road_x" || t.tex === "x") return true;
  if (t.tex === "road_c" || t.tex === "c") return true;
  return roadDegree(city, x, y) >= 3;
}

function roadDegree(city, x, y) {
  let n = 0;
  if (isRoad(city, x + 1, y)) n++;
  if (isRoad(city, x - 1, y)) n++;
  if (isRoad(city, x, y + 1)) n++;
  if (isRoad(city, x, y - 1)) n++;
  return n;
}

function roadAxis(tex) {
  if (tex === "road_v" || tex === "v") return "z";
  return "x";
}

function travelVec(car) {
  if (car.axis === "x") return { x: car.dir, z: 0 };
  return { x: 0, z: car.dir };
}

function laneOffset(city, car) {
  const ox = car.axis === "z" ? LANE * car.dir : 0;
  const oz = car.axis === "x" ? -LANE * car.dir : 0;
  if (roadFootprint(city, car.x + ox, car.z + oz)) return { ox, oz };
  return { ox: 0, oz: 0 };
}

function height(city, x, z) {
  const tile = tileAt(city, x, z);
  return tileHeight(tile?.type);
}

function yawFor(axis, dir) {
  if (axis === "x") return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? -Math.PI / 2 : Math.PI / 2;
}

function lerpAngle(cur, target, t) {
  let diff = target - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return cur + diff * t;
}

function applyDrive(car, axis, dir) {
  car.axis = axis;
  car.dir = dir;
}

export function spawnTraffic(scene, city, templates, rng, assets) {
  const cars = [];
  const spots = city.props.filter((p) => p.tex.startsWith("car"));
  while (spots.length > MAX_CARS) spots.splice((rng() * spots.length) | 0, 1);

  for (const prop of spots) {
    const tile = city.tiles[prop.y][prop.x];
    if (!tile || tile.type !== "road") continue;
    if (roadDegree(city, prop.x, prop.y) < 2) continue;
    const axis = roadAxis(tile.tex);
    const dir = rng() < 0.5 ? 1 : -1;
    const node = cloneTpl(templates.car, prop.tex, assets);
    paintByMaterial(node, templates.materials, { CarPaint: CAR_COLORS[prop.tex] || CAR_COLORS.car_red });
    node.scaling.setAll(0.85);
    const car = {
      node,
      x: prop.x + 0.5,
      z: prop.y + 0.5,
      axis,
      dir,
      speed: 2.4 + rng() * 1.4,
      curSpeed: 0,
      angle: yawFor(axis, dir),
      lastCross: -1,
      stuck: 0,
    };
    car.node.rotation.y = car.angle;
    cars.push(car);
  }

  const peds = [];
  const pedSpots = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (PED_WALK.has(city.tiles[y][x].type)) pedSpots.push({ x, y });
    }
  }
  const n = Math.min(PED_COUNT, pedSpots.length);
  for (let i = 0; i < n; i++) {
    const spot = pedSpots.splice((rng() * pedSpots.length) | 0, 1)[0];
    const pal = PED_PALETTES[i % PED_PALETTES.length];
    const rig = createPlayer(scene, templates, assets, pal, 0.46);
    const dirs = pedDirs(city, spot.x, spot.y);
    const d = dirs.length ? pick(rng, dirs) : { dx: 0, dz: 0 };
    peds.push({
      rig,
      x: spot.x + 0.5 + (rng() - 0.5) * 0.3,
      z: spot.y + 0.5 + (rng() - 0.5) * 0.3,
      dx: d.dx,
      dz: d.dz,
      angle: Math.atan2(d.dx, d.dz || 1),
      anim: rng() * 10,
      pause: 0,
    });
  }

  return { cars, peds };
}

function pedDirs(city, x, y) {
  const out = [];
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const t = tileAt(city, x + dx, y + dz);
    if (t && PED_WALK.has(t.type)) out.push({ dx, dz });
  }
  return out;
}

function decideCar(city, car, tx, tz, rng) {
  const valid = [];
  for (const axis of ["x", "z"]) {
    for (const dir of [1, -1]) {
      if (isRoad(city, tx + (axis === "x" ? dir : 0), tz + (axis === "z" ? dir : 0))) {
        valid.push({ axis, dir });
      }
    }
  }
  if (!valid.length) return;

  const straight = valid.find((v) => v.axis === car.axis && v.dir === car.dir);
  const nonReverse = valid.filter((v) => !(v.axis === car.axis && v.dir === -car.dir));
  let choice = straight && rng() < 0.62 ? straight : null;
  if (!choice) {
    const pool = nonReverse.length ? nonReverse : valid;
    choice = pool[(rng() * pool.length) | 0];
  }
  applyDrive(car, choice.axis, choice.dir);
  if (isRoad(city, tx + 0.5, tz + 0.5)) {
    car.x = tx + 0.5;
    car.z = tz + 0.5;
  } else {
    recoverToRoad(city, car);
  }
}

function recoverToRoad(city, car) {
  if (isRoad(city, car.x, car.z)) {
    lockToLane(city, car);
    return;
  }
  const tx = Math.floor(car.x);
  const tz = Math.floor(car.z);
  let best = null;
  let bestD = 99;
  for (let z = tz - 2; z <= tz + 2; z++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      if (!isRoad(city, x + 0.5, z + 0.5)) continue;
      const d = (car.x - (x + 0.5)) ** 2 + (car.z - (z + 0.5)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: x + 0.5, z: z + 0.5 };
      }
    }
  }
  if (!best) return;
  car.x = best.x;
  car.z = best.z;
  const tile = tileAt(city, car.x, car.z);
  if (tile) applyDrive(car, roadAxis(tile.tex), car.dir);
}

function lockToLane(city, car) {
  if (car.axis === "x") {
    const cz = Math.floor(car.z) + 0.5;
    if (isRoad(city, car.x, cz)) car.z = cz;
  } else {
    const cx = Math.floor(car.x) + 0.5;
    if (isRoad(city, cx, car.z)) car.x = cx;
  }
}

function willCrossCenter(car, tx, tz, dt) {
  const cx = tx + 0.5;
  const cz = tz + 0.5;
  const step = Math.max(0.12, (car.curSpeed || car.speed) * dt + 0.08);
  const tv = travelVec(car);
  const dist = (cx - car.x) * tv.x + (cz - car.z) * tv.z;
  const lat = Math.abs((cx - car.x) * tv.z - (cz - car.z) * tv.x);
  return lat < 0.28 && dist >= -0.05 && dist < step;
}

export function updateTraffic(city, traffic, dt, rng) {
  const movers = [];
  for (const car of traffic.cars) {
    const tx = Math.floor(car.x);
    const tz = Math.floor(car.z);
    if (!isRoad(city, car.x, car.z)) recoverToRoad(city, car);

    if (isJunction(city, tx, tz)) {
      if (willCrossCenter(car, tx, tz, dt)) {
        const key = tx * 1000 + tz;
        if (key !== car.lastCross) {
          car.lastCross = key;
          decideCar(city, car, tx, tz, rng);
        }
      }
    } else {
      car.lastCross = -1;
      const tv = travelVec(car);
      const aheadX = car.x + tv.x * 0.7;
      const aheadZ = car.z + tv.z * 0.7;
      if (!isRoad(city, aheadX, aheadZ)) {
        decideCar(city, car, tx, tz, rng);
      }
    }

    lockToLane(city, car);

    const { ox, oz } = laneOffset(city, car);
    let targetSpeed = car.speed;
    const myPx = car.x + ox;
    const myPz = car.z + oz;
    const tv = travelVec(car);
    for (const other of traffic.cars) {
      if (other === car) continue;
      const oo = laneOffset(city, other);
      const oPx = other.x + oo.ox;
      const oPz = other.z + oo.oz;
      const dx = oPx - myPx;
      const dz = oPz - myPz;
      const ahead = dx * tv.x + dz * tv.z;
      const lateral = Math.abs(dx * tv.z - dz * tv.x);
      if (lateral < 0.16 && ahead > 0 && ahead < 1.25) {
        targetSpeed = Math.min(targetSpeed, ahead < 0.55 ? 0 : other.curSpeed);
      }
    }

    car.curSpeed += (targetSpeed - car.curSpeed) * Math.min(1, dt * 6);
    if (car.curSpeed < 0.08) {
      car.stuck += dt;
      if (car.stuck > 0.9) {
        car.lastCross = -1;
        decideCar(city, car, Math.floor(car.x), Math.floor(car.z), rng);
        car.stuck = 0;
        car.curSpeed = car.speed * 0.4;
      }
    } else {
      car.stuck = 0;
    }

    const move = travelVec(car);
    const nx = car.x + move.x * car.curSpeed * dt;
    const nz = car.z + move.z * car.curSpeed * dt;
    if (isRoad(city, nx, nz)) {
      car.x = nx;
      car.z = nz;
      lockToLane(city, car);
      if (!isRoad(city, car.x, car.z)) recoverToRoad(city, car);
    } else {
      decideCar(city, car, Math.floor(car.x), Math.floor(car.z), rng);
    }
    if (car.x < 0.25 || car.x > MAP_SIZE - 0.25 || car.z < 0.25 || car.z > MAP_SIZE - 0.25) {
      decideCar(city, car, Math.floor(car.x), Math.floor(car.z), rng);
      if (car.x < 0.25 || car.x > MAP_SIZE - 0.25 || car.z < 0.25 || car.z > MAP_SIZE - 0.25) car.dir *= -1;
    }
    car.x = Math.max(0.25, Math.min(MAP_SIZE - 0.25, car.x));
    car.z = Math.max(0.25, Math.min(MAP_SIZE - 0.25, car.z));
    if (!isRoad(city, car.x, car.z)) recoverToRoad(city, car);

    const off = laneOffset(city, car);
    const y = height(city, car.x + off.ox, car.z + off.oz);
    car.node.position.set(car.x + off.ox, Math.max(0, y), car.z + off.oz);
    const targetYaw = yawFor(car.axis, car.dir);
    car.angle = lerpAngle(car.angle, targetYaw, Math.min(1, dt * 8));
    car.node.rotation.y = car.angle;
    movers.push({ x: car.x + off.ox - 0.5, y: car.z + off.oz - 0.5, r: 0.32 });
  }

  for (const ped of traffic.peds) {
    if (ped.pause > 0) {
      ped.pause -= dt;
      animateWalk(ped.rig, false, dt, ped.anim);
      ped.rig.root.position.set(ped.x, height(city, ped.x, ped.z), ped.z);
      ped.rig.root.rotation.y = ped.angle;
      continue;
    }

    const speed = 1.15;
    const nx = ped.x + ped.dx * speed * dt;
    const nz = ped.z + ped.dz * speed * dt;
    const tile = tileAt(city, nx, nz);
    const ok = tile && PED_WALK.has(tile.type) && inBounds(nx, nz);
    if (!ok) {
      const ptx = Math.floor(ped.x);
      const ptz = Math.floor(ped.z);
      const dirs = pedDirs(city, ptx, ptz).filter((d) => d.dx !== -ped.dx || d.dz !== -ped.dz);
      const pool = dirs.length ? dirs : pedDirs(city, ptx, ptz);
      if (pool.length) {
        const d = pool[(rng() * pool.length) | 0];
        ped.dx = d.dx;
        ped.dz = d.dz;
      } else {
        ped.pause = 0.4 + rng() * 0.8;
      }
    } else {
      ped.x = nx;
      ped.z = nz;
      if (Math.abs(ped.x - Math.floor(ped.x) - 0.5) < 0.04 && Math.abs(ped.z - Math.floor(ped.z) - 0.5) < 0.04 && rng() < 0.02) {
        const dirs = pedDirs(city, Math.floor(ped.x), Math.floor(ped.z));
        if (dirs.length) {
          const d = dirs[(rng() * dirs.length) | 0];
          ped.dx = d.dx;
          ped.dz = d.dz;
        }
        if (rng() < 0.12) ped.pause = 0.6 + rng() * 1.4;
      }
    }

    if (ped.dx || ped.dz) ped.angle = Math.atan2(ped.dx, ped.dz);
    ped.anim += dt * 9;
    animateWalk(ped.rig, !!(ped.dx || ped.dz) && ped.pause <= 0, dt, ped.anim);
    ped.rig.root.position.set(ped.x, height(city, ped.x, ped.z), ped.z);
    ped.rig.root.rotation.y = ped.angle;
    movers.push({ x: ped.x - 0.5, y: ped.z - 0.5, r: 0.18 });
  }

  return movers;
}
