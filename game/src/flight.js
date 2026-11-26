// flight.js — arcade flight physics for the Elang-1.
// Speed follows throttle, pitch trades speed for altitude, banking turns the
// heading, and below stall speed the plane sinks. Landing and crash checks
// live here; the caller decides what each outcome means for the mission.
import * as THREE from 'three';

export const MAX_SPEED = 95;        // m/s at full throttle (~342 km/h)
export const STALL_SPEED = 24;      // m/s; below this the plane sinks
export const SAFE_LAND_SPEED = 48;  // m/s; faster than this is a crash landing
export const SAFE_SINK = 6;         // m/s of descent; harder is a crash
export const GROUND_CLEARANCE = 1.9;

export function createFlightState() {
  return {
    position: new THREE.Vector3(0, 120, -600),
    heading: 0,          // radians, 0 = +Z (north), grows clockwise
    pitch: 0,            // radians, positive = nose up
    roll: 0,             // radians, positive = bank right
    speed: 55,           // m/s
    throttle: 0.55,      // 0..1
    fuel: 100,           // 0..100
    verticalSpeed: 0,
    onGround: false,
    lastTouchdown: null,
    rollInput: 0,
    pitchInput: 0,
    distanceFlown: 0,
  };
}

export function forwardVector(state) {
  const cp = Math.cos(state.pitch);
  return new THREE.Vector3(
    Math.sin(state.heading) * cp,
    Math.sin(state.pitch),
    Math.cos(state.heading) * cp,
  );
}

// One physics step. Returns an event: null, { type: 'landed', ... } or
// { type: 'crashed', reason }.
export function stepFlight(state, input, dt, getHeight) {
  if (state.onGround) {
    // Roll-out: throttle still accelerates, brakes (pitch down) slow us.
    const accel = state.throttle * 14 - 6 - (input.pitch < -0.2 ? 10 : 0);
    state.speed = Math.max(0, state.speed + accel * dt);
    state.distanceFlown += state.speed * dt;
    state.position.addScaledVector(forwardVector(state), state.speed * dt);
    state.position.y = getHeight(state.position.x, state.position.z) + GROUND_CLEARANCE;
    return null;
  }

  // Throttle: Shift up, Ctrl down; empty tank forces the engine off.
  if (state.fuel <= 0) {
    state.throttle = 0;
  } else {
    if (input.throttleUp) state.throttle = Math.min(1, state.throttle + 0.55 * dt);
    if (input.throttleDown) state.throttle = Math.max(0, state.throttle - 0.55 * dt);
  }

  // Pitch and roll chase the stick position: holding a key holds the attitude,
  // releasing it eases back to level flight. The plane answers at once.
  const targetPitch = input.pitch * 0.55;
  state.pitch += (targetPitch - state.pitch) * Math.min(1, 2.4 * dt);
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.62, 0.62);
  const targetRoll = input.roll * 1.0;
  state.roll += (targetRoll - state.roll) * Math.min(1, 2.8 * dt);
  state.roll = THREE.MathUtils.clamp(state.roll, -1.15, 1.15);
  state.pitchInput = input.pitch;
  state.rollInput = input.roll;

  // Banking turns the heading; the rudder (yaw) trims it gently.
  const turnRate = Math.sin(state.roll) * (state.speed / 60) * 0.85;
  state.heading += (turnRate + input.yaw * 0.22) * dt;

  // Speed chases the throttle setting; drag bites harder at low throttle.
  const targetSpeed = state.throttle * MAX_SPEED;
  const chase = state.throttle > 0.05 ? 0.32 : 0.55;
  state.speed += (targetSpeed - state.speed) * Math.min(1, chase * dt);
  // Climbing bleeds speed, descending gains it.
  state.speed -= Math.sin(state.pitch) * 9 * dt;
  state.speed = Math.max(8, state.speed);

  // Move along the flight direction.
  const forward = forwardVector(state);
  const prevY = state.position.y;
  state.position.addScaledVector(forward, state.speed * dt);
  // Below stall speed the wing stops flying and the plane sinks.
  if (state.speed < STALL_SPEED) {
    state.position.y -= (STALL_SPEED - state.speed) * 0.85 * dt;
  }
  state.verticalSpeed = (state.position.y - prevY) / Math.max(dt, 1e-4);
  state.distanceFlown += state.speed * dt;

  // Fuel drains faster the harder the throttle works.
  state.fuel = Math.max(0, state.fuel - (0.10 + state.throttle * 0.40) * dt);

  // Ground contact.
  const groundY = getHeight(state.position.x, state.position.z) + GROUND_CLEARANCE;
  if (state.position.y <= groundY) {
    state.position.y = groundY;
    return checkTouchdown(state, getHeight);
  }
  return null;
}

function checkTouchdown(state, getHeight) {
  const { x, z } = state.position;
  const overRunway = Math.abs(x) < 16 && Math.abs(z) < 340;
  const sink = -state.verticalSpeed; // positive when descending
  const level = Math.abs(state.roll) < 0.35 && Math.abs(state.pitch) < 0.22;
  if (overRunway && sink <= SAFE_SINK && state.speed <= SAFE_LAND_SPEED && level) {
    state.onGround = true;
    state.pitch = 0;
    state.roll = 0;
    // Remember the touchdown so the loop can score it even if the step that
    // recorded it was not the loop's own.
    state.lastTouchdown = { speed: state.speed, sink, centreline: Math.abs(x) };
    return { type: 'landed', ...state.lastTouchdown };
  }
  if (overRunway && sink > SAFE_SINK) {
    return { type: 'crashed', reason: 'Pendaratan terlalu keras — turun dengan ' + sink.toFixed(1) + ' m/detik.' };
  }
  if (overRunway && state.speed > SAFE_LAND_SPEED) {
    return { type: 'crashed', reason: 'Terlalu cepat untuk mendarat — ' + Math.round(state.speed * 3.6) + ' km/jam di landasan.' };
  }
  if (overRunway && !level) {
    return { type: 'crashed', reason: 'Sayap tidak rata saat menyentuh landasan.' };
  }
  // Off the runway: river or hillside.
  const riverDist = Math.abs(x - riverXOf(z));
  if (riverDist < 34 && state.position.y < 4) {
    return { type: 'crashed', reason: 'Mendarat darurat di sungai — Elang-1 basah kuyup.' };
  }
  return { type: 'crashed', reason: 'Menabrak tanah di ketinggian ' + Math.round(state.position.y) + ' m.' };
}

// River centreline, duplicated here so flight.js stays self-contained.
function riverXOf(z) {
  return -720 + 260 * Math.sin(z * 0.0008 + 0.5) + 120 * Math.sin(z * 0.0021);
}
