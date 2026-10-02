# Night Defenders: Monster Tower Defense — sources

- `sim.js`: the rules (maps, waves, towers, enemies, Endless). No DOM, seeded RNG only.
- `view.js`: three.js drawing, input, map select, saves. Reads `sim.state`, drains `sim.events`.
- `shell.html` + `vendor/`: CSS, DOM and the inlined fonts and three.js r128.
- `python3 build.py` → `out.html`, the single file that gets published.

## Tools
- `node bot.js garden|patch|roof|endless [runs]`: the balance table for a map.
- `LEAKS=1 node bot.js patch`: which wave and helper blow out candles under the mixed plan.
- `TWEAK='frank.jumpR=2' node bot.js roof`: try a tower stat without editing `sim.js`.
- `node test_maps.js`, `node test_ring.js`, `node test_levels.js`: Playwright screenshots (swiftshader).
  Use `__game.play('patch', false)` / `__game.play(null, true)` to jump into a map or Endless.

## Step 2 (2 Oct)
- **Maps:** Garden Path (Rattle, Wisp, Vesper) → Pumpkin Patch (adds Gourdon) → Rooftop (adds Dr. Frankenstein).
  Winning a map (any stars) opens the next. Endless opens with the Garden Path won and allows all five monsters.
- **Pumpkin Patch:** three lanes back and forth, so stones between lanes reach two lanes. Start candy 300,
  HP grows 19% a wave (Garden Path 9%). 12 waves, the Sun in the last.
- **Rooftop:** plank walkway, bird- and pigeon-heavy. Start candy 400. 12 waves, the Sun in the last.
- **Dr. Frankenstein:** the zap now jumps to helpers up to 1.8 apart (was 2.4), otherwise it wins the Rooftop alone.
  Cost, damage, range, the 3-target chain and ×0.7 per jump are unchanged.
- **Endless (Garden Path):** waves made from the wave number, so they're the same for everyone. Size grows each wave;
  HP grows 9% a wave, and from wave 13 also ×1.07 a wave. The Sun comes every 10th wave with half HP and blows out
  10 candles (not 20). Score = waves cleared (every helper of the wave shooed or through) before the candles run out.
- **Saves:** stars per map and the Endless best, in localStorage (`nsd-save-1`) until Playgama cloud saves (step 3).

## Bot balance (40 runs each)

| Map | Mixed build | Random stones | Calls early | Without the new monster | Careless | Any single monster |
|---|---|---|---|---|---|---|
| Garden Path | 40/40, mostly 2★, 7.7 min | 40/40 | 40/40 | — | 6/40 | 0/40 |
| Pumpkin Patch | 40/40, 2★, 8.1 min | 40/40 | 3/40 | 23/40, mostly 1★ | 14/40 | 0/40 |
| Rooftop | 40/40, mostly 2★, 8.1 min | 40/40 | 13/40 | 7/40 | 9/40 | 0/40 |

Endless: the mixed build clears 24–26 waves in about 17 minutes; any single monster stops at 9–19 waves.
