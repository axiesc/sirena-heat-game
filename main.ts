// SIRENA HEAT — hand-in program for the make.fun gta6-01 bounty (Node 22, standard library only).
//
// The game itself is the game/ folder next to this file: plain static files (an index.html and
// its ES modules) that a desktop browser runs fully offline. This program's whole job is the
// hand-in: copy game/ and screenshots/ into the output directory and write dossier.json there
// with the vendored make.fun library, exactly as the bounty asks. It does nothing else — no
// timestamps, no randomness — so two runs over the same repository produce byte-identical
// output.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The caps are the scorer's own (see the kit's gate): the dossier text is shaped by
// text_max_bytes; the rest refuse anything the scorer would refuse — more than 4 screenshots
// or one over 256 KiB, more than 993 files or 48 MiB under game/, or a game path over
// 1,000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
