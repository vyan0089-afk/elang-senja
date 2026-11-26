// main.js — Elang Senja: wires the scene, the chase camera, the game loop and
// the menu / flying / landed / crashed states together. Also answers the
// ?shot= query used to take the entry's screenshots: each shot places the
// plane in a fixed, photogenic state and raises window.__shotReady once the
// frame has settled.
import * as THREE from 'three';
import {
  buildTerrain, buildRiver, buildRunway, buildTreesAndHouses, buildClouds,
  buildSky, buildLights, terrainHeight, mulberry32,
} from './terrain.js';
import { buildAircraft, updateAircraftVisuals } from './aircraft.js';
import { createFlightState, stepFlight, forwardVector } from './flight.js';
import { createInput } from './input.js';
import { createMission, updateMission, scoreLanding, missionStart, formatTime, RING_RADIUS } from './missions.js';
import { updateHUD, showToast, showHUD, showMenu, showEnd, showEndScreen, announce } from './hud.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') || 1);

// --- scene ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
camera.position.set(0, 130, -640);

buildSky(scene);
buildLights(scene);
const random = mulberry32(20261126);
scene.add(buildTerrain(random));
scene.add(buildRiver());
scene.add(buildRunway());
scene.add(buildTreesAndHouses(random));
scene.add(buildClouds(random));

// --- aircraft ---------------------------------------------------------------
const { group: plane, parts } = buildAircraft();
scene.add(plane);

// --- rings ------------------------------------------------------------------
const ringGroup = new THREE.Group();
const ringMeshes = [];
const RING_GOLD = 0xffc93c;
const RING_DIM = 0x9fc3e8;
const RING_DONE = 0x7ee081;
const RING_FUEL = 0x35e065;

function makeRingMesh(color) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS, 1.1, 12, 40),
    new THREE.MeshBasicMaterial({ color }),
  );
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS, 2.6, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 }),
  );
  mesh.add(glow);
  return mesh;
}

function buildRings(mission) {
  while (ringGroup.children.length) ringGroup.remove(ringGroup.children[0]);
  ringMeshes.length = 0;
  mission.rings.forEach((pos) => {
    const mesh = makeRingMesh(RING_DIM);
    mesh.position.copy(pos);
    ringGroup.add(mesh);
    ringMeshes.push(mesh);
  });
  mission.fuelRings.forEach((fr) => {
    const mesh = makeRingMesh(RING_FUEL);
    mesh.position.copy(fr.pos);
    ringGroup.add(mesh);
    ringMeshes.push(mesh);
  });
  scene.add(ringGroup);
}

function updateRingColors(mission) {
  mission.rings.forEach((pos, i) => {
    const mesh = ringMeshes[i];
    const color = i < mission.nextRing ? RING_DONE : i === mission.nextRing ? RING_GOLD : RING_DIM;
    mesh.material.color.setHex(color);
    mesh.children[0].material.color.setHex(color);
    // The next ring pulses so the pilot always knows where to go.
    const pulse = i === mission.nextRing ? 1 + Math.sin(performance.now() / 280) * 0.07 : 1;
    mesh.scale.setScalar(pulse);
  });
  mission.fuelRings.forEach((fr, i) => {
    const mesh = ringMeshes[mission.rings.length + i];
    mesh.visible = !fr.taken;
  });
}

// --- state ------------------------------------------------------------------
const input = createInput(canvas);
const audio = createAudio();
let flight = createFlightState();
let mission = createMission('ring');
buildRings(mission);

let mode = 'menu'; // menu | flying | paused | crashed | landed | complete
let paused = false;
let lowFuelWarned = false;

function startMission(kind) {
  const start = missionStart(kind);
  flight = createFlightState();
  flight.position.set(start.x, start.y, start.z);
  flight.heading = start.heading;
  flight.speed = start.speed;
  flight.throttle = start.throttle;
  flight.fuel = 100;
  mission = createMission(kind);
  buildRings(mission);
  lowFuelWarned = false;
  mode = 'flying';
  showMenu(false);
  showEnd(false);
  showHUD(true);
  announce(mission.title + ': ' + mission.goal);
  updateHUD(flight, mission);
}

function endFlight(title, reason, stats) {
  showEndScreen({ title, reason, stats });
  showHUD(true);
  announce(title + '. ' + reason);
}

function missionStats() {
  return `Skor ${mission.score} · Waktu ${formatTime(mission.timer)} · Ring ${mission.ringsPassed} · Jarak ${Math.round(flight.distanceFlown)} m`;
}

function handleLanding(touchdown) {
  flight.lastTouchdown = null;
  audio.land();
  if (mission.kind === 'landing') {
    const scored = scoreLanding(mission, touchdown);
    mode = 'complete';
    endFlight(
      'Mendarat dengan mulus!',
      `Sentuhan lembut di landasan 09/27: +${scored.total} poin (tengah +${scored.centreBonus}, lembut +${scored.softBonus}, pelan +${scored.speedBonus}).`,
      missionStats(),
    );
  } else {
    mode = 'landed';
    flight.fuel = 100;
    endFlight(
      'Mendarat!',
      'Elang-1 berhenti dengan aman di landasan. Tangki diisi penuh — tekan R untuk terbang lagi.',
      missionStats(),
    );
  }
}

function handleCrash(event) {
  mode = 'crashed';
  mission.status = 'crashed';
  audio.crash();
  endFlight('Jatuh!', event.reason, missionStats());
}

// --- camera -----------------------------------------------------------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 130, -640);
function updateCamera(dt, closeUp, side = 0) {
  const forward = forwardVector(flight);
  const behind = closeUp ? 12.5 : 14.5;
  const above = closeUp ? 4.2 : 5;
  camTarget.copy(flight.position).addScaledVector(forward, -behind);
  camTarget.y = flight.position.y + above;
  // A side offset turns the chase into a three-quarter rear view.
  if (side !== 0) {
    camTarget.x += Math.cos(flight.heading) * side;
    camTarget.z += -Math.sin(flight.heading) * side;
  }
  const k = 1 - Math.exp(-(closeUp ? 7 : 3.2) * dt);
  camPos.lerp(camTarget, k);
  // Never let the camera sink under the terrain.
  const minY = terrainHeight(camPos.x, camPos.z) + 3;
  if (camPos.y < minY) camPos.y = minY;
  camera.position.copy(camPos);
  const look = flight.position.clone().addScaledVector(forward, 26);
  look.y += 1;
  camera.lookAt(look);
}

function syncPlaneMesh() {
  plane.position.copy(flight.position);
  plane.rotation.set(0, 0, 0);
  plane.rotateY(flight.heading);
  plane.rotateX(-flight.pitch);
  plane.rotateZ(-flight.roll);
}

// --- screenshot shots -------------------------------------------------------
// Fixed, photogenic states for the entry's screenshots. In shot mode the loop
// steps the physics (so the propeller spins) and then restores the exact
// framing, so the plane never drifts through the ring before the screenshot.
let shotState = null;

function applyShot(name) {
  // Fixed, photogenic states for the entry's screenshots. Input is ignored
  // in shot mode; the loop still steps the physics so the propeller spins.
  if (name === 'flight') {
    startMission('ring');
    flight.position.set(104, 109, 232); // 70 m before ring 2, on course
    flight.heading = 0.23;
    flight.pitch = 0.02;
    flight.roll = 0.12;
    flight.speed = 62;
    flight.throttle = 0.6;
    mission.nextRing = 1;
    mission.ringsPassed = 1;
    mission.score = 100;
    mission.timer = 42;
    updateHUD(flight, mission);
  } else if (name === 'rings') {
    startMission('ring');
    flight.position.set(0, 100, -225); // 25 m before the first gold ring
    flight.heading = 0;
    flight.pitch = 0;
    flight.roll = 0.05;
    flight.speed = 66;
    flight.throttle = 0.65;
    mission.nextRing = 0;
    mission.timer = 18;
    updateHUD(flight, mission);
  } else if (name === 'landing') {
    startMission('landing');
    flight.position.set(6, 42, -620);
    flight.heading = 0;
    flight.pitch = -0.06;
    flight.roll = 0;
    flight.speed = 44;
    flight.throttle = 0.3;
    mission.timer = 96;
    updateHUD(flight, mission);
  } else if (name === 'cockpit') {
    startMission('free');
    flight.position.set(300, 140, 200); // open hills, river and village in the distance
    flight.heading = -0.3;
    flight.pitch = 0.03;
    flight.roll = -0.18;
    flight.speed = 58;
    flight.throttle = 0.55;
    mission.ringsPassed = 2;
    mission.score = 225;
    mission.timer = 133;
    updateHUD(flight, mission);
  }
  syncPlaneMesh();
  updateCamera(1, name === 'cockpit', name === 'cockpit' ? 4 : 0);
  updateRingColors(mission);
  renderer.render(scene, camera);
  // Remember the exact framing so the loop can restore it each frame.
  shotState = {
    position: flight.position.clone(),
    heading: flight.heading, pitch: flight.pitch, roll: flight.roll,
    speed: flight.speed, throttle: flight.throttle, fuel: flight.fuel,
  };
}

// One simulation step, shared by the live loop and the test hook: reads a
// control, steps the physics, updates the mission, and returns both events.
function simulateStep(dt, control) {
  const event = stepFlight(flight, control, dt, terrainHeight);
  const missionEvent = updateMission(mission, flight, dt);
  return { event, missionEvent };
}
const clock = new THREE.Clock();
let shotFrames = 0;
let shotReady = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (shotName) {
    // Shot mode: step gently so the propeller spins, then restore the exact
    // framing, then signal readiness.
    if (!shotReady) {
      stepFlight(flight, { pitch: 0, roll: 0, yaw: 0, throttleUp: false, throttleDown: false }, dt, terrainHeight);
      if (shotState) {
        flight.position.copy(shotState.position);
        flight.heading = shotState.heading;
        flight.pitch = shotState.pitch;
        flight.roll = shotState.roll;
        flight.speed = shotState.speed;
        flight.throttle = shotState.throttle;
        flight.fuel = shotState.fuel;
      }
      syncPlaneMesh();
      updateAircraftVisuals(parts, flight, dt);
      updateCamera(dt, shotName === 'cockpit', shotName === 'cockpit' ? 4 : 0);
      updateRingColors(mission);
      updateHUD(flight, mission);
      renderer.render(scene, camera);
      if (++shotFrames >= 25) { shotReady = true; window.__shotReady = true; }
    }
    return;
  }

  // One-shot keys.
  if (input.consume('r') && mode !== 'menu') startMission(mission.kind);
  if (input.consume('m')) { mode = 'menu'; showMenu(true); showEnd(false); showHUD(false); }
  if (input.consume('p') && (mode === 'flying' || mode === 'paused')) {
    paused = !paused;
    mode = paused ? 'paused' : 'flying';
    showToast(paused ? 'Jeda — tekan P untuk lanjut' : 'Lanjut terbang!');
  }
  if (input.consume(' ')) audio.unlock();

  if (mode === 'flying' && !paused) {
    const control = input.read();
    const { event, missionEvent } = simulateStep(dt, control);
    syncPlaneMesh();
    updateAircraftVisuals(parts, flight, dt);
    updateCamera(dt, false);
    updateRingColors(mission);
    updateHUD(flight, mission);
    audio.update(flight.throttle, flight.speed);

    if (flight.fuel < 25 && !lowFuelWarned) {
      lowFuelWarned = true;
      showToast('⚠ Bahan bakar menipis — cari ring hijau!');
    }
    if (flight.fuel <= 0 && flight.throttle === 0) showToast('Bahan bakar habis — meluncur!');

    if (missionEvent?.kind === 'ring') {
      showToast(`Ring ${missionEvent.n} / ${mission.rings.length}! +100`);
      audio.ring();
    } else if (missionEvent?.kind === 'fuel') {
      showToast('⛽ Bahan bakar +30');
      audio.fuel();
    } else if (missionEvent?.kind === 'complete') {
      mode = 'complete';
      audio.land();
      endFlight(
        'Misi selesai!',
        `Semua 8 ring dilewati dalam ${formatTime(mission.finishTime)} (bonus waktu +${missionEvent.bonus}).`,
        missionStats(),
      );
    }

    if (event?.type === 'landed') {
      handleLanding(event);
    } else if (event?.type === 'crashed') {
      handleCrash(event);
    } else if (mode === 'flying' && flight.onGround && flight.lastTouchdown) {
      // The touchdown was recorded by an earlier step (a test hook, or a
      // frame whose event another consumer took): score it from the state.
      handleLanding(flight.lastTouchdown);
    }
  } else if (mode === 'menu') {
    // Slow orbit around the parked plane on the menu screen.
    const t = performance.now() / 1000;
    plane.position.set(0, terrainHeight(0, 0) + 1.9, 0);
    plane.rotation.set(0, Math.sin(t * 0.15) * 0.4, 0);
    camera.position.set(Math.sin(t * 0.1) * 26, 10, Math.cos(t * 0.1) * 26);
    camera.lookAt(0, 3, 0);
    updateRingColors(mission);
  }

  renderer.render(scene, camera);
}

// --- wiring -----------------------------------------------------------------
document.querySelectorAll('.mission-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.unlock();
    startMission(btn.dataset.mission);
  });
});
document.getElementById('again-btn').addEventListener('click', () => startMission(mission.kind));
document.getElementById('menu-btn').addEventListener('click', () => {
  mode = 'menu';
  showMenu(true);
  showEnd(false);
  showHUD(false);
});
document.getElementById('sound-btn').addEventListener('click', (e) => {
  audio.unlock();
  const muted = audio.toggleMute();
  e.target.textContent = muted ? '🔇 Suara: mati' : '🔊 Suara: nyala';
});
canvas.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock(), { once: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotName) applyShot(shotName);
window.__game = {
  // Getters, not snapshots: startMission replaces the flight and mission
  // objects, so a test reading __game.flight must see the current one.
  get flight() { return flight; },
  get mission() { return mission; },
  startMission, terrainHeight,
  // Deterministic stepping for tests: advances the sim by dt seconds with the
  // given control, without waiting for the render loop.
  stepSim(dt, control) {
    const zero = { pitch: 0, roll: 0, yaw: 0, throttleUp: false, throttleDown: false };
    const result = simulateStep(dt, control || zero);
    syncPlaneMesh();
    updateCamera(dt, false);
    updateRingColors(mission);
    updateHUD(flight, mission);
    // No render here: the live loop renders every frame, and stepping without
    // rendering keeps deterministic tests fast under software GL.
    return result;
  },
};
loop();
