import type { GameSettings } from "./storage";

export class EngineAudio {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private overtone: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private readonly formula1Sample = new Audio(new URL("../assets/audio/formula1-race.mp3", import.meta.url).href);

  constructor() {
    this.formula1Sample.loop = true;
    this.formula1Sample.preload = "auto";
    this.formula1Sample.volume = 0.68;
  }

  setRunning(running: boolean, sound: GameSettings["engineSound"]): Promise<void> {
    if (!running || sound === "off") {
      this.gain?.gain.setTargetAtTime(0, this.context?.currentTime ?? 0, 0.08);
      this.formula1Sample.pause();
      return Promise.resolve();
    }

    if (sound === "formula-1") {
      this.gain?.gain.setTargetAtTime(0, this.context?.currentTime ?? 0, 0.08);
      this.formula1Sample.volume = 0.68;
      return this.formula1Sample.play().catch((error: unknown) => {
        console.error("ApexGrid Formula 1 audio could not start.", error);
        throw new Error("Race audio could not start. Check your device volume and sound setting.");
      });
    }

    this.formula1Sample.pause();
    this.initialize(sound);
    if (this.context?.state === "suspended") {
      void this.context.resume().catch((error: unknown) => {
        console.warn("ApexGrid engine audio could not resume.", error);
      });
    }
    this.gain?.gain.setTargetAtTime(0.11, this.context?.currentTime ?? 0, 0.08);
    return Promise.resolve();
  }

  update(speed: number, throttle: boolean, sound: GameSettings["engineSound"]): void {
    if (sound === "formula-1") {
      const revs = Math.max(0, Math.min(1, speed / 95));
      this.formula1Sample.playbackRate = 0.82 + revs * 0.43 + (throttle ? 0.035 : 0);
      this.formula1Sample.volume = Math.min(0.92, 0.48 + revs * 0.28 + (throttle ? 0.12 : 0));
      return;
    }
    if (sound === "off" || !this.context || !this.oscillator || !this.overtone || !this.gain) return;
    const now = this.context.currentTime;
    const baseFrequency = 58 + Math.min(speed, 300) * (sound === "engine-v" ? 1.15 : 0.82);
    this.oscillator.frequency.setTargetAtTime(baseFrequency, now, 0.045);
    this.overtone.frequency.setTargetAtTime(baseFrequency * 2.01, now, 0.05);
    this.gain.gain.setTargetAtTime(0.075 + (throttle ? 0.045 : 0), now, 0.07);
  }

  private initialize(sound: Exclude<GameSettings["engineSound"], "off" | "formula-1">): void {
    if (this.context && this.oscillator && this.overtone && this.gain) {
      const waveform: OscillatorType = sound === "engine-v" ? "sawtooth" : "triangle";
      this.oscillator.type = waveform;
      this.overtone.type = waveform;
      return;
    }
    if (!window.AudioContext) {
      throw new Error("Web Audio is not available in this browser.");
    }

    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    this.oscillator = this.context.createOscillator();
    this.overtone = this.context.createOscillator();
    const waveform: OscillatorType = sound === "engine-v" ? "sawtooth" : "triangle";
    this.oscillator.type = waveform;
    this.overtone.type = waveform;
    this.overtone.frequency.value = 120;
    this.oscillator.connect(filter);
    this.overtone.connect(filter);
    filter.connect(this.gain);
    this.gain.connect(this.context.destination);
    this.oscillator.start();
    this.overtone.start();
  }
}
