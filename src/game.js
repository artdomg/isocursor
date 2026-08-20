import {
  Camera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  FreeCamera,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { MAP_SIZE, ISO_DIR } from "./config.js";
import { clearanceToRoad, generateCity, inBounds } from "./city.js";
import { hashSeed, mulberry32 } from "./rng.js";
import { bakeGroundCanvas, createCitySurface, tileHeight } from "./terrain.js";
import { Player } from "./player.js";
import { cloneTpl, createPlayer, loadTemplates, placeBuilding } from "./models.js";
import { spawnTraffic, updateTraffic } from "./traffic.js";
import { markOccluder, updateOcclusion } from "./occlusion.js";

const CAM_DIST = 28;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { adaptToDeviceRatio: true, preserveDrawingBuffer: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#87b4d8ff");
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = Color3.FromHexString("#87b4d8");
    this.scene.fogStart = 40;
    this.scene.fogEnd = 90;
    this.assets = [];
    this.templates = null;
    this.player = null;
    this.city = null;
    this.blockers = [];
    this.traffic = { cars: [], peds: [] };
    this.movers = [];
    this.occluders = [];
    this.occludeActive = new Set();
    this.rng = Math.random;
    this.orthoHalf = 11;
    this.seed = new URLSearchParams(window.location.search).get("seed") || String((Math.random() * 1e9) | 0);
    this.hudEl = document.getElementById("hud");
    if (this.hudEl) this.hudEl.textContent = "CARGANDO MODELOS 3D…";

    this.camera = new FreeCamera("cam", Vector3.Zero(), this.scene);
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 220;
    this.camera.inputs.clear();
    this.isoDir = new Vector3(ISO_DIR.x, ISO_DIR.y, ISO_DIR.z).normalize();
    this.camTarget = Vector3.Zero();
    this.camRotation = null;
    this.camRotationQ = null;

    this.hemi = new HemisphericLight("hemi", new Vector3(0.25, 1, 0.15), this.scene);
    this.hemi.diffuse = Color3.FromHexString("#f4efe4");
    this.hemi.groundColor = Color3.FromHexString("#5a6a4a");
    this.hemi.intensity = 0.7;

    this.sun = new DirectionalLight("sun", new Vector3(-0.65, -1, -0.2), this.scene);
    this.sun.intensity = 0.85;
    this.sun.diffuse = Color3.FromHexString("#fff4d8");

    window.addEventListener("resize", () => this.engine.resize());
    canvas.addEventListener(
      "wheel",
      (e) => {
        this.orthoHalf = Math.min(22, Math.max(6, this.orthoHalf * (e.deltaY > 0 ? 1.1 : 0.9)));
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "n") this.rebuild(String((Math.random() * 1e9) | 0));
    });

    loadTemplates(this.scene)
      .then((t) => {
        this.templates = t;
        this.rebuild(this.seed);
      })
      .catch((err) => {
        console.error(err);
        if (this.hudEl) this.hudEl.textContent = "ERROR: no se pudieron cargar los modelos 3D";
      });

    this.engine.runRenderLoop(() => {
      try {
        this.update(this.engine.getDeltaTime() / 1000);
        this.scene.render();
      } catch (err) {
        console.error(err);
      }
    });
  }

  disposeWorld() {
    for (const a of this.assets) {
      try {
        a.dispose();
      } catch {
        /* already gone */
      }
    }
    this.assets = [];
    this.blockers = [];
    this.traffic = { cars: [], peds: [] };
    this.movers = [];
    this.occluders = [];
    this.occludeActive = new Set();
    this.surface = null;
  }

  rebuild(seed) {
    if (!this.templates) return;
    this.seed = seed;
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    window.history.replaceState({}, "", url);
    this.disposeWorld();

    const rng = mulberry32(hashSeed(seed));
    this.rng = rng;
    this.city = generateCity(rng);
    this.buildGround();
    this.placeCity();
    this.traffic = spawnTraffic(this.scene, this.city, this.templates, rng, this.assets);
    for (const car of this.traffic.cars) {
      markOccluder(car.node);
      this.occluders.push(car.node);
    }
    const rig = createPlayer(this.scene, this.templates, this.assets);
    this.player = new Player(rig, this.city.start, this.city);
    this.snapCamera();
    this.updateHud();
  }

  buildGround() {
    const canvas = bakeGroundCanvas(this.city);
    this.surface = createCitySurface(this.scene, this.city, canvas);
    this.assets.push(...this.surface.assets);
  }

  placeCity() {
    for (const b of this.city.buildings) {
      const node = placeBuilding(this.scene, this.templates, b, this.assets);
      markOccluder(node);
      this.occluders.push(node);
    }
    for (const prop of this.city.props) {
      const kind = prop.tex;
      const x = prop.x + 0.5 + (prop.ox || 0) / 32;
      const z = prop.y + 0.5 + (prop.oy || 0) / 32;
      const y = tileHeight(this.city.tiles[prop.y]?.[prop.x]?.type);
      if (kind.startsWith("tree")) {
        const at = this.city.tiles[Math.floor(z)]?.[Math.floor(x)];
        if (!at || at.type === "road" || at.type === "sidewalk" || at.type === "water" || at.type === "pier") continue;
        if (clearanceToRoad(this.city.tiles, x, z) < 0.5) continue;
        const key = kind === "tree_tall" ? "tree_tall" : kind === "tree_sm" ? "tree_sm" : "tree";
        const node = cloneTpl(this.templates[key], kind, this.assets);
        node.position.set(x, y, z);
        node.rotation.y = (prop.x * 1.7 + prop.y) % (Math.PI * 2);
        const s = 0.85 + ((prop.x * 3 + prop.y) % 7) * 0.04;
        node.scaling.setAll(s);
        markOccluder(node);
        this.occluders.push(node);
        if (prop.collide) this.blockers.push({ x: prop.x, y: prop.y, r: 0.28 });
      } else if (kind === "lamp") {
        const at = this.city.tiles[Math.floor(z)]?.[Math.floor(x)];
        if (!at || at.type === "road" || at.type === "water" || at.type === "pier") continue;
        if (clearanceToRoad(this.city.tiles, x, z) < 0.28) continue;
        const node = cloneTpl(this.templates.lamp, "lamp", this.assets);
        node.position.set(x, y, z);
        node.rotation.y = prop.rot ?? 0;
        markOccluder(node);
        this.occluders.push(node);
      } else if (kind.startsWith("car")) {
        continue;
      } else if (kind === "boat") {
        const node = cloneTpl(this.templates.boat, "boat", this.assets);
        node.position.set(x, y + 0.48, z);
        node.rotation.y = (prop.x % 2 === 0 ? 0 : Math.PI) + (prop.x * 0.03 - 0.06);
        markOccluder(node);
        this.occluders.push(node);
      }
    }
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (this.city.tiles[y][x].type !== "pier") continue;
        const waterN = inBounds(x, y + 1) && this.city.tiles[y + 1][x].type === "water";
        if (!waterN) continue;
        for (let k = -0.28; k <= 0.28; k += 0.28) {
          const p = cloneTpl(this.templates.piling, "piling", this.assets);
          p.position.set(x + 0.5 + k, -0.08, y + 0.88);
        }
      }
    }
  }

  snapCamera() {
    if (!this.player) return;
    this.camTarget.copyFrom(this.player.rig.root.position);
    this.camera.position.copyFrom(this.camTarget).addInPlace(this.isoDir.scale(CAM_DIST));
    this.camera.setTarget(this.camTarget);
    this.camRotation = this.camera.rotation.clone();
    this.camRotationQ = this.camera.rotationQuaternion?.clone() ?? null;
    this.applyOrtho();
  }

  applyOrtho() {
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.camera.orthoTop = this.orthoHalf;
    this.camera.orthoBottom = -this.orthoHalf;
    this.camera.orthoRight = this.orthoHalf * aspect;
    this.camera.orthoLeft = -this.orthoHalf * aspect;
  }

  update(dt) {
    if (!this.player || !this.city) return;
    const clamped = Math.min(dt, 0.05);
    this.player.update(clamped, this.city, this.blockers.concat(this.movers));
    this.movers = updateTraffic(this.city, this.traffic, clamped, this.rng);
    this.surface?.update(clamped);
    Vector3.LerpToRef(
      this.camTarget,
      this.player.rig.root.position,
      1 - Math.pow(0.001, clamped),
      this.camTarget,
    );
    this.camera.position.copyFrom(this.camTarget).addInPlace(this.isoDir.scale(CAM_DIST));
    if (this.camRotationQ) {
      if (!this.camera.rotationQuaternion) this.camera.rotationQuaternion = this.camRotationQ.clone();
      else this.camera.rotationQuaternion.copyFrom(this.camRotationQ);
    } else if (this.camRotation) {
      this.camera.rotation.copyFrom(this.camRotation);
    }
    this.applyOrtho();
    updateOcclusion(this.scene, this.camera, this.player.rig.root, this.occludeActive, clamped);
    this.updateHud();
  }

  updateHud() {
    if (!this.hudEl) return;
    this.hudEl.innerHTML = `ISOCITY 3D&nbsp;&nbsp;seed ${this.seed}<br>WASD / flechas para caminar<br>N nueva ciudad&nbsp;&nbsp;rueda: zoom&nbsp;&nbsp;${MAP_SIZE}×${MAP_SIZE}`;
  }
}
