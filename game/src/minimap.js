// minimap.js — the round map in the corner: Sirena Bay from above, north up, Marco at the
// centre. Water, land, the street grid and the beach are drawn from the same constants the
// city was built with; on top go the shops, the traffic, the SBPD (flashing, as they do),
// the gold mission marker, and Marco's own arrow.

import { STREET_CENTERS } from './citygen.js';
import { SHOP_ZONES } from './shops.js';
import { dist2D } from './math3d.js';

const RANGE = 150; // metres from centre to rim
const SHOP_COLORS = { arms: '#ffb84d', customs: '#35e0d0', safehouse: '#7ddb6a' };

export function drawMinimap(ctx, world) {
  const size = 172, centre = size / 2, scale = (centre - 4) / RANGE;
  const p = world.player;
  const toMap = (x, z) => [centre + (x - p.x) * scale, centre + (z - p.z) * scale];
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(centre, centre, centre - 1, 0, Math.PI * 2);
  ctx.clip();
  // Water, then the island, then the sand.
  ctx.fillStyle = '#14425e';
  ctx.fillRect(0, 0, size, size);
  const [lx0, lz0] = toMap(-8, -46);
  const [lx1, lz1] = toMap(500, 488);
  ctx.fillStyle = '#2c3436';
  ctx.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
  const [bx0, bz0] = toMap(-60, 484);
  const [bx1, bz1] = toMap(500, 540);
  ctx.fillStyle = '#8a7a52';
  ctx.fillRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
  // Streets.
  ctx.strokeStyle = '#565e66';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const c of STREET_CENTERS) {
    const [vx, vzTop] = toMap(c, -6);
    const [, vzBot] = toMap(c, 456);
    ctx.moveTo(vx, vzTop); ctx.lineTo(vx, vzBot);
    const [hzLeft, hz] = toMap(-6, c);
    const [hzRight] = toMap(456, c);
    ctx.moveTo(hzLeft, hz); ctx.lineTo(hzRight, hz);
  }
  ctx.stroke();
  // Shops.
  for (const zone of SHOP_ZONES) {
    const [sx, sz] = toMap(zone.x, zone.z);
    if (sx < -6 || sx > size + 6 || sz < -6 || sz > size + 6) continue;
    ctx.fillStyle = SHOP_COLORS[zone.id] || '#fff';
    ctx.fillRect(sx - 3, sz - 3, 6, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 3, sz - 3, 6, 6);
  }
  // Traffic.
  ctx.fillStyle = '#c8ccd2';
  for (const car of world.cars) {
    if (car.driver === 'police' || car.driver === 'player') continue;
    if (dist2D(car.x, car.z, p.x, p.z) > RANGE) continue;
    const [cx, cz] = toMap(car.x, car.z);
    ctx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
  }
  // Police: flashing blue/red, ringed so they read at a glance.
  const flashBlue = Math.floor(world.time * 2.4) % 2 === 0;
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    if (dist2D(car.x, car.z, p.x, p.z) > RANGE) continue;
    const [cx, cz] = toMap(car.x, car.z);
    ctx.fillStyle = flashBlue ? '#3f8cff' : '#ff4040';
    ctx.beginPath(); ctx.arc(cx, cz, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }
  for (const ped of world.peds) {
    if (ped.kind !== 'officer' || ped.state === 'down') continue;
    if (dist2D(ped.x, ped.z, p.x, p.z) > RANGE) continue;
    const [cx, cz] = toMap(ped.x, ped.z);
    ctx.fillStyle = flashBlue ? '#3f8cff' : '#ff4040';
    ctx.beginPath(); ctx.arc(cx, cz, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  // The helicopter, when it is up.
  if (world.heli.active) {
    const [hx, hz] = toMap(world.heli.x, world.heli.z);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('H', hx, hz + 3);
  }
  // The objective: a gold diamond, clamped to the rim when it is far away.
  if (world.objective) {
    let [ox, oz] = toMap(world.objective.x, world.objective.z);
    const dx = ox - centre, dz = oz - centre;
    const d = Math.hypot(dx, dz);
    if (d > centre - 10) { ox = centre + (dx / d) * (centre - 10); oz = centre + (dz / d) * (centre - 10); }
    ctx.save();
    ctx.translate(ox, oz);
    ctx.rotate(Math.PI / 4);
    const pulse = 4.6 + Math.sin(world.time * 4) * 0.8;
    ctx.fillStyle = '#ffc23d';
    ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.strokeStyle = '#7a5200';
    ctx.strokeRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.restore();
  }
  // Marco's arrow.
  const yaw = p.inCar ? p.inCar.yaw : p.camYaw;
  ctx.save();
  ctx.translate(centre, centre);
  ctx.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // North marker.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', centre, 14);
}
