# Builds night-shift-defense.html from the sources. python3 build.py
import os
here = os.path.dirname(os.path.abspath(__file__))
r = lambda p: open(os.path.join(here, p), encoding='utf-8').read()
s = r('shell.html').replace('{{FONTS}}', r('vendor/fonts.html')).replace('{{THREE}}', r('vendor/three.html')).replace('{{SIM}}', r('sim.js')).replace('{{PLATFORM}}', r('platform.js')).replace('{{VIEW}}', r('view.js'))
open(os.path.join(here, 'out.html'), 'w', encoding='utf-8').write(s)
print('out.html', len(s), 'bytes')
# the Playgama upload: a zip with index.html at its root
import zipfile
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
with zipfile.ZipFile(os.path.join(here, 'dist', 'night-defenders.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('index.html', s)
    z.write(os.path.join(here, 'playgama-bridge-config.json'), 'playgama-bridge-config.json')   # the Bridge loads it from next to index.html
print('dist/night-defenders.zip')
