const fs = require('fs');
const path = require('path');

const sampleRate = 44100;

function createWavHeader(numSamples, numChannels = 1) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function writeWavFile(filepath, samples, numChannels = 1) {
  const header = createWavHeader(samples.length / numChannels, numChannels);
  const dataBuffer = Buffer.alloc(samples.length * 2);

  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1.0, 1.0]
    const clamped = Math.max(-1.0, Math.min(1.0, samples[i]));
    const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    dataBuffer.writeInt16LE(Math.round(intSample), i * 2);
  }

  const combined = Buffer.concat([header, dataBuffer]);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, combined);
  console.log(`Generated: ${filepath} (${(combined.length / 1024).toFixed(1)} KB)`);
}

// 1. CAR HORN (Dual-tone G#4 415Hz + B4 494Hz with natural acoustic harmonics and envelope)
function generateCarHorn() {
  const duration = 0.45;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);
  const f1 = 415.0; // G#4
  const f2 = 494.0; // B4

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Envelope: quick attack 0.02s, sustain, gentle release last 0.08s
    let env = 1.0;
    if (t < 0.02) {
      env = t / 0.02;
    } else if (t > duration - 0.08) {
      env = (duration - t) / 0.08;
    }

    // Horn tone with primary fundamental + 2nd, 3rd, and 4th harmonics
    const tone1 = Math.sin(2 * Math.PI * f1 * t) * 0.40
                + Math.sin(2 * Math.PI * f1 * 2 * t) * 0.22
                + Math.sin(2 * Math.PI * f1 * 3 * t) * 0.12;
    const tone2 = Math.sin(2 * Math.PI * f2 * t) * 0.38
                + Math.sin(2 * Math.PI * f2 * 2 * t) * 0.20
                + Math.sin(2 * Math.PI * f2 * 3 * t) * 0.10;

    // Slight mechanical diaphragm buzz
    const buzz = (Math.random() * 2 - 1) * 0.03;

    samples[i] = (tone1 + tone2 + buzz) * env * 0.70;
  }
  return samples;
}

// 2. BIRD CHIRP (Sweet songbird trill with natural FM sweeps and chirps)
function generateBirdChirp() {
  const duration = 0.75;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let s = 0;

    // Chirp 1: 0.05 to 0.25s
    if (t >= 0.05 && t < 0.25) {
      const ct = t - 0.05;
      const progress = ct / 0.20;
      // Parabolic frequency sweep 3400Hz -> 4800Hz -> 3600Hz
      const freq = 3400 + Math.sin(progress * Math.PI) * 1400;
      const env = Math.sin(progress * Math.PI);
      s += Math.sin(2 * Math.PI * freq * ct) * env * 0.45;
      s += Math.sin(4 * Math.PI * freq * ct) * env * 0.12; // 2nd harmonic
    }

    // Chirp 2 (higher double-trill): 0.32 to 0.58s
    if (t >= 0.32 && t < 0.58) {
      const ct = t - 0.32;
      const progress = ct / 0.26;
      const freq = 3800 + Math.sin(progress * Math.PI * 1.5) * 1600;
      const env = Math.sin(progress * Math.PI);
      s += Math.sin(2 * Math.PI * freq * ct) * env * 0.50;
      s += Math.sin(4 * Math.PI * freq * ct) * env * 0.15;
    }

    samples[i] = s * 0.65;
  }
  return samples;
}

// 3. AMBULANCE SIREN (Classic European/US Two-Tone Hi-Lo 650Hz / 880Hz, 2.0s seamless loop)
function generateAmbulanceSiren() {
  const duration = 2.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);
  const half = duration / 2;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const isHigh = (t % duration) < half;
    const baseFreq = isHigh ? 880.0 : 659.25;

    // Siren tone with rich acoustic horn harmonics (odd & even)
    const tone = Math.sin(2 * Math.PI * baseFreq * t) * 0.50
               + Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.25
               + Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.15
               + Math.sin(2 * Math.PI * baseFreq * 4 * t) * 0.08;

    // Seamless loop windowing on endpoints
    let loopWindow = 1.0;
    if (t < 0.02) loopWindow = t / 0.02;
    else if (t > duration - 0.02) loopWindow = (duration - t) / 0.02;

    samples[i] = tone * loopWindow * 0.60;
  }
  return samples;
}

// 4. POLICE SIREN (Classic Electronic Wail 650Hz -> 1350Hz -> 650Hz, 2.4s seamless loop)
function generatePoliceSiren() {
  const duration = 2.4;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  let phase = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Triangular frequency modulation from 650Hz to 1350Hz
    const cycle = (t % duration) / duration;
    const mod = cycle < 0.5 ? (cycle * 2) : (2 - cycle * 2);
    const freq = 650 + mod * 700;

    phase += 2 * Math.PI * freq / sampleRate;
    const tone = Math.sin(phase) * 0.48
               + Math.sin(phase * 2) * 0.24
               + Math.sin(phase * 3) * 0.14
               + Math.sin(phase * 4) * 0.07;

    samples[i] = tone * 0.58;
  }
  return samples;
}

// 5. TRAFFIC RUMBLE (4.0s seamless stereo urban road bed)
function generateTrafficRumble() {
  const duration = 4.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples * 2); // Stereo

  // Generate multi-band filtered texture
  let l0 = 0, l1 = 0, r0 = 0, r1 = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Pink noise base
    const wnL = Math.random() * 2 - 1;
    const wnR = Math.random() * 2 - 1;

    l0 = 0.95 * l0 + wnL * 0.05;
    l1 = 0.85 * l1 + wnL * 0.15;
    r0 = 0.95 * r0 + wnR * 0.05;
    r1 = 0.85 * r1 + wnR * 0.15;

    // Slow organic traffic swell LFO (0.2Hz and 0.35Hz)
    const swell = 0.75 + Math.sin(2 * Math.PI * 0.25 * t) * 0.22;
    const lowHum = Math.sin(2 * Math.PI * 55 * t) * 0.08 + Math.sin(2 * Math.PI * 110 * t) * 0.05;

    // Smooth loop crossfade at ends (0.15s)
    let loopFade = 1.0;
    if (t < 0.15) loopFade = t / 0.15;
    else if (t > duration - 0.15) loopFade = (duration - t) / 0.15;

    const left = (l0 * 0.6 + l1 * 0.25 + lowHum) * swell * loopFade * 0.45;
    const right = (r0 * 0.6 + r1 * 0.25 + lowHum) * swell * loopFade * 0.45;

    samples[i * 2] = left;
    samples[i * 2 + 1] = right;
  }
  return samples;
}

const outDir = path.resolve(__dirname, '../public/audio');

writeWavFile(path.join(outDir, 'car_horn.wav'), generateCarHorn(), 1);
writeWavFile(path.join(outDir, 'bird_chirp.wav'), generateBirdChirp(), 1);
writeWavFile(path.join(outDir, 'ambulance_siren.wav'), generateAmbulanceSiren(), 1);
writeWavFile(path.join(outDir, 'police_siren.wav'), generatePoliceSiren(), 1);
writeWavFile(path.join(outDir, 'traffic_rumble.wav'), generateTrafficRumble(), 2);

console.log('All 5 audio assets successfully generated in public/audio/');
