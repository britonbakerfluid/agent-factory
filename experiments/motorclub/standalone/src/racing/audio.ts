export class CarAudio {
  context?: AudioContext;
  engine?: OscillatorNode;
  engineGain?: GainNode;
  skid?: AudioBufferSourceNode;
  skidGain?: GainNode;
  master?: GainNode;
  muted = false;
  constructor() {
    try {
      this.muted = localStorage.getItem("fluid.motorclub.muted") === "true";
    } catch {}
  }
  async start() {
    if (!this.context) {
      const c = (this.context = new AudioContext());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.25;
      this.master.connect(c.destination);
      this.engine = c.createOscillator();
      this.engine.type = "sawtooth";
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 330;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master);
      this.engine.start();
      const buffer = c.createBuffer(1, c.sampleRate, c.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.skid = c.createBufferSource();
      this.skid.buffer = buffer;
      this.skid.loop = true;
      this.skidGain = c.createGain();
      this.skidGain.gain.value = 0;
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1700;
      this.skid.connect(band).connect(this.skidGain).connect(this.master);
      this.skid.start();
    }
    await this.context.resume();
  }
  toggle() {
    this.muted = !this.muted;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.25,
        this.context.currentTime,
        0.03,
      );
    try {
      localStorage.setItem("fluid.motorclub.muted", String(this.muted));
    } catch {}
  }
  update(speed: number, slip: number, active: boolean) {
    const c = this.context;
    if (!c) return;
    this.engine?.frequency.setTargetAtTime(42 + speed * 4, c.currentTime, 0.08);
    this.engineGain?.gain.setTargetAtTime(
      active ? 0.14 : 0,
      c.currentTime,
      0.08,
    );
    this.skidGain?.gain.setTargetAtTime(
      active && speed > 6 ? Math.min(0.15, slip * 0.3) : 0,
      c.currentTime,
      0.06,
    );
  }
  beep(frequency: number, duration = 0.13) {
    const c = this.context;
    if (!c || !this.master) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = frequency;
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  dispose() {
    void this.context?.close();
  }
}
