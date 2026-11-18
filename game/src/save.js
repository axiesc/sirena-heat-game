// save.js — the localStorage save: money, story progress, weapons and ammo, health, the
// garage car and where Marco was standing. One slot, versioned key; anything unreadable is
// treated as no save rather than an error.

const SAVE_KEY = 'sirena-heat-save-v1';

export function hasSave() {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

export function saveGame(world) {
  const p = world.player;
  const data = {
    money: p.money,
    health: p.health,
    armor: p.armor,
    weapons: p.weapons,
    ammo: p.ammo,
    missionIndex: world.missions.index,
    missionsDone: world.missions.done,
    time: world.hour,
    day: world.day,
    pos: { x: p.x, z: p.z, yaw: p.yaw },
    garage: world.garage ? { type: world.garage.type, color: world.garage.color } : null,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function loadGame(world) {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }
  if (!data) return false;
  const p = world.player;
  p.money = data.money | 0;
  p.health = Math.min(100, data.health ?? 100);
  p.armor = Math.min(100, data.armor ?? 0);
  p.weapons = data.weapons || { fists: true };
  p.ammo = data.ammo || { pistol: 0, smg: 0 };
  p.weapon = p.weapons.smg ? 'smg' : p.weapons.pistol ? 'pistol' : 'fists';
  world.missions.index = data.missionIndex | 0;
  world.missions.done = !!data.missionsDone;
  world.hour = data.time ?? 10;
  world.day = data.day ?? 1;
  if (data.pos) { p.x = data.pos.x; p.z = data.pos.z; p.yaw = data.pos.yaw || 0; }
  world.pendingGarage = data.garage || null;
  return true;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
