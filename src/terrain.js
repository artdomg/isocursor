import { Color3, DynamicTexture, Mesh, StandardMaterial, Texture, VertexData } from "@babylonjs/core";
import { MAP_SIZE, PIER_Y, WATER_Y } from "./config.js";
import { C, mixHex } from "./palette.js";
import { createWater } from "./water.js";

export { PIER_Y, WATER_Y };

const PX = 24;

function frac(n) {
  return n - Math.floor(n);
}

function hash2(a, b) {
  let n = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35), 0x27d4eb2d);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

function grassColor(u, v) {
  const tuft = hash2(Math.floor(u * 10), Math.floor(v * 10));
  const n = hash2(Math.floor(u * 5 + 2), Math.floor(v * 5 + 1));
  if (tuft < 0.07) return C.grassHi;
  if (tuft < 0.14) return C.grassMid;
  if (n < 0.09) return mixHex(C.grass, C.dirt, 0.22);
  return n < 0.55 ? C.grass : C.grassDk;
}

function paverColor(u, v, hi, mid, grout, density = 2) {
  const fu = frac(u * density);
  const fv = frac(v * density);
  if (fu < 0.07 || fv < 0.07) return grout;
  const n = hash2(Math.floor(u * density), Math.floor(v * density));
  return n < 0.55 ? hi : mid;
}

function asphalt(u, v) {
  const n = hash2(Math.floor(u * 16), Math.floor(v * 16));
  if (n < 0.04) return C.roadMid;
  return n < 0.52 ? C.road : C.roadHi;
}

function tileAtSafe(city, x, y) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return null;
  return city.tiles[y][x];
}

function isType(city, x, y, type) {
  const t = tileAtSafe(city, x, y);
  return t && t.type === type;
}

function roadPixel(kind, ix, iy, px, py) {
  const u = ix + px / PX;
  const v = iy + py / PX;
  let col = asphalt(u, v);
  const cx = px - PX / 2;
  const cy = py - PX / 2;
  const dash = (ix * PX + px) % 14 < 9;
  const dashZ = (iy * PX + py) % 14 < 9;
  if (kind === "h" || kind === "x" || kind === "road_h") {
    if (dash && Math.abs(cy - 2) <= 1) col = C.lineY;
    if (dash && Math.abs(cy + 2) <= 1) col = C.lineYd;
  }
  if (kind === "v" || kind === "x" || kind === "road_v") {
    if (dashZ && Math.abs(cx - 2) <= 1) col = C.lineY;
    if (dashZ && Math.abs(cx + 2) <= 1) col = C.lineYd;
  }
  if (kind === "x" || kind === "road_x") {
    if (Math.abs(cx) > PX * 0.28 && Math.abs(cy) < PX * 0.38 && (Math.floor(cx / 2) & 1)) col = C.lineW;
    if (Math.abs(cy) > PX * 0.28 && Math.abs(cx) < PX * 0.38 && (Math.floor(cy / 2) & 1)) col = C.lineW;
  }
  if (kind === "c" || kind === "road_c") {
    if (py > PX * 0.45 && dash && Math.abs(cx) <= 1) col = C.lineY;
    if (px > PX * 0.45 && dashZ && Math.abs(cy) <= 1) col = C.lineY;
  }
  return col;
}

function pixelColor(city, ix, iy, px, py) {
  const tile = city.tiles[iy][ix];
  const u = ix + px / PX;
  const v = iy + py / PX;
  const wet =
    isType(city, ix + 1, iy, "pier") ||
    isType(city, ix - 1, iy, "pier") ||
    isType(city, ix, iy + 1, "pier") ||
    isType(city, ix, iy - 1, "pier");
  switch (tile.type) {
    case "road": {
      const col = roadPixel(tile.tex, ix, iy, px, py);
      return wet ? mixHex(col, C.waterDk, 0.18) : col;
    }
    case "grass":
      return grassColor(u, v);
    case "plaza":
      return paverColor(u, v, C.walkHi, mixHex(C.walk, C.cream, 0.12), mixHex(C.walk, C.walkDk, 0.4), 2);
    case "building":
    case "lot":
      return paverColor(u, v, C.walk, mixHex(C.walkDk, C.walk, 0.35), mixHex(C.walkDk, C.walkCrack, 0.25), 2);
    case "sidewalk":
      return wet ? mixHex(paverColor(u, v, C.walkHi, C.walk, C.walkCrack, 2), C.water, 0.12) : paverColor(u, v, C.walkHi, C.walk, C.walkCrack, 2);
    case "water":
      return C.waterDk;
    case "pier":
      return C.pierDk;
    default:
      return grassColor(u, v);
  }
}

function hexToRgb(h) {
  const n = h.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function putCanvas(size, fn) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = hexToRgb(fn(x, y, size));
      const i = (y * size + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function bakeGroundCanvas(city) {
  const size = MAP_SIZE * PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let iy = 0; iy < MAP_SIZE; iy++) {
    for (let ix = 0; ix < MAP_SIZE; ix++) {
      for (let py = 0; py < PX; py++) {
        for (let px = 0; px < PX; px++) {
          const col = hexToRgb(pixelColor(city, ix, iy, px, py));
          const sx = ix * PX + px;
          const sy = iy * PX + py;
          const i = (sy * size + sx) * 4;
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function bakeWoodCanvas() {
  return putCanvas(128, (x, y, size) => {
    const plank = 18;
    const py = y % plank;
    const grain = hash2(x, Math.floor(y / plank) * 13);
    const streak = Math.sin((x / size) * Math.PI * 18 + grain * 6) * 0.5 + 0.5;
    if (py < 3 || py > plank - 4) return mixHex(C.pierDk, C.nail, 0.25);
    let col = mixHex(C.pier, C.pierHi, 0.25 + streak * 0.35);
    if (grain < 0.08) col = mixHex(col, C.woodDk, 0.45);
    if (grain > 0.94) col = mixHex(col, C.nail, 0.55);
    if ((x % 22 < 2 && (py === 5 || py === 12)) && grain > 0.4) col = C.nail;
    return col;
  });
}

export function tileHeight(type) {
  if (type === "water") return WATER_Y;
  if (type === "pier") return PIER_Y;
  if (type === "sidewalk") return 0.04;
  return 0;
}

const LAND = new Set(["road", "sidewalk", "grass", "plaza", "building", "lot"]);

function buf() {
  return { positions: [], indices: [], uvs: [] };
}

function pushQuad(b, a, p, c, d) {
  const v = b.positions.length / 3;
  for (const q of [a, p, c, d]) {
    b.positions.push(q.x, q.y, q.z);
    b.uvs.push(q.u, q.v);
  }
  b.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
}

function toMesh(name, scene, b, updatable = false) {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = b.positions;
  vd.indices = b.indices;
  vd.uvs = b.uvs;
  const normals = [];
  VertexData.ComputeNormals(b.positions, b.indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh, updatable);
  mesh.refreshBoundingInfo();
  return mesh;
}

function dynTex(name, canvas, scene, wrap) {
  const tex = new DynamicTexture(name, { width: canvas.width, height: canvas.height }, scene, false, Texture.BILINEAR_SAMPLINGMODE);
  tex.getContext().drawImage(canvas, 0, 0);
  tex.update();
  tex.wrapU = wrap;
  tex.wrapV = wrap;
  return tex;
}

function landUv(x, z) {
  return { u: x / MAP_SIZE, v: 1 - z / MAP_SIZE };
}

function buildLand(city) {
  const b = buf();
  const edges = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const type = city.tiles[z][x].type;
      if (!LAND.has(type)) continue;
      const y = tileHeight(type);
      const a = landUv(x, z);
      const p = landUv(x + 1, z);
      const c = landUv(x + 1, z + 1);
      const d = landUv(x, z + 1);
      pushQuad(
        b,
        { x, y, z, ...a },
        { x: x + 1, y, z, ...p },
        { x: x + 1, y, z: z + 1, ...c },
        { x, y, z: z + 1, ...d },
      );
      for (const [dx, dz] of edges) {
        const nx = x + dx;
        const nz = z + dz;
        const nt = tileAtSafe(city, nx, nz);
        const drop = !nt || nt.type === "water" || nt.type === "pier";
        if (!drop) continue;
        const y2 = nt?.type === "pier" ? PIER_Y : WATER_Y;
        if (Math.abs(y - y2) < 0.02) continue;
        if (dx === 1) {
          pushQuad(
            b,
            { x: x + 1, y, z, u: p.u, v: p.v },
            { x: x + 1, y: y2, z, u: p.u, v: p.v },
            { x: x + 1, y: y2, z: z + 1, u: c.u, v: c.v },
            { x: x + 1, y, z: z + 1, u: c.u, v: c.v },
          );
        } else if (dx === -1) {
          pushQuad(
            b,
            { x, y, z: z + 1, u: d.u, v: d.v },
            { x, y: y2, z: z + 1, u: d.u, v: d.v },
            { x, y: y2, z, u: a.u, v: a.v },
            { x, y, z, u: a.u, v: a.v },
          );
        } else if (dz === 1) {
          pushQuad(
            b,
            { x: x + 1, y, z: z + 1, u: c.u, v: c.v },
            { x: x + 1, y: y2, z: z + 1, u: c.u, v: c.v },
            { x, y: y2, z: z + 1, u: d.u, v: d.v },
            { x, y, z: z + 1, u: d.u, v: d.v },
          );
        } else {
          pushQuad(
            b,
            { x, y, z, u: a.u, v: a.v },
            { x, y: y2, z, u: a.u, v: a.v },
            { x: x + 1, y: y2, z, u: p.u, v: p.v },
            { x: x + 1, y, z, u: p.u, v: p.v },
          );
        }
      }
    }
  }
  return b;
}

function buildPier(city) {
  const b = buf();
  const edges = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (city.tiles[z][x].type !== "pier") continue;
      const uv = (px, pz) => ({ u: px * 0.85, v: pz * 1.15 });
      const a = uv(x, z);
      const p = uv(x + 1, z);
      const c = uv(x + 1, z + 1);
      const d = uv(x, z + 1);
      pushQuad(
        b,
        { x: x - 0.01, y: PIER_Y, z: z - 0.01, ...a },
        { x: x + 1.01, y: PIER_Y, z: z - 0.01, ...p },
        { x: x + 1.01, y: PIER_Y, z: z + 1.01, ...c },
        { x: x - 0.01, y: PIER_Y, z: z + 1.01, ...d },
      );
      pushQuad(
        b,
        { x: x + 0.12, y: PIER_Y - 0.04, z: z + 0.12, u: 0.2, v: 0.05 },
        { x: x + 0.88, y: PIER_Y - 0.04, z: z + 0.12, u: 0.8, v: 0.05 },
        { x: x + 0.88, y: PIER_Y - 0.04, z: z + 0.88, u: 0.8, v: 0.2 },
        { x: x + 0.12, y: PIER_Y - 0.04, z: z + 0.88, u: 0.2, v: 0.2 },
      );
      for (const [dx, dz] of edges) {
        const nt = tileAtSafe(city, x + dx, z + dz);
        const toWater = !nt || nt.type === "water";
        if (!toWater) continue;
        if (dx === 1) {
          pushQuad(
            b,
            { x: x + 1, y: PIER_Y, z, u: 0, v: 0.02 },
            { x: x + 1, y: WATER_Y, z, u: 0, v: 0.55 },
            { x: x + 1, y: WATER_Y, z: z + 1, u: 1, v: 0.55 },
            { x: x + 1, y: PIER_Y, z: z + 1, u: 1, v: 0.02 },
          );
        } else if (dx === -1) {
          pushQuad(
            b,
            { x, y: PIER_Y, z: z + 1, u: 0, v: 0.02 },
            { x, y: WATER_Y, z: z + 1, u: 0, v: 0.55 },
            { x, y: WATER_Y, z, u: 1, v: 0.55 },
            { x, y: PIER_Y, z, u: 1, v: 0.02 },
          );
        } else if (dz === 1) {
          pushQuad(
            b,
            { x: x + 1, y: PIER_Y, z: z + 1, u: 0, v: 0.02 },
            { x: x + 1, y: WATER_Y, z: z + 1, u: 0, v: 0.55 },
            { x, y: WATER_Y, z: z + 1, u: 1, v: 0.55 },
            { x, y: PIER_Y, z: z + 1, u: 1, v: 0.02 },
          );
        } else {
          pushQuad(
            b,
            { x, y: PIER_Y, z, u: 0, v: 0.02 },
            { x, y: WATER_Y, z, u: 0, v: 0.55 },
            { x: x + 1, y: WATER_Y, z, u: 1, v: 0.55 },
            { x: x + 1, y: PIER_Y, z, u: 1, v: 0.02 },
          );
        }
      }
    }
  }
  return b;
}

export function createCitySurface(scene, city, groundCanvas) {
  const assets = [];
  const groundTex = dynTex("groundTex", groundCanvas, scene, Texture.CLAMP_ADDRESSMODE);
  groundTex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  const landMat = new StandardMaterial("landMat", scene);
  landMat.diffuseTexture = groundTex;
  landMat.specularColor = Color3.Black();
  const land = toMesh("land", scene, buildLand(city));
  land.material = landMat;
  assets.push(land, landMat, groundTex);

  const ocean = createWater(scene);
  assets.push(...ocean.assets);

  const woodTex = dynTex("woodTex", bakeWoodCanvas(), scene, Texture.WRAP_ADDRESSMODE);
  const woodMat = new StandardMaterial("woodMat", scene);
  woodMat.diffuseTexture = woodTex;
  woodMat.specularColor = Color3.FromHexString("#3a2414").scale(0.15);
  woodMat.specularPower = 16;
  const pier = toMesh("pier", scene, buildPier(city));
  pier.material = woodMat;
  assets.push(pier, woodMat, woodTex);

  return {
    assets,
    update(dt) {
      ocean.update(dt);
    },
  };
}
