// Platform adapter: one game, different portal SDKs.
// window.PLATFORM is set in index.html by the build script: 'crazygames' | 'youtube' | 'local'

const SAVE_KEY = 'mma_save_v1';

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}

// Hooks the game fills in so ads can pause the game and mute audio.
export const hooks = {
  onAdStart: () => {},
  onAdEnd: () => {},
  onPause: () => {},
  onResume: () => {},
  onAudioChange: (_enabled) => {},
};

// ---------------------------------------------------------------- Local (testing / own website)
const local = {
  name: 'local',
  hasRewarded: true,
  async init() {},
  firstFrameReady() {},
  gameReady() {},
  gameplayStart() {},
  gameplayStop() {},
  happyTime() {},
  async loadData() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
  },
  saveData(obj) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); } catch { /* storage blocked */ }
  },
  async rewardedAd() {
    // Simulated ad for testing: always grants the reward.
    hooks.onAdStart();
    await new Promise((r) => setTimeout(r, 400));
    hooks.onAdEnd();
    return true;
  },
  async midgameAd() {},
  sendScore() {},
  isAudioEnabled() { return true; },
};

// ---------------------------------------------------------------- CrazyGames (SDK v3)
const crazygames = {
  name: 'crazygames',
  hasRewarded: true,
  sdk: null,
  playing: false,
  async init() {
    const SDK = window.CrazyGames && window.CrazyGames.SDK;
    if (!SDK) return;
    try {
      await withTimeout(SDK.init(), 5000, null);
      this.sdk = SDK;
      this.sdk.game.loadingStart();
    } catch (e) { console.warn('CrazyGames SDK init failed', e); this.sdk = null; }
  },
  firstFrameReady() {},
  gameReady() { try { this.sdk && this.sdk.game.loadingStop(); } catch {} },
  gameplayStart() {
    if (this.playing) return;
    this.playing = true;
    try { this.sdk && this.sdk.game.gameplayStart(); } catch {}
  },
  gameplayStop() {
    if (!this.playing) return;
    this.playing = false;
    try { this.sdk && this.sdk.game.gameplayStop(); } catch {}
  },
  happyTime() { try { this.sdk && this.sdk.game.happytime(); } catch {} },
  async loadData() {
    try {
      const raw = this.sdk ? this.sdk.data.getItem(SAVE_KEY) : localStorage.getItem(SAVE_KEY);
      return JSON.parse(raw || 'null');
    } catch { return null; }
  },
  saveData(obj) {
    try {
      const s = JSON.stringify(obj);
      if (this.sdk) this.sdk.data.setItem(SAVE_KEY, s); else localStorage.setItem(SAVE_KEY, s);
    } catch {}
  },
  requestAd(type) {
    return new Promise((resolve) => {
      if (!this.sdk) { resolve(type === 'rewarded' ? false : true); return; }
      let started = false;
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => { started = true; hooks.onAdStart(); },
          adFinished: () => { if (started) hooks.onAdEnd(); resolve(true); },
          adError: () => { if (started) hooks.onAdEnd(); resolve(false); },
        });
      } catch { resolve(false); }
    });
  },
  rewardedAd() { return this.requestAd('rewarded'); },
  midgameAd() { return this.requestAd('midgame'); },
  sendScore() {},
  isAudioEnabled() { return true; },
};

// ---------------------------------------------------------------- YouTube Playables (via Mediacube)
const youtube = {
  name: 'youtube',
  hasRewarded: false,
  yt: null,
  loaded: false,
  async init() {
    const yt = window.ytgame;
    if (!yt) return;
    this.yt = yt;
    this.hasRewarded = !!(yt.ads && yt.ads.requestRewardedAd);
    try {
      yt.system.onPause(() => hooks.onPause());
      yt.system.onResume(() => hooks.onResume());
      yt.system.onAudioEnabledChange((on) => hooks.onAudioChange(on));
    } catch (e) { console.warn(e); }
  },
  firstFrameReady() { try { this.yt && this.yt.game.firstFrameReady(); } catch {} },
  gameReady() { try { this.yt && this.yt.game.gameReady(); } catch {} },
  gameplayStart() {},
  gameplayStop() {},
  happyTime() {},
  async loadData() {
    if (!this.yt) return local.loadData();
    try {
      const s = await this.yt.game.loadData();
      this.loaded = true;
      return s ? JSON.parse(s) : null;
    } catch (e) {
      console.warn('loadData failed', e);
      return null; // loaded stays false: we never overwrite a save we could not read
    }
  },
  saveData(obj) {
    if (!this.yt) return local.saveData(obj);
    if (!this.loaded) return; // YouTube rule: saveData only after loadData succeeded
    this.yt.game.saveData(JSON.stringify(obj)).catch((e) => console.warn('saveData failed', e));
  },
  async rewardedAd(rewardId = 'reward') {
    if (!this.yt || !this.hasRewarded) return false;
    hooks.onAdStart();
    try { return await this.yt.ads.requestRewardedAd(rewardId); }
    catch { return false; }
    finally { hooks.onAdEnd(); }
  },
  async midgameAd() {
    if (!this.yt || !this.yt.ads || !this.yt.ads.requestInterstitialAd) return;
    hooks.onAdStart();
    try { await this.yt.ads.requestInterstitialAd(); } catch {}
    finally { hooks.onAdEnd(); }
  },
  sendScore(value) {
    try { this.yt && this.yt.engagement.sendScore({ value: Math.floor(value) }); } catch {}
  },
  isAudioEnabled() {
    try { return this.yt ? this.yt.system.isAudioEnabled() : true; } catch { return true; }
  },
};

// ---------------------------------------------------------------- Playhop / Yandex Games
const playhop = {
  name: 'playhop',
  hasRewarded: true,
  ysdk: null,
  player: null,
  playing: false,
  lang: 'en',
  async init() {
    if (!window.YaGames) return;
    try {
      this.ysdk = await withTimeout(window.YaGames.init(), 8000, null);
      if (!this.ysdk) return;
      try { this.lang = this.ysdk.environment.i18n.lang || 'en'; } catch {}
      this.ysdk.on && this.ysdk.on('game_api_pause', () => hooks.onPause());
      this.ysdk.on && this.ysdk.on('game_api_resume', () => hooks.onResume());
      try { this.player = await withTimeout(this.ysdk.getPlayer({ scopes: false }), 5000, null); } catch { this.player = null; }
    } catch (e) { console.warn('Yandex SDK init failed', e); this.ysdk = null; }
  },
  firstFrameReady() {},
  gameReady() { try { this.ysdk && this.ysdk.features.LoadingAPI && this.ysdk.features.LoadingAPI.ready(); } catch {} },
  gameplayStart() {
    if (this.playing) return;
    this.playing = true;
    try { this.ysdk && this.ysdk.features.GameplayAPI && this.ysdk.features.GameplayAPI.start(); } catch {}
  },
  gameplayStop() {
    if (!this.playing) return;
    this.playing = false;
    try { this.ysdk && this.ysdk.features.GameplayAPI && this.ysdk.features.GameplayAPI.stop(); } catch {}
  },
  happyTime() {},
  async loadData() {
    if (this.player) {
      try {
        const d = await this.player.getData(['save']);
        if (d && d.save) return d.save;
      } catch {}
    }
    return local.loadData();
  },
  saveData(obj) {
    local.saveData(obj); // also keep a local copy
    if (this.player) { try { this.player.setData({ save: obj }, false); } catch {} }
  },
  rewardedAd() {
    return new Promise((resolve) => {
      if (!this.ysdk) { resolve(false); return; }
      let rewarded = false;
      try {
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => hooks.onAdStart(),
            onRewarded: () => { rewarded = true; },
            onClose: () => { hooks.onAdEnd(); resolve(rewarded); },
            onError: () => { hooks.onAdEnd(); resolve(false); },
          },
        });
      } catch { resolve(false); }
    });
  },
  midgameAd() {
    return new Promise((resolve) => {
      if (!this.ysdk) { resolve(); return; }
      let opened = false;
      try {
        this.ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => { opened = true; hooks.onAdStart(); },
            onClose: () => { if (opened) hooks.onAdEnd(); resolve(); },
            onError: () => { if (opened) hooks.onAdEnd(); resolve(); },
            onOffline: () => resolve(),
          },
        });
      } catch { resolve(); }
    });
  },
  sendScore() {},
  isAudioEnabled() { return true; },
};

const all = { local, crazygames, youtube, playhop };
export const platform = all[window.PLATFORM] || local;
export function detectLanguage() {
  if (platform.lang) return platform.lang;
  return (navigator.language || 'en').slice(0, 2);
}
