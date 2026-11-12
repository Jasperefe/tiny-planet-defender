#!/usr/bin/env python3
"""Build platform-specific copies of the game.

Creates:
  dist/crazygames/   + dist/tiny-planet-defender-crazygames.zip
  dist/youtube/      + dist/tiny-planet-defender-youtube.zip
  dist/web/          + dist/tiny-planet-defender-web.zip   (your own website / cPanel)

The only differences are the SDK <script> tag and window.PLATFORM in index.html.
If esbuild is available (ESBUILD env var or on PATH), three.js files are minified.
"""
import os
import shutil
import subprocess
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
INCLUDE = ['index.html', 'css', 'js', 'lib', 'assets', 'CREDITS.txt']

PLATFORMS = {
    'crazygames': '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n'
                  '<script>window.PLATFORM = "crazygames";</script>',
    'youtube': '<script src="https://www.youtube.com/game_api/v1"></script>\n'
               '<script>window.PLATFORM = "youtube";</script>',
    'web': '<script>window.PLATFORM = "local";</script>',
}

ESBUILD = os.environ.get('ESBUILD') or shutil.which('esbuild')


def minify_js(folder):
    if not ESBUILD:
        print('  esbuild not found: skipping minify')
        return
    for base, _, files in os.walk(folder):
        for f in files:
            if f.endswith('.js'):
                p = os.path.join(base, f)
                subprocess.run([ESBUILD, p, '--minify', '--format=esm', '--log-level=error',
                                '--allow-overwrite', '--outfile=' + p], check=True)


def build(name, sdk_tag):
    out = os.path.join(DIST, name)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for item in INCLUDE:
        src = os.path.join(ROOT, item)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(out, item))
        elif os.path.exists(src):
            shutil.copy(src, out)
    minify_js(os.path.join(out, 'lib'))
    html_path = os.path.join(out, 'index.html')
    with open(html_path, encoding='utf-8') as fh:
        html = fh.read()
    html = html.replace('<!--PLATFORM_SDK-->', sdk_tag)
    with open(html_path, 'w', encoding='utf-8') as fh:
        fh.write(html)
    # Zip with index.html at the root (what CrazyGames and YouTube expect)
    zip_path = os.path.join(DIST, f'tiny-planet-defender-{name}.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(out):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, out))
    size = sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(out) for f in fs)
    print(f'  {name}: {size / 1024 / 1024:.2f} MB unzipped, zip {os.path.getsize(zip_path) / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    os.makedirs(DIST, exist_ok=True)
    for name, tag in PLATFORMS.items():
        build(name, tag)
