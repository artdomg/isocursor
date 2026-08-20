import { BUILDING_CATALOG } from "./catalog.js";
import { BLOCK, MAP_SIZE, PIER_DEPTH, WATER_EDGE, WALKABLE } from "./config.js";
import { chance, pick } from "./rng.js";

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

function isWaterCell(x, y) {
  return y >= WATER_EDGE;
}

function isPierCell(x, y) {
  return y >= WATER_EDGE - PIER_DEPTH && y < WATER_EDGE;
}

function isPromenade(x, y) {
  if (isWaterCell(x, y) || isPierCell(x, y)) return false;
  return isPierCell(x, y + 1) || isPierCell(x, y - 1) || isPierCell(x + 1, y) || isPierCell(x - 1, y);
}

function roadMask(x, y) {
  if (isWaterCell(x, y) || isPierCell(x, y)) return false;
  return x % BLOCK === 0 || y % BLOCK === 0;
}

function classifyRoad(x, y) {
  const n = inBounds(x, y - 1) && roadMask(x, y - 1);
  const s = inBounds(x, y + 1) && roadMask(x, y + 1);
  const e = inBounds(x + 1, y) && roadMask(x + 1, y);
  const w = inBounds(x - 1, y) && roadMask(x - 1, y);
  const count = n + s + e + w;
  if (count >= 3) return "road_x";
  if ((n && s && !e && !w) || (n && !s && !e && !w) || (!n && s && !e && !w)) return "road_v";
  if ((e && w && !n && !s) || (e && !w && !n && !s) || (!e && w && !n && !s)) return "road_h";
  return "road_c";
}

function neighborsRoad(x, y) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return dirs.some(([dx, dy]) => inBounds(x + dx, y + dy) && roadMask(x + dx, y + dy));
}

export function generateCity(rng, buildingCatalog = BUILDING_CATALOG) {
  const tiles = [];
  const props = [];
  const buildings = [];

  for (let y = 0; y < MAP_SIZE; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      if (isWaterCell(x, y)) {
        tiles[y][x] = { type: "water", tex: "water" };
      } else if (isPierCell(x, y)) {
        tiles[y][x] = { type: "pier", tex: "pier" };
      } else if (roadMask(x, y)) {
        tiles[y][x] = { type: "road", tex: classifyRoad(x, y) };
      } else if (neighborsRoad(x, y) || isPromenade(x, y)) {
        tiles[y][x] = { type: "sidewalk", tex: "sidewalk" };
      } else {
        tiles[y][x] = { type: "lot", tex: "grass" };
      }
    }
  }

  const blockTypes = new Map();
  for (let by = 0; by < MAP_SIZE / BLOCK; by++) {
    for (let bx = 0; bx < MAP_SIZE / BLOCK; bx++) {
      const cx = bx * BLOCK + 4;
      const cy = by * BLOCK + 4;
      if (!inBounds(cx, cy) || isWaterCell(cx, cy) || isPierCell(cx, cy)) {
        blockTypes.set(`${bx},${by}`, "skip");
        continue;
      }
      const roll = rng();
      blockTypes.set(`${bx},${by}`, roll < 0.16 ? "park" : roll < 0.22 ? "plaza" : "urban");
    }
  }

  const occupied = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(false));
  const ones = buildingCatalog.filter((b) => (b.spanX || 1) === 1 && (b.spanY || 1) === 1);
  const wideX = buildingCatalog.filter((b) => b.spanX === 2 && b.spanY === 1);
  const wideY = buildingCatalog.filter((b) => b.spanX === 1 && b.spanY === 2);

  const canPlace = (x, y, sx, sy) => {
    for (let dy = 0; dy < sy; dy++) {
      for (let dx = 0; dx < sx; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(tx, ty) || occupied[ty][tx]) return false;
        if (tiles[ty][tx].type !== "lot") return false;
        if (Math.floor(tx / BLOCK) !== Math.floor(x / BLOCK)) return false;
        if (Math.floor(ty / BLOCK) !== Math.floor(y / BLOCK)) return false;
      }
    }
    return true;
  };

  const occupy = (x, y, sx, sy) => {
    for (let dy = 0; dy < sy; dy++) {
      for (let dx = 0; dx < sx; dx++) {
        occupied[y + dy][x + dx] = true;
        tiles[y + dy][x + dx].type = "building";
        tiles[y + dy][x + dx].tex = "lot";
      }
    }
  };

  const pickStyled = (list, rng) => {
    const themed =
      chance(rng, 0.32)
        ? list.filter((b) => b.style === "office" || b.style === "slate" || b.style === "glass")
        : chance(rng, 0.5)
          ? list.filter((b) => b.style === "brick" || b.style === "brown")
          : list;
    return pick(rng, themed.length ? themed : list);
  };

  const roadInset = (x, y, amount = 0.34) => {
    let ox = 0;
    let oy = 0;
    if (inBounds(x + 1, y) && tiles[y][x + 1].type === "road") ox -= amount;
    if (inBounds(x - 1, y) && tiles[y][x - 1].type === "road") ox += amount;
    if (inBounds(x, y + 1) && tiles[y + 1][x].type === "road") oy -= amount;
    if (inBounds(x, y - 1) && tiles[y - 1][x].type === "road") oy += amount;
    return { ox, oy };
  };

  const roadNeighbors = (x, y) => {
    let n = 0;
    if (inBounds(x + 1, y) && tiles[y][x + 1].type === "road") n++;
    if (inBounds(x - 1, y) && tiles[y][x - 1].type === "road") n++;
    if (inBounds(x, y + 1) && tiles[y + 1][x].type === "road") n++;
    if (inBounds(x, y - 1) && tiles[y - 1][x].type === "road") n++;
    return n;
  };

  const addTree = (x, y, tex, jitter = 0) => {
    const kind = tiles[y][x].type;
    if (kind === "road" || kind === "sidewalk" || kind === "water" || kind === "pier") return;
    if (roadNeighbors(x, y) >= 1) return;
    const inset = roadInset(x, y, 0.22);
    const jx = jitter ? (rng() - 0.5) * jitter : 0;
    const jy = jitter ? (rng() - 0.5) * jitter : 0;
    const ox = Math.max(-0.28, Math.min(0.28, inset.ox + jx));
    const oy = Math.max(-0.28, Math.min(0.28, inset.oy + jy));
    const wx = x + 0.5 + ox;
    const wy = y + 0.5 + oy;
    if (clearanceToRoad(tiles, wx, wy) < 0.55) return;
    const tile = tileAt({ tiles }, wx, wy);
    if (!tile || tile.type === "road" || tile.type === "sidewalk" || tile.type === "water" || tile.type === "pier") return;
    props.push({ x, y, tex, ox: ox * 32, oy: oy * 32, collide: true });
  };

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = tiles[y][x];
      if (tile.type !== "lot" || occupied[y][x]) continue;
      const bx = Math.floor(x / BLOCK);
      const by = Math.floor(y / BLOCK);
      const kind = blockTypes.get(`${bx},${by}`) || "urban";
      if (kind === "park") {
        tile.type = "grass";
        tile.tex = "grass";
        if (chance(rng, 0.5)) {
          addTree(x, y, pick(rng, ["tree", "tree", "tree_tall", "tree_sm"]), 0.18);
        }
      } else if (kind === "plaza") {
        tile.type = "plaza";
        tile.tex = "plaza";
        if (chance(rng, 0.14)) addTree(x, y, "tree_sm", 0);
      } else {
        let spec = null;
        let sx = 1;
        let sy = 1;
        if (wideX.length && chance(rng, 0.42) && canPlace(x, y, 2, 1)) {
          spec = pickStyled(wideX, rng);
          sx = 2;
          sy = 1;
        } else if (wideY.length && chance(rng, 0.3) && canPlace(x, y, 1, 2)) {
          spec = pickStyled(wideY, rng);
          sx = 1;
          sy = 2;
        }
        if (!spec) spec = pickStyled(ones.length ? ones : buildingCatalog, rng);
        occupy(x, y, sx, sy);
        buildings.push({
          x,
          y,
          tex: spec.key,
          style: spec.style,
          shape: spec.shape || "A",
          variant: spec.variant || 0,
          floors: spec.floors,
          spanX: spec.spanX || sx,
          spanY: spec.spanY || sy,
        });
      }
    }
  }

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = tiles[y][x];
      if (tile.type === "sidewalk") {
        if (chance(rng, 0.12) && roadNeighbors(x, y) === 1) {
          const inset = roadInset(x, y, 0.36);
          const wx = x + 0.5 + inset.ox;
          const wy = y + 0.5 + inset.oy;
          if (clearanceToRoad(tiles, wx, wy) >= 0.32) {
            const len = Math.hypot(inset.ox, inset.oy) || 1;
            props.push({
              x,
              y,
              tex: "lamp",
              ox: inset.ox * 32,
              oy: inset.oy * 32,
              rot: Math.atan2(inset.oy / len, -inset.ox / len),
              collide: false,
            });
          }
        }
      }
      if (tile.type === "road" && chance(rng, 0.12)) {
        props.push({
          x,
          y,
          tex: pick(rng, ["car_taxi", "car_red", "car_blue", "car_van"]),
          ox: (rng() - 0.5) * 6,
          oy: (rng() - 0.5) * 4,
          collide: true,
        });
      }
      if (tile.type === "water" && chance(rng, 0.1) && neighborsPier(tiles, x, y)) {
        props.push({ x, y, tex: "boat", ox: 0, oy: 0, collide: false });
      }
    }
  }

  let start = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
  const blocked = new Set(props.filter((p) => p.collide).map((p) => `${p.x},${p.y}`));
  outer: for (let r = 0; r < MAP_SIZE; r++) {
    for (let y = Math.floor(MAP_SIZE / 2) - r; y <= MAP_SIZE / 2 + r; y++) {
      for (let x = Math.floor(MAP_SIZE / 2) - r; x <= MAP_SIZE / 2 + r; x++) {
        if (!inBounds(x, y)) continue;
        if (tiles[y][x].type === "road" && !blocked.has(`${x},${y}`)) {
          start = { x: x + 0.5, y: y + 0.5 };
          break outer;
        }
      }
    }
  }

  return { tiles, props, buildings, start };
}

function neighborsPier(tiles, x, y) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return dirs.some(([dx, dy]) => inBounds(x + dx, y + dy) && tiles[y + dy][x + dx].type === "pier");
}

export function clearanceToRoad(tiles, wx, wy) {
  let best = 99;
  const x0 = Math.floor(wx) - 1;
  const y0 = Math.floor(wy) - 1;
  for (let y = y0; y <= y0 + 2; y++) {
    for (let x = x0; x <= x0 + 2; x++) {
      if (!inBounds(x, y) || tiles[y][x].type !== "road") continue;
      const dx = Math.max(x - wx, 0, wx - (x + 1));
      const dy = Math.max(y - wy, 0, wy - (y + 1));
      best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best;
}

export function tileAt(city, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return null;
  return city.tiles[ty][tx];
}

export function isWalkable(city, x, y, blockers) {
  const tile = tileAt(city, x, y);
  if (!tile || !WALKABLE.has(tile.type)) return false;
  for (const b of blockers) {
    const dx = x - (b.x + 0.5);
    const dy = y - (b.y + 0.5);
    if (dx * dx + dy * dy < b.r * b.r) return false;
  }
  return true;
}

export function worldSize() {
  return { w: MAP_SIZE, h: MAP_SIZE };
}
