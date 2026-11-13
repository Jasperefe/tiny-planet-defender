// Web Audio: sound effects with variation, music tracks with crossfade, mute and pause handling.

export class AudioManager {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    this.buffers = {};
    this.lastPlay = {};
    this.sfxOn = true;
    this.musicOn = true;
    this.blocked = false;
    this.paused = false;
    this.track = null; // { name, src, gain }
    this.wantedTrack = null;
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.master);
  }

  async load(name, url) {
    if (!this.ctx) return;
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      this.buffers[name] = await new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail));
      if (this.wantedTrack && this.wantedTrack.name === name) this.playMusic(name, this.wantedTrack.volume);
    } catch (e) {
      console.warn('Audio failed to load:', url, e);
    }
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
  }

  play(name, { volume = 1, rate = 1, gap = 0.04, vary = 0.08 } = {}) {
    if (!this.ctx || !this.sfxOn || this.blocked) return;
    const buf = this.buffers[name];
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < gap) return;
    this.lastPlay[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  // Crossfade to a looping music track
  playMusic(name, volume = 0.35) {
    this.wantedTrack = { name, volume };
    if (!this.ctx || !this.musicOn) return;
    if (this.track && this.track.name === name) {
      this.track.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.3);
      return;
    }
    const buf = this.buffers[name];
    if (!buf) return; // will start when loaded
    this.fadeOutTrack();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.4);
    src.connect(gain).connect(this.musicBus);
    src.start();
    this.track = { name, src, gain };
  }

  fadeOutTrack() {
    if (!this.track) return;
    const t = this.track;
    this.track = null;
    t.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    setTimeout(() => { try { t.src.stop(); } catch {} }, 1500);
  }

  setSfx(on) { this.sfxOn = on; }

  setMusic(on) {
    this.musicOn = on;
    if (!on) this.fadeOutTrack();
    else if (this.wantedTrack) this.playMusic(this.wantedTrack.name, this.wantedTrack.volume);
  }

  setBlocked(blocked) {
    this.blocked = blocked;
    if (this.ctx) this.master.gain.setTargetAtTime(blocked ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) this.ctx.suspend(); else this.ctx.resume();
  }
}
