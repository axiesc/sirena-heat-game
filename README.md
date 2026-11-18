# SIRENA HEAT — open-world crime in Sirena Bay

[![make.fun bounty: gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
![make.fun rank](https://make.fun/badge/gta6-01/axiesc/sirena-heat-game/rank.svg)
![make.fun reward](https://make.fun/badge/gta6-01/axiesc/sirena-heat-game/reward.svg)

Submitted to the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

**SIRENA HEAT** is a 3D open-world crime game that runs in a desktop browser from plain
static files. No build step, no libraries, no network requests — just a hand-rolled WebGL2
engine, a small coastal city with a full day cycle, and a bay that minds its own business
until you start something.

You are **Marco Reyes**, home in Sirena Bay after ten years away. Explore the whole city on
foot or behind the wheel from the first minute, work the six-mission story, build a wanted
level the SBPD answers with interceptors, roadblocks and a helicopter — or just cruise the
beachfront at golden hour with the radio on.

## The story

The Reyes family hotel is failing. Marco's sister Lucia runs the bay's quiet economy out of
a safehouse in Old Town, and El Faro — the old lighthouse keeper turned smuggler — has
decided the whole coast belongs to him. Six chained story missions take Marco from errand
boy to the man who takes the bay back: meet the crew, lift a collector's coupe, run a
package through a pier full of Faro's boys, clear Bahía Market in daylight, steal the toll
truck under the lighthouse, and face Tito Marín at Plaza del Sol before escaping to the
Blue Hour at the marina.

## What's in the bay

- **A living city** — a 7×7 grid of city blocks (46 m blocks on a 62 m pitch, 16 m roads)
  across five districts: Downtown, Beachfront, Old Town, Marina and the Hills. Palms, neon,
  moored boats, a working lighthouse, lit windows after dark, and a minimap with police
  blips and the gold mission beacon.
- **Driving and carjacking** — seven vehicle types (sedan, hatch, coupe, pickup, van, taxi
  and the SBPD Interceptor) with arcade physics and real drift. Any parked or driven car
  can be entered — steal one in front of witnesses and see what happens.
- **Traffic and pedestrians** — traffic follows lanes, brakes for you and flees a crash;
  pedestrians stroll, panic at gunfire, and witness crimes, which is how heat starts.
- **The SBPD and the wanted system** — a five-star wanted level. Pursuit cars steer for
  where you *will* be, officers get out and fight on foot, roadblocks wait at four stars,
  at three stars a helicopter puts its searchlight on you, and at five its door gunner
  opens up. Break line of sight, swap into a clean car or get fresh plates to cool down.
- **Combat** — fists, a pistol and an SMG: hitscan with tracers, headshots, cover that
  genuinely works, health and armour.
- **Shops and an economy** — Sirena Arms (guns, ammo, armour), Reef Customs (repairs,
  resprays, fresh plates that shed heat) and the Reyes Safehouse (rest, save, and pick up
  the next mission).
- **Radio and sound, all synthesised** — a WebAudio engine for gunfire, crashes, engines
  and sirens, plus a four-station generative radio (island pop, reggae, synthwave, salsa)
  that only plays while you drive. No audio files anywhere.
- **Save anywhere** — progress, money, weapons and story state persist in the browser's
  localStorage; Continue picks up right where you left off.
- **A day that turns** — a keyframed 24-hour sky: dawn haze, hard noon light, golden hour,
  and a neon night, all computed from the in-game clock.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse (click to lock) | Camera |
| Shift | Sprint |
| Space | Handbrake |
| F | Enter / exit car |
| E | Talk / shop |
| Mouse click | Attack / shoot |
| Right mouse | Aim |
| Q | Switch weapon |
| R | Radio station (in a car) |
| P / Esc | Pause |

## How to run

The game is static files — serve the `game/` folder with anything and open it in a desktop
browser:

```sh
python3 -m http.server -d game 8080
# then open http://localhost:8080
```

Any static file server works (or your editor's "open in browser" preview, as long as ES
modules load over `http://` — opening `game/index.html` via `file://` will not work in most
browsers because module scripts require a server origin).

The repository root also carries the make.fun hand-in program, `main.ts` (Node, standard
library only):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` and writes the entry's `dossier.json`
there with the vendored library in `vendor/`. It does nothing else — no timestamps, no
randomness — so two runs over the same repository produce byte-identical output.

Staged screenshot scenes: `game/index.html?shot=cover|chase|mission|night&seed=1` builds
the world from the seed, plays the real simulation forward a fixed number of steps and
freezes on the composed frame — the chase really is four stars of SBPD behind a coupe, the
mission scene really is the pier at golden hour.

## Tech notes

- **Rendering** — a hand-rolled WebGL2 engine: one static mesh batch for the whole city,
  one dynamic batch rebuilt per frame, flat-shaded vertex colours everywhere, and a single
  canvas-painted radial sprite for every additive glow (lamps, headlights, muzzle flashes,
  the helicopter searchlight). The only texture in the game is that glow sprite.
- **Code** — plain ES modules under `game/src/`, one module per system (see Layout below).
  No dependencies, no bundler, no transpiler: what you read is what the browser runs.
- **Offline by construction** — the game makes zero network requests; fonts, audio and
  textures are all generated at boot. It runs from a USB stick.
- **Simulation** — a fixed 60 Hz timestep with a seeded RNG, so the staged scenes, the
  title orbit and the live game all agree, and a scene re-renders identically every time.
- **Persistence** — saves live in `localStorage` under a single key; nothing leaves the
  machine.

## Layout

- `main.ts` — the hand-in program (plumbing only).
- `vendor/makefun-game.ts` — the vendored make.fun dossier library, unchanged.
- `game/index.html` — the page, HUD and menus.
- `game/src/` — the game itself, one module per system:
  - `gl` and `renderer` — WebGL2 plumbing, mesh building, sky and the lighting model.
  - `citygen` — the 7×7 city: districts, roads, buildings, colliders, landmarks.
  - `world` — the simulation core and per-frame scene building.
  - `player`, `vehicles`, `traffic`, `pedestrians` — Marco, the seven car types, lane
    traffic and the crowd.
  - `police`, `helicopter`, `wanted` — pursuit AI, the searchlight, the five-star system.
  - `weapons`, `missions`, `story` — combat and the six-mission campaign.
  - `shops`, `hud`, `minimap` — the economy and everything on screen.
  - `radio`, `audio` — the four-station generative radio and the synth sound engine.
  - `input`, `save`, `shots` — controls, localStorage saves, the staged scenes.
  - `models`, `math3d`, `rng`, `textures` — car/ped geometry, maths, the seeded RNG and
    the glow sprite.

## License

MIT — see `LICENSE`.
