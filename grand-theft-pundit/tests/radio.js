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
  t.assert(R.defaultStation === 'wail_101' && R.station(R.defaultStation) === R.stations[0] && R.napMinute === 20, 'default station and the Nap Dynasty minute');
  t.assert(R.timeline('no_such_station').length === 0 && R.songStarts('no_such_station').length === 0 && R.cue('no_such_station', 1) === false && R.nowPlaying('no_such_station') === null, 'song helpers do not fall back to WAIL 101 on an unknown id');
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

  // an on-air cue on the talk station keeps the engine's 12-bar bumper/talk cycle on the song's sections
  const fw = { id: 'wail_101', talkBar: -1 }, R5 = loadRadio({ Audio: { radio: { state: () => ({ id: fw.id, talkBar: fw.talkBar }) } } }).Content.radio, w5 = R5.station('wail_101');
  for (fw.talkBar = -1; fw.talkBar <= 40; fw.talkBar++) w5.pattern.bass;
  R5.cue('wail_101', 2); let aligned = true, reached2 = false;
  for (fw.talkBar = 41; fw.talkBar < 70; fw.talkBar++) { w5.pattern.bass; const np5 = R5.nowPlaying('wail_101'); if ((fw.talkBar % 12 >= 4) !== (np5.section === 'talk')) aligned = false; if (np5.song === w5.songs[2].id && fw.talkBar % 12 === 0) reached2 = true; }
  t.assert(aligned && reached2, 'an on-air cue on WAIL 101 starts the song at the next 12-bar cycle and stays in phase');

  // the wrappers: installed once, following the module now in GTP.Content.radio; the feeds work with no engine
  let fbar = -1; const code = fs.readFileSync(SRC, 'utf8');
  const W = { GTP: { Audio: { update() {}, render() { return null; }, radio: { current: () => W.GTP.Content.radio.stations[1], nowPlaying: () => 'ENGINE TEXT', isPlaying: () => true, state: () => ({ id: 'pennant_fm', talkBar: fbar }) } } } };
  W.window = W;
  vm.runInNewContext(code, W); const up1 = W.GTP.Audio.update, np1 = W.GTP.Audio.radio.nowPlaying, rd1 = W.GTP.Audio.render;
  vm.runInNewContext(code, W);
  t.assert(W.GTP.Audio.update === up1 && W.GTP.Audio.radio.nowPlaying === np1 && W.GTP.Audio.render === rd1, 'a second load wraps nothing twice');
  const pw = W.GTP.Content.radio.station('pennant_fm'); for (fbar = -1; fbar < 70; fbar++) pw.pattern.bass;
  const npw = W.GTP.Audio.radio.nowPlaying();
  t.assert(typeof npw === 'string' && npw.indexOf(W.GTP.Content.radio.onAir('pennant_fm').title + '  ·  ') === 0 && /ENGINE TEXT$/.test(npw), 'the nowPlaying wrapper follows the current module: ' + npw);
  pw.nowPlaying = { kind: 'news', text: 'OVERRIDE LINE' };
  t.assert(W.GTP.Audio.radio.nowPlaying() === 'OVERRIDE LINE  ·  ENGINE TEXT', 'an assigned nowPlaying feed reaches the wrapper string');
  pw.nowPlaying = null;
  t.assert(pw.nowPlaying.kind === 'song', 'assigning null restores the live feed');
  W.GTP.Audio.radio.isPlaying = () => false;
  t.assert(pw.nowPlaying === null, 'nothing is "now playing" while the engine is silent (parachute, stopped)');

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

  // the news follows the real story chain: play GTP.Content.parity.chain in order with every content file loaded
  const CW = { GTP: {} }; CW.window = CW;
  ['20_content_world', '21_content_cast', '22_content_missions', '23_content_radio', '24_content_expansion', '25_content_parity'].forEach((f) => vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), CW, { filename: f }));
  const CC = CW.GTP.Content, RC = CC.radio, NC = RC.news, byId = {};
  [].concat(CC.missions || [], (CC.expansion && CC.expansion.missions) || [], (CC.parity && CC.parity.missions) || []).forEach((m) => { byId[m.id] = m; });
  const chain = (CC.parity && CC.parity.chain) || [];
  t.assert(chain.length >= 30 && chain.every((id) => byId[id]), 'the story chain resolves: ' + chain.length);
  const cf = {}, cd = [], darkSteps = [], leads = new Set();
  for (const id of chain) {
    const oc = byId[id].onComplete || {}, fl = [].concat(oc.setFlag ? [oc.setFlag] : [], oc.setFlags || []);
    fl.forEach((f) => { cf[f] = true; }); cd.push(id);
    const mine = NC.order.filter((k) => k === 'mission:' + id || fl.indexOf(k) >= 0);
    const b = RC.bulletin('wail_101', 3, { flags: cf, completed: cd });
    if (!mine.length || b.stage !== mine[mine.length - 1]) darkSteps.push(id + ' -> ' + b.stage + ' (own keys: ' + mine.join(',') + ')');
    if (b.stage) leads.add(b.stage);
  }
  t.assert(darkSteps.length === 0, 'after every chain mission its own story beat leads the bulletin:\n  ' + darkSteps.join('\n  '));
  t.assert(NC.order.every((k) => leads.has(k) || /^ending_/.test(k)), 'every news key leads at some point: ' + NC.order.filter((k) => !leads.has(k)).join(','));
  // parity.radio (content track) is merged: its mission news joins byMission, outcome lines wait for their mission
  RC.mergeParity();
  const PR = CC.parity.radio;
  t.assert(RC._parityMerged && Object.keys(PR.news).every((m) => NC.byMission[m] && (NC.byMission[m].indexOf(PR.news[m]) >= 0 || RC.paritySkipped.indexOf(PR.news[m]) >= 0)), 'parity news lines join their missions (or are skipped as a near-duplicate of a line already there)');
  console.log('  parity merge skipped as near-duplicates: ' + JSON.stringify(RC.paritySkipped));
  t.assert(Object.values(PR.news).every((l) => RC.ticker.indexOf(l) < 0), 'outcome headlines never sit in the always-on ticker');
  const pqs = RC.station('quiet_signal'), djLocked = pqs.dj.slice();
  CW.GTP.Missions = { state: { flags: {}, completed: new Set(['b04_redacted', 'h03_job']) } };
  t.assert(pqs.dj.length > djLocked.length && djLocked.every((l) => !/balloon was popped/i.test(l)) && pqs.dj.some((l) => /balloon was popped/i.test(l)), 'a parity DJ line about an outcome airs only after its mission');
  t.assert(RC.stations.every((st) => /Nap Dynasty|mattress/i.test(st.ads[st.napAd])), 'napAd still points at the mattress ad after every append');

  // call-in show
  const C = R.callin, wail = R.station('wail_101');
  t.assert(C.segments.length >= 6 && C.segments.every((s) => s.title && s.intro && s.outro && s.exchanges.length >= 4), 'call-in show: six or more full segments');
  t.assert(wail.djAll.length > 40, 'djAll lists every line');
  // the feeds' shapes, and the segment rotating at minute 5 with dj, callers and the on-air line together
  const G3 = loadRadio({ game: { time: { day: 0, clock: 0 } } }), R3 = G3.Content.radio, w3 = R3.station('wail_101');
  R3.stations.forEach((st) => {
    const np = st.nowPlaying, b = st.bulletins;
    t.assert(st.id === 'wail_101' ? (np.kind === 'show' && np.title.indexOf(R3.callin.show + ': ') === 0 && np.text && np.host) : (np.kind === 'song' && np.id && np.title && np.artist && np.section), st.id + ': nowPlaying shape ' + JSON.stringify(np));
    t.assert(Array.isArray(b) && b.length === 1 && b[0].text === R3.bulletin(st.id).text && b[0].headline && 'stage' in b[0] && Number.isInteger(b[0].hour), st.id + ': bulletins shape');
    t.assert((st.id === 'wail_101') === Array.isArray(st.callers), st.id + ': callers only on WAIL 101');
  });
  for (let h = 0; h < R3.callin.segments.length + 1; h++) {
    G3.game.time.clock = h + 6 / 60; const seg = R3.segment(), cs = w3.callers;
    t.assert(cs.length === seg.exchanges.length && cs.every((c, i) => c.caller !== 'A caller' && seg.exchanges[i] === 'CALLER, ' + c.caller + ': ' + c.text), 'hour ' + h + ': callers are {caller, text} of ' + seg.id);
    t.assert(w3.nowPlaying.id === seg.id && w3.dj[0].indexOf(seg.title.toUpperCase()) > 0 && w3.dj.indexOf(seg.outro) > 0, 'hour ' + h + ': show, dj and callers rotate together');
    G3.game.time.clock = h + 1 + 2 / 60;   // the top of the next hour: still the same segment (the bulletin's window)
    t.assert(R3.segment().id === seg.id, 'hour ' + h + ': the segment holds through the bulletin minutes');
  }

  // every string through the content audit, plus length and PG-13 sanity
  const all = strings(R, 'radio', [], new Set());
  t.assert(all.length > 400, 'strings collected: ' + all.length);
  const audit = auditLines(all.map((x) => x.s));
  console.log('  audit on ' + all.length + ' runtime strings: ' + (audit.log.concat(audit.err).join(' | ').slice(0, 400)));
  t.assert(audit.code === 0 && /0 hits/.test(audit.log.join(' ')), 'content audit passes on every runtime string');
  // composed lines the walker cannot see (getters, functions): on-air titles, WAIL's dj per segment, callers, bulletins
  const extra = [];
  for (let h = 0; h < R3.callin.segments.length; h++) {
    G3.game.time.clock = h + 0.5;
    R3.stations.forEach((st) => { const o = st.nowPlaying; extra.push({ at: st.id + '.nowPlaying@' + h, s: o.title + '  ·  ' + (o.artist || o.text) }); });
    w3.dj.forEach((s, i) => extra.push({ at: 'wail.dj@' + h + '[' + i + ']', s }));
    w3.callers.forEach((c, i) => extra.push({ at: 'wail.callers@' + h + '[' + i + ']', s: c.caller + ': ' + c.text }));
  }
  const fl2 = {}, dn2 = [];
  N.order.forEach((key) => { if (key.indexOf('mission:') === 0) dn2.push(key.slice(8)); else fl2[key] = true; ids.forEach((id) => { for (let h = 0; h < 4; h++) extra.push({ at: 'bulletin@' + id + '/' + key + '/' + h, s: R.bulletin(id, h, { flags: fl2, completed: dn2 }).text }); }); });
  const audit2 = auditLines(extra.map((x) => x.s));
  t.assert(audit2.code === 0 && /0 hits/.test(audit2.log.join(' ')), 'content audit passes on ' + extra.length + ' composed ticker lines: ' + audit2.err.join(' | '));
  t.assert(extra.every((x) => x.s.length <= (/^bulletin@/.test(x.at) ? 340 : 160)), 'composed lines fit the ticker (bulletins scroll): ' + extra.filter((x) => x.s.length > (/^bulletin@/.test(x.at) ? 340 : 160)).map((x) => x.at + ' ' + x.s.length).join(', '));
  const rot13 = (s) => s.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
  const strong13 = ['shpx', 'fuvg', 'ovgpu', 'phag', 'qvpx', 'cvff', 'onfgneq', 'nffubyr', 'jnax', 'gjng'].map(rot13);
  const bad = all.filter((x) => strong13.some((w) => new RegExp('(?<![a-z])' + w, 'i').test(x.s)) || /TODO|FIXME|lorem/i.test(x.s) || x.s.length > 160);
  t.assert(bad.length === 0, 'PG-13, no placeholders, every atomic line fits the ticker: ' + bad.map((x) => x.at + ': ' + x.s).join('\n'));
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
    // the top of the hour in the car: radio:news fires once (the v0.3 UI shows station.bulletins itself)
    const shown = [], events = [];
    const origTicker = GTP.UI.ticker;
    GTP.UI.ticker = function (text) { shown.push(text); return origTicker.apply(this, arguments); };
    GTP.Events.on('radio:news', (b) => events.push(b));
    A.radio.setStation(Rd.stations.findIndex((s) => s.id === 'quiet_signal'));
    GTP.game.debug.setClock(13 + 59.5 / 60); GTP.game.advance(0.1);
    GTP.game.advance(1.2);   // 1.2 s real = 0.8 game minutes: crosses 14:00
    out.eventsInCar = events.map((e) => ({ station: e.station, stage: e.stage, n: e.headlines.length, text: e.text.slice(0, 40) }));
    // what the UI ticker shows per station (docs/v03/ui.md: nowPlaying, bulletins, callers)
    const tk = GTP.UI.state.ticker, feed = {};
    for (const sid of ['pennant_fm', 'wail_101', 'loop_174']) {
      A.radio.setStation(Rd.stations.findIndex((s) => s.id === sid)); GTP.game.debug.setClock(14.01);
      tk.lastNp = null; tk.lastBulletin = -1; tk.n = 0; tk.queue.length = 0; const lines = [];
      for (let i = 0; i < 15; i++) { tk.cur = null; GTP.UI.update(1 / 60); if (tk.cur) lines.push(tk.cur.tag + ': ' + tk.cur.text); }
      feed[sid] = lines;
    }
    out.feed = feed;
    const np = A.radio.nowPlaying();
    out.np = { str: String(np), type: typeof np, onAir: Rd.onAir('loop_174') };
    // an assigned feed reaches the ticker, null hands it back
    const pen = Rd.station('pennant_fm'); A.radio.setStation(Rd.stations.indexOf(pen)); GTP.game.debug.setClock(14.01);
    pen.nowPlaying = { kind: 'song', id: 'ovr', title: 'OVERRIDE SONG', artist: 'Test Desk' }; pen.bulletins = [{ text: 'OVERRIDE BULLETIN' }];
    tk.lastNp = null; tk.lastBulletin = -1; tk.n = 0; tk.queue.length = 0; const ov = [];
    for (let i = 0; i < 4; i++) { tk.cur = null; GTP.UI.update(1 / 60); if (tk.cur) ov.push(tk.cur.text); }
    pen.nowPlaying = null; pen.bulletins = null;
    out.override = { np: ov.some((l) => /OVERRIDE SONG/.test(l)), bul: ov.some((l) => /OVERRIDE BULLETIN/.test(l)), restored: !!pen.nowPlaying && pen.nowPlaying.kind === 'song' && pen.bulletins[0].text !== 'OVERRIDE BULLETIN', lines: ov };
    // the Nap Dynasty ad at minute 20 on every station's ticker
    out.nap = Rd.stations.map((st, i) => { A.radio.setStation(i); GTP.game.debug.setClock(14 + 20.5 / 60); tk.lastNapHour = -1; tk.queue.length = 0; tk.cur = null; GTP.UI.update(1 / 60); return st.id + ':' + !!(tk.cur && tk.cur.nap && tk.cur.text === st.ads[st.napAd]); });
    // station.bulletins follows the live mission state (flags and the completed Set)
    const M = GTP.Missions.state, pq = Rd.station('pennant_fm'), saved = { flags: Object.assign({}, M.flags), done: new Set(M.completed) };
    Object.keys(M.flags).forEach((k) => delete M.flags[k]); M.completed.clear();
    out.newsLive = [pq.bulletins[0].stage];
    M.flags.has_table = true; out.newsLive.push(pq.bulletins[0].stage);
    M.completed.add('b01_goldplate'); out.newsLive.push(pq.bulletins[0].stage);
    Object.keys(M.flags).forEach((k) => delete M.flags[k]); Object.assign(M.flags, saved.flags); M.completed.clear(); saved.done.forEach((x) => M.completed.add(x));
    // real time on WAIL 101: the ticker runs from 13:57 to about 14:17 (the draw-side line timer emulated, as headless never
    // draws); the hourly bulletin must get its slot and the new call-in segment follows after minute 5
    A.radio.setStation(Rd.stations.findIndex((s) => s.id === 'wail_101')); GTP.game.debug.setClock(13 + 57 / 60);
    tk.cur = null; tk.queue.length = 0; tk.forceT = 0; tk.lastBulletin = -1; const seen = []; let lastCur = null;   // hour 14's bulletin already ran in the quick checks above
    for (let i = 0; i < 60 * 30; i++) {
      GTP.game.advance(1 / 60);
      const c = tk.cur;
      if (c && c !== lastCur) { lastCur = c; const clk = GTP.game.time.clock; seen.push(Math.floor(clk) + ':' + String(Math.floor((clk % 1) * 60)).padStart(2, '0') + ' ' + c.tag + ': ' + c.text.slice(0, 70)); }
      if (c && !c.done && tk.lineT > Math.max(4.5, (c.text.length * 7.5 - 700) / 70 + 3.5)) c.done = true;
    }
    out.wailLive = seen;
    out.eventsBeforeFoot = events.length;
    // on foot: no bulletin event
    const vv = p.inVehicle; if (vv) { vv.speed = 0; vv.vx = 0; vv.vz = 0; } GTP.game.advance(0.1);
    press('enter'); GTP.game.advance(0.6);
    out.onFoot = !p.inVehicle;
    GTP.game.debug.setClock(15 + 59.5 / 60); GTP.game.advance(0.1); GTP.game.advance(1.2);
    out.eventsTotal = events.length; out.shownTotal = shown.length;
    GTP.UI.ticker = origTicker;
    out.errors = (GTP.errors || []).map((e) => e.where + ': ' + e.message);
    return out;
  });
  console.log('  headless: ' + JSON.stringify({ inCar: hl.inCar, cycle: hl.cycle, events: hl.eventsInCar, np: hl.np, onFoot: hl.onFoot, eventsTotal: hl.eventsTotal }));
  console.log('  ticker feed:\n    ' + Object.keys(hl.feed).map((k) => k + ':\n      ' + hl.feed[k].map((l) => l.slice(0, 110)).join('\n      ')).join('\n    '));
  t.assert(hl.inCar, 'in a car');
  t.assert(hl.cycle.length === stationIds.length + 1 && new Set(hl.cycle).size === stationIds.length && hl.cycle[0] === hl.cycle[hl.cycle.length - 1], 'R cycles through every station and wraps: ' + hl.cycle.join(' > '));
  t.assert(hl.tickerIsArray, 'the ticker is still a plain array after every content file loaded');
  t.assert(hl.eventsInCar.length === 1 && hl.eventsInCar[0].station === 'quiet_signal' && /^A BULLETIN HAS BEEN ISSUED/.test(hl.eventsInCar[0].text), 'the top of the hour emits one radio:news bulletin in the station voice');
  const F = hl.feed;
  t.assert(F.pennant_fm.some((l) => /^(NOW PLAYING|ON AIR): .+  ·  .+  ·  Pennant FM/.test(l)) && F.loop_174.some((l) => /^(NOW PLAYING|ON AIR): .+  ·  .+  ·  Loop 174/.test(l)), 'the ticker names the song and artist on music stations');
  t.assert(F.pennant_fm.some((l) => /^NEWS 14:00: PENNANT FM NEWS/.test(l)) && F.loop_174.some((l) => /^NEWS 14:00: LOOP 174 NEWS/.test(l)), 'the hourly bulletin shows in each station voice');
  t.assert(F.wail_101.some((l) => /^ON AIR: Uproar at Large: .+WAIL 101/.test(l)) && F.wail_101.some((l) => /^CALLER: .+ on the line: /.test(l)) && F.wail_101.some((l) => /^NEWS 14:00: WAIL 101 NEWS/.test(l)), 'WAIL 101 shows the show on air, callers and the bulletin');
  t.assert(hl.np.type === 'string' && hl.np.str.indexOf(hl.np.onAir.title + '  ·  ' + hl.np.onAir.artist) === 0 && /Loop 174/.test(hl.np.str), 'Audio.radio.nowPlaying() is a string naming the song, then the station: ' + JSON.stringify(hl.np));
  t.assert(hl.eventsBeforeFoot === 2, 'one radio:news per hour turned in the car (14:00 twice: the quick check and the real-time run): ' + hl.eventsBeforeFoot);
  t.assert(hl.onFoot && hl.eventsTotal === hl.eventsBeforeFoot && hl.shownTotal === 0, 'no bulletin on foot, and nothing pushed past the UI');
  t.assert(hl.override.np && hl.override.bul && hl.override.restored, 'feed setters reach the ticker and null restores them: ' + JSON.stringify(hl.override));
  t.assert(hl.nap.every((x) => /:true$/.test(x)), 'the Nap Dynasty ad runs at minute 20 on every station: ' + hl.nap.join(' '));
  t.assert(JSON.stringify(hl.newsLive) === JSON.stringify([null, 'has_table', 'mission:b01_goldplate']), 'station.bulletins follows live flags and completed missions: ' + JSON.stringify(hl.newsLive));
  console.log('  WAIL 101 in real time:\n    ' + hl.wailLive.join('\n    '));
  const bIdx = hl.wailLive.findIndex((l) => /^14:0[0-2] NEWS 14:00: WAIL 101 NEWS/.test(l)), sIdx = hl.wailLive.findIndex((l) => /^14:(0[5-9]|[1-5]\d) ON AIR: Uproar at Large: /.test(l));
  t.assert(bIdx >= 0, 'in real time the hourly bulletin gets its slot on WAIL 101');
  t.assert(sIdx > bIdx, 'the next call-in segment goes on air after the bulletin');
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

  const final = await page.evaluate(() => GTP.Audio.state());
  t.assert(final.errors === 0, 'audio errors after the live run: ' + final.errors);
  const errs = [].concat(pageErrors.map((e) => 'pageerror: ' + e), consoleErrors.map((e) => 'console: ' + e), await t.gameErrors(page));
  t.assert(errs.length === 0, 'live page errors:\n' + errs.join('\n'));
  await page.close();

  // ---- 4. offline renders of every song ----
  // a fresh headless page: no AudioContext and no real-time loop, so nothing draws from the engine's noise RNG
  // between renders and the peaks are the same on every run
  const rctx = await t.boot({ seed: 7 });
  const isolation = await rctx.page.evaluate(async () => {
    const A = GTP.Audio, Rd = GTP.Content.radio, i = Rd.stations.findIndex((s) => s.id === 'velvetine_888');
    const before = Rd.nowPlaying('velvetine_888').pos;
    await A.render('radio', { station: i, seconds: 4 });
    return { before, after: Rd.nowPlaying('velvetine_888').pos, rendered: (Rd.lastRender.velvetine_888 || []).slice() };
  });
  t.assert(isolation.before === isolation.after && isolation.rendered.length >= 1, 'a radio render leaves the live song where it was: ' + JSON.stringify(isolation));
  const renders = await rctx.page.evaluate(async () => {
    const A = GTP.Audio, Rd = GTP.Content.radio, out = [];
    for (let i = 0; i < Rd.stations.length; i++) {
      const st = Rd.stations[i];
      for (let k = 0; k < st.songs.length; k++) {
        Rd.cue(st.id, k);
        const secs = st.id === 'quiet_signal' ? 16 : st.id === 'wail_101' ? 10 : 12;
        const r = await A.render('radio', { station: i, seconds: secs });
        const played = (Rd.lastRender[st.id] || []).map((n) => st.songs[n].id);
        Rd.cue(st.id, k);
        const r6 = await A.render('radio', { station: i, seconds: st.id === 'wail_101' ? 14 : 6 });   // the window tests/audio.js renders
        out.push({ station: st.id, song: st.songs[k].id, played, peak: r && r.peak, peak6: r6 && r6.peak, rms: r && r.rms, env: r && r.env });
      }
    }
    return out;
  });
  const stats = (env) => { const m = env.reduce((a, v) => a + v, 0) / env.length; const sd = Math.sqrt(env.reduce((a, v) => a + (v - m) * (v - m), 0) / env.length); return { m, cv: sd / (m || 1) }; };
  console.log('  renders:\n    ' + renders.map((r) => `${r.station.padEnd(14)} ${r.song.padEnd(18)} peak ${r.peak} (opening ${r.peak6})  rms ${r.rms}  cv ${stats(r.env).cv.toFixed(2)}`).join('\n    '));
  // raw offline peaks skip the engine's music bus (x 0.6) and compressor: the opening (the window tests/audio.js
  // checks) stays under 0.995 and the whole song keeps in-game headroom (under 0.75 after the bus)
  const badR = renders.filter((r) => !(r.rms > 0.008) || !(r.peak6 < 0.995) || !(r.peak < 1.25) || r.played.length !== 1 || r.played[0] !== r.song);
  t.assert(badR.length === 0, 'every song renders audible with headroom, and the render sequenced only the cued song: ' + JSON.stringify(badR.map((r) => [r.station, r.song, r.peak, r.peak6, r.rms, r.played])));
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
  const rfinal = await rctx.page.evaluate(() => GTP.Audio.state());
  t.assert(rfinal.errors === 0, 'audio errors after renders: ' + rfinal.errors);
  const rerrs = await t.errors(rctx);
  t.assert(rerrs.length === 0, 'render page errors:\n' + rerrs.join('\n'));
  await rctx.page.close();
});
