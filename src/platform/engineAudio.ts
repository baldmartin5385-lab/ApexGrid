import type { GameSettings } from "./storage";

export class EngineAudio {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private overtone: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  setRunning(running: boolean, sound: GameSettings["engineSound"]): void {
    if (!running || sound === "off") {
      this.gain?.gain.setTargetAtTime(0, this.context?.currentTime ?? 0, 0.08);
      return;
    }

    this.initialize(sound);
    if (this.context?.state === "suspended") {
      void this.context.resume().catch((error: unknown) => {
        console.warn("ApexGrid engine audio could not resume.", error);
      });
    }
    this.gain?.gain.setTargetAtTime(0.055, this.context?.currentTime ?? 0, 0.08);
  }

  update(speed: number, throttle: boolean, sound: GameSettings["engineSound"]): void {
    if (sound === "off" || !this.context || !this.oscillator || !this.overtone || !this.gain) return;
    const now = this.context.currentTime;
    const baseFrequency = 58 + Math.min(speed, 300) * (sound === "engine-v" ? 1.15 : 0.82);
    this.oscillator.frequency.setTargetAtTime(baseFrequency, now, 0.045);
    this.overtone.frequency.setTargetAtTime(baseFrequency * 2.01, now, 0.05);
    this.gain.gain.setTargetAtTime(0.035 + (throttle ? 0.025 : 0), now, 0.07);
  }

  private initialize(sound: Exclude<GameSettings["engineSound"], "off">): void {
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
