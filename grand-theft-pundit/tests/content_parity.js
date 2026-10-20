/* content_parity.js: validates GTP.Content.parity (js/25_content_parity.js) and the v0.3 story chain.
 * Part 1 (plain node, always): loads js/20..25 in a vm sandbox and checks every table's schema, unique ids,
 *   the 35-mission requires DAG against PLAN_V03.md's "Story chain" table, and that every landmark, cast id,
 *   weapon id, mission id, station id and district referenced by the content resolves. Runs content_audit.js.
 * Part 2 (when Playwright is installed): boots index.html headless and checks the tables reach the live game
 *   (Content.parity present, the ten new missions in Missions.allMissions, their intro cutscenes registered),
 *   with no page errors.
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/content_parity.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['20_content_world', '21_content_cast', '22_content_missions', '23_content_radio', '24_content_expansion', '25_content_parity'];

let checks = 0;
const fails = [];
function ok(cond, msg) { checks++; if (!cond) fails.push(msg); }

// ---------------------------------------------------------------- load --
const sb = { console, Math, JSON };
sb.window = sb;
vm.createContext(sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sb, { filename: f + '.js' });
const Ct = sb.GTP.Content, P = Ct.parity, X = Ct.expansion;
ok(P && typeof P === 'object', 'GTP.Content.parity exists');

// ------------------------------------------------------- reference sets --
const LANDMARKS = new Set(Ct.world.landmarks.map((l) => l.id));
const PENDING = new Set(P.pendingLandmarks || []);
const DISTRICTS = new Set(Ct.world.layout.districts.map((d) => d.id));
const CAST = new Set(Object.keys(Ct.cast));
const ROLES = new Set(Object.keys((Ct.looks && Ct.looks.roles) || {}).concat(['civ', 'thug', 'cop', 'protester', 'donor', 'swat', 'hoa', 'npc', 'doorman', 'raccoon']));
const STATIONS = new Set(Ct.radio.stations.map((s) => s.id));
const VEHICLES = new Set(['sedan', 'sports', 'suv', 'truck', 'van', 'cop', 'taxi', 'bus', 'bike']);
const HAIR = new Set(['bald', 'short', 'long', 'pompadour', 'bun', 'mohawk', 'slick', 'afro', 'bob']);
const HATS = new Set(['none', 'cap', 'beanie', 'cowboy', 'fedora', 'beret', 'crown', 'helmet']);
const GLASSES = new Set(['none', 'round', 'aviator', 'thick', 'shades']);
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z][a-z0-9_]*$/;

const ALL_MISSIONS = Ct.missions.concat(X.missions.filter((m) => !Ct.missions.some((b) => b.id === m.id)));
for (const m of P.missions) if (!ALL_MISSIONS.some((a) => a.id === m.id)) ALL_MISSIONS.push(m);
const MISSION_IDS = new Set(ALL_MISSIONS.map((m) => m.id));
const lmOk = (id) => LANDMARKS.has(id) || PENDING.has(id);

function uniqueIds(list, what, key) {
  key = key || 'id';
  const seen = new Set();
  for (const x of list) {
    ok(x && typeof x[key] === 'string' && x[key].length > 0, what + ': every entry has a string ' + key);
    ok(!seen.has(x[key]), what + ': duplicate ' + key + ' ' + x[key]);
    seen.add(x[key]);
  }
  return seen;
}
function unlockOk(u, where) {
  ok(u === null || u === undefined || (typeof u === 'object' && MISSION_IDS.has(u.mission)), where + ': unlock mission resolves (' + JSON.stringify(u) + ')');
}

// --------------------------------------------------------------- weapons --
const EXISTING = ['fist', 'tableleg', 'megaphone', 'pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper', 'hottake', 'hotmic', 'ratio'];
const CLASSES = new Set(['melee', 'pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'thrown', 'launcher', 'special']);
const SLOTS = new Set(P.attachmentSlots);
const W = P.weapons;
const WIDS = uniqueIds(W, 'weapons');
ok(W.length >= 32, 'at least 32 weapons (' + W.length + ')');
for (const id of EXISTING) ok(WIDS.has(id), 'the existing weapon ' + id + ' is in the table');
ok(new Set(W.map((w) => w.name)).size === W.length, 'weapon names are unique');
for (const w of W) {
  const where = 'weapon ' + w.id;
  ok(ID.test(w.id), where + ': snake_case id');
  ok(typeof w.name === 'string' && w.name.length >= 3 && w.name.length <= 32, where + ': name length');
  ok(CLASSES.has(w.class), where + ': class ' + w.class);
  for (const k of ['dmg', 'rate', 'mag', 'reserve', 'reload', 'spread', 'recoil', 'range', 'price']) ok(typeof w[k] === 'number' && w[k] >= 0 && isFinite(w[k]), where + ': ' + k + ' is a number >= 0');
  ok(w.rate > 0 && w.range > 0, where + ': rate and range > 0');
  ok(['hitscan', 'lobbed', 'rocket'].indexOf(w.projectile) >= 0, where + ': projectile ' + w.projectile);
  ok(['none', 'one', 'two'].indexOf(w.hold) >= 0, where + ': hold ' + w.hold);
  ok(w.bloom === null || (w.bloom && w.bloom.add >= 0 && w.bloom.max >= w.bloom.add && w.bloom.decay > 0), where + ': bloom {add, max, decay}');
  ok(Array.isArray(w.attachments) && w.attachments.every((s) => SLOTS.has(s)), where + ': attachment slots valid');
  unlockOk(w.unlock, where);
  ok(typeof w.flavor === 'string' && w.flavor.length > 8, where + ': has flavor');
  if (w.mag > 0) ok(w.reload > 0 && w.reserve >= w.mag, where + ': a magazine has a reload and a reserve');
  if (w.class === 'melee') ok(w.melee === true && w.range <= 3, where + ': melee is melee and short');
  if (w.id !== 'fist') ok(w.price > 0, where + ': has a price');
  if (w.attachments.length) ok(P.attachmentsFor(w.id).length > 0, where + ': at least one attachment fits its slots');
  // sane balance: sustained damage per second (pellets are per volley)
  const dps = w.dmg * w.rate;
  ok(dps <= 300, where + ': dps ' + dps.toFixed(0) + ' <= 300');
  if (['pistol', 'smg', 'rifle', 'shotgun'].indexOf(w.class) >= 0) ok(dps >= 40, where + ': a gun does at least 40 dps (' + dps.toFixed(0) + ')');
}
// the existing twelve keep their engine numbers apart from the two documented balance fixes (shotgun, table leg)
const ENGINE = { fist: [12, 2.5, 1.7], megaphone: [0, 1.2, 6], pistol: [18, 4, 35], revolver: [40, 1.6, 45], smg: [9, 11, 30], rifle: [24, 5.5, 60], sniper: [120, 0.7, 160], hottake: [12, 1, 20], hotmic: [60, 0.8, 24], ratio: [200, 0.5, 120] };
for (const id in ENGINE) { const w = P.weaponById(id); ok(w.dmg === ENGINE[id][0] && w.rate === ENGINE[id][1] && w.range === ENGINE[id][2], 'weapon ' + id + ' keeps its v0.2 dmg/rate/range'); }
ok(P.weaponById('shotgun').dmg > 60, 'CMB-15: the shotgun kills a 60 hp ped in one volley at point blank');
ok(P.weaponById('tableleg').dmg >= 30, 'CMB-16: two table-leg hits drop a 60 hp ped');
ok(P.weaponById('pistol').unlock.mission === 'm01c_both_sides', 'the pistol is on the wall from m01c');

// ----------------------------------------------------------- attachments --
uniqueIds(P.attachments, 'attachments');
for (const a of P.attachments) {
  ok(SLOTS.has(a.slot), 'attachment ' + a.id + ': slot ' + a.slot);
  ok(a.price > 0 && a.mods && typeof a.mods === 'object', 'attachment ' + a.id + ': price and mods');
  ok(Array.isArray(a.fits) && a.fits.length && a.fits.every((c) => CLASSES.has(c)), 'attachment ' + a.id + ': fits classes');
}
for (const s of SLOTS) ok(P.attachments.some((a) => a.slot === s), 'some attachment uses slot ' + s);

// ------------------------------------------------------------------ tints --
uniqueIds(P.tints, 'tints');
ok(P.tints.length >= 8, 'at least 8 tints');
for (const t of P.tints) { ok(HEX.test(t.color), 'tint ' + t.id + ': hex colour'); ok(t.price >= 0, 'tint ' + t.id + ': price'); unlockOk(t.unlock, 'tint ' + t.id); }

// --------------------------------------------------------------- mod shop --
const MS = P.modshop;
for (const s of MS.shops) ok(lmOk(s), 'modshop shop landmark ' + s);
ok(MS.paint.colors.length >= 12 && MS.paint.colors.every((c) => HEX.test(c.hex)), 'modshop paint colours');
ok(['gloss', 'metallic', 'matte', 'chrome'].every((f) => MS.paint.finishes.some((x) => x.id === f)), 'modshop finishes gloss/metallic/matte/chrome');
const RANGES = { wheels: 5, spoiler: 3, tint: 3, engine: 4, brakes: 3, armor: 5 };
for (const k in RANGES) {
  ok(Array.isArray(MS[k]) && MS[k].length === RANGES[k] + 1, 'modshop ' + k + ' has levels 0..' + RANGES[k]);
  MS[k].forEach((lv, i) => ok(lv.level === i && typeof lv.name === 'string' && lv.price >= 0 && (i === 0 || lv.price > MS[k][i - 1].price), 'modshop ' + k + ' level ' + i + ' ordered and priced'));
}
ok(MS.turbo && MS.turbo.price > 0, 'modshop turbo');
uniqueIds(MS.horns, 'modshop horns');

// -------------------------------------------------------- clothing, barber --
const CL = P.clothing;
for (const s of CL.stores) ok(lmOk(s), 'clothing store landmark ' + s);
const ITEMS = uniqueIds(CL.items, 'clothing items');
for (const it of CL.items) {
  ok(['top', 'bottom', 'shoes', 'hat', 'glasses'].indexOf(it.slot) >= 0, 'clothing ' + it.id + ': slot');
  ok(HEX.test(it.color) && it.price > 0 && typeof it.style === 'string', 'clothing ' + it.id + ': colour, price, style');
  if (it.slot === 'hat') ok(HATS.has(it.style), 'clothing ' + it.id + ': hat style is a cast hat');
  if (it.slot === 'glasses') ok(GLASSES.has(it.style), 'clothing ' + it.id + ': glasses style is a cast glasses');
}
for (const slot of ['top', 'bottom', 'shoes', 'hat', 'glasses']) ok(CL.items.filter((i) => i.slot === slot).length >= 3, 'clothing has 3+ items for ' + slot);
uniqueIds(CL.outfits, 'outfits');
for (const o of CL.outfits) for (const slot in o.items) {
  const id = o.items[slot];
  ok(id === null || (ITEMS.has(id) && CL.items.find((i) => i.id === id).slot === slot), 'outfit ' + o.id + ': ' + slot + ' item ' + id + ' resolves to that slot');
  unlockOk(o.unlock, 'outfit ' + o.id);
}
const BB = P.barber;
for (const s of BB.stores) ok(lmOk(s), 'barber landmark ' + s);
uniqueIds(BB.styles, 'barber styles');
for (const h of HAIR) ok(BB.styles.some((s) => s.hair === h), 'barber offers hair ' + h);
for (const s of BB.styles) ok(HAIR.has(s.hair) && s.price > 0, 'barber ' + s.id + ': hair enum and price');
uniqueIds(BB.colors, 'barber colours');
for (const c of BB.colors) ok(c.hex === null || HEX.test(c.hex), 'barber colour ' + c.id + ': hex');

// ------------------------------------------------------------- properties --
uniqueIds(P.properties, 'properties');
for (const id of ['safe_dorm', 'safe_brownstone', 'safe_marina_loft', 'safe_suburb', 'safe_penthouse']) ok(P.properties.some((p) => p.id === id && p.kind === 'safehouse'), 'safehouse ' + id + ' (the plan\'s four plus the van)');
for (const p of P.properties) {
  ok(['safehouse', 'business'].indexOf(p.kind) >= 0, 'property ' + p.id + ': kind');
  ok(lmOk(p.landmark), 'property ' + p.id + ': landmark ' + p.landmark + ' resolves');
  ok(p.price >= 0 && p.income >= 0 && p.garage >= 0, 'property ' + p.id + ': numbers');
  if (p.kind === 'business') ok(p.income > 0 && p.price / p.income >= 20 && p.price / p.income <= 60, 'property ' + p.id + ': pays back in 20-60 game days');
  unlockOk(p.unlock, 'property ' + p.id);
}

// ----------------------------------------------------------------- stocks --
ok(P.stocks.length === 8, 'eight stock tickers');
uniqueIds(P.stocks, 'stocks', 'ticker');
for (const s of P.stocks) {
  ok(/^[A-Z]{3,5}$/.test(s.ticker) && s.price > 0 && s.vol > 0 && s.vol < 0.5, 'stock ' + s.ticker + ': ticker, price, vol');
  for (const mid in s.reacts) ok(MISSION_IDS.has(mid) && s.reacts[mid] > -1, 'stock ' + s.ticker + ': reacts to ' + mid + ' (a story mission, never below zero)');
}

// ------------------------------------------------------------------- golf --
ok(LANDMARKS.has(P.golf.landmark), 'golf landmark resolves');
ok(P.golf.holes.length === 9, 'nine holes');
P.golf.holes.forEach((h, i) => {
  ok(h.hole === i + 1 && h.par >= 3 && h.par <= 5 && h.displayPar === 10, 'hole ' + (i + 1) + ': numbered, par 3-5, a ten on the card');
  const len = Math.hypot(h.pin.x - h.tee.x, h.pin.z - h.tee.z);
  ok(len >= 15 && len <= 120 && typeof h.name === 'string' && typeof h.gag === 'string', 'hole ' + (i + 1) + ': tee to pin ' + len.toFixed(0) + ' m, named');
});

// ----------------------------------------------------------------- events --
ok(P.events.length >= 8, 'eight street events');
uniqueIds(P.events, 'events');
for (const e of P.events) {
  ok(e.districts.length && e.districts.every((d) => DISTRICTS.has(d)), 'event ' + e.id + ': districts resolve');
  ok(e.weight > 0 && e.reward && e.lines && e.lines.start && e.lines.win && e.lines.lose, 'event ' + e.id + ': weight, reward, lines');
  for (const v of (e.setup.vehicles || [])) ok(VEHICLES.has(v.type), 'event ' + e.id + ': vehicle type ' + v.type);
  for (const pd of (e.setup.peds || [])) ok(ROLES.has(pd.role) || CAST.has(pd.role), 'event ' + e.id + ': ped role ' + pd.role);
  for (const d of (e.setup.destinations || [])) ok(LANDMARKS.has(d), 'event ' + e.id + ': destination ' + d);
  if (e.setup.weapon) ok(WIDS.has(e.setup.weapon), 'event ' + e.id + ': weapon ' + e.setup.weapon);
}

// ------------------------------------------------------------------- jobs --
ok(P.jobs.damage_control && P.jobs.hot_take_brigade, 'both job strands');
for (const id in P.jobs) {
  const j = P.jobs[id];
  ok(j.id === id && VEHICLES.has(j.vehicle.type) && LANDMARKS.has(j.vehicle.parkedAt), 'job ' + id + ': vehicle type and parking');
  ok(j.levels >= 10 && j.pay && j.timer && j.lines && j.rewards.length, 'job ' + id + ': levels, pay, timer, lines, rewards');
  for (const d of (j.dropOff || [])) ok(LANDMARKS.has(d), 'job ' + id + ': drop-off ' + d);
  uniqueIds(j.patients || j.fires, 'job ' + id + ' calls');
}

// ------------------------------------------------- achievements and cheats --
ok(P.achievements.length >= 25, '25+ achievements (' + P.achievements.length + ')');
uniqueIds(P.achievements, 'achievements');
for (const a of P.achievements) {
  ok(typeof a.name === 'string' && typeof a.desc === 'string' && a.trigger, 'achievement ' + a.id + ': name, desc, trigger');
  if (a.trigger.mission) ok(MISSION_IDS.has(a.trigger.mission), 'achievement ' + a.id + ': mission resolves');
  for (const m of (a.trigger.anyMission || [])) ok(MISSION_IDS.has(m), 'achievement ' + a.id + ': mission ' + m + ' resolves');
}
ok(P.cheats.length >= 6, '6+ cheats');
uniqueIds(P.cheats, 'cheats', 'code');
for (const c of P.cheats) {
  ok(/^[A-Z]{6,20}$/.test(c.code) && typeof c.effect === 'string' && typeof c.toast === 'string', 'cheat ' + c.code + ': letters only, effect, toast');
  for (const o of P.cheats) if (o !== c) ok(o.code.indexOf(c.code) < 0, 'cheat ' + c.code + ' is not inside ' + o.code);
}

// ------------------------------------------------------- tips and radio --
ok(P.loadingTips.length >= 20 && P.loadingTips.every((s) => typeof s === 'string' && s.length > 10 && s.length < 140), '20+ loading tips, each one line');
ok(P.radio.ticker.length >= 12 && P.radio.ticker.every((s) => s === s.toUpperCase()), 'ticker lines are in caps');
for (const st in P.radio.ads) ok(STATIONS.has(st), 'radio ads station ' + st + ' exists');
for (const st in P.radio.dj) ok(STATIONS.has(st), 'radio dj station ' + st + ' exists');
for (const mid in P.radio.news) ok(MISSION_IDS.has(mid), 'radio news for mission ' + mid);

// --------------------------------------------------------------- missions --
const ENGINE_TYPES = ['goto', 'drive_to', 'enter_vehicle', 'pickup', 'follow', 'escape_wanted', 'survive', 'destroy', 'defeat', 'dialogue', 'minigame', 'timer_wrap'];
const EXPANSION_TYPES = ['equip', 'deliver_passenger', 'stop_vehicle', 'stunt', 'race', 'collect_any', 'cutscene', 'shop'];
const V03_TYPES = ['interior', 'range', 'buy', 'boss', 'heist_board'];
const TYPES = new Set(ENGINE_TYPES.concat(EXPANSION_TYPES, V03_TYPES));
const BOSSES = ['b01_goldplate', 'b02_velvetine', 'b03_warbanner', 'b04_redacted', 'b05_dunk', 'b06_panel'];
const NEW_IDS = ['m01c_both_sides'].concat(BOSSES, ['h01_casing', 'h02_prep', 'h03_job']);

function target(t, where) {
  if (!t) return;
  if (t.landmark) ok(LANDMARKS.has(t.landmark), where + ': landmark ' + t.landmark + ' resolves');
  if (t.point) { const lm = Ct.world.landmarks.find((l) => l.id === t.landmark); ok(lm && lm.points && lm.points[t.point], where + ': point ' + t.point + ' on ' + t.landmark); }
}
function lines(ls, where) {
  ok(Array.isArray(ls) && ls.length > 0, where + ': has lines');
  for (const l of ls || []) {
    ok(CAST.has(l.who), where + ': speaker ' + l.who + ' is a cast id');
    ok(typeof l.text === 'string' && l.text.length > 0 && l.text.length <= 200, where + ': line length (' + (l.text || '').slice(0, 30) + ')');
  }
}
function objective(o, where) {
  ok(TYPES.has(o.type), where + ': objective type ' + o.type);
  if (o.type !== 'dialogue' && o.type !== 'timer_wrap') ok(typeof o.text === 'string' && o.text.length > 3, where + ': ' + o.type + ' has HUD text');
  target(o.target, where);
  const s = o.spawn;
  if (s) {
    target(s.at, where + ' spawn.at'); target(s.around, where + ' spawn.around');
    if (s.type) ok(VEHICLES.has(s.type), where + ': vehicle type ' + s.type);
    if (s.vehicle) ok(VEHICLES.has(s.vehicle), where + ': vehicle ' + s.vehicle);
    if (s.ped) ok(CAST.has(s.ped) || ROLES.has(s.ped), where + ': ped ' + s.ped);
    if (s.path) s.path.forEach((p) => target(p, where + ' path'));
    if (s.color) ok(HEX.test(s.color), where + ': spawn colour');
  }
  if (o.vehicle && o.vehicle !== 'any') ok(/^spawned:[a-z_]+$/.test(o.vehicle), where + ': vehicle ' + o.vehicle);
  if (o.weaponId) ok(WIDS.has(o.weaponId), where + ': equip weapon ' + o.weaponId);
  if (o.weapon) ok(WIDS.has(o.weapon), where + ': weapon ' + o.weapon);
  if (o.waves) for (const r in o.waves) ok(ROLES.has(r), where + ': wave role ' + r);
  if (o.type === 'dialogue') lines(o.lines, where + ' dialogue');
  if (o.type === 'timer_wrap') { ok(o.seconds > 0 && o.objectives.length, where + ': timer_wrap seconds and children'); o.objectives.forEach((c, i) => objective(c, where + '.' + i)); }
  if (o.type === 'interior') ok(['armory', 'clothing', 'barber', 'safehouse'].indexOf(o.interior) >= 0 && (!o.store || LANDMARKS.has(o.store)), where + ': interior ' + o.interior);
  if (o.type === 'range') ok(['bronze', 'silver', 'gold'].indexOf(o.medal) >= 0, where + ': range medal');
  if (o.type === 'buy') ok(typeof o.item === 'string' && /^(ammo_[a-z_]+|[a-z_]+)$/.test(o.item) && (o.item.indexOf('ammo_') !== 0 || WIDS.has(o.item.slice(5))), where + ': buy item ' + o.item);
  if (o.type === 'boss') ok(BOSSES.indexOf(o.bossId) >= 0, where + ': bossId ' + o.bossId);
  if (o.type === 'heist_board') ok(P.heists[o.heist], where + ': heist ' + o.heist);
  if (o.type === 'escape_wanted') ok(o.setWanted >= 1 && o.setWanted <= 5, where + ': wanted 1..5');
}
// QA-C1-10: a goto never completes from a car, so a goto right after a vehicle objective must tell the player to get out
function onFootLegs(objs, where) {
  for (let i = 1; i < objs.length; i++) {
    const prev = objs[i - 1], o = objs[i];
    if (o.type === 'goto' && ['drive_to', 'enter_vehicle'].indexOf(prev.type) >= 0) ok(/get out|on foot|walk/i.test(o.text), where + ' obj ' + i + ': goto after ' + prev.type + ' says to get out: ' + o.text);
  }
}
// a mission that drives a tagged vehicle fails cleanly when it is lost (drive_to waits forever otherwise)
function tagsCovered(m, objs, where) {
  const s = JSON.stringify(objs);
  for (const mt of s.match(/"vehicle":"spawned:[a-z_]+"/g) || []) { const tag = mt.split(':')[2].replace('"', ''); ok(m.failOn.indexOf('vehicle_lost:' + tag) >= 0, where + ': failOn covers vehicle_lost:' + tag); }
}
ok(P.missions.length === 10, 'ten new story missions');
ok(NEW_IDS.every((id) => P.missionById(id)), 'every planned new mission id exists: ' + NEW_IDS.join(','));
for (const m of P.missions) {
  const where = 'mission ' + m.id;
  ok(typeof m.title === 'string' && m.title.length > 2, where + ': title');
  ok(CAST.has(m.giver), where + ': giver ' + m.giver);
  ok(LANDMARKS.has(m.marker), where + ': marker ' + m.marker + ' is a real landmark');
  ok(Array.isArray(m.requires) && m.requires.length === 1, where + ': requires one mission');
  ok(typeof m.reward === 'number' && m.reward >= 0 && m.reward <= (m.heist ? 10000 : 5000), where + ': reward');
  ok(m.story === true, where + ': story:true (09 drops expansion.missions entries outside expansion.chain otherwise)');
  ok([1, 2, 3].indexOf(m.act) >= 0 && P.actOf(m.id) === m.act, where + ': act matches acts table');
  lines(m.intro, where + ' intro'); lines(m.outro, where + ' outro');
  ok(m.intro.length >= 3 && m.intro.length <= 6 && m.outro.length >= 3 && m.outro.length <= 6, where + ': 3 to 6 intro and outro lines');
  ok(m.intro.some((l) => l.who === 'player') && m.outro.some((l) => l.who === 'player'), where + ': Bryce speaks in intro and outro');
  m.objectives.forEach((o, i) => objective(o, where + ' obj ' + i));
  ok(Array.isArray(m.failOn) && m.failOn.indexOf('player_dead') >= 0, where + ': failOn includes player_dead');
  onFootLegs(m.objectives, where); tagsCovered(m, m.objectives, where);
  for (const f of m.failOn) { const tag = f.split(':')[1]; if (f.indexOf('vehicle_lost:') === 0) ok(JSON.stringify([m.objectives].concat(m.heist ? Object.values(P.heists[m.heist].variants).map((v) => v[m.id] || []) : [])).indexOf('"tag":"' + tag + '"') >= 0, where + ': ' + f + ' names a spawned tag'); }
  const oc = m.onComplete || {};
  if (oc.unlockWeapon) ok(WIDS.has(oc.unlockWeapon), where + ': unlockWeapon ' + oc.unlockWeapon);
  if (oc.setFlag) ok(/^[a-z_]+$/.test(oc.setFlag), where + ': setFlag');
  if (oc.unlockWeapon) { const w = P.weaponById(oc.unlockWeapon); ok(w.unlock && w.unlock.mission === m.id, where + ': the unlocked weapon goes on the shop wall from this mission'); }
  if (BOSSES.indexOf(m.id) >= 0) {
    const bo = m.objectives.filter((o) => o.type === 'boss');
    ok(bo.length === 1 && bo[0].bossId === m.id && m.objectives.indexOf(bo[0]) > 0, where + ': one boss objective with its own bossId, after an approach objective');
  }
}
for (const id of BOSSES) {
  const g = P.missionById(id).objectives[0];
  ok(g.type === 'goto' && g.target.metres === true && g.target.offset && LANDMARKS.has(g.target.landmark) && g.radius >= 120, id + ': the approach goes to the boss arena (landmark + metres offset): ' + JSON.stringify(g.target));
}
const m01c = P.missionById('m01c_both_sides');
const seq = m01c.objectives.map((o) => o.type);
ok(seq[0] === 'goto' && m01c.objectives[0].target.landmark === 'both_sides_strip', 'm01c: goto the armory door first');
ok(seq.indexOf('interior') > 0 && seq.indexOf('range') > seq.indexOf('interior') && seq.indexOf('buy') > seq.indexOf('range'), 'm01c: goto, interior, range, buy in that order: ' + seq.join(','));
ok(m01c.objectives.find((o) => o.type === 'range').medal === 'bronze' && m01c.objectives.find((o) => o.type === 'interior').interior === 'armory', 'm01c: range bronze in the armory');
ok(m01c.objectives.some((o) => o.type === 'equip' && o.weaponId === 'pistol'), 'm01c: Merle gives the free pistol');
for (const id of ['h01_casing', 'h02_prep', 'h03_job']) ok(P.missionById(id).act === 3, id + ' is Act III');
ok(P.missionById('h01_casing').objectives.some((o) => o.type === 'heist_board'), 'h01 ends at the planning board');

// ------------------------------------------------------------- the DAG --
const PLAN = {   // PLAN_V03.md "Story chain after v0.3"
  m01c_both_sides: ['m01_van'], m01b_airport: ['m01c_both_sides'],
  b01_goldplate: ['m06_rally'], m07_listen: ['b01_goldplate'],
  b02_velvetine: ['m07b_ferry'], m08_scooters: ['b02_velvetine'],
  b03_warbanner: ['m08b_jets'], m09_balloon: ['b03_warbanner'],
  b04_redacted: ['m09b_hotmic'], m10_pellets: ['b04_redacted'],
  h01_casing: ['m12b_scope'], h02_prep: ['h01_casing'], h03_job: ['h02_prep'], m13_thursday: ['h03_job'],
  b05_dunk: ['m13_thursday'], m13b_ratio: ['b05_dunk'],
  b06_panel: ['m13b_ratio'], m14_grift: ['b06_panel']
};
const byId = {}; for (const m of ALL_MISSIONS) byId[m.id] = m;
ok(ALL_MISSIONS.length === 35, '35 story missions (' + ALL_MISSIONS.length + ')');
for (const id in PLAN) ok(byId[id] && JSON.stringify(byId[id].requires) === JSON.stringify(PLAN[id]), id + '.requires = ' + JSON.stringify(PLAN[id]) + ' (is ' + JSON.stringify(byId[id] && byId[id].requires) + ')');
ok(JSON.stringify(P.requiresPatches) === JSON.stringify(PLAN), 'parity.requiresPatches records the plan table');
for (const m of ALL_MISSIONS) for (const r of m.requires) ok(byId[r], m.id + ' requires ' + r + ' which exists');
// no cycles: Kahn's algorithm
const indeg = {}, out = {};
for (const m of ALL_MISSIONS) { indeg[m.id] = m.requires.length; for (const r of m.requires) (out[r] = out[r] || []).push(m.id); }
const q = ALL_MISSIONS.filter((m) => !m.requires.length).map((m) => m.id), order = [];
while (q.length) { const id = q.shift(); order.push(id); for (const n of (out[id] || [])) if (--indeg[n] === 0) q.push(n); }
ok(order.length === ALL_MISSIONS.length, 'the requires graph is a DAG (sorted ' + order.length + ' of ' + ALL_MISSIONS.length + ')');
ok(q.length === 0 && ALL_MISSIONS.filter((m) => !m.requires.length).map((m) => m.id).join() === 'm00_intro', 'm00_intro is the only root');
// a line: chain[i] requires chain[i-1], endings require m14_grift
ok(P.chain.length === 35 && new Set(P.chain).size === 35 && P.chain.every((id) => byId[id]), 'parity.chain lists the 35 missions once each');
P.chain.forEach((id, i) => {
  if (i === 0) return;
  const want = (id === 'm15a_primetime' || id === 'm15b_liveread') ? ['m14_grift'] : [P.chain[i - 1]];
  ok(JSON.stringify(byId[id].requires) === JSON.stringify(want), 'chain line: ' + id + ' requires ' + want + ' (is ' + byId[id].requires + ')');
});
const actIds = [].concat(P.acts[1], P.acts[2], P.acts[3]);
ok(actIds.length === 35 && actIds.slice().sort().join() === P.chain.slice().sort().join(), 'acts cover the chain exactly once');
ok(actIds.join() === P.chain.join(), 'acts are in chain order');

// --------------------------------------------------------- calls, chapters --
for (const id of P.chain) {
  const c = P.calls[id];
  ok(c && c.from === byId[id].giver, 'call for ' + id + ' from its giver ' + (byId[id] && byId[id].giver) + ' (is ' + (c && c.from) + ')');
  if (c) { lines(c.lines, 'call ' + id); ok(c.lines.length >= 2 && c.lines.length <= 4, 'call ' + id + ': 2 to 4 lines'); }
}
ok(Object.keys(P.calls).length === 35, 'exactly one call per story mission');
uniqueIds(P.chapters.concat(P.interludes), 'chapters and interludes');
ok(P.chapters.length === 3, 'chapters are the three acts only (09 lets a later entry of the same act override its title)');
for (const ch of P.chapters.concat(P.interludes)) ok(P.chain.indexOf(ch.from) >= 0 && P.actOf(ch.from) === ch.act && typeof ch.title === 'string', 'chapter ' + ch.id + ' starts (`from`) at a chain mission in its act');
for (const ch of P.chapters) ok(!/^act\b/i.test(ch.title), 'chapter ' + ch.id + ': bare title (the UI prints ACT I itself): ' + ch.title);
for (const a of [1, 2, 3]) ok(P.chapters.some((c) => c.act === a && c.from === P.acts[a][0]), 'act ' + a + ' has a chapter card at its first mission');

// ------------------------------------------------------------------ heist --
const H = P.heists.hedge_job;
ok(H && LANDMARKS.has(H.target) && H.missions.join() === 'h01_casing,h02_prep,h03_job', 'hedge_job targets a landmark and spans the three heist missions');
ok(H.payout.base > 0 && H.payout.minimum > 0 && H.payout.minimum < H.payout.base, 'heist payout numbers');
uniqueIds(H.approaches, 'heist approaches');
uniqueIds(H.roles, 'heist roles');
for (const c of H.crew) ok(CAST.has(c.castId) && H.roles.some((r) => r.id === c.role) && c.cut >= 0 && c.cut < 0.5 && c.skill > 0 && c.skill <= 1, 'crew ' + c.castId + ': cast id, role, cut, skill');
for (const r of H.roles) ok(H.crew.filter((c) => c.role === r.id).length >= 2, 'heist role ' + r.id + ' has a choice');
ok(new Set(H.crew.map((c) => c.castId)).size === H.crew.length, 'each crew member has one role');
for (const a of H.approaches) {
  ok(a.payoutMul > 0 && a.wanted >= 1 && a.wanted <= 5 && typeof a.pitch === 'string', 'approach ' + a.id + ': numbers and pitch');
  for (const mid of ['h02_prep', 'h03_job']) {
    const objs = P.heistObjectives('hedge_job', mid, a.id);
    ok(Array.isArray(objs) && objs.length >= 3, 'approach ' + a.id + ' has objectives for ' + mid);
    (objs || []).forEach((o, i) => objective(o, 'heist ' + a.id + ' ' + mid + ' obj ' + i));
    onFootLegs(objs || [], 'heist ' + a.id + ' ' + mid); tagsCovered(P.missionById(mid), objs || [], 'heist ' + a.id + ' ' + mid);
  }
}
// the shape GTP.Heist (09_missions.js) reads
const PH = P.heist;
ok(PH && PH.missions.join() === H.missions.join(), 'parity.heist.missions');
for (const a of PH.approaches) ok(typeof a.id === 'string' && typeof a.name === 'string' && a.hostiles > 0 && a.payout > 0 && a.wanted >= 1 && typeof a.line === 'string', 'parity.heist approach ' + a.id + ' {id, name, hostiles, payout, wanted, line}');
for (const c of PH.crew) ok(CAST.has(c.id) && typeof c.name === 'string' && c.cut >= 0 && typeof c.perk === 'string', 'parity.heist crew ' + c.id + ' {id, name, cut, perk}');
for (const mid of ['h02_prep', 'h03_job']) {
  const objs = P.missionById(mid).objectives;
  ok(objs.every((o) => H.approaches.some((a) => a.id === o.approach)), mid + ': every objective is tagged with an approach');
  for (const a of H.approaches) ok(objs.filter((o) => o.approach === a.id).length >= 3, mid + ': approach ' + a.id + ' has its own objectives');
}
ok(Math.round(P.missionById('h03_job').reward * Math.min(...PH.approaches.map((a) => a.payout)) * (1 - 0.6)) >= H.payout.minimum, 'the heist take after the 60% cut cap still clears the minimum');
const worst = Math.min(...H.approaches.map((a) => a.payoutMul)) * 0.6 * (1 - 0.2 - 0.12 - 0.15);
ok(H.payout.base * worst >= H.payout.minimum, 'the priciest crew still clears the minimum payout');

// -------------------------------------------------------- runtime hooks --
ok(NEW_IDS.every((id) => X.missions.some((m) => m.id === id)), 'register(): the new missions joined expansion.missions');
ok(NEW_IDS.every((id) => X.cutscenes['cs_intro_' + id] && X.cutscenes['cs_intro_' + id].shots.length === 2), 'register(): a two-shot intro cutscene per new mission');
const m03b = X.missionById('m03b_range');
ok(!('takeWeapon' in m03b.onComplete) && m03b.onComplete.unlockWeapon === 'tableleg', 'retune: m03b keeps the m01c pistol');
ok(X.cutscenes.cs_intro_m03b_range.shots[0].lines[1].text === m03b.intro[1].text, 'retune: m03b intro cutscene rebuilt from the new line');
const m05 = X.missionById('m05_peer');
ok(m05.onComplete.unlockWeapon === 'pocket' && /Footnote/.test(m05.outro[3].text), 'retune: m05 hands over the Footnote, not a second pistol');
const before = X.missions.length; P.register(); ok(X.missions.length === before, 'register() is idempotent');

// ------------------------------------------------- source hygiene --
const SRC = fs.readFileSync(path.join(ROOT, 'js', '25_content_parity.js'), 'utf8');
ok(!/Math\.random/.test(SRC), 'no Math.random in 25_');
ok(!/\b(alert|confirm|prompt)\s*\(/.test(SRC), 'no alert/confirm/prompt in 25_');
const diff22 = spawnSync('git', ['diff', 'ea6a035', '--', 'js/22_content_missions.js', 'js/24_content_expansion.js'], { cwd: ROOT, encoding: 'utf8' });
if (diff22.status === 0 && diff22.stdout) {
  const changed = diff22.stdout.split('\n').filter((l) => /^[+-][^+-]/.test(l));
  ok(changed.every((l) => /requires: \[/.test(l)), 'only requires arrays changed in 22_ and 24_ since ea6a035');
}
const audit = spawnSync(process.execPath, [path.join(__dirname, 'content_audit.js')], { cwd: ROOT, encoding: 'utf8' });
ok(audit.status === 0, 'content_audit.js passes: ' + (audit.stdout + audit.stderr).trim().split('\n').slice(0, 6).join(' | '));

console.log('content parity (node): ' + checks + ' checks, ' + fails.length + ' failed');
if (fails.length) { console.error(fails.map((f) => '  FAIL ' + f).join('\n')); process.exit(1); }

// -------------------------------------------------------- part 2: browser --
let H2 = null;
try { require.resolve('playwright'); H2 = require('./_harness'); } catch (e) { console.log('playwright not found: skipping the in-game check'); }
if (H2) {
  H2.run('content_parity', async (t) => {
    const ctx = await t.boot({});
    const live = await ctx.page.evaluate((ids) => {
      const P = GTP.Content.parity, M = GTP.Missions;
      const all = (M && M.allMissions ? M.allMissions() : []).map((m) => m.id);
      return {
        parity: !!P, weapons: P && P.weapons.length, calls: P && Object.keys(P.calls).length,
        inGame: ids.filter((id) => all.indexOf(id) >= 0), total: all.length,
        intros: ids.filter((id) => GTP.Content.expansion.cutscenes['cs_intro_' + id]).length,
        story: (GTP.Story && GTP.Story.order ? GTP.Story.order() : []).filter((id) => ids.indexOf(id) >= 0).length,
        arenas: ['b01_goldplate', 'b02_velvetine', 'b03_warbanner', 'b04_redacted', 'b05_dunk', 'b06_panel'].map((id) => {
          const m = P.missionById(id), B = GTP.Bosses, a = B && B.arena ? B.arena(id) : null, lm = GTP.World.landmark(m.marker), d = lm && (lm.door || lm);
          const t = m.objectives[0].target, at = GTP.Missions.resolvePoint ? GTP.Missions.resolvePoint(t) : null;
          return { id, arena: !!a, off: a && at ? Math.hypot(a.x - at.x, a.z - at.z) : null, fromMarker: a && d ? Math.round(Math.hypot(a.x - d.x, a.z - d.z)) : null };
        })
      };
    }, NEW_IDS);
    console.log('  live: ' + JSON.stringify(live));
    t.assert(live.parity && live.weapons >= 32 && live.calls === 35, 'parity tables reach the game: ' + JSON.stringify(live));
    t.assert(live.inGame.length === NEW_IDS.length && live.total >= 35, 'Missions.allMissions sees all 35 story missions: ' + JSON.stringify(live));
    t.assert(live.intros === NEW_IDS.length, 'every new mission has its intro cutscene in the live game');
    t.assert(live.story === NEW_IDS.length, 'GTP.Story.order() counts all ten new missions as story: ' + live.story);
    for (const a of live.arenas) {
      t.assert(a.arena, a.id + ': GTP.Bosses knows the arena');
      t.assert(a.off == null || a.off < 1, a.id + ': the approach target is the live arena centre (off by ' + a.off + ' m)');
      t.assert(a.fromMarker == null || a.id === 'b03_warbanner' || a.fromMarker < 260, a.id + ': the arena is within walking distance of the marker (' + a.fromMarker + ' m)');
    }
    const errs = (await t.errors(ctx)).filter((e) => /25_content_parity/.test(e));
    t.assert(errs.length === 0, 'no errors from 25_content_parity.js: ' + errs.join('\n'));
  });
}
