/* radio.js: GTP.Content.radio (23_content_radio) played through GTP.Audio (03_audio).
 *  1 data (node, no browser): the file loads standalone with no authoring errors; six stations with the v0.2 fields;
 *    every bar of every timeline matches the pattern schema the engine reads; songs have verses, choruses, fills and
 *    key shifts; anti-monotony metrics per station (distinct bars and drum bars, longest repeat, chord-tone fit, pitch
 *    variety, genre tempo and swing); the live `pattern` view follows a simulated engine bar counter, moves to the next
 *    song on a retune and honours cue(); the news bulletin follows story flags and completed missions; the call-in show
 *    rotates by game hour; every runtime string passes tests/content_audit.js (run on a virtual file of the strings)
 *  2 headless game boot: stations cycle with R, the plain ticker array is intact, the news runner shows a bulletin on the
 *    ticker and emits radio:news when a game hour turns over in a car, and not on foot
 *  3 live page (headless=0, a click unlocks audio): each station plays in a car for a few real seconds through the
 *    current engine; the sequencer schedules steps, the view moves through sections, no errors
 *  4 offline renders of every song through the engine: audible, unclipped, not flat, songs differ from each other
 * Run: cd grand-theft-pundit && NODE_PATH=/opt/node-tools/node_modules node tests/radio.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./_harness');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'js', '23_content_radio.js');

function loadRadio(extra) {
  const win = { GTP: Object.assign({}, extra || {}) };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), win, { filename: SRC });
  return win.GTP;
}

// every string reachable from the radio module (getters included), with a path
function strings(obj, at, out, seen) {
  if (obj == null) return out;
  if (typeof obj === 'string') { out.push({ at, s: obj }); return out; }
  if (typeof obj !== 'object' || seen.has(obj)) return out;
  seen.add(obj);
  for (const k of Object.keys(obj)) strings(obj[k], at + '.' + k, out, seen);
  return out;
}

// runs tests/content_audit.js with its own patterns against one virtual file holding the given lines
function auditLines(lines) {
  const auditPath = path.join(__dirname, 'content_audit.js');
  const src = fs.readFileSync(auditPath, 'utf8');
  const VROOT = '/virtual', VFILE = '/virtual/radio_strings.txt';
  const fakeFs = {
    readdirSync: (d) => (d === VROOT ? ['radio_strings.txt'] : []),
    statSync: (p) => ({ isDirectory: () => p === VROOT }),
    readFileSync: (p) => (p === VFILE ? lines.join('\n') : '')
  };
  const fakePath = Object.assign({}, path, { resolve: (...a) => (a.length === 2 && a[1] === '..' ? VROOT : path.resolve(...a)) });
  const log = [], err = [];
  let code = 0;
  const sandbox = {
    require: (m) => (m === 'fs' ? fakeFs : m === 'path' ? fakePath : require(m)),
    __dirname: '/virtual/tests', __filename: auditPath,
    console: { log: (...a) => log.push(a.join(' ')), error: (...a) => err.push(a.join(' ')) },
    process: { exit: (c) => { code = c; throw { auditExit: true }; } }
  };
  try { vm.runInNewContext(src.replace(/^#!.*\n/, ''), sandbox, { filename: auditPath }); } catch (e) { if (!e || !e.auditExit) throw e; }
  return { code, log, err };
}

const mod7 = (a) => ((a % 7) + 7) % 7;
const isDeg = (v) => v === null || (Number.isInteger(v) && v >= -7 && v <= 21);
const WAVES = { bass: ['square', 'sawtooth', 'triangle'], lead: ['sine', 'square', 'sawtooth', 'triangle'] };

function dataChecks(t) {
  const G = loadRadio();
  const R = G.Content.radio;
  t.assert(R && Array.isArray(R.stations), 'GTP.Content.radio.stations exists when the file loads alone');
  t.assert(R.errors.length === 0, 'no authoring errors: ' + R.errors.join('; '));
  const ids = R.stations.map((s) => s.id);
  t.assert(ids.length >= 6 && new Set(ids).size === ids.length, 'six or more unique stations: ' + ids.join(','));
  ['wail_101', 'pennant_fm', 'velvetine_888', 'quiet_signal'].forEach((id, i) => t.assert(ids[i] === id, 'the four GDD stations keep their order: ' + id));
  t.assert(R.station(R.defaultStation).id === 'wail_101' && R.napMinute === 20, 'default station and the Nap Dynasty minute');
  t.assert(Array.isArray(R.ticker) && R.ticker.length >= 12 && R.ticker.every((x) => typeof x === 'string'), 'the ticker stays a plain array of strings');
  t.assert(R.barks && R.barks.ped.length === 20 && R.barks.cop.length === 8 && R.failTexts.wasted === 'RATIO\'D', 'barks and fail texts intact');

  const report = [];
  for (const st of R.stations) {
    const where = st.id;
    t.assert(st.name && st.tagline && st.genre && st.bpm >= 40 && st.bpm <= 200 && ['minor', 'major', 'dorian'].includes(st.scale), where + ': name, tagline, genre, bpm, scale');
    t.assert(Array.isArray(st.ads) && st.ads.length >= 10, where + ': ten or more ads (' + (st.ads || []).length + ')');
    t.assert(st.napAd >= 0 && st.napAd < st.ads.length && /Nap Dynasty|mattress/i.test(st.ads[st.napAd]), where + ': napAd points at the mattress ad');
    t.assert(Array.isArray(st.dj) && st.dj.length >= 4 && st.dj.every((x) => typeof x === 'string' && x.length), where + ': DJ lines');
    const P = st.pattern;
    t.assert(P && P.steps === 16 && P.transposeBass === false, where + ': pattern keeps steps 16 and absolute bass');
    if (st.id === 'wail_101') t.assert(P.talk === true, 'WAIL 101 stays a talk station');
    if (st.id === 'pennant_fm') t.assert(P.jingle && P.jingle.every === 40 && P.jingle.notes.length, 'Pennant FM keeps its 40 s jingle');

    // every bar of the timeline is a valid v0.2 pattern
    const tl = R.timeline(st.id);
    t.assert(tl.length > 0, where + ': a timeline');
    tl.forEach((b, i) => {
      const w = where + ' bar ' + i;
      t.assert(b.steps === 16 && b.bass.length === 16 && b.lead.length === 16 && b.bass.every(isDeg) && b.lead.every(isDeg), w + ': bass and lead are 16 degrees or rests');
      t.assert(Array.isArray(b.chords) && b.chords.length === 4 && b.chords.every(Number.isInteger), w + ': four chord roots');
      t.assert(['kick', 'snare', 'hat'].every((k) => b.drums[k].length === 16 && b.drums[k].every((v) => v === 0 || v === 1)), w + ': drums 16 x 0|1');
      t.assert(b.swing >= 0 && b.swing <= 0.3 && b.sustain > 0 && b.sustain <= 12, w + ': swing and sustain in range');
      t.assert(WAVES.bass.includes(b.wave.bass) && WAVES.lead.includes(b.wave.lead), w + ': waves');
    });

    // songs and arrangement
    const talk = !!P.talk, songs = st.songs;
    t.assert(songs.length >= (talk ? 5 : 4), where + ': ' + songs.length + ' songs');
    let shifts = 0, fills = 0;
    songs.forEach((s) => {
      const names = new Set(s.form.map((f) => f.replace(/[\^!].*$/, '')));
      t.assert(s.title && s.artist && s.bars === tl.filter((b) => st.songs[b.song] === s).length, where + '/' + s.id + ': title, artist, bar count');
      if (talk) t.assert(s.bars % 12 === 0, where + '/' + s.id + ': talk songs are 12-bar cycles');
      else t.assert(names.size >= 3 && s.bars >= 16, where + '/' + s.id + ': at least three sections and 16 bars (' + [...names].join(' ') + ', ' + s.bars + ')');
      shifts += s.form.filter((f) => /\^/.test(f)).length; fills += s.form.filter((f) => /!$/.test(f)).length;
    });

    // listening metrics: a station must not be one loop
    const keyOf = (b) => JSON.stringify([b.bass, b.lead, b.drums, b.chords[0]]);
    const keys = tl.map(keyOf), distinct = new Set(keys).size, drumBars = new Set(tl.map((b) => JSON.stringify(b.drums))).size;
    let run = 1, maxRun = 1; for (let i = 1; i < keys.length; i++) { run = keys[i] === keys[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
    let strong = 0, strongCT = 0; const pcs = new Set(), chordSet = new Set();
    tl.forEach((b) => {
      const r = b.chords[0], ct = [r, r + 2, r + 4, r + 6].map(mod7); chordSet.add(mod7(r));
      b.lead.forEach((n, i) => { if (n == null) return; pcs.add(mod7(n)); if (i % 4 === 0) { strong++; if (ct.includes(mod7(n))) strongCT++; } });
    });
    const fit = strongCT / Math.max(1, strong), seconds = Math.round(tl.length * 240 / st.bpm);
    report.push(`${st.id.padEnd(14)} ${songs.length} songs  ${String(tl.length).padStart(3)} bars ${String(seconds).padStart(3)} s  distinct bars ${distinct}  drum bars ${drumBars}  longest repeat ${maxRun}  chords ${chordSet.size}  pitch classes ${pcs.size}  strong-beat chord tones ${(fit * 100).toFixed(0)}%  key shifts ${shifts}  fills ${fills}`);
    t.assert(distinct >= tl.length * 0.3 && distinct >= 30, where + ': distinct bars ' + distinct + ' of ' + tl.length);
    t.assert(drumBars >= (st.id === 'quiet_signal' ? 2 : 8), where + ': drum variety ' + drumBars);
    t.assert(maxRun <= 3, where + ': no bar repeats more than three times in a row (' + maxRun + ')');
    t.assert(chordSet.size >= 4 && pcs.size >= 6, where + ': harmonic and melodic variety (' + chordSet.size + ' chords, ' + pcs.size + ' pitch classes)');
    t.assert(fit >= 0.8, where + ': strong-beat melody notes sit on chord tones (' + (fit * 100).toFixed(0) + '%)');
    t.assert(seconds >= 150, where + ': at least two and a half minutes before the rotation repeats (' + seconds + ' s)');
    if (!talk) t.assert(shifts >= 2 && (fills >= 4 || st.id === 'quiet_signal'), where + ': key shifts (' + shifts + ') and fills (' + fills + ', none needed without drums)');
  }
  console.log('  stations:\n    ' + report.join('\n    '));

  // genre feel: tempo, swing and kit hints that suit each style
  const S = (id) => R.station(id), swingOf = (id) => R.timeline(id).reduce((a, b) => a + b.swing, 0) / R.timeline(id).length;
  t.assert(S('office_hours').bpm >= 70 && S('office_hours').bpm <= 105 && swingOf('office_hours') >= 0.15, 'lo-fi: laid-back tempo with heavy swing');
  t.assert(S('loop_174').bpm >= 160 && swingOf('loop_174') === 0, 'drum and bass: 160+ bpm, straight');
  t.assert(S('velvetine_888').bpm >= 118 && S('velvetine_888').bpm <= 126, 'deep house tempo');
  t.assert(swingOf('pennant_fm') >= 0.1, 'Pennant FM swings');
  t.assert(R.timeline('quiet_signal').every((b) => !b.drums.kick.some(Boolean) && !b.drums.snare.some(Boolean)), 'Quiet Signal has no kick or snare');
  t.assert(R.timeline('velvetine_888').some((b) => b.section === 'N' && !b.drums.kick.some(Boolean)), 'Velvetine: the drop that does not come');

  // the live view follows the engine's bar counter
  const fake = { id: 'pennant_fm', talkBar: -1 };
  const G2 = loadRadio({ Audio: { radio: { state: () => ({ id: fake.id, talkBar: fake.talkBar }) } } });
  const R2 = G2.Content.radio, pen = R2.station('pennant_fm'), tl2 = R2.timeline('pennant_fm'), starts = R2.songStarts('pennant_fm');
  const same = (b) => JSON.stringify([pen.pattern.bass, pen.pattern.lead, pen.pattern.drums, pen.pattern.chords, pen.pattern.swing, pen.pattern.sustain, pen.pattern.wave]) === JSON.stringify([b.bass, b.lead, b.drums, b.chords, b.swing, b.sustain, b.wave]);
  let ok = true;
  for (let bar = -1; bar < 60; bar++) { fake.talkBar = bar; if (!same(tl2[Math.max(0, bar)])) ok = false; }
  t.assert(ok, 'the pattern view returns timeline bar n while the engine plays bar n');
  t.assert(R2.nowPlaying('pennant_fm').song === pen.songs[1].id, 'bar 59 is in the second song: ' + R2.nowPlaying('pennant_fm').song);
  fake.talkBar = -1; same(tl2[0]);
  t.assert(R2.nowPlaying('pennant_fm').pos === starts[2], 'a retune starts the next song: ' + JSON.stringify(R2.nowPlaying('pennant_fm')));
  R2.cue('pennant_fm', 3); fake.talkBar = -1; pen.pattern.bass; fake.talkBar = 0; pen.pattern.bass;
  t.assert(R2.nowPlaying('pennant_fm').pos === starts[3], 'cue() starts song 3');
  fake.id = 'wail_101'; const before = R2.nowPlaying('pennant_fm').pos; fake.talkBar = 40; pen.pattern.bass;
  t.assert(R2.nowPlaying('pennant_fm').pos === before, 'an off-air station holds its place');

  // news
  const N = R.news, flagsInOrder = N.order.filter((k) => k.indexOf('mission:') < 0), missionsInOrder = N.order.filter((k) => k.indexOf('mission:') === 0).map((k) => k.slice(8));
  t.assert(Object.keys(N.byFlag).every((f) => flagsInOrder.includes(f)) && Object.keys(N.byMission).every((m) => missionsInOrder.includes(m)), 'every news key is placed in story order');
  t.assert(ids.every((id) => typeof N.intros[id] === 'string'), 'a bulletin intro per station');
  const allHeads = [].concat(N.start, ...Object.values(N.byFlag), ...Object.values(N.byMission));
  t.assert(allHeads.every((h) => h === h.toUpperCase() && h.length <= 110), 'headlines are ticker caps and short');
  const b0 = R.bulletin('quiet_signal', 5, { flags: {}, completed: [] });
  t.assert(b0.stage === null && b0.headlines.length === 3 && N.start.includes(b0.headlines[0]) && /^A BULLETIN HAS BEEN ISSUED/.test(b0.text), 'no progress: the opening headlines');
  const flags = {}, done = [];
  let stagesOk = true;
  for (const key of N.order) {
    if (key.indexOf('mission:') === 0) done.push(key.slice(8)); else flags[key] = true;
    const b = R.bulletin('wail_101', 7, { flags, completed: done }), lines = key.indexOf('mission:') === 0 ? N.byMission[key.slice(8)] : N.byFlag[key];
    if (b.stage !== key || !lines.includes(b.headlines[0]) || b.headlines.length < 2) { stagesOk = false; console.log('  stage miss: ' + key + ' ' + JSON.stringify(b)); }
  }
  t.assert(stagesOk, 'each story beat leads the bulletin once reached');
  const hA = R.bulletin('wail_101', 10, { flags: { has_table: true, has_van: true } }).headlines, hB = R.bulletin('wail_101', 11, { flags: { has_table: true, has_van: true } }).headlines;
  t.assert(hA.join() !== hB.join(), 'bulletins rotate by the hour');

  // call-in show
  const C = R.callin, wail = R.station('wail_101');
  t.assert(C.segments.length >= 6 && C.segments.every((s) => s.title && s.intro && s.outro && s.exchanges.length >= 4), 'call-in show: six or more full segments');
  t.assert(R.segment(0).id !== R.segment(1).id && wail.djAll.length > 40, 'segments rotate by game hour; djAll lists every line');

  // every string through the content audit, plus length and PG-13 sanity
  const all = strings(R, 'radio', [], new Set());
  t.assert(all.length > 400, 'strings collected: ' + all.length);
  const audit = auditLines(all.map((x) => x.s));
  console.log('  audit on ' + all.length + ' runtime strings: ' + (audit.log.concat(audit.err).join(' | ').slice(0, 400)));
  t.assert(audit.code === 0 && /0 hits/.test(audit.log.join(' ')), 'content audit passes on every runtime string');
  const rot13 = (s) => s.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
  const strong13 = ['shpx', 'fuvg', 'ovgpu', 'phag', 'qvpx', 'cvff', 'onfgneq', 'nffubyr', 'jnax', 'gjng'].map(rot13);
  const bad = all.filter((x) => strong13.some((w) => new RegExp('(?<![a-z])' + w, 'i').test(x.s)) || /TODO|FIXME|lorem/i.test(x.s) || x.s.length > 160);
  t.assert(bad.length === 0, 'PG-13, no placeholders, every line fits the ticker: ' + bad.map((x) => x.at + ': ' + x.s).join('\n'));
  return R;
}

H.run('radio', async (t) => {
  // ---- 1. data ----
  const R = dataChecks(t);
  const stationIds = R.stations.map((s) => s.id);

  // ---- 2. headless game: stations, ticker, the news runner ----
  const hctx = await t.boot({ seed: 7 });
  const hl = await hctx.page.evaluate(() => {
    const A = GTP.Audio, Rd = GTP.Content.radio, p = GTP.game.player, out = { ids: Rd.stations.map((s) => s.id) };
    const press = (a) => { GTP.Input.set(a, true); GTP.game.advance(1 / 60); GTP.Input.set(a, false); GTP.game.advance(1 / 60); };
    const rp = GTP.World.nearestRoadPoint(p.x, p.z) || { x: p.x + 3, z: p.z };
    const v = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
    const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1);
    press('enter'); GTP.game.advance(0.8);
    out.inCar = p.inVehicle === v;
    out.cycle = [];
    for (let i = 0; i < Rd.stations.length + 1; i++) { out.cycle.push(A.radio.current().id); press('radio'); }
    out.errorsBefore = (GTP.errors || []).length;
    out.tickerIsArray = Array.isArray(Rd.ticker);
    // the news runner: a game hour turns over in the car
    const shown = [], events = [];
    const origTicker = GTP.UI.ticker;
    GTP.UI.ticker = function (text) { shown.push(text); return origTicker.apply(this, arguments); };
    GTP.Events.on('radio:news', (b) => events.push(b));
    A.radio.setStation(Rd.stations.findIndex((s) => s.id === 'quiet_signal'));
    GTP.game.debug.setClock(13 + 59.5 / 60); GTP.game.advance(0.1);
    GTP.game.advance(1.2);   // 1.2 s real = 0.8 game minutes: crosses 14:00
    out.shownInCar = shown.slice(); out.eventsInCar = events.map((e) => ({ station: e.station, stage: e.stage, n: e.headlines.length }));
    out.tickerCur = GTP.UI.state && GTP.UI.state.ticker && GTP.UI.state.ticker.cur ? GTP.UI.state.ticker.cur.text : null;
    // on foot: no bulletin
    const vv = p.inVehicle; if (vv) { vv.speed = 0; vv.vx = 0; vv.vz = 0; } GTP.game.advance(0.1);
    press('enter'); GTP.game.advance(0.6);
    out.onFoot = !p.inVehicle;
    GTP.game.debug.setClock(15 + 59.5 / 60); GTP.game.advance(0.1); GTP.game.advance(1.2);
    out.shownTotal = shown.length;
    GTP.UI.ticker = origTicker;
    out.wailDj = Rd.station('wail_101').dj.slice(0, 2);
    out.errors = (GTP.errors || []).map((e) => e.where + ': ' + e.message);
    return out;
  });
  console.log('  headless: ' + JSON.stringify({ inCar: hl.inCar, cycle: hl.cycle, shown: hl.shownInCar, events: hl.eventsInCar, onFoot: hl.onFoot, shownTotal: hl.shownTotal }));
  t.assert(hl.inCar, 'in a car');
  t.assert(hl.cycle.length === stationIds.length + 1 && new Set(hl.cycle).size === stationIds.length && hl.cycle[0] === hl.cycle[hl.cycle.length - 1], 'R cycles through every station and wraps: ' + hl.cycle.join(' > '));
  t.assert(hl.tickerIsArray, 'the ticker is still a plain array after every content file loaded');
  t.assert(hl.shownInCar.length === 1 && /^A BULLETIN HAS BEEN ISSUED/.test(hl.shownInCar[0]) && hl.eventsInCar.length === 1 && hl.eventsInCar[0].station === 'quiet_signal', 'the top of the hour shows one bulletin in the station voice and emits radio:news');
  t.assert(hl.tickerCur && /BULLETIN/.test(hl.tickerCur), 'the bulletin is on the ticker strip');
  t.assert(hl.onFoot && hl.shownTotal === 1, 'no bulletin on foot');
  t.assert(hl.errors.length === 0, 'headless errors: ' + hl.errors.join('\n'));
  const herrs = await t.errors(hctx);
  t.assert(herrs.length === 0, 'headless page errors:\n' + herrs.join('\n'));
  await hctx.page.close();

  // ---- 3. live page: every station plays through the current engine ----
  const page = await t.browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(t.url({ headless: 0, skipTitle: 1, seed: 7 }));
  await page.waitForFunction(() => window.GTP && GTP.game && GTP.game.booted && GTP.game.frames >= 2, null, { timeout: 240000 });
  await page.mouse.click(640, 200);
  const unlocked = await page.evaluate(() => ({ ctx: GTP.Audio.ctx && GTP.Audio.ctx.state, game: GTP.game.state }));
  if (unlocked.game === 'title') { await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => GTP.game.state === 'playing', null, { timeout: 240000 });
  await page.evaluate(() => {
    const p = GTP.game.player, rp = GTP.World.nearestRoadPoint(p.x, p.z) || { x: p.x + 3, z: p.z };
    const v = GTP.game.debug.spawnVehicle(rp.x, rp.z, 'sedan');
    const d = v.doorWorld(0); GTP.game.debug.teleport(d.x, d.z); GTP.game.advance(0.1);
    GTP.Input.set('enter', true); GTP.game.advance(1 / 60); GTP.Input.set('enter', false); GTP.game.advance(0.8);
    // software GL renders a frame every few hundred ms and the engine drops steps missed in a stall, so freeze the
    // render loop and pump the audio update in real time (the engine and the data are what is under test here)
    cancelAnimationFrame(GTP.game._raf); GTP.game._raf = 0;
    window.__radioPump = setInterval(() => GTP.Audio.update(0.02), 20);
  });
  console.log('  live: ' + JSON.stringify(unlocked) + ' inCar=' + (await page.evaluate(() => !!GTP.game.player.inVehicle)));
  const live = [];
  for (let i = 0; i < stationIds.length; i++) {
    const id = stationIds[i];
    await page.evaluate((a) => { const Rd = GTP.Content.radio; Rd.cue(a.id, 0); GTP.Audio.radio.setStation(a.i); }, { id, i });
    const samples = [];
    const secs = id === 'quiet_signal' ? 10 : id === 'wail_101' ? 6 : 7;
    for (let k = 0; k < secs * 4; k++) {
      await page.waitForTimeout(250);
      samples.push(await page.evaluate((sid) => { const n = GTP.Content.radio.nowPlaying(sid), s = GTP.Audio.radio.state(); return { sec: n.section, pos: n.pos, song: n.song, sched: s.scheduled, id: s.id, live: s.live, playing: s.playing, game: GTP.game.state, voices: GTP.Audio.state().voices }; }, id));
    }
    const first = samples[0], last = samples[samples.length - 1];
    const sections = [...new Set(samples.map((s) => s.sec))], positions = new Set(samples.map((s) => s.pos));
    live.push({ id, scheduled: last.sched - first.sched, sections, bars: positions.size, song: last.song, onAir: samples.every((s) => s.id === id && s.live), maxVoices: Math.max(...samples.map((s) => s.voices)), off: samples.filter((s) => !(s.id === id && s.live)).slice(0, 2) });
  }
  console.log('  live play:\n    ' + live.map((l) => JSON.stringify(l)).join('\n    '));
  const secsOf = (id) => (id === 'quiet_signal' ? 10 : id === 'wail_101' ? 6 : 7);
  const stepsPerSec = (id) => R.station(id).bpm / 15;
  await page.evaluate(() => clearInterval(window.__radioPump));
  const audioState = await page.evaluate(() => GTP.Audio.state());
  t.assert(audioState.ctx === 'running', 'the AudioContext runs after the click: ' + audioState.ctx);
  live.forEach((l) => {
    t.assert(l.onAir && l.scheduled > secsOf(l.id) * 4 * 0.6 * stepsPerSec(l.id) / 4, l.id + ': the engine scheduled steps on air (' + l.scheduled + ')');
    t.assert(l.bars >= 2, l.id + ': the view advanced through bars (' + l.bars + ')');
  });
  t.assert(live.filter((l) => l.sections.length >= 2).length >= 2, 'the view crossed a section boundary live (stations with short intros): ' + live.map((l) => l.id + ':' + l.sections.join('/')).join(' '));
  t.assert(audioState.errors === 0 && !audioState.disabled, 'audio healthy after the live run: ' + JSON.stringify({ errors: audioState.errors, disabled: audioState.disabled }));

  // ---- 4. offline renders of every song ----
  const renders = await page.evaluate(async () => {
    const A = GTP.Audio, Rd = GTP.Content.radio, out = [];
    for (let i = 0; i < Rd.stations.length; i++) {
      const st = Rd.stations[i];
      for (let k = 0; k < st.songs.length; k++) {
        Rd.cue(st.id, k);
        const secs = st.id === 'quiet_signal' ? 16 : st.id === 'wail_101' ? 10 : 12;
        const r = await A.render('radio', { station: i, seconds: secs });
        const np = Rd.nowPlaying(st.id);
        Rd.cue(st.id, k);
        const r6 = await A.render('radio', { station: i, seconds: st.id === 'wail_101' ? 14 : 6 });   // the window tests/audio.js renders
        out.push({ station: st.id, song: st.songs[k].id, playedSong: np && np.song, peak: r && r.peak, peak6: r6 && r6.peak, rms: r && r.rms, env: r && r.env });
      }
    }
    return out;
  });
  const stats = (env) => { const m = env.reduce((a, v) => a + v, 0) / env.length; const sd = Math.sqrt(env.reduce((a, v) => a + (v - m) * (v - m), 0) / env.length); return { m, cv: sd / (m || 1) }; };
  console.log('  renders:\n    ' + renders.map((r) => `${r.station.padEnd(14)} ${r.song.padEnd(18)} peak ${r.peak} (opening ${r.peak6})  rms ${r.rms}  cv ${stats(r.env).cv.toFixed(2)}`).join('\n    '));
  // raw offline peaks skip the engine's music bus (x 0.6) and compressor: the opening (the window tests/audio.js
  // checks) stays under 0.995 and the whole song keeps in-game headroom (under 0.75 after the bus)
  const badR = renders.filter((r) => !(r.rms > 0.008) || !(r.peak6 < 0.995) || !(r.peak < 1.25) || r.playedSong !== r.song);
  t.assert(badR.length === 0, 'every song renders audible with headroom, and the render played the cued song: ' + JSON.stringify(badR.map((r) => [r.station, r.song, r.peak, r.rms, r.playedSong])));
  const flat = renders.filter((r) => stats(r.env).cv < 0.15);
  t.assert(flat.length === 0, 'no song renders as a flat drone (envelope variation): ' + flat.map((r) => r.station + '/' + r.song).join(','));
  // songs on a station differ from each other (mean envelope distance)
  for (const id of stationIds) {
    const rs = renders.filter((r) => r.station === id);
    let minD = 1e9;
    for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
      const n = Math.min(rs[a].env.length, rs[b].env.length); let d = 0;
      for (let j = 0; j < n; j++) d += Math.abs(rs[a].env[j] - rs[b].env[j]);
      minD = Math.min(minD, d / n);
    }
    t.assert(minD > 0.004, id + ': every pair of songs sounds different (min envelope distance ' + minD.toFixed(4) + ')');
  }
  const final = await page.evaluate(() => GTP.Audio.state());
  t.assert(final.errors === 0, 'audio errors after renders: ' + final.errors);
  const errs = [].concat(pageErrors.map((e) => 'pageerror: ' + e), consoleErrors.map((e) => 'console: ' + e), await t.gameErrors(page));
  t.assert(errs.length === 0, 'live page errors:\n' + errs.join('\n'));
  await page.close();
});
