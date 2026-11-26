// audio.js — small WebAudio sound for Elang Senja: an engine hum that follows
// the throttle, wind that grows with speed, a chime for rings, a soft thud for
// a landing and a crunch for a crash. Everything is synthesised at runtime;
// no audio files. Sound only starts after the player interacts (a click or a
// key), and the speaker button on the menu mutes it.
export function createAudio() {
  let ctx = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    // Engine: two detuned sawtooths through a low-pass filter.
    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc1.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc1.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 600;
    band.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(band);
    band.connect(windGain);
    windGain.connect(ctx.destination);
    noise.start();
  }

  function blip(freq, delay, duration, type = 'sine', volume = 0.18) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    // Call from a click or key handler: the browser only allows audio after
    // the player has interacted with the page.
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      started = true;
    },
    update(throttle, speed) {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.09, t, 0.1);
      engineOsc1.frequency.setTargetAtTime(48 + throttle * 55, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(72 + throttle * 82, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0011), t, 0.2);
    },
    ring() { blip(880, 0, 0.25); blip(1318, 0.09, 0.35); },
    fuel() { blip(659, 0, 0.2); blip(988, 0.08, 0.3); },
    land() { blip(220, 0, 0.3, 'sine', 0.25); blip(330, 0.12, 0.4, 'sine', 0.2); },
    crash() {
      if (!ctx || muted) return;
      const len = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      blip(70, 0, 0.5, 'sine', 0.4);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        const t = ctx.currentTime;
        if (engineGain) engineGain.gain.setTargetAtTime(muted ? 0 : 0.08, t, 0.05);
        if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
      }
      return muted;
    },
    isMuted() { return muted; },
  };
}
