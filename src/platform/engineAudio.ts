import type { AIDriver, RaceSeries } from "../domain/ai";

interface EngineProfile {
  idleHz: number;
  rangeHz: number;
  gears: number;
  filterHz: number;
  filterRange: number;
  waveforms: [OscillatorType, OscillatorType, OscillatorType];
  harmonics: [number, number, number];
  intake: number;
}

interface EngineVoice {
  oscillators: OscillatorNode[];
  oscillatorGains: GainNode[];
  filter: BiquadFilterNode;
  output: GainNode;
  panner: StereoPannerNode;
  noiseSource: AudioBufferSourceNode;
  noiseGain: GainNode;
  variation: number;
  gear: number;
  shiftUntil: number;
}

const ENGINE_PROFILES: Record<RaceSeries, EngineProfile> = {
  f1: {
    idleHz: 52,
    rangeHz: 150,
    gears: 8,
    filterHz: 900,
    filterRange: 3900,
    waveforms: ["triangle", "sawtooth", "triangle"],
    harmonics: [0.72, 0.2, 0.08],
    intake: 0.72,
  },
  f2: {
    idleHz: 42,
    rangeHz: 116,
    gears: 6,
    filterHz: 650,
    filterRange: 2600,
    waveforms: ["triangle", "sawtooth", "triangle"],
    harmonics: [0.66, 0.24, 0.1],
    intake: 0.56,
  },
  f3: {
    idleHz: 37,
    rangeHz: 105,
    gears: 6,
    filterHz: 600,
    filterRange: 2200,
    waveforms: ["triangle", "sawtooth", "sine"],
    harmonics: [0.64, 0.25, 0.11],
    intake: 0.48,
  },
  gt3: {
    idleHz: 34,
    rangeHz: 78,
    gears: 6,
    filterHz: 520,
    filterRange: 1800,
    waveforms: ["triangle", "sawtooth", "sine"],
    harmonics: [0.58, 0.28, 0.14],
    intake: 0.62,
  },
  prototype: {
    idleHz: 40,
    rangeHz: 118,
    gears: 7,
    filterHz: 700,
    filterRange: 2800,
    waveforms: ["triangle", "sawtooth", "triangle"],
    harmonics: [0.62, 0.25, 0.13],
    intake: 0.58,
  },
};

export class EngineAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly voices = new Map<string, EngineVoice>();
  private lastUpdate = 0;
  private stopTimer = 0;
  private running = false;

  async setRunning(
    running: boolean,
    drivers: AIDriver[],
    enabled: boolean,
    listenerId?: string | null,
  ): Promise<void> {
    if (!running || !enabled) {
      this.stop();
      return;
    }

    window.clearTimeout(this.stopTimer);
    this.running = true;
    const context = this.ensureAudioGraph();
    if (context.state !== "running") await context.resume();
    this.update(drivers, true, listenerId);
  }

  update(drivers: AIDriver[], force = false, listenerId?: string | null): void {
    const context = this.context;
    if (!this.running || !context || !this.master || context.state !== "running") return;
    const now = context.currentTime;
    if (!force && now - this.lastUpdate < 0.045) return;
    this.lastUpdate = now;

    const listener = drivers.find((driver) => driver.id === listenerId) ?? drivers[0];
    const activeDrivers = listener
      ? [...drivers]
          .sort((a, b) =>
            Math.hypot(a.car.x - listener.car.x, a.car.y - listener.car.y) -
            Math.hypot(b.car.x - listener.car.x, b.car.y - listener.car.y))
          .slice(0, 12)
      : [];
    if (listener && !activeDrivers.includes(listener)) activeDrivers[activeDrivers.length - 1] = listener;
    const activeIds = new Set(activeDrivers.map((driver) => driver.id));
    for (const [id, voice] of this.voices) {
      if (!activeIds.has(id)) this.releaseVoice(id, voice, now);
    }

    for (const driver of activeDrivers) {
      const profile = ENGINE_PROFILES[driver.series];
      let voice = this.voices.get(driver.id);
      if (!voice) {
        voice = this.createVoice(driver, profile);
        this.voices.set(driver.id, voice);
      }

      const speedRatio = Math.max(0, Math.min(1, driver.car.speed / 95));
      const gear = Math.min(profile.gears - 1, Math.floor(speedRatio * profile.gears));
      if (gear !== voice.gear) {
        voice.gear = gear;
        voice.shiftUntil = now + 0.1;
      }
      const gearProgress = speedRatio * profile.gears - gear;
      const revs = 0.24 + Math.max(0, Math.min(1, gearProgress)) * 0.76;
      const shiftDip = now < voice.shiftUntil ? 0.78 : 1;
      const frequency = (profile.idleHz + profile.rangeHz * revs) * shiftDip * voice.variation;
      const throttle = driver.throttle ? 1 : 0;
      const distance = listener
        ? Math.hypot(driver.car.x - listener.car.x, driver.car.y - listener.car.y)
        : 0;
      const attenuation = 0.12 + 0.88 / (1 + (distance / 135) ** 2);
      const amplitude = (0.014 + revs * 0.01) * (throttle ? 1.3 : 0.62) * attenuation;

      voice.oscillators.forEach((oscillator, index) => {
        const ratios = [1, 2.01, driver.series === "gt3" ? 4.03 : 3.02];
        oscillator.frequency.setTargetAtTime(frequency * ratios[index], now, 0.045);
      });
      voice.filter.frequency.setTargetAtTime(profile.filterHz + revs * profile.filterRange, now, 0.08);
      voice.output.gain.setTargetAtTime(amplitude, now, 0.065);
      voice.noiseGain.gain.setTargetAtTime(
        (0.00025 + throttle * 0.0011) * profile.intake * voice.variation * attenuation,
        now,
        0.08,
      );
      const lateral = listener
        ? (driver.car.x - listener.car.x) * -Math.sin(listener.car.heading) +
          (driver.car.y - listener.car.y) * Math.cos(listener.car.heading)
        : 0;
      voice.panner.pan.setTargetAtTime(
        Math.max(-0.8, Math.min(0.8, lateral / 160)),
        now,
        0.15,
      );
    }
  }

  private ensureAudioGraph(): AudioContext {
    if (this.context) return this.context;
    if (!window.AudioContext) throw new Error("Per-car engine audio is unavailable in this browser.");

    const context = new AudioContext();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = 0.9;
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    master.connect(compressor);
    compressor.connect(context.destination);

    const samples = context.sampleRate * 2;
    const noiseBuffer = context.createBuffer(1, samples, context.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples; i += 1) noise[i] = Math.random() * 2 - 1;

    this.context = context;
    this.master = master;
    this.noiseBuffer = noiseBuffer;
    return context;
  }

  private createVoice(driver: AIDriver, profile: EngineProfile): EngineVoice {
    const context = this.context!;
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const oscillators: OscillatorNode[] = [];
    const oscillatorGains: GainNode[] = [];
    const variation = 0.95 + (hash(driver.id) % 101) / 1000;

    output.gain.value = 0;
    filter.type = "lowpass";
    filter.Q.value = 0.75;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1350 + (hash(driver.id) % 9) * 75;
    noiseFilter.Q.value = 0.7;
    noiseGain.gain.value = 0;

    for (let index = 0; index < profile.waveforms.length; index += 1) {
      const oscillator = context.createOscillator();
      const harmonicGain = context.createGain();
      oscillator.type = profile.waveforms[index];
      oscillator.detune.value = (index - 1) * (1 + (hash(driver.id) % 4));
      harmonicGain.gain.value = profile.harmonics[index];
      oscillator.connect(harmonicGain);
      harmonicGain.connect(filter);
      oscillator.start();
      oscillators.push(oscillator);
      oscillatorGains.push(harmonicGain);
    }

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    noiseSource.loop = true;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseSource.start();
    filter.connect(output);
    noiseGain.connect(output);
    output.connect(panner);
    panner.connect(this.master!);

    return {
      oscillators,
      oscillatorGains,
      filter,
      output,
      panner,
      noiseSource,
      noiseGain,
      variation,
      gear: -1,
      shiftUntil: 0,
    };
  }

  private stop(): void {
    this.running = false;
    const context = this.context;
    if (!context) return;
    const stopAt = context.currentTime + 0.12;
    for (const voice of this.voices.values()) {
      voice.output.gain.cancelScheduledValues(context.currentTime);
      voice.output.gain.setTargetAtTime(0, context.currentTime, 0.025);
      for (const oscillator of voice.oscillators) oscillator.stop(stopAt);
      voice.noiseSource.stop(stopAt);
    }
    this.voices.clear();
    this.stopTimer = window.setTimeout(() => {
      if (!this.running && this.context?.state === "running") void this.context.suspend();
    }, 180);
  }

  private releaseVoice(id: string, voice: EngineVoice, now: number): void {
    voice.output.gain.setTargetAtTime(0, now, 0.04);
    for (const oscillator of voice.oscillators) oscillator.stop(now + 0.16);
    voice.noiseSource.stop(now + 0.16);
    this.voices.delete(id);
  }
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
