#!/usr/bin/env node
// Content audit for Grand Theft Pundit. See CONTENT_RULES.md.
// Scans code, data, dialogue, docs and the page shell for terms that would turn
// the parody into a reference to a real person, a real event, a real country
// or agency, or hateful content. Exits non-zero on any hit.
//
// Run: node tests/content_audit.js
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SELF = path.resolve(__filename)

// ---- Patterns -----------------------------------------------------------
// Each entry: [regex, reason]. Case-insensitive. Word-bounded unless the term
// is a surname fragment that a "thin edit" would keep.
const rot13 = s => s.replace(/[a-z]/gi, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26))

const REAL_PEOPLE = [
  // politicians and heads of state
  'trump', 'donald j', 'melania', 'ivanka', 'biden', 'obama', 'clinton', 'hillary', 'pelosi', 'kamala', 'harris, kamala', 'vance', 'pence', 'desantis', 'newsom', 'ocasio', 'aoc', 'bernie', 'sanders', 'mcconnell', 'schumer', 'cheney', 'bush', 'reagan', 'nixon', 'kennedy', 'rfk', 'musk', 'netanyahu', 'bibi', 'zelensky', 'zelenskyy', 'putin', 'xi jinping', 'kim jong', 'erdogan', 'orban', 'milei', 'modi', 'macron', 'trudeau', 'starmer',
  // pundits, media and influencer figures
  'kirk', 'charlie k', 'tpusa', 'turning point', 'shapiro', 'crowder', 'carlson', 'tucker', 'rogan', 'hannity', 'candace', 'owens', 'fuentes', 'tate, andrew', 'andrew tate', 'kanye', 'ye west', 'west, kanye', 'alex jones', 'infowars', 'bannon', 'loomer', 'greene, marjorie', 'mtg', 'boebert', 'gaetz', 'maddow', 'colbert', 'kimmel', 'oliver, john', 'joe rogan', 'lex fridman', 'jordan peterson', 'peterson, jordan', 'destiny', 'hasan', 'piker', 'vaush', 'nick fuentes', 'steven crowder', 'ben shapiro', 'dave rubin', 'matt walsh', 'michael knowles', 'tim pool', 'sneako', 'adin ross', 'kai cenat', 'ishowspeed', 'mr beast', 'mrbeast', 'logan paul', 'jake paul', 'kardashian', 'kylie', 'taylor swift', 'swift, taylor', 'beyonce', 'jay-z', 'jay z', 'drake', 'kendrick',
  // crime victims, defendants, and people known from real cases or viral incidents
  'diddy', 'p diddy', 'puff daddy', 'puffy', 'combs', 'sean john', 'bad boy records', 'floyd', 'george f', 'chauvin', 'epstein', 'maxwell, ghislaine', 'ghislaine', 'weinstein', 'kelly, r', 'r kelly', 'r. kelly', 'cosby', 'rittenhouse', 'zimmerman', 'trayvon', 'breonna', 'cornell 7', 'cornell seven', 'cornell girl', 'luigi', 'mangione', 'tyler robinson',
  // slogans, catchphrases, brands that identify one real person or org
  'maga', 'make america great', 'america first', 'prove me wrong', 'change my mind', 'facts don\'t care', 'facts dont care', 'let\'s go brandon', 'mar-a-lago', 'mar a lago', 'truth social', 'daily wire', 'the daily wire', 'fox news', 'cnn', 'msnbc', 'newsmax', 'oan', 'breitbart', 'the blaze', 'theblaze', 'prager', 'heritage foundation', 'aipac', 'adl', 'splc', 'blm', 'black lives matter', 'proud boys', 'antifa', 'qanon', 'pizzagate', 'epstein list', 'great replacement', 'deep state',
]

const REAL_PLACES_AGENCIES = [
  'israel', 'israeli', 'mossad', 'idf', 'gaza', 'palestin', 'zion', 'tel aviv', 'jerusalem', 'west bank', 'hamas', 'hezbollah', 'iran', 'tehran', 'ukraine', 'russia', 'kremlin', 'moscow', 'china', 'beijing', 'ccp', 'north korea', 'pyongyang', 'saudi', 'riyadh', 'qatar', 'venezuela', 'mexico cartel',
  'cia', 'c.i.a', 'central intelligence', 'fbi', 'f.b.i', 'nsa', 'n.s.a', 'dhs', 'ice agents', 'doj', 'pentagon', 'langley', 'kgb', 'fsb', 'gru', 'mi6', 'mi5', 'secret service', 'epstein island',
  'white house', 'capitol hill', 'wall street', 'silicon valley', 'hollywood', 'washington dc', 'washington, d.c',
]

const HATE = [
  // slurs, stored rot13 so the plain strings never live in the repo
  'avttre', 'avttn', 'xvxr', 'fcvp', 'jrgonpx', 'puvax', 'tbbx', 'enturnq', 'snttbg', 'snt ', 'genaal', 'qlxr', 'ergneq', 'ergneqrq', 'fuvgfxva', 'fnaq avttre', 'gbjryurnq', 'ornare', 'pbba', 'wnc ', 'cnxv', 'lvq', 'urro', 'tlcfl', 'tbllvz',
].map(rot13)

const TROPES = [
  // conspiracy framings that are banned in every costume
  'control the media', 'controls the media', 'control the banks', 'controls the banks', 'run the world', 'runs the world', 'control the world', 'controls the world', 'globalist', 'rothschild', 'soros', 'new world order', 'nwo', 'puppet master', 'puppet masters', 'cabal', 'chemtrail', 'false flag', 'crisis actor', 'crisis actors', 'adrenochrome', 'lizard people', 'reptilian', 'the jews', 'jewish', 'zionist', 'muslim', 'islam', 'christian nationalist', 'sharia', 'illegals', 'invasion', 'replacement',
]

const SEXUAL = [
  'sex trafficking', 'trafficking', 'freak off', 'freak-off', 'freakoff', 'baby oil', 'orgy', 'escort', 'stripper', 'strip club', 'porn', 'nude', 'naked', 'onlyfans', 'rape', 'molest', 'pedophil', 'grooming', 'groomer',
]

function compile(list, reason, bounded) {
  return list.map(term => {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const src = bounded ? `(?<![a-z])${esc}(?![a-z])` : esc
    return { re: new RegExp(src, 'i'), term, reason }
  })
}

const PATTERNS = [
  ...compile(REAL_PEOPLE, 'real person / real org / real slogan', true),
  ...compile(REAL_PLACES_AGENCIES, 'real country / city / agency', true),
  ...compile(HATE, 'slur', true),
  ...compile(TROPES, 'hateful or conspiracy trope', true),
  ...compile(SEXUAL, 'sexual content', true),
]

// A few bounded terms are also banned as substrings because a thin edit keeps them.
const SUBSTRING = compile(['netanyahu', 'trumpist', 'trumpian', 'drumpf', 'diddy', 'kirkl', 'floydian', 'epstein', 'combsy', 'tpusa', 'mossad', 'zionis'], 'thin-edit of a real name', false)
PATTERNS.push(...SUBSTRING)

// ---- Allow list (whole lines) ---------------------------------------------
// Lines that legitimately contain a term, like the audit doc pointer.
const ALLOW_LINE = [
  /CONTENT_RULES\.md/, // pointers to the rules file are fine
]

// ---- Walk ----------------------------------------------------------------
const INCLUDE_EXT = new Set(['.js', '.html', '.md', '.json', '.txt', '.css'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out'])

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out) }
    else if (INCLUDE_EXT.has(path.extname(name)) && path.resolve(p) !== SELF) out.push(p)
  }
  return out
}

const files = walk(ROOT, [])
const hits = []
for (const f of files) {
  const rel = path.relative(ROOT, f)
  // CONTENT_RULES.md is the rulebook: it names the banned topics by necessity.
  if (rel === 'CONTENT_RULES.md') continue
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (ALLOW_LINE.some(re => re.test(line))) return
    for (const p of PATTERNS) {
      if (p.re.test(line)) hits.push({ file: rel, line: i + 1, term: p.term, reason: p.reason, text: line.trim().slice(0, 140) })
    }
  })
}

if (hits.length) {
  console.error(`CONTENT AUDIT FAILED: ${hits.length} hit(s) in ${new Set(hits.map(h => h.file)).size} file(s)\n`)
  for (const h of hits) console.error(`  ${h.file}:${h.line}  [${h.reason}: "${h.term}"]\n      ${h.text}`)
  console.error('\nFix the content (see CONTENT_RULES.md). Do not edit the audit to make it pass.')
  process.exit(1)
} else {
  console.log(`content audit OK: ${files.length} files scanned, 0 hits`)
}
