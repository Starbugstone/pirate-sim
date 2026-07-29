// @ts-nocheck
/* ──────────────────────────────────────────────────────────────────────
   Web Audio API Sound Engine
   Procedural sound synthesis for sea ambiance, cannon fire, ship impacts,
   treasure gold clinks, and seagull cries with spatial distance attenuation.
   ────────────────────────────────────────────────────────────────────── */

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let ambianceGain: GainNode | null = null
let ambianceFilter: BiquadFilterNode | null = null
let ambianceNoiseNode: AudioNode | null = null
let ambianceStarted = false
const transientNoiseBuffers = new Map<number, AudioBuffer>()

/** Initialize or resume the Web Audio Context on user interaction */
export function initAudio() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    audioCtx = new AudioCtx()

    masterGain = audioCtx.createGain()
    masterGain.gain.setValueAtTime(0.7, audioCtx.currentTime)
    masterGain.connect(audioCtx.destination)
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  if (!ambianceStarted && audioCtx) {
    startOceanAmbiance()
  }
}

/** Distance attenuation helper: returns gain multiplier (0 to 1) */
function getDistanceVolume(x: number, z: number, playerX: number, playerZ: number, maxDist = 200): number {
  const dx = x - playerX
  const dz = z - playerZ
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist >= maxDist) return 0
  return Math.max(0, 1 - dist / maxDist)
}

/** Reuse procedural noise across shots instead of allocating and filling a
 * fresh AudioBuffer for every cannon and impact in a broadside. */
function getTransientNoiseBuffer(duration: number): AudioBuffer | null {
  if (!audioCtx) return null
  const cached = transientNoiseBuffers.get(duration)
  if (cached) return cached

  const bufferSize = Math.floor(audioCtx.sampleRate * duration)
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
  transientNoiseBuffers.set(duration, noiseBuffer)
  return noiseBuffer
}

/** 1. Ocean Ambiance: Filtered Pink Noise with Modulated Wave Swells */
function startOceanAmbiance() {
  if (!audioCtx || !masterGain || ambianceStarted) return
  ambianceStarted = true

  // Create 5 seconds of pink noise buffer
  const bufferSize = audioCtx.sampleRate * 5
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const output = noiseBuffer.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.96900 * b2 + white * 0.1538520
    b3 = 0.86650 * b3 + white * 0.3104856
    b4 = 0.55000 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.0168980
    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    output[i] *= 0.08
    b6 = white * 0.115926
  }

  const whiteNoise = audioCtx.createBufferSource()
  whiteNoise.buffer = noiseBuffer
  whiteNoise.loop = true

  // Low pass filter simulating rolling ocean waves
  ambianceFilter = audioCtx.createBiquadFilter()
  ambianceFilter.type = 'lowpass'
  ambianceFilter.frequency.setValueAtTime(280, audioCtx.currentTime)
  ambianceFilter.Q.setValueAtTime(1.5, audioCtx.currentTime)

  ambianceGain = audioCtx.createGain()
  ambianceGain.gain.setValueAtTime(0.18, audioCtx.currentTime)

  whiteNoise.connect(ambianceFilter)
  ambianceFilter.connect(ambianceGain)
  ambianceGain.connect(masterGain)
  whiteNoise.start()

  ambianceNoiseNode = whiteNoise
}

/** Dynamic update for ocean wave sound based on ship speed */
export function updateOceanAmbiance(playerSpeed: number) {
  if (!audioCtx || !ambianceFilter || !ambianceGain) return

  const now = audioCtx.currentTime
  // Wave swell modulation using time sine wave
  const swell = Math.sin(now * 0.8) * 0.5 + 0.5 // 0 to 1
  const targetFreq = 220 + swell * 240 + Math.min(playerSpeed * 20, 250)
  const targetVol = 0.14 + swell * 0.08 + Math.min(playerSpeed * 0.01, 0.12)

  ambianceFilter.frequency.setTargetAtTime(targetFreq, now, 0.2)
  ambianceGain.gain.setTargetAtTime(targetVol, now, 0.2)
}

/** 2. Seagull Cry / Screech Sound */
export function playSeagullSound(x?: number, z?: number, playerX?: number, playerZ?: number) {
  initAudio()
  if (!audioCtx || !masterGain) return

  let vol = 0.35
  if (x !== undefined && z !== undefined && playerX !== undefined && playerZ !== undefined) {
    vol *= getDistanceVolume(x, z, playerX, playerZ, 180)
  }
  if (vol <= 0.01) return

  const now = audioCtx.currentTime

  // Trigger 2 short cries in rapid succession ("Squawk! Squawk!")
  const cryTimes = [now, now + 0.22]
  cryTimes.forEach((startTime, idx) => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    osc.type = 'sine'

    // Pitch sweep: starts ~1300Hz, sweeps up to 2300Hz, drops to 1500Hz
    const baseFreq = 1350 + (idx === 1 ? 150 : 0)
    osc.frequency.setValueAtTime(baseFreq, startTime)
    osc.frequency.exponentialRampToValueAtTime(2300 + (idx === 1 ? 200 : 0), startTime + 0.08)
    osc.frequency.exponentialRampToValueAtTime(1450, startTime + 0.18)

    // Vibrato effect
    const lfo = audioCtx.createOscillator()
    const lfoGain = audioCtx.createGain()
    lfo.frequency.setValueAtTime(18, startTime)
    lfoGain.gain.setValueAtTime(80, startTime)
    lfo.connect(osc.frequency)
    lfo.start(startTime)
    lfo.stop(startTime + 0.2)

    // Envelope
    gain.gain.setValueAtTime(0.001, startTime)
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.20)

    osc.connect(gain)
    gain.connect(masterGain)

    osc.start(startTime)
    osc.stop(startTime + 0.21)
  })
}

/** 3. Cannon Firing Sound: Explosive Low Sub Sweep + Noise Burst */
export function playCannonSound(x?: number, z?: number, playerX?: number, playerZ?: number, isPlayer = true) {
  initAudio()
  if (!audioCtx || !masterGain) return

  let vol = isPlayer ? 0.75 : 0.45
  if (!isPlayer && x !== undefined && z !== undefined && playerX !== undefined && playerZ !== undefined) {
    vol *= getDistanceVolume(x, z, playerX, playerZ, 250)
  }
  if (vol <= 0.01) return

  const now = audioCtx.currentTime

  // --- Sub-Bass Punch ---
  const subOsc = audioCtx.createOscillator()
  const subGain = audioCtx.createGain()
  subOsc.type = 'sine'
  subOsc.frequency.setValueAtTime(150, now)
  subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35)

  subGain.gain.setValueAtTime(vol * 1.1, now)
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

  subOsc.connect(subGain)
  subGain.connect(masterGain)
  subOsc.start(now)
  subOsc.stop(now + 0.42)

  // --- Filtered Explosion Noise Blast ---
  const noise = audioCtx.createBufferSource()
  noise.buffer = getTransientNoiseBuffer(0.5)

  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1200, now)
  filter.frequency.exponentialRampToValueAtTime(120, now + 0.4)

  const noiseGain = audioCtx.createGain()
  noiseGain.gain.setValueAtTime(vol * 0.9, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(masterGain)
  noise.start(now)
  noise.stop(now + 0.46)
}

/** 4. Cannonball Ship Impact Sound: Wooden Crunch & Thud */
export function playImpactSound(x?: number, z?: number, playerX?: number, playerZ?: number) {
  initAudio()
  if (!audioCtx || !masterGain) return

  let vol = 0.8
  if (x !== undefined && z !== undefined && playerX !== undefined && playerZ !== undefined) {
    vol *= getDistanceVolume(x, z, playerX, playerZ, 200)
  }
  if (vol <= 0.01) return

  const now = audioCtx.currentTime

  // Low wood thud
  const thudOsc = audioCtx.createOscillator()
  const thudGain = audioCtx.createGain()
  thudOsc.type = 'triangle'
  thudOsc.frequency.setValueAtTime(110, now)
  thudOsc.frequency.exponentialRampToValueAtTime(40, now + 0.25)

  thudGain.gain.setValueAtTime(vol, now)
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

  thudOsc.connect(thudGain)
  thudGain.connect(masterGain)
  thudOsc.start(now)
  thudOsc.stop(now + 0.3)

  // Splintering snap (bandpassed noise)
  const noise = audioCtx.createBufferSource()
  noise.buffer = getTransientNoiseBuffer(0.25)

  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(450, now)
  filter.Q.setValueAtTime(2.0, now)

  const snapGain = audioCtx.createGain()
  snapGain.gain.setValueAtTime(vol * 0.85, now)
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

  noise.connect(filter)
  filter.connect(snapGain)
  snapGain.connect(masterGain)
  noise.start(now)
  noise.stop(now + 0.25)
}

/** 5. Treasure Gold Clink Sound: Metallic Double Ring */
export function playTreasureSound() {
  initAudio()
  if (!audioCtx || !masterGain) return

  const now = audioCtx.currentTime
  const clinkTimes = [now, now + 0.07]

  clinkTimes.forEach((time, idx) => {
    const freqs = idx === 0 ? [2640, 3520] : [2940, 3960]

    freqs.forEach(freq => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, time)

      gain.gain.setValueAtTime(0.25, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25)

      osc.connect(gain)
      gain.connect(masterGain!)

      osc.start(time)
      osc.stop(time + 0.26)
    })
  })
}
