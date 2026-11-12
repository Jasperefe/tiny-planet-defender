// Web Audio sound manager: sound effects, music playlist, mute/pause handling.

export class AudioManager {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    this.buffers = {};
    this.lastPlay = {};
    this.sfxOn = true;
    this.musicOn = true;
    this.blocked = false; // platform mute or ad playing
    this.musicList = [];
    this.musicIndex = 0;
    this.musicSource = null;
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
  }

  async load(name, url) {
    if (!this.ctx) return;
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      this.buffers[name] = await new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail));
    } catch (e) {
      console.warn('Audio failed to load:', url, e);
    }
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
  }

  play(name, { volume = 1, rate = 1, gap = 0.04 } = {}) {
    if (!this.ctx || !this.sfxOn || this.blocked) return;
    const buf = this.buffers[name];
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < gap) return;
    this.lastPlay[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  setMusicList(names) {
    this.musicList = names;
    this.musicIndex = 0;
    this.startMusic();
  }

  startMusic() {
    if (!this.ctx || this.musicSource || !this.musicOn) return;
    const name = this.musicList[this.musicIndex % Math.max(1, this.musicList.length)];
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.musicGain);
    src.onended = () => {
      if (this.musicSource !== src) return;
      this.musicSource = null;
      this.musicIndex++;
      this.startMusic();
    };
    src.start();
    this.musicSource = src;
  }

  stopMusic() {
    if (this.musicSource) {
      const s = this.musicSource;
      this.musicSource = null;
      try { s.stop(); } catch {}
    }
  }

  setSfx(on) { this.sfxOn = on; }

  setMusic(on) {
    this.musicOn = on;
    if (on) this.startMusic(); else this.stopMusic();
  }

  setBlocked(blocked) {
    this.blocked = blocked;
    this.refreshMaster();
  }

  refreshMaster() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.blocked ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) this.ctx.suspend(); else this.ctx.resume();
  }
}
