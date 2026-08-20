import { Ray, Vector3 } from "@babylonjs/core";

const FADE = 0.2;
const _chest = new Vector3();
const _head = new Vector3();
const _side = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

function applyVis(root, vis) {
  root.metadata.fade = vis;
  for (const m of root.getChildMeshes()) m.visibility = vis;
}

export function markOccluder(root) {
  const md = root.metadata || {};
  md.occluder = true;
  md.fade = 1;
  root.metadata = md;
  for (const m of root.getChildMeshes()) {
    m.metadata = { ...(m.metadata || {}), occluderRoot: root };
    m.isPickable = true;
  }
}

function shoot(scene, camera, target, maxDist, hits) {
  const ray = Ray.CreateNewFromTo(camera.position, target);
  const picked = scene.multiPickWithRay(ray, (mesh) => !!mesh.metadata?.occluderRoot);
  if (!picked) return;
  for (const hit of picked) {
    if (hit.distance >= maxDist - 0.05) continue;
    const root = hit.pickedMesh?.metadata?.occluderRoot;
    if (root && !root._isDisposed) hits.add(root);
  }
}

export function updateOcclusion(scene, camera, playerRoot, active, dt) {
  if (!playerRoot) return;
  const pos = playerRoot.position;
  _chest.copyFrom(pos);
  _chest.y += 0.36;
  _head.copyFrom(pos);
  _head.y += 0.62;
  _side.set(0.16, 0, -0.16);

  const dChest = Vector3.Distance(camera.position, _chest);
  const dHead = Vector3.Distance(camera.position, _head);
  const hits = new Set();
  shoot(scene, camera, _chest, dChest, hits);
  shoot(scene, camera, _head, dHead, hits);
  _a.copyFrom(_chest).addInPlace(_side);
  _b.copyFrom(_chest).subtractInPlace(_side);
  shoot(scene, camera, _a, Vector3.Distance(camera.position, _a), hits);
  shoot(scene, camera, _b, Vector3.Distance(camera.position, _b), hits);

  const k = Math.min(1, dt * 14);
  for (const root of hits) active.add(root);
  for (const root of [...active]) {
    if (!root || root._isDisposed) {
      active.delete(root);
      continue;
    }
    const want = hits.has(root) ? FADE : 1;
    const cur = root.metadata?.fade ?? 1;
    const next = cur + (want - cur) * k;
    applyVis(root, next);
    if (want === 1 && next > 0.992) {
      applyVis(root, 1);
      active.delete(root);
    }
  }
}
