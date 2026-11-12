# Tiny Planet Defender

A 3D browser game (three.js). Protect your planet from meteors with an orbiting cannon, collect crystals, and buy upgrades between waves.

## Folder layout

```
index.html          Page + UI screens (HUD, shop, pause, game over, credits)
css/style.css       All UI styling
js/main.js          The game (scene, gameplay, waves, shop, input)
js/platform.js      Portal adapter: CrazyGames SDK / YouTube Playables SDK / local
js/audio.js         Sound effects and music
lib/three/          three.js engine (do not edit)
assets/models/      GLB models (Kenney, Quaternius)
assets/audio/       MP3 sound effects and music
assets/bg/          Background images
tools/build.py      Makes the platform builds in dist/
CREDITS.txt         Asset credits and licenses (keep it in every build)
```

## Ready-made builds

| File | Use it for |
|---|---|
| `tiny-planet-defender-crazygames.zip` | Upload to the CrazyGames Developer Portal |
| `tiny-planet-defender-youtube.zip` | Send to Mediacube / YouTube Playables |
| `tiny-planet-defender-web.zip` | Your own website (cPanel) or testing |

Each zip has `index.html` at the root. The game code is identical; only the SDK script tag in `index.html` changes.

## Testing on your phone

The game uses ES modules, so it must be served over http(s). Opening `index.html` directly as a file will not work.
- Upload the **web** zip to your cPanel, extract it into a folder (for example `public_html/tpd/`), and open `https://yourdomain.com/tpd/`.

## Editing without the build script

If you edit files in Acode, edit the same files inside each build folder, or edit the source and only change the top of `index.html`:

- CrazyGames:
  `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script><script>window.PLATFORM = "crazygames";</script>`
- YouTube Playables:
  `<script src="https://www.youtube.com/game_api/v1"></script><script>window.PLATFORM = "youtube";</script>`
- Your own site: `<script>window.PLATFORM = "local";</script>`

## Tuning the game (js/main.js)

- `UPGRADES`: names, prices (`base`), price growth, max levels
- `METEOR_TYPES`: HP, speed, size, damage, crystal reward
- `buildWave()`: how many meteors per wave and when new types appear
- Boss waves: every 5th wave (`n % 5 === 0`)
- `BACKGROUNDS`: background images and their brightness (changes every 5 waves)

## Portal checklist (already built in)

**CrazyGames**
- Starts straight into gameplay, no menu wall
- `loadingStart/loadingStop`, `gameplayStart/gameplayStop`, `happytime` (boss kill)
- Rewarded ads: Revive and +50% crystals. Midgame ad on "Play again"
- Game pauses and audio mutes during ads
- Saves through `SDK.data`

**YouTube Playables (Mediacube)**
- `firstFrameReady()` while loading, `gameReady()` when playable
- `loadData()` before any `saveData()`; save is tiny (< 1 KB)
- Respects YouTube pause/resume and the audio on/off setting
- No external network calls: every file is inside the zip with relative paths
- Initial download about 2 MB; music loads after the game is ready
- Rewarded/interstitial ads used only if the SDK provides them
- Sends best wave as the score

## Credits
See `CREDITS.txt`. The music "Title Screen" by Irrational Machines is CC-BY 4.0 and **must stay credited**.
