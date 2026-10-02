# Builds night-shift-defense.html from the sources. python3 build.py
import os
here = os.path.dirname(os.path.abspath(__file__))
r = lambda p: open(os.path.join(here, p), encoding='utf-8').read()
s = r('shell.html').replace('{{FONTS}}', r('vendor/fonts.html')).replace('{{THREE}}', r('vendor/three.html')).replace('{{SIM}}', r('sim.js')).replace('{{VIEW}}', r('view.js'))
open(os.path.join(here, 'out.html'), 'w', encoding='utf-8').write(s)
print('out.html', len(s), 'bytes')
