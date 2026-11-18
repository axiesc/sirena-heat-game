// shops.js — the bay's three useful doors. Sirena Arms sells the guns and the bullets;
// Reef Customs repairs, resprays and — for a price — fits fresh plates that make the heat
// forget a car; the Reyes Safehouse saves the game and lets Marco sleep the clock forward.
// Items are computed fresh each time the menu opens, so prices always match the state of
// the car, the wallet and the wanted level.

import { placeById } from './citygen.js';
import { CAR_COLORS } from './models.js';
import { clearWanted } from './wanted.js';
import { saveGame } from './save.js';
import { dist2D } from './math3d.js';

export const SHOP_ZONES = [
  { id: 'arms', name: 'Sirena Arms', place: 'arms', r: 4.5, needsCar: false },
  { id: 'customs', name: 'Reef Customs', place: 'customs', r: 9, needsCar: true },
  { id: 'safehouse', name: 'Reyes Safehouse', place: 'safehouse', r: 5, needsCar: false },
];

for (const zone of SHOP_ZONES) {
  const place = placeById(zone.place);
  zone.x = place.x; zone.z = place.z;
}

/** The shop Marco is standing (or sitting) in range of, or null. */
export function nearestShop(world) {
  const p = world.player;
  for (const zone of SHOP_ZONES) {
    if (zone.needsCar && !p.inCar) continue;
    if (!zone.needsCar && p.inCar) continue;
    if (dist2D(p.x, p.z, zone.x, zone.z) < zone.r) return zone;
  }
  return null;
}

export function shopItems(world, zone) {
  const p = world.player;
  if (zone.id === 'arms') {
    return [
      { id: 'pistol', label: 'Pistol', price: 250, enabled: !p.weapons.pistol, hint: p.weapons.pistol ? 'Owned' : 'A honest sidearm' },
      { id: 'smg', label: 'SMG', price: 600, enabled: !p.weapons.smg, hint: p.weapons.smg ? 'Owned' : 'For serious conversations' },
      { id: 'ammoPistol', label: 'Pistol ammo ×24', price: 40, enabled: p.weapons.pistol, hint: p.weapons.pistol ? `${p.ammo.pistol} carried` : 'Needs the pistol' },
      { id: 'ammoSmg', label: 'SMG ammo ×60', price: 70, enabled: p.weapons.smg, hint: p.weapons.smg ? `${p.ammo.smg} carried` : 'Needs the SMG' },
      { id: 'armor', label: 'Body armor', price: 200, enabled: p.armor < 100, hint: `Armor at ${Math.round(p.armor)}%` },
    ];
  }
  if (zone.id === 'customs') {
    const car = p.inCar;
    const damage = car ? Math.round(100 - car.health) : 0;
    return [
      { id: 'repair', label: 'Repair', price: 40 + damage * 2, enabled: !!car && damage > 0, hint: car ? `${damage}% damaged` : 'Drive in first' },
      { id: 'respray', label: 'Respray', price: 80, enabled: !!car, hint: 'A new colour, a new car' },
      { id: 'plates', label: 'Fresh plates', price: 120 * Math.max(1, world.wanted.stars), enabled: world.wanted.stars > 0, hint: world.wanted.stars > 0 ? `Lose ${world.wanted.stars}★ of heat` : 'No heat to lose' },
    ];
  }
  return [
    { id: 'save', label: 'Save game', price: 0, enabled: true, hint: 'Write it all down' },
    { id: 'rest', label: 'Rest until morning', price: 0, enabled: true, hint: 'Heal up; the bay sleeps too' },
  ];
}

/** Applies a purchase; returns a message for the toast line. */
export function buyItem(world, zone, itemId) {
  const p = world.player;
  const item = shopItems(world, zone).find((i) => i.id === itemId);
  if (!item) return 'Not for sale';
  if (!item.enabled) return item.hint;
  if (p.money < item.price) { world.sound.dryFire(); return 'Not enough cash'; }
  p.money -= item.price;
  if (item.price > 0) world.sound.cash();
  switch (itemId) {
    case 'pistol': p.weapons.pistol = true; p.ammo.pistol += 24; p.weapon = 'pistol'; return 'Pistol bought — Q switches weapons';
    case 'smg': p.weapons.smg = true; p.ammo.smg += 60; p.weapon = 'smg'; return 'SMG bought — hold mouse to fire';
    case 'ammoPistol': p.ammo.pistol += 24; return '+24 pistol rounds';
    case 'ammoSmg': p.ammo.smg += 60; return '+60 SMG rounds';
    case 'armor': p.armor = 100; return 'Armor fitted';
    case 'repair': p.inCar.health = 100; p.inCar.dead = false; return 'Good as new';
    case 'respray': {
      let color = p.inCar.color;
      while (color === p.inCar.color) color = world.rng.pick(CAR_COLORS);
      p.inCar.color = color;
      return 'Resprayed — who is that guy?';
    }
    case 'plates': clearWanted(world); return 'Fresh plates fitted — heat forgotten';
    case 'save': saveGame(world); return 'Game saved';
    case 'rest': {
      p.health = 100;
      if (world.hour >= 20 || world.hour < 6) world.day += 1;
      world.hour = 8.5;
      saveGame(world);
      return 'Rested. A new Sirena morning.';
    }
    default: return 'Done';
  }
}
