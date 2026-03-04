let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let currentVolume = 0.8; // 0–1

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Get the master gain node — all sounds route through this */
function getMaster(): GainNode {
  const ctx = getCtx();
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(currentVolume, ctx.currentTime);
    masterGain.connect(ctx.destination);
  }
  return masterGain;
}

/** Unlock AudioContext — call from a user gesture (click/tap) to ensure audio works */
export function resumeAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  // Also ensure master gain is wired up
  getMaster();
}

/** Set master volume (0–100). Persisted by caller via settings. */
export function setVolume(level: number) {
  currentVolume = Math.max(0, Math.min(1, level / 100));
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(currentVolume, audioCtx.currentTime, 0.02);
  }
}

// Pre-create and unlock AudioContext on first user interaction
// so sounds play instantly without initialization delay
if (typeof window !== "undefined") {
  const warmUp = () => {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    // Play a silent buffer to fully unlock the audio pipeline
    const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);

    window.removeEventListener("click", warmUp);
    window.removeEventListener("touchstart", warmUp);
    window.removeEventListener("keydown", warmUp);
  };
  window.addEventListener("click", warmUp);
  window.addEventListener("touchstart", warmUp);
  window.addEventListener("keydown", warmUp);
}

// ---- Air-raid siren state ----
let sirenOsc: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenLfo: OscillatorNode | null = null;
let sirenActive = false;

/**
 * Start a continuous air-raid siren using FM synthesis.
 * An LFO modulates the main oscillator's frequency for automatic warbling.
 * Call stopSiren() when missiles are no longer in flight.
 * Safe to call multiple times — only one siren plays at a time.
 */
export function startSiren() {
  if (sirenActive) return;
  try {
    const ctx = getCtx();
    sirenActive = true;

    // Main oscillator — the siren tone
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = "sawtooth";
    sirenOsc.frequency.value = 380; // center frequency — deeper tone

    // LFO for frequency sweep (warble) — FM synthesis
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = "sine";
    sirenLfo.frequency.value = 0.3; // ~3.3s cycle (rise + fall)

    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 150; // sweep ±150Hz → 230–530Hz range

    sirenLfo.connect(lfoDepth);
    lfoDepth.connect(sirenOsc.frequency);

    // Lowpass filter — soften harsh sawtooth harmonics
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.7;

    // Output gain
    sirenGain = ctx.createGain();
    sirenGain.gain.setValueAtTime(0.15, ctx.currentTime);

    sirenOsc.connect(filter);
    filter.connect(sirenGain);
    sirenGain.connect(getMaster());

    sirenOsc.start();
    sirenLfo.start();
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
    const fadeEnd = ctx.currentTime + 0.3;
    if (sirenGain) {
      sirenGain.gain.setValueAtTime(sirenGain.gain.value, ctx.currentTime);
      sirenGain.gain.exponentialRampToValueAtTime(0.001, fadeEnd);
    }
    if (sirenOsc) sirenOsc.stop(fadeEnd + 0.05);
    if (sirenLfo) sirenLfo.stop(fadeEnd + 0.05);
  } catch {
    // ignore
  }
  sirenOsc = null;
  sirenGain = null;
  sirenLfo = null;
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
    const dest = getMaster();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(dest);

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
 * GAU-8 Avenger BRRT sound — sawtooth oscillator amplitude-modulated
 * by a square wave simulating the 70Hz fire rate, with bandpass-filtered
 * white noise and a sub-bass thud. Duration ~1.8s.
 */
export function playBRRTSound() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const duration = 1.5;

    // Local gain to control this sound's relative volume
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.7, now);
    master.connect(getMaster());

    // Main sawtooth at 65Hz (the "buzz")
    const sawOsc = ctx.createOscillator();
    sawOsc.type = "sawtooth";
    sawOsc.frequency.setValueAtTime(65, now);

    // Envelope — quick attack, sustain, quick release
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0, now);
    envGain.gain.linearRampToValueAtTime(0.5, now + 0.03);
    envGain.gain.setValueAtTime(0.5, now + duration - 0.2);
    envGain.gain.linearRampToValueAtTime(0, now + duration);

    sawOsc.connect(envGain);
    envGain.connect(master);

    // White noise layer — wide bandpass for "rattle/mechanical" character
    const noiseLen = Math.floor(ctx.sampleRate * duration);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(500, now);
    noiseFilter.Q.setValueAtTime(0.7, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.35, now + 0.03);
    noiseGain.gain.setValueAtTime(0.35, now + duration - 0.2);
    noiseGain.gain.linearRampToValueAtTime(0, now + duration);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    // Sub-bass thud at 40Hz — initial impact punch
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(40, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.4, now + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(master);

    // Start all
    sawOsc.start(now);
    noiseSrc.start(now);
    subOsc.start(now);

    // Stop all
    sawOsc.stop(now + duration);
    noiseSrc.stop(now + duration);
    subOsc.stop(now + 0.5);
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
    const dest = getMaster();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(dest);

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
    gain2.connect(dest);

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
    noiseGain.connect(dest);

    noise.start(now);
    noise.stop(now + 0.15);
  } catch {
    // Audio not available
  }
}
