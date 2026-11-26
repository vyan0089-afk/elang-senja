// terrain.js — procedural terrain for Elang Senja: rolling hills, a river valley,
// a flat runway strip, scattered trees and houses, clouds and a late-afternoon sky.
// Every placement is seeded, so the valley is identical on every run.
import * as THREE from 'three';

// --- deterministic random -------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// --- the valley -----------------------------------------------------------
// Runway 09/27: flat strip along Z at x = 0, from z = -350 to z = +350.
export const RUNWAY = { halfWidth: 18, halfLength: 350, length: 700, width: 36 };

// River: winds north-south west of the runway.
export function riverX(z) {
  return -720 + 260 * Math.sin(z * 0.0008 + 0.5) + 120 * Math.sin(z * 0.0021);
}

// Distance from a point to the runway rectangle (0 inside it).
function runwayDistance(x, z) {
  const dx = Math.max(Math.abs(x) - RUNWAY.halfWidth, 0);
  const dz = Math.max(Math.abs(z) - RUNWAY.halfLength, 0);
  return Math.hypot(dx, dz);
}

// Height of the ground in metres. Flat (0) on the runway, rolling hills
// elsewhere, with a valley carved along the river.
export function terrainHeight(x, z) {
  let h = 0;
  h += 22 * Math.sin(x * 0.0011 + 1.7) * Math.cos(z * 0.0009 - 0.6);
  h += 12 * Math.sin(x * 0.0023 - 0.4) * Math.sin(z * 0.0019 + 2.1);
  h += 6 * Math.sin(x * 0.005 + z * 0.004);
  h += 3 * Math.sin(x * 0.011 - z * 0.008 + 1.1);
  // River valley: carve the ground down near the river line.
  const dRiver = Math.abs(x - riverX(z));
  h -= 14 * (1 - smoothstep(0, 200, dRiver));
  // Flatten toward the runway so the strip and its approaches are level.
  const flat = smoothstep(0, 240, runwayDistance(x, z));
  h *= flat;
  return h;
}

// --- materials ------------------------------------------------------------
const grassA = new THREE.Color(0x5d8a3c);
const grassB = new THREE.Color(0x7a9a4a);
const dirt = new THREE.Color(0x8a6f4d);
const rock = new THREE.Color(0x7d7468);

function colorForHeight(h, random) {
  const c = new THREE.Color();
  if (h > 26) c.copy(rock);
  else if (h > 14) c.copy(grassB).lerp(rock, (h - 14) / 14);
  else c.copy(grassA).lerp(grassB, h / 14);
  // Dry patches of dirt, scattered by the seeded random.
  if (random() < 0.08) c.lerp(dirt, 0.55);
  return c;
}

// --- builders -------------------------------------------------------------
export function buildTerrain(random) {
  const group = new THREE.Group();
  const size = 5200;
  const segments = 180;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const c = colorForHeight(h, random);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(mesh);
  return group;
}

export function buildRiver() {
  // A ribbon that hugs the valley floor, so it never clips through hills.
  const group = new THREE.Group();
  const width = 70;
  const positions = [];
  const indices = [];
  const step = 60;
  let n = 0;
  for (let z = -2500; z <= 2500; z += step) {
    const cx = riverX(z);
    const y = terrainHeight(cx, z) + 1.1;
    // Cross-section: left bank, centre, right bank (slightly lower centre).
    positions.push(cx - width / 2, terrainHeight(cx - width / 2, z) + 0.4, z);
    positions.push(cx, y, z);
    positions.push(cx + width / 2, terrainHeight(cx + width / 2, z) + 0.4, z);
    if (n > 0) {
      const a = (n - 1) * 3, b = n * 3;
      indices.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
    }
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: 0x3a7bd5, transparent: true, opacity: 0.88, emissive: 0x0a2a55,
  }));
  group.add(water);
  return group;
}

export function buildRunway() {
  const group = new THREE.Group();
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf2f0e6 });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length), asphalt);
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.15;
  group.add(strip);
  // Centreline dashes.
  for (let z = -320; z <= 320; z += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 18), white);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.2, z);
    group.add(dash);
  }
  // Threshold bars at both ends.
  for (const zEnd of [-330, 330]) {
    for (let x = -14; x <= 14; x += 7) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3, 22), white);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x, 0.2, zEnd);
      group.add(bar);
    }
  }
  // Edge lights: small warm lamps along both edges.
  const lampGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let z = -340; z <= 340; z += 34) {
    for (const x of [-RUNWAY.halfWidth - 2, RUNWAY.halfWidth + 2]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 0.8, z);
      group.add(lamp);
    }
  }
  // Windsock at the southern end.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(30, 6, -360);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 6, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a3c }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(33, 11.5, -360);
  group.add(sock);
  return group;
}

export function buildTreesAndHouses(random) {
  const group = new THREE.Group();
  // Trees: instanced trunks + canopies, kept clear of runway and river.
  const treeCount = 420;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const canopyGeo = new THREE.ConeGeometry(3.4, 9, 8);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f6b2a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard < 6000) {
    guard++;
    const x = (random() - 0.5) * 4800;
    const z = (random() - 0.5) * 4800;
    if (runwayDistance(x, z) < 90) continue;
    if (Math.abs(x - riverX(z)) < 55) continue;
    const y = terrainHeight(x, z);
    const s = 0.7 + random() * 0.9;
    dummy.position.set(x, y + 2 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x, y + (4 + 4.5) * s, z);
    dummy.updateMatrix();
    canopies.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunks.count = placed;
  canopies.count = placed;
  group.add(trunks, canopies);
  // Houses: small boxes with pitched roofs, clustered into two villages.
  const houseCount = 46;
  const bodyGeo = new THREE.BoxGeometry(10, 6, 8);
  const roofGeo = new THREE.ConeGeometry(7.5, 4, 4);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }), houseCount);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0xa44a2a }), houseCount);
  const villages = [{ x: 420, z: -700 }, { x: -420, z: 800 }];
  let placedHouses = 0;
  let houseGuard = 0;
  while (placedHouses < houseCount && houseGuard < 400) {
    houseGuard++;
    const v = villages[placedHouses % villages.length];
    const x = v.x + (random() - 0.5) * 260;
    const z = v.z + (random() - 0.5) * 260;
    if (Math.abs(x - riverX(z)) < 80) continue; // keep houses out of the river
    if (runwayDistance(x, z) < 90) continue;
    const y = terrainHeight(x, z);
    const s = 0.8 + random() * 0.7;
    dummy.position.set(x, y + 2.6 * s, z); // sink the base into the slope
    dummy.scale.setScalar(s);
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    bodies.setMatrixAt(placedHouses, dummy.matrix);
    dummy.position.set(x, y + (6 + 2) * s, z);
    dummy.rotation.y += Math.PI / 4;
    dummy.updateMatrix();
    roofs.setMatrixAt(placedHouses, dummy.matrix);
    placedHouses++;
  }
  bodies.count = placedHouses;
  roofs.count = placedHouses;
  group.add(bodies, roofs);
  return group;
}

export function buildClouds(random) {
  const group = new THREE.Group();
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  // Unlit warm white: lit clouds shaded brown under the low sun.
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xfff2dd, transparent: true, opacity: 0.9 });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, 90);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let c = 0; c < 16; c++) {
    const cx = (random() - 0.5) * 4200;
    const cz = (random() - 0.5) * 4200;
    const cy = 300 + random() * 140;
    const n = 4 + Math.floor(random() * 3);
    for (let p = 0; p < n && idx < 90; p++) {
      dummy.position.set(cx + (random() - 0.5) * 90, cy + (random() - 0.5) * 14, cz + (random() - 0.5) * 40);
      dummy.scale.set(28 + random() * 22, 10 + random() * 7, 20 + random() * 14);
      dummy.updateMatrix();
      puffs.setMatrixAt(idx++, dummy.matrix);
    }
  }
  puffs.count = idx;
  group.add(puffs);
  return group;
}

export function buildSky(scene) {
  // Warm late-afternoon gradient dome, generated at runtime (no files).
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2e4a6b');
  grad.addColorStop(0.45, '#7fa3c8');
  grad.addColorStop(0.72, '#f7b267');
  grad.addColorStop(0.88, '#ff9a5c');
  grad.addColorStop(1.0, '#e8834f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4800, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);
  // Low sun disc in the west, with a soft glow sprite.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(150, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sun.position.set(-3800, 620, -1400);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  scene.fog = new THREE.Fog(0xf2b98a, 900, 3800);
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffd9a8, 0x51603a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 1.6);
  sun.position.set(-1400, 500, -600);
  scene.add(sun);
}
