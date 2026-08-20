import {
  Camera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  FreeCamera,
  HemisphericLight,
  Ray,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { CAM, MAP_SIZE } from "./config.js";
import { clearanceToRoad, generateCity, inBounds } from "./city.js";
import { hashSeed, mulberry32 } from "./rng.js";
import { bakeGroundCanvas, createCitySurface, tileHeight } from "./terrain.js";
import { Player } from "./player.js";
import { cloneTpl, createPlayer, loadTemplates, placeBuilding } from "./models.js";
import { spawnTraffic, updateTraffic } from "./traffic.js";
import { markOccluder, updateOcclusion } from "./occlusion.js";
import { Controls } from "./controls.js";

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, { adaptToDeviceRatio: true, preserveDrawingBuffer: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#87b4d8ff");
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = Color3.FromHexString("#87b4d8");
    this.scene.fogStart = 28;
    this.scene.fogEnd = 78;
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
    this.seed = new URLSearchParams(window.location.search).get("seed") || String((Math.random() * 1e9) | 0);
    this.hudEl = document.getElementById("hud");
    if (this.hudEl) this.hudEl.textContent = "CARGANDO MODELOS 3D…";

    this.camYaw = Math.PI;
    this.camPitch = CAM.pitchDefault;
    this.camDist = CAM.distDefault;
    this.camTarget = Vector3.Zero();
    this._camDesired = new Vector3();
    this._camDir = new Vector3();
    this._follow = new Vector3();

    this.camera = new FreeCamera("cam", new Vector3(0, 8, -8), this.scene);
    this.camera.mode = Camera.PERSPECTIVE_CAMERA;
    this.camera.fov = CAM.fov;
    this.camera.minZ = 0.12;
    this.camera.maxZ = 180;
    this.camera.inputs.clear();
    this.camera.inertia = 0;

    this.hemi = new HemisphericLight("hemi", new Vector3(0.25, 1, 0.15), this.scene);
    this.hemi.diffuse = Color3.FromHexString("#f4efe4");
    this.hemi.groundColor = Color3.FromHexString("#5a6a4a");
    this.hemi.intensity = 0.7;

    this.sun = new DirectionalLight("sun", new Vector3(-0.65, -1, -0.2), this.scene);
    this.sun.intensity = 0.85;
    this.sun.diffuse = Color3.FromHexString("#fff4d8");

    this.controls = new Controls({
      canvas,
      joystick: document.getElementById("joystick"),
      knob: document.getElementById("joystick-knob"),
      lookStick: document.getElementById("look-stick"),
      lookKnob: document.getElementById("look-knob"),
    });

    window.addEventListener("resize", () => this.engine.resize());
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "n") this.rebuild(String((Math.random() * 1e9) | 0));
    });
    document.getElementById("btn-new")?.addEventListener("click", () => {
      this.rebuild(String((Math.random() * 1e9) | 0));
    });
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
      this.camDist = clamp(this.camDist * 0.82, CAM.distMin, CAM.distMax);
    });
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
      this.camDist = clamp(this.camDist * 1.22, CAM.distMin, CAM.distMax);
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
    this.camYaw = this.player.angle;
    this.camPitch = CAM.pitchDefault;
    this.camDist = CAM.distDefault;
    this.camTarget.copyFrom(this.player.rig.root.position);
    this.camTarget.y += CAM.lookY;
    this.placeCamera();
  }

  placeCamera() {
    const cosp = Math.cos(this.camPitch);
    const dist = this.camDist;
    this._camDesired.set(
      this.camTarget.x + Math.sin(this.camYaw) * cosp * dist,
      this.camTarget.y + Math.sin(this.camPitch) * dist,
      this.camTarget.z + Math.cos(this.camYaw) * cosp * dist,
    );
    this._camDesired.y = Math.max(0.42, this._camDesired.y);

    const maxD = Vector3.Distance(this.camTarget, this._camDesired);
    const ray = Ray.CreateNewFromTo(this.camTarget, this._camDesired);
    const hit = this.scene.pickWithRay(ray, (mesh) => !!mesh.metadata?.occluderRoot);
    if (hit?.hit && hit.distance < maxD - 0.15) {
      const d = Math.max(1.35, hit.distance - 0.4);
      this._camDir.copyFrom(this._camDesired).subtractInPlace(this.camTarget);
      const len = this._camDir.length();
      if (len > 0.001) this._camDir.scaleInPlace(d / len);
      this.camera.position.copyFrom(this.camTarget).addInPlace(this._camDir);
    } else {
      this.camera.position.copyFrom(this._camDesired);
    }
    this.camera.setTarget(this.camTarget);
  }

  wishFromCamera(move) {
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = -Math.cos(this.camYaw);
    const rz = Math.sin(this.camYaw);
    return {
      x: fx * move.forward + rx * move.strafe,
      z: fz * move.forward + rz * move.strafe,
    };
  }

  update(dt) {
    if (!this.player || !this.city) return;
    const clamped = Math.min(dt, 0.05);
    const move = this.controls.getMove();
    const wish = this.wishFromCamera(move);
    this.player.update(clamped, this.city, this.blockers.concat(this.movers), wish.x, wish.z);
    this.movers = updateTraffic(this.city, this.traffic, clamped, this.rng);
    this.surface?.update(clamped);

    const look = this.controls.consumeLook();
    const sens = this.controls.isTouch() ? CAM.touchLookSens : CAM.lookSens;
    this.camYaw += look.x * sens + this.controls.lookStickX * CAM.stickLook * clamped;
    this.camPitch = clamp(
      this.camPitch + look.y * sens + this.controls.lookStickY * CAM.stickLook * clamped,
      CAM.pitchMin,
      CAM.pitchMax,
    );
    const zoom = this.controls.consumeZoom();
    if (zoom) this.camDist = clamp(this.camDist * Math.exp(zoom * 0.085), CAM.distMin, CAM.distMax);

    const pos = this.player.rig.root.position;
    this._follow.set(pos.x, pos.y + CAM.lookY, pos.z);
    Vector3.LerpToRef(this.camTarget, this._follow, 1 - Math.pow(0.0008, clamped), this.camTarget);
    this.placeCamera();
    updateOcclusion(this.scene, this.camera, this.player.rig.root, this.occludeActive, clamped);
    this.updateHud();
  }

  updateHud() {
    if (!this.hudEl) return;
    const mobile = document.body.classList.contains("touch-on");
    const html = mobile
      ? `ISOCITY 3D&nbsp;&nbsp;seed ${this.seed}<br>${MAP_SIZE}×${MAP_SIZE}`
      : `ISOCITY 3D&nbsp;&nbsp;seed ${this.seed}<br>WASD / flechas para caminar&nbsp;&nbsp;arrastrar: mirar<br>N nueva ciudad&nbsp;&nbsp;rueda: zoom&nbsp;&nbsp;${MAP_SIZE}×${MAP_SIZE}`;
    if (html === this._hudLast) return;
    this._hudLast = html;
    this.hudEl.innerHTML = html;
  }
}
