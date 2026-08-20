import { Color3, Effect, Mesh, ShaderMaterial, StandardMaterial, Vector3, VertexData } from "@babylonjs/core";
import { MAP_SIZE, PIER_DEPTH, WATER_EDGE, WATER_Y } from "./config.js";

const OCEAN_PAD_X = 22;
const OCEAN_PAD_Z = 36;
const STEP = 0.35;

Effect.ShadersStore.isoCityWaterVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float time;
varying vec3 vWPos;
varying vec3 vNrm;
varying float vZ;
varying float vCrest;

vec3 displace(vec3 p) {
  float t = time;
  vec2 d1 = vec2(0.86, 0.50);
  vec2 d2 = vec2(-0.42, 0.91);
  vec2 d3 = vec2(0.18, -0.98);
  float w1 = dot(p.xz, d1) * 1.85 + t * 1.25;
  float w2 = dot(p.xz, d2) * 2.40 + t * 0.95;
  float w3 = dot(p.xz, d3) * 3.60 + t * 1.85;
  float a1 = 0.22;
  float a2 = 0.12;
  float a3 = 0.045;
  float y = sin(w1) * a1 + sin(w2) * a2 + sin(w3) * a3;
  vec2 h = d1 * (cos(w1) * a1 * 0.55) + d2 * (cos(w2) * a2 * 0.5) + d3 * (cos(w3) * a3 * 0.45);
  return vec3(p.x + h.x, p.y + y, p.z + h.y);
}

void main() {
  vec3 p = displace(position);
  float e = 0.22;
  vec3 px = displace(position + vec3(e, 0.0, 0.0));
  vec3 pz = displace(position + vec3(0.0, 0.0, e));
  vec3 n = normalize(cross(px - p, pz - p));
  if (n.y < 0.0) n = -n;
  vWPos = (world * vec4(p, 1.0)).xyz;
  vNrm = normalize((world * vec4(n, 0.0)).xyz);
  vZ = position.z;
  vCrest = p.y - position.y;
  gl_Position = worldViewProjection * vec4(p, 1.0);
}
`;

Effect.ShadersStore.isoCityWaterFragmentShader = `
precision highp float;
uniform vec3 camPos;
uniform vec3 viewDir;
uniform vec3 sunDir;
uniform vec3 skyCol;
uniform float shoreZ;
uniform float time;
varying vec3 vWPos;
varying vec3 vNrm;
varying float vZ;
varying float vCrest;

void main() {
  vec3 n = normalize(vNrm);
  if (n.y < 0.0) n = -n;
  vec3 view = normalize(-viewDir);
  float ndv = max(dot(n, view), 0.001);
  float fres = pow(1.0 - ndv, 2.4);

  float dist = max(vZ - shoreZ, 0.0);
  vec3 shallow = vec3(0.30, 0.60, 0.60);
  vec3 mid = vec3(0.09, 0.34, 0.48);
  vec3 abyss = vec3(0.04, 0.15, 0.28);
  vec3 water = mix(shallow, mid, smoothstep(0.2, 6.0, dist));
  water = mix(water, abyss, smoothstep(5.0, 16.0, dist));

  float crest = smoothstep(0.04, 0.20, vCrest);
  float trough = smoothstep(-0.02, -0.20, vCrest);
  water = mix(water, vec3(0.08, 0.22, 0.34), trough * 0.5);
  water = mix(water, vec3(0.36, 0.62, 0.66), crest * 0.4);

  vec3 light = normalize(sunDir);
  float lambert = 0.58 + 0.42 * max(dot(n, light), 0.0);
  vec3 halfv = normalize(light + view);
  float spec = pow(max(dot(n, halfv), 0.0), 28.0);
  float specWide = pow(max(dot(n, halfv), 0.0), 6.0);

  float foam = 1.0 - smoothstep(0.0, 1.6, dist);
  foam *= 0.55 + 0.2 * sin(vWPos.x * 0.85 + time * 1.7);
  foam = clamp(foam, 0.0, 0.7);

  vec3 col = water * lambert;
  col = mix(col, skyCol, fres * 0.5);
  col += vec3(0.88, 0.94, 1.0) * spec * 0.45;
  col += vec3(0.32, 0.52, 0.64) * specWide * 0.16;
  col = mix(col, vec3(0.78, 0.88, 0.90), foam * 0.45);

  gl_FragColor = vec4(col, 1.0);
}
`;

function buildOceanGrid() {
  const positions = [];
  const indices = [];
  const x0 = -OCEAN_PAD_X;
  const x1 = MAP_SIZE + OCEAN_PAD_X;
  const z0 = WATER_EDGE - PIER_DEPTH - 0.02;
  const z1 = MAP_SIZE + OCEAN_PAD_Z;
  const nx = Math.ceil((x1 - x0) / STEP);
  const nz = Math.ceil((z1 - z0) / STEP);
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      const x = x0 + (ix / nx) * (x1 - x0);
      const z = z0 + (iz / nz) * (z1 - z0);
      positions.push(x, WATER_Y, z);
    }
  }
  const stride = nx + 1;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return { positions, indices };
}

function toMesh(name, scene, geo) {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = geo.positions;
  vd.indices = geo.indices;
  const normals = [];
  VertexData.ComputeNormals(geo.positions, geo.indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.refreshBoundingInfo();
  return mesh;
}

export function createWater(scene) {
  const assets = [];
  const geo = buildOceanGrid();

  const depthMat = new StandardMaterial("oceanDepthMat", scene);
  depthMat.diffuseColor = Color3.FromHexString("#041018");
  depthMat.specularColor = Color3.Black();
  depthMat.emissiveColor = Color3.FromHexString("#02080e");
  depthMat.disableLighting = false;
  const depth = toMesh("oceanDepth", scene, {
    positions: geo.positions.map((v, i) => (i % 3 === 1 ? WATER_Y - 0.85 : v)),
    indices: geo.indices,
  });
  depth.material = depthMat;
  depth.applyFog = false;
  assets.push(depth, depthMat);

  const waterMat = new ShaderMaterial(
    "oceanMat",
    scene,
    { vertex: "isoCityWater", fragment: "isoCityWater" },
    {
      attributes: ["position"],
      uniforms: ["world", "worldViewProjection", "time", "camPos", "viewDir", "sunDir", "skyCol", "shoreZ"],
    },
  );
  waterMat.backFaceCulling = true;
  waterMat.setFloat("time", 0);
  waterMat.setFloat("shoreZ", WATER_EDGE);
  waterMat.setColor3("skyCol", Color3.FromHexString("#c3dced"));
  const sun = scene.getLightByName("sun");
  const sunDir = sun ? sun.direction.scale(-1) : new Vector3(0.55, 1, 0.18);
  sunDir.normalize();
  waterMat.setVector3("sunDir", sunDir);
  waterMat.setVector3("viewDir", new Vector3(-1, -0.8, -1).normalize());
  const water = toMesh("ocean", scene, geo);
  water.material = waterMat;
  water.applyFog = false;
  assets.push(water, waterMat);

  let t = 0;
  return {
    assets,
    update(dt) {
      t += dt;
      waterMat.setFloat("time", t);
      const cam = scene.activeCamera;
      if (cam) {
        waterMat.setVector3("camPos", cam.position);
        const fwd = cam.getForwardRay().direction;
        waterMat.setVector3("viewDir", fwd);
      }
    },
  };
}
