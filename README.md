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
| Shift | Sprint | Nitro | Descend |
| E | Interact · hold to rob, cut alarms, loop cameras | Sell at Rusty's | |
| F | Steal / enter a vehicle | Get out | Get out / bail out |
| Q, 1–6 | Weapons | | |
| G | Smoke bomb | Spike strip | |
| T · B | Grenade · C4 | | |
| H | Medkit | | |
| C | Camera: isometric · top-down · 3rd person | | |
| M | City map | | |
| Esc · N | Pause · sound | | |

## Code layout

| File | What it does |
| --- | --- |
| `js/core.js` | Math helpers, input, particles, floating text |
| `js/audio.js` | Synthesized audio: effects, sirens, engine, rotor, ambience, chase music |
| `js/world.js` | City generation, road graph, Ring Highway, zones, collisions, minimap |
| `js/actors.js` | Characters, pedestrians, cops, weapons, bullets, pickups |
| `js/vehicles.js` | Car/bike physics, traffic and police AI, roadblocks, explosions |
| `js/game.js` | Heat, crimes, security, robberies, shop, story missions, spawning |
| `js/air.js` | Helicopters (police + flyable), parachutes, rockets, grenades, C4 |
| `js/weather.js` | Dynamic weather |
| `js/main.js` | Camera, HUD, minimap, controls, main loop |
| `js/autotest.js` | In-page automated tests |

## Tests

`index.html?autotest` runs the automated checks in the page and prints PASS/FAIL for each. To run them headless:

```bash
tools/run-tests.sh                 # all checks
tools/run-tests.sh "rob|heat"      # only checks whose name matches a regex
```

The script uses Google Chrome (set `CHROME` to point at another Chromium-based browser).
