// hud.js — the Elang-1 instrument panel: airspeed, altitude, vertical speed,
// compass tape, throttle and fuel bars, score, mission status, the attitude
// indicator, toast messages and the menu / end overlays. All DOM, no canvas,
// so the instruments stay crisp at any size.
import { formatTime } from './missions.js';

const $ = (id) => document.getElementById(id);

const CARDINALS = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
  [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
];

let toastTimer = null;

export function compassHeading(headingRad) {
  return ((headingRad * 180 / Math.PI) % 360 + 360) % 360;
}

function compassTape(headingDeg) {
  // A strip of the compass around the current heading, cardinals in gold.
  let html = '';
  for (let d = -90; d <= 90; d += 15) {
    const deg = ((Math.round(headingDeg) + d) % 360 + 360) % 360;
    const cardinal = CARDINALS.find(([c]) => c === deg);
    const label = cardinal ? cardinal[1] : String(deg).padStart(3, '0');
    html += cardinal
      ? `<span class="cardinal">${label}</span>&nbsp;&nbsp;`
      : `${label}&nbsp;&nbsp;`;
  }
  return html;
}

export function updateHUD(flight, mission) {
  $('hud-speed').textContent = Math.round(flight.speed * 3.6);
  $('hud-alt').textContent = Math.round(Math.max(0, flight.position.y));
  const vs = flight.verticalSpeed;
  $('hud-vs').textContent = (vs >= 0 ? '+' : '') + vs.toFixed(1);
  const hdg = compassHeading(flight.heading);
  $('compass-hdg').textContent = String(Math.round(hdg)).padStart(3, '0') + '°';
  $('compass-tape').innerHTML = compassTape(hdg);
  $('hud-score').textContent = mission.score;
  $('hud-throttle-pct').textContent = Math.round(flight.throttle * 100) + '%';
  $('throttle-fill').style.width = (flight.throttle * 100) + '%';
  $('hud-fuel-pct').textContent = Math.round(flight.fuel) + '%';
  const fuelFill = $('fuel-fill');
  fuelFill.style.width = flight.fuel + '%';
  fuelFill.classList.toggle('low', flight.fuel < 25);
  $('mission-title').textContent = mission.title;
  let sub = mission.goal;
  if (mission.kind === 'ring') {
    sub = `Ring ${mission.ringsPassed} / ${mission.rings.length} · ${formatTime(mission.timer)}`;
  } else if (mission.kind === 'landing') {
    sub = `Mendarat di 09/27 · ${formatTime(mission.timer)}`;
  } else {
    sub = `Ring ${mission.ringsPassed} · Bahan bakar ${Math.round(flight.fuel)}% · ${formatTime(mission.timer)}`;
  }
  $('mission-sub').textContent = sub;
  // Attitude indicator: horizon rolls with the bank and slides with pitch.
  const horizon = $('horizon');
  const pitchPx = Math.max(-40, Math.min(40, flight.pitch * 55));
  horizon.style.transform = `rotate(${-flight.roll}rad) translateY(${pitchPx}px)`;
}

export function showToast(text, ms = 1600) {
  const toast = $('toast');
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms);
}

export function showHUD(show) { $('hud').classList.toggle('hidden', !show); }
export function showMenu(show) { $('menu').classList.toggle('hidden', !show); }
export function showEnd(show) { $('end').classList.toggle('hidden', !show); }

export function showEndScreen({ title, reason, stats }) {
  $('end-title').textContent = title;
  $('end-reason').textContent = reason;
  $('end-stats').textContent = stats;
  showEnd(true);
}

export function announce(text) { $('status').textContent = text; }
