# SIRENA HEAT — open-world crime in Sirena Bay

A 3D open-world crime game that runs in a desktop browser from static files — no build
step, no libraries, no network requests. Hand-rolled WebGL2, a full day cycle, and a small
coastal city that minds its own business until you start something.

## The story

Marco Reyes comes home to Sirena Bay after ten years away. The family hotel is failing,
his sister Lucia runs the bay's quiet economy out of a safehouse in Old Town, and El Faro —
the old lighthouse keeper turned smuggler — has decided the whole coast is his. Six chained
story missions take Marco from errand boy to the man who takes the bay back: meet the crew,
lift a collector's coupe, run a package through a pier full of Faro's boys, clear Bahía
Market in daylight, steal the toll truck under the lighthouse, and face Tito Marín at Plaza
del Sol before escaping to the Blue Hour at the marina.

## What's in the bay

- **A living city** — five districts (Downtown, Beachfront, Old Town, Marina, Hills) on a
  street grid with traffic that follows lanes and brakes for you, pedestrians who stroll,
  flee gunfire and witness crimes, palms, neon, a marina with moored boats and a lighthouse.
- **Driving** — seven car types with arcade physics and real drift, traffic to dodge,
  anything parked or driven can be entered — steal a car in front of witnesses and see.
- **The SBPD** — a five-star wanted system. Pursuit cars steer for where you'll be,
  officers get out and fight on foot, roadblocks wait at four stars, and at three a
  helicopter puts its searchlight on you; at five, its door gunner opens up.
- **Combat** — fists, a pistol and an SMG, hitscan with tracers, headshots, cover that
  genuinely works, health and armour.
- **An economy** — Sirena Arms (guns, ammo, armour), Reef Customs (repair, respray, fresh
  plates that shed heat), and the Reyes Safehouse (save, rest, next mission).
- **Sound, all synthesised** — a WebAudio engine for gunfire, crashes and sirens, and a
  four-station generative radio (island pop, reggae, synthwave, salsa) that only plays
  while you drive.
- **A day that turns** — golden-hour light, lit windows and neon after dark, a minimap with
  police blips and the gold mission beacon, and a save in localStorage.

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

## Running it

Serve `game/` with anything static, e.g. `python3 -m http.server -d game 8080`, and open
`http://localhost:8080`. The entry's hand-in program is `main.ts` at the repository root:
`MAKEFUN_OUTPUT_DIR=out node main.ts` copies the game and screenshots into `out/` and
writes the dossier.

Staged scenes for screenshots: `game/index.html?shot=cover|chase|mission|night&seed=1`
builds the world from the seed, plays the real simulation forward a fixed number of steps
and freezes on the composed frame.

## Layout

- `main.ts` — the hand-in program (plumbing only).
- `vendor/makefun-game.ts` — the vendored make.fun dossier library, unchanged.
- `game/src/` — the game itself, one module per system: `gl` and `renderer` (WebGL2,
  mesh building, sky and lighting), `citygen` (the city), `world` (the simulation),
  `player`, `vehicles`, `traffic`, `pedestrians`, `police`, `helicopter`, `wanted`,
  `weapons`, `missions` + `story`, `shops`, `hud`, `minimap`, `radio`, `audio`,
  `input`, `save`, `shots`, `models`, `math3d`, `rng`, `textures`.

## License

MIT — see `LICENSE`.
