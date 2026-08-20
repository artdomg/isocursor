import {
  Color3,
  DynamicTexture,
  PBRMaterial,
  SceneLoader,
  Space,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { STYLE_COLORS } from "./catalog.js";
import { C, mixHex } from "./palette.js";

const MODEL_DIR = "assets/models/";
const MODEL_VER = "20260820b";

const ROT_FIX = {
  tree: 0,
  tree_tall: 0,
  tree_sm: 0,
  lamp: 0,
  car: Math.PI,
  boat: 0,
  piling: 0,
  character: Math.PI,
};

export async function loadTemplates(scene) {
  const files = {
    tree: "tree.glb",
    tree_tall: "tree_tall.glb",
    tree_sm: "tree_sm.glb",
    lamp: "lamp.glb",
    car: "car.glb",
    boat: "boat.glb",
    piling: "piling.glb",
    character: "character.glb",
  };
  const out = {};
  for (const key of Object.keys(files)) {
    const res = await SceneLoader.ImportMeshAsync("", MODEL_DIR, `${files[key]}?v=${MODEL_VER}`, scene);
    const tpl = new TransformNode(`tpl_${key}`, scene);
    for (const m of res.meshes) {
      if (!m.parent) {
        const fix = ROT_FIX[key] ?? 0;
        if (fix) m.rotate(Vector3.Up(), fix, Space.LOCAL);
        m.parent = tpl;
      }
    }
    tpl.setEnabled(false);
    out[key] = tpl;
  }

  const buildings = {};
  for (const key of ["A", "B", "C", "D", "E"]) {
    const res = await SceneLoader.ImportMeshAsync("", MODEL_DIR, `building_${key.toLowerCase()}.glb?v=${MODEL_VER}`, scene);
    const tpl = new TransformNode(`tpl_bld${key}`, scene);
    for (const m of res.meshes) {
      if (!m.parent) m.parent = tpl;
    }
    tpl.setEnabled(false);
    buildings[key] = tpl;
  }

  const materials = new Map();
  for (const m of scene.materials) {
    if (m instanceof PBRMaterial) materials.set(m.name, m);
  }
  return { ...out, buildings, materials };
}

export function cloneTpl(tpl, name, assets) {
  const c = tpl.clone(name, null);
  c.setEnabled(true);
  assets.push(c);
  for (const n of c.getDescendants()) assets.push(n);
  return c;
}

function child(root, name) {
  const hit = root.getDescendants(false, (n) => n.name === name || n.name.endsWith("." + name));
  return hit[0] ?? null;
}

const tintCache = new Map();
function tinted(base, hex) {
  const key = `${base.name}|${hex}`;
  let m = tintCache.get(key);
  if (!m) {
    m = base.clone(key);
    m.albedoColor = Color3.FromHexString(hex);
    tintCache.set(key, m);
  }
  return m;
}

export function paintByMaterial(root, materials, map) {
  for (const mesh of root.getChildMeshes()) {
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial)) continue;
    const baseName = Object.keys(map).find((k) => mat.name === k || mat.name.startsWith(`${k}|`));
    if (!baseName) continue;
    const base = materials.get(baseName) ?? mat;
    mesh.material = tinted(base, map[baseName]);
  }
}

const facadeCache = new Map();

function fill(ctx, x, y, w, h, hex) {
  ctx.fillStyle = hex;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function brickPattern(ctx, x, y, w, h, pal) {
  fill(ctx, x, y, w, h, pal.wall);
  const bh = 7;
  const bw = 12;
  for (let row = 0; row < Math.ceil(h / bh); row++) {
    const oy = y + row * bh;
    const shift = row & 1 ? bw / 2 : 0;
    fill(ctx, x, oy + bh - 1, w, 1, pal.mortar);
    for (let col = -1; col < Math.ceil(w / bw) + 1; col++) {
      const ox = x + col * bw + shift;
      fill(ctx, ox, oy, 1, bh, pal.mortar);
      if ((row + col) % 9 === 0) fill(ctx, ox + 2, oy + 1, bw - 3, bh - 3, pal.wallDk);
      else if ((row + col) % 5 === 0) fill(ctx, ox + 2, oy + 1, bw - 3, bh - 3, pal.wallLt);
    }
  }
}

function makeFacadeTexture(scene, style, floors) {
  const key = `${style}_${floors}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const pal = STYLE_COLORS[style] || STYLE_COLORS.brick;
  const w = 160;
  const h = 320;
  const tex = new DynamicTexture(`facade_${key}`, { width: w, height: h }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const band = h * 0.5;
  const masonry = style === "brick" || style === "brown" || style === "tan" || style === "cream";
  const glassy = style === "glass" || style === "office" || style === "slate";

  fill(ctx, 0, 0, w, band, pal.roof);
  for (let i = 0; i < 18; i++) {
    const rx = 8 + ((i * 37) % (w - 28));
    const ry = 6 + ((i * 19) % (band - 36));
    fill(ctx, rx, ry, 10, 8, pal.wallDk);
    fill(ctx, rx + 1, ry + 1, 8, 6, pal.mortar);
  }
  fill(ctx, 18, 10, 28, 16, pal.mortar);
  fill(ctx, 22, 13, 20, 10, pal.wallDk);
  fill(ctx, 24, 15, 7, 6, pal.wall);
  fill(ctx, 31, 15, 7, 6, pal.wallLt);
  fill(ctx, w - 48, 8, 22, 14, pal.mortar);
  fill(ctx, w - 45, 11, 16, 8, pal.wallDk);
  fill(ctx, 0, band - 8, w, 8, pal.wallDk);
  fill(ctx, 0, band - 5, w, 3, pal.mortar);

  if (masonry) brickPattern(ctx, 0, band, w, band, pal);
  else {
    fill(ctx, 0, band, w, band, pal.wall);
    for (let gy = 0; gy < 8; gy++) fill(ctx, 0, band + gy * ((band - 4) / 8), w, 2, pal.wallDk);
  }

  const cols = glassy ? 4 : 3;
  const rows = Math.max(2, Math.min(10, floors));
  const doorW = 18;
  const doorH = 28;
  fill(ctx, (w - doorW) / 2 - 2, h - doorH - 4, doorW + 4, doorH + 4, pal.wallDk);
  fill(ctx, (w - doorW) / 2, h - doorH - 2, doorW, doorH, "#2a201c");
  fill(ctx, (w - doorW) / 2 + 3, h - doorH + 4, 5, 10, C.glassLt);
  fill(ctx, (w - doorW) / 2 + 10, h - doorH + 4, 5, 10, C.glassLt);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 8 + c * ((w - 16) / cols);
      const y = band + 10 + r * ((band - 44) / rows);
      const ww = (w - 16) / cols - 8;
      const hh = Math.max(8, (band - 44) / rows - 7);
      if (r === rows - 1 && c === Math.floor(cols / 2) && y + hh > h - doorH - 10) continue;
      fill(ctx, x, y, ww, hh, pal.wallDk);
      fill(ctx, x + 1, y + 1, ww - 2, hh - 2, pal.mortar);
      const lit = (r * 17 + c * 11 + floors) % 10 > 5;
      fill(ctx, x + 2, y + 2, ww - 4, hh - 4, lit ? C.glassLit : glassy ? C.glassHi : C.glassLt);
      if (glassy) {
        fill(ctx, x + 2, y + 2, (ww - 4) / 2, hh - 4, mixHex(C.glassLt, "#ffffff", 0.12));
      }
      fill(ctx, x, y + hh - 2, ww, 2, pal.wallLt);
    }
  }
  fill(ctx, 0, band, w, 5, pal.mortar);
  fill(ctx, 0, h - 3, w, 3, pal.wallDk);
  tex.update();
  tex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  facadeCache.set(key, tex);
  return tex;
}

const matCache = new Map();
export function buildingMaterial(scene, style, floors) {
  const key = `${style}_${floors}`;
  if (matCache.has(key)) return matCache.get(key);
  const pal = STYLE_COLORS[style] || STYLE_COLORS.brick;
  const mat = new StandardMaterial(`bmat_${key}`, scene);
  mat.diffuseTexture = makeFacadeTexture(scene, style, floors);
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.FromHexString(pal.wallLt).scale(0.04);
  if (style === "glass" || style === "office") {
    mat.specularColor = Color3.FromHexString("#9ab4c8").scale(0.35);
    mat.specularPower = 48;
  }
  matCache.set(key, mat);
  return mat;
}

export function placeBuilding(scene, templates, b, assets) {
  const shape = b.shape || "A";
  const root = cloneTpl(templates.buildings[shape], `bld_${b.x}_${b.y}`, assets);
  const spanX = b.spanX || 1;
  const spanY = b.spanY || 1;
  root.position.set(b.x + spanX * 0.5, 0, b.y + spanY * 0.5);
  const h = Math.max(0.85, b.floors * 0.38);
  root.scaling.set(spanX, h, spanY);
  const mat = buildingMaterial(scene, b.style || "brick", b.floors);
  for (const mesh of root.getChildMeshes()) mesh.material = mat;
  return root;
}

export function createPlayer(scene, templates, assets, palette = null, scale = 0.48) {
  const root = cloneTpl(templates.character, palette ? "ped" : "player", assets);
  paintByMaterial(root, templates.materials, {
    Skin: palette?.skin ?? C.skin,
    Hair: palette?.hair ?? C.hair,
    Shirt: palette?.shirt ?? C.shirt,
    ShirtDark: palette?.shirtDark ?? "#c83c28",
    Pants: palette?.pants ?? C.pants,
    Shoe: palette?.shoe ?? C.shoes,
  });
  const legL = child(root, "LegL");
  const legR = child(root, "LegR");
  const armL = child(root, "ArmL");
  const armR = child(root, "ArmR");
  for (const n of [legL, legR, armL, armR]) {
    if (n) n.rotationQuaternion = null;
  }
  root.scaling.setAll(scale);
  return { root, legL, legR, armL, armR };
}

export function animateWalk(rig, moving, dt, anim) {
  if (!moving) {
    const damp = Math.max(0, 1 - dt * 10);
    if (rig.legL) rig.legL.rotation.x *= damp;
    if (rig.legR) rig.legR.rotation.x *= damp;
    if (rig.armL) rig.armL.rotation.x *= damp;
    if (rig.armR) rig.armR.rotation.x *= damp;
    return;
  }
  const amp = 0.55;
  if (rig.legL) rig.legL.rotation.x = Math.sin(anim) * amp;
  if (rig.legR) rig.legR.rotation.x = Math.sin(anim + Math.PI) * amp;
  if (rig.armL) rig.armL.rotation.x = Math.sin(anim + Math.PI) * amp * 0.55;
  if (rig.armR) rig.armR.rotation.x = Math.sin(anim) * amp * 0.55;
}
