// hud.js — everything drawn over the 3D world: the wanted stars, money and clock, health
// and armour, the weapon readout, the objective line with its distance, prompts, dialogue,
// toasts, mission banners, the busted meter, the damage vignette, the shop menu and the
// title / pause / end screens. The world talks to it through world.ui (toast + banner);
// this module reads the world back once a frame and keeps the DOM honest.

import { WEAPONS } from './weapons.js';
import { MISSIONS, CHARACTERS } from './story.js';
import { CAR_TYPES } from './models.js';
import { nearestShop, shopItems, buyItem } from './shops.js';
import { nearestEnterableCar } from './player.js';
import { drawMinimap } from './minimap.js';
import { dist2D } from './math3d.js';

function el(id) { return document.getElementById(id); }

export class Hud {
  constructor(world, callbacks) {
    this.world = world;
    this.cb = callbacks;
    this.shopZone = null;
    this.bannerTimer = null;
    this.mapCtx = el('minimap').getContext('2d');
    world.ui.toast = (msg) => this.toast(msg);
    world.ui.banner = (title, sub) => this.banner(title, sub);
    el('btnNew').addEventListener('click', () => callbacks.onNew());
    el('btnContinue').addEventListener('click', () => callbacks.onContinue());
    el('btnResume').addEventListener('click', () => callbacks.onResume());
    el('btnSave').addEventListener('click', () => callbacks.onSave());
    el('btnQuitTitle').addEventListener('click', () => callbacks.onQuitTitle());
    el('btnRespawn').addEventListener('click', () => callbacks.onRespawn());
    window.addEventListener('keydown', (e) => {
      if (!this.shopZone) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5) this.buyByIndex(n - 1);
    });
  }

  get shopOpen() { return this.shopZone !== null; }

  toast(msg) {
    const box = el('toasts');
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    box.appendChild(div);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 4200);
  }

  banner(title, sub) {
    el('bannerTitle').textContent = title;
    el('bannerSub').textContent = sub || '';
    const banner = el('banner');
    banner.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => banner.classList.remove('show'), 3400);
  }

  // -- Screens -------------------------------------------------------------------------

  showTitle(hasSave) {
    el('titleScreen').classList.remove('hidden');
    el('btnContinue').classList.toggle('hidden', !hasSave);
    el('hud').classList.add('hidden');
    el('pauseScreen').classList.add('hidden');
    el('endScreen').classList.add('hidden');
  }

  startGame() {
    el('titleScreen').classList.add('hidden');
    el('pauseScreen').classList.add('hidden');
    el('endScreen').classList.add('hidden');
    el('hud').classList.remove('hidden');
  }

  showPause() { el('pauseScreen').classList.remove('hidden'); }
  hidePause() { el('pauseScreen').classList.add('hidden'); }

  showEnd(kind) {
    const title = el('endTitle');
    title.textContent = kind === 'busted' ? 'Busted' : 'Wasted';
    title.className = 'screenTitle ' + kind;
    el('endSub').textContent = kind === 'busted'
      ? 'Capt. Ruiz sends her regards. The SBPD took their cut of your cash.'
      : "Vera's people dragged you home and patched you up. It cost you.";
    el('endScreen').classList.remove('hidden');
  }

  hideEnd() { el('endScreen').classList.add('hidden'); }

  // -- Shop ------------------------------------------------------------------------------

  openShop(zone) {
    this.shopZone = zone;
    el('shopMenu').classList.remove('hidden');
    this.renderShop();
  }

  closeShop() {
    this.shopZone = null;
    el('shopMenu').classList.add('hidden');
  }

  renderShop() {
    if (!this.shopZone) return;
    const world = this.world;
    el('shopTitle').textContent = this.shopZone.name;
    el('shopMoney').textContent = `Cash: $${world.player.money}`;
    const items = shopItems(world, this.shopZone);
    const box = el('shopItems');
    box.innerHTML = '';
    items.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = 'shopItem';
      btn.disabled = !item.enabled || world.player.money < item.price;
      btn.innerHTML = `<span>${idx + 1}. ${item.label}<span class="hint">${item.hint}</span></span><span class="price">${item.price > 0 ? '$' + item.price : 'FREE'}</span>`;
      btn.addEventListener('click', () => this.buyByIndex(idx));
      box.appendChild(btn);
    });
  }

  buyByIndex(idx) {
    if (!this.shopZone) return;
    const items = shopItems(this.world, this.shopZone);
    const item = items[idx];
    if (!item) return;
    const msg = buyItem(this.world, this.shopZone, item.id);
    this.toast(msg);
    this.renderShop();
  }

  // -- Per-frame -------------------------------------------------------------------------

  update() {
    const world = this.world;
    const p = world.player;
    if (el('hud').classList.contains('hidden')) return;
    // Stars.
    const stars = world.wanted.stars;
    let starHtml = '';
    for (let i = 0; i < 5; i += 1) starHtml += i < stars ? '★' : '<span class="off">★</span>';
    const starsEl = el('stars');
    starsEl.innerHTML = starHtml;
    starsEl.classList.toggle('seen', world.police.seesPlayer && stars > 0);
    el('money').textContent = '$' + p.money;
    const hh = Math.floor(world.hour);
    const mm = Math.floor((world.hour - hh) * 60);
    el('clock').textContent = `Day ${world.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · Sirena Bay`;
    el('healthFill').style.width = `${Math.max(0, p.health)}%`;
    el('armorFill').style.width = `${Math.max(0, p.armor)}%`;
    const spec = WEAPONS[p.weapon];
    el('weaponName').textContent = p.inCar ? 'Driving' : spec.label;
    el('ammo').textContent = !p.inCar && spec.ammoType ? `${p.ammo[spec.ammoType]} rounds` : '';
    el('district').textContent = world.districtAt(p.x, p.z);
    // Objective.
    const missions = world.missions;
    const mission = missions.active || MISSIONS[missions.index];
    el('missionName').textContent = missions.done
      ? 'Free Roam — Sirena Bay is yours'
      : missions.state === 'active' ? mission.title : `Next: ${mission ? mission.title : ''}`;
    const objEl = el('objective');
    if (world.objective) {
      const d = Math.round(dist2D(p.x, p.z, world.objective.x, world.objective.z));
      objEl.innerHTML = `${world.objective.label} <span class="dist">${d}m</span>`;
    } else if (world.dialogue) {
      objEl.textContent = '';
    } else {
      objEl.textContent = missions.done ? 'Shops stay open. The bay is yours.' : '';
    }
    // Dialogue.
    const dlg = el('dialogue');
    if (world.dialogue) {
      dlg.classList.remove('hidden');
      const who = CHARACTERS[world.dialogue.who] || { name: world.dialogue.who, color: '#fff' };
      const nameEl = el('dlgName');
      nameEl.textContent = who.name;
      nameEl.style.color = who.color;
      el('dlgText').textContent = world.dialogue.text;
    } else dlg.classList.add('hidden');
    // Prompt.
    const prompt = el('prompt');
    let promptHtml = '';
    if (!this.shopOpen && world.mode === 'play' && !world.endState) {
      const shop = nearestShop(world);
      if (shop) promptHtml = `<b>E</b> ${shop.name}`;
      else if (!p.inCar) {
        const car = nearestEnterableCar(world);
        if (car) promptHtml = `<b>F</b> Enter ${CAR_TYPES[car.type].label}${car.driver === 'traffic' ? ' — steal it' : ''}`;
      }
    }
    if (promptHtml) { prompt.innerHTML = promptHtml; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
    // Busted meter.
    const bw = el('bustedWrap');
    if (world.wanted.busted > 0.02) {
      bw.classList.remove('hidden');
      el('bustedFill').style.width = `${Math.round(world.wanted.busted * 100)}%`;
    } else bw.classList.add('hidden');
    // Vignette + crosshair.
    const lowHealth = p.health < 28 && !p.dead ? 0.22 + 0.1 * Math.sin(world.time * 5) : 0;
    el('vignette').style.opacity = String(Math.min(0.85, world.damageFlash * 0.5 + lowHealth));
    el('crosshair').style.display = !p.inCar && world.mode === 'play' ? 'block' : 'none';
    drawMinimap(this.mapCtx, world);
  }
}
