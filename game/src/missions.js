// missions.js — the three sorties of Elang Senja and the ring course.
// Ring Run: 8 gold rings in order against the clock. Landing: one gentle
// touchdown on runway 09/27. Free Flight: explore, collect green fuel rings.
// Score: each ring +100, a landing +500 plus a soft-touch bonus, and Ring Run
// pays a time bonus for finishing quickly.
import * as THREE from 'three';

export const RING_RADIUS = 14;

// The course: a circuit over the valley — runway, hills, river, and home.
export const RING_COURSE = [
  { x: 0, y: 100, z: -200 },
  { x: 120, y: 110, z: 300 },
  { x: 350, y: 140, z: 700 },
  { x: 200, y: 130, z: 1100 },
  { x: -300, y: 120, z: 900 },
  { x: -600, y: 110, z: 400 },
  { x: -400, y: 130, z: -200 },
  { x: -100, y: 110, z: -700 },
];

// Green rings that top the tank up by 30 points.
export const FUEL_RINGS = [
  { x: 250, y: 115, z: 550 },
  { x: -450, y: 115, z: 600 },
];

export const MISSION_INFO = {
  ring: {
    title: 'Ring Run',
    goal: 'Lewati 8 ring secepat mungkin',
    start: { x: 0, y: 120, z: -600, heading: 0, speed: 55, throttle: 0.55 },
  },
  landing: {
    title: 'Pendaratan',
    goal: 'Mendarat di landasan 09/27 di bawah 170 km/jam',
    start: { x: 0, y: 150, z: -1100, heading: 0, speed: 55, throttle: 0.4 },
  },
  free: {
    title: 'Terbang Bebas',
    goal: 'Jelajahi lembah — ring hijau mengisi bahan bakar',
    start: { x: 0, y: 150, z: -600, heading: 0, speed: 55, throttle: 0.55 },
  },
};

export function createMission(kind) {
  const info = MISSION_INFO[kind];
  return {
    kind,
    title: info.title,
    goal: info.goal,
    rings: RING_COURSE.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    fuelRings: FUEL_RINGS.map((p) => ({ pos: new THREE.Vector3(p.x, p.y, p.z), taken: false })),
    nextRing: 0,
    ringsPassed: 0,
    timer: 0,
    score: 0,
    status: 'flying', // flying | complete | crashed | landed
    finishTime: null,
    message: null,
  };
}

export function missionStart(kind) {
  const info = MISSION_INFO[kind];
  return { ...info.start };
}

// Advance the mission one step. Returns a transient event for the HUD:
// { kind: 'ring', n } | { kind: 'fuel' } | { kind: 'complete' } | null.
export function updateMission(mission, flight, dt) {
  if (mission.status !== 'flying') return null;
  mission.timer += dt;

  // Next gold ring: passed when the plane flies within the ring's radius.
  if (mission.nextRing < mission.rings.length) {
    const ring = mission.rings[mission.nextRing];
    if (flight.position.distanceTo(ring) < RING_RADIUS) {
      mission.nextRing++;
      mission.ringsPassed++;
      mission.score += 100;
      if (mission.kind === 'ring' && mission.nextRing >= mission.rings.length) {
        mission.status = 'complete';
        mission.finishTime = mission.timer;
        const bonus = Math.max(0, Math.round((300 - mission.timer) * 2));
        mission.score += bonus;
        return { kind: 'complete', bonus };
      }
      return { kind: 'ring', n: mission.ringsPassed };
    }
  }

  // Green fuel rings: refuel and keep flying.
  for (const fr of mission.fuelRings) {
    if (!fr.taken && flight.position.distanceTo(fr.pos) < RING_RADIUS) {
      fr.taken = true;
      flight.fuel = Math.min(100, flight.fuel + 30);
      mission.score += 25;
      return { kind: 'fuel' };
    }
  }
  return null;
}

// Score a touchdown for the landing mission.
export function scoreLanding(mission, touchdown) {
  const centreBonus = Math.max(0, Math.round((16 - touchdown.centreline) * 10));
  const softBonus = Math.max(0, Math.round((6 - touchdown.sink) * 30));
  const speedBonus = Math.max(0, Math.round((48 - touchdown.speed) * 5));
  const total = 500 + centreBonus + softBonus + speedBonus;
  mission.score += total;
  mission.status = 'complete';
  mission.finishTime = mission.timer;
  return { total, centreBonus, softBonus, speedBonus };
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
