// aircraft.js — the Elang-1, a small single-propeller plane built from primitives.
// Cream fuselage, deep-green wings, terracotta nose and tail, spinning propeller,
// navigation lights and fixed landing gear. The model faces +Z when heading is 0.
import * as THREE from 'three';

const CREAM = 0xf3e6c8;
const GREEN = 0x2e5d43;
const TERRA = 0xc65a33;
const GLASS = 0x274b63;
const DARK = 0x2a2a2a;

export function buildAircraft() {
  const group = new THREE.Group();
  const parts = {};

  const cream = new THREE.MeshLambertMaterial({ color: CREAM });
  const green = new THREE.MeshLambertMaterial({ color: GREEN });
  const terra = new THREE.MeshLambertMaterial({ color: TERRA });
  const glass = new THREE.MeshLambertMaterial({ color: GLASS });
  const dark = new THREE.MeshLambertMaterial({ color: DARK });

  // Fuselage: a cylinder along Z with a tapered tail cone and a rounded nose.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 5.4, 12), cream);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.4);
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.6, 12), terra);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 3.9);
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 12), cream);
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.position.set(0, 0, -3.4);
  group.add(tailCone);

  // Cockpit canopy: a flattened dark dome on top, forward of centre.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), glass);
  canopy.scale.set(0.9, 0.62, 1.5);
  canopy.position.set(0, 0.75, 1.5);
  group.add(canopy);

  // Main wings: one wide slab, with terracotta tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.22, 2.5), green);
  wing.position.set(0, -0.15, 0.9);
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 2.5), terra);
    tip.position.set(side * 8.2, -0.15, 0.9);
    group.add(tip);
    // Aileron: a thin strip at the trailing edge that deflects with roll input.
    const aileron = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.7), terra);
    aileron.position.set(side * 5.2, -0.15, -0.45);
    group.add(aileron);
    parts[side < 0 ? 'aileronL' : 'aileronR'] = aileron;
  }

  // Tail: horizontal stabiliser and vertical fin.
  const stabiliser = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 1.5), green);
  stabiliser.position.set(0, 0.15, -4.2);
  group.add(stabiliser);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.1, 1.7), terra);
  fin.position.set(0, 1.0, -4.3);
  group.add(fin);

  // Propeller: hub plus two blades at the nose; spins around Z.
  const propeller = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 10), dark);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 0, 0.35);
  propeller.add(hub);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.6, 0.08), dark);
    blade.position.set(0, 0, 0.1);
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    holder.add(blade);
    propeller.add(holder);
  }
  propeller.position.set(0, 0, 4.7);
  group.add(propeller);
  parts.propeller = propeller;

  // Fixed landing gear: two main legs with wheels, one nose wheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), dark);
    leg.position.set(side * 1.1, -1.3, 1.2);
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.1, -1.85, 1.2);
    group.add(wheel);
  }
  const noseLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6), dark);
  noseLeg.position.set(0, -1.25, 3.0);
  group.add(noseLeg);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), dark);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -1.75, 3.0);
  group.add(noseWheel);

  // Navigation lights: red on the left wing, green on the right, white on the tail.
  const lightGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const navLeft = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  navLeft.position.set(-8.6, -0.1, 0.9);
  const navRight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x35e065 }));
  navRight.position.set(8.6, -0.1, 0.9);
  const navTail = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navTail.position.set(0, 0.2, -4.6);
  group.add(navLeft, navRight, navTail);

  group.traverse((obj) => { if (obj.isMesh) obj.castShadow = false; });
  return { group, parts };
}

// Animate the propeller and control surfaces from the flight state.
export function updateAircraftVisuals(parts, state, dt) {
  const spin = 6 + state.throttle * 42 + state.speed * 0.25;
  parts.propeller.rotation.z += spin * dt;
  const rollInput = state.rollInput || 0;
  parts.aileronL.rotation.x = rollInput * 0.35;
  parts.aileronR.rotation.x = -rollInput * 0.35;
}
