# Loot Run

An isometric open-world crime caper built with [three.js](https://threejs.org/). Rob anything in the city of Bayhaven, cut alarms and loop cameras, buy gear, and choose your getaway: the fast six-lane Ring Highway, narrow alleys, Forest Park, rooftops or the sky.

Everything (city, models, sounds, music) is generated in code. There are no asset files.

## Play

Open `index.html` in Chrome, Edge, Firefox or Safari. An internet connection is used for three.js and fonts; a local copy of three.js in `vendor/` is used if the CDN is unreachable.

Progress saves in your browser after every story job.

## Controls

| Key | On foot | Car / bike | Helicopter |
| --- | --- | --- | --- |
| WASD | Move | Drive | Fly / turn |
| Mouse | Aim (3rd person: look) | | |
| Click | Attack / shoot | | |
| Space | Jump · vault · mantle · open parachute | Handbrake (BMX: hop) | Climb |
| Shift | Sprint (uses stamina) | Nitro | Descend |
| E | Interact · hold to rob, cut alarms, loop cameras | Sell at Rusty's | |
| F | Steal / enter a vehicle | Get out | Get out / bail out |
| Q, 1–6 | Weapons | | |
| G | Smoke bomb | Spike strip | |
| T · B | Grenade · C4 | | |
| H | Medkit | | |
| C | Camera: isometric · top-down · 3rd person | | |
| M | Map: click to set a waypoint, right-click to teleport, scroll to zoom | | |
| Esc · N · V | Pause · sound on/off · voices on/off | | |

Planes and jets: W/S throttle, build speed on the runway, Space to pull up, Shift to dive, A/D to bank; land and brake (S) to get out. Click fires the gun on police choppers, gunships and fighter jets. Next to the county train, E climbs on; Space jumps off.

## Code layout

| File | What it does |
| --- | --- |
| `js/core.js` | Math helpers, input, particles, floating text |
| `js/audio.js` | Audio engine: recorded effects with positional mixing, looping sirens/engines/rotor/ambience, chase music; synthesized fallback |
| `js/voice.js` | Spoken lines: Vera's briefings, shouts from people and cops, police radio chatter with street names |
| `js/voicedata.js` | The spoken lines, embedded as MP3 (generated — see Voices below) |
| `js/sfxdata.js` | The recorded sounds, embedded as MP3 (generated — see Sound below) |
| `js/world.js` | City generation, road graph, Ring Highway, zones, collisions, minimap |
| `js/outer.js` | The county outside the city: country roads, roundabout, farms, woods, the airport, Mirror Lake, the Bay River and bridges, Pine Ridge and its tunnel, the railway |
| `js/actors.js` | Characters, pedestrians, cops, weapons, bullets, pickups |
| `js/vehicles.js` | Car/bike physics, traffic and police AI, roadblocks, explosions |
| `js/game.js` | Heat, crimes, security, robberies, shop, story missions, spawning |
| `js/train.js` | The county train: runs the rail loop, stops at stations, carries riders on its roof, hits what's on the line |
| `js/air.js` | Helicopters (police + flyable), parachutes, rockets, grenades, C4 |
| `js/weather.js` | Dynamic weather |
| `js/main.js` | Camera, HUD, minimap, controls, main loop |
| `js/autotest.js` | In-page automated tests |

## Sound

The sound effects are public-domain (CC0) recordings from [Freesound](https://freesound.org), listed in [CREDITS.md](CREDITS.md). `tools/sfx-manifest.json` says which recording each in-game sound uses and how it is trimmed; `python3 tools/build-sfx.py` downloads them, confirms each one's CC0 license, trims, normalises and loops them, and writes `js/sfxdata.js` (embedded so the game still works when opened straight from disk). To swap a sound, change its `id` in the manifest and rebuild.

## Voices

Vera's briefings, people's shouts and the police radio are spoken lines generated with the open [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) text-to-speech model (Apache-2.0). The lines live in `tools/voice-lines.json` (Vera's are read from the missions in `js/game.js`); to regenerate `js/voicedata.js` after changing them:

```bash
uv run --python 3.12 --with kokoro-onnx --with soundfile tools/build-voice.py --model DIR
```

where `DIR` holds `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the [kokoro-onnx model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).

## Tests

`index.html?autotest` runs the automated checks in the page and prints PASS/FAIL for each. To run them headless:

```bash
tools/run-tests.sh                 # all checks
tools/run-tests.sh "rob|heat"      # only checks whose name matches a regex
```

The script uses Google Chrome (set `CHROME` to point at another Chromium-based browser).
