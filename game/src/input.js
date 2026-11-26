// input.js — keyboard and mouse controls for the Elang-1.
// Arrow keys / WASD steer, Shift / Ctrl work the throttle, Q / E the rudder.
// Dragging the mouse steers too. R restarts, P pauses, M returns to the menu.
export function createInput(canvas) {
  const keys = new Set();
  const drag = { active: false, dx: 0, dy: 0 };

  const onKeyDown = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  const onKeyUp = (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    drag.active = true;
    drag.dx = 0; drag.dy = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    drag.dx += e.movementX || 0;
    drag.dy += e.movementY || 0;
  });
  const endDrag = () => { drag.active = false; drag.dx = 0; drag.dy = 0; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function pressed(...names) { return names.some((n) => keys.has(n)); }

  return {
    // -1..1 pitch (up positive), roll (right positive), yaw (right positive).
    read() {
      let pitch = 0;
      if (pressed('ArrowUp', 'w')) pitch += 1;
      if (pressed('ArrowDown', 's')) pitch -= 1;
      let roll = 0;
      if (pressed('ArrowRight', 'd')) roll += 1;
      if (pressed('ArrowLeft', 'a')) roll -= 1;
      let yaw = 0;
      if (pressed('e')) yaw += 1;
      if (pressed('q')) yaw -= 1;
      // Mouse drag steers with a gentle hand: 120 px of drag is full input.
      if (drag.active) {
        pitch += Math.max(-1, Math.min(1, -drag.dy / 120));
        roll += Math.max(-1, Math.min(1, drag.dx / 120));
      }
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        yaw,
        throttleUp: pressed('Shift'),
        throttleDown: pressed('Control'),
      };
    },
    // One-shot keys: true once per press.
    consume(key) {
      const k = key.length === 1 ? key.toLowerCase() : key;
      if (keys.has(k)) { keys.delete(k); return true; }
      return false;
    },
    isDown(key) { return keys.has(key.length === 1 ? key.toLowerCase() : key); },
  };
}
