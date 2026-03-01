let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if browser suspended it (autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Auto-resume audio context on first user interaction
if (typeof window !== "undefined") {
  const unlock = () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    window.removeEventListener("click", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("click", unlock);
  window.addEventListener("touchstart", unlock);
  window.addEventListener("keydown", unlock);
}

// ---- Air-raid siren state ----
let sirenOsc: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenActive = false;

/**
 * Start a continuous air-raid siren that sweeps between two frequencies.
 * Call stopSiren() when missiles are no longer in flight.
 * Safe to call multiple times — only one siren plays at a time.
 */
export function startSiren() {
  if (sirenActive) return;
  try {
    const ctx = getCtx();
    sirenActive = true;

    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();

    // Deep air-raid siren — low pitch, not shrill
    sirenOsc.type = "sawtooth";
    sirenGain.gain.setValueAtTime(0.09, ctx.currentTime);

    // Low-pass filter to cut the harsh high frequencies
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.Q.setValueAtTime(1, ctx.currentTime);

    sirenOsc.connect(filter);
    filter.connect(sirenGain);
    sirenGain.connect(ctx.destination);

    // Classic siren sweep — low range, 4s cycle
    const cycleDuration = 4;
    const scheduleAhead = 120;
    const now = ctx.currentTime;

    for (let t = 0; t < scheduleAhead; t += cycleDuration) {
      const start = now + t;
      sirenOsc.frequency.setValueAtTime(180, start);
      sirenOsc.frequency.linearRampToValueAtTime(450, start + cycleDuration / 2);
      sirenOsc.frequency.linearRampToValueAtTime(180, start + cycleDuration);
    }

    sirenOsc.start(now);
  } catch {
    sirenActive = false;
  }
}

/**
 * Stop the air-raid siren with a quick fade-out.
 */
export function stopSiren() {
  if (!sirenActive) return;
  try {
    const ctx = getCtx();
    if (sirenGain) {
      sirenGain.gain.setValueAtTime(sirenGain.gain.value, ctx.currentTime);
      sirenGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    }
    if (sirenOsc) {
      sirenOsc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // ignore
  }
  sirenOsc = null;
  sirenGain = null;
  sirenActive = false;
}

/**
 * Short rising three-tone alert for incoming missiles.
 * Louder and more urgent than before.
 */
export function playAlertSound() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Three quick rising beeps — louder, higher frequencies
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "square";
      osc.frequency.setValueAtTime(900 + i * 250, now + i * 0.15);
      osc.frequency.linearRampToValueAtTime(1400 + i * 250, now + i * 0.15 + 0.1);

      gain.gain.setValueAtTime(0.35, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.12);

      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.12);
    }
  } catch {
    // Audio not available
  }
}

/**
 * Deeper thud sound with white noise burst for a confirmed strike/impact.
 */
export function playImpactSound() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Low frequency thud — louder
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.35);

    // Noise-like click on top
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(300, now);
    osc2.frequency.exponentialRampToValueAtTime(60, now + 0.08);

    gain2.gain.setValueAtTime(0.25, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc2.start(now);
    osc2.stop(now + 0.1);

    // White noise burst for explosion crack
    const bufferSize = ctx.sampleRate * 0.15;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(800, now);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.15);
  } catch {
    // Audio not available
  }
}
