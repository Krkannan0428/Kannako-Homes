# v0.3 integration round 1: combat area (shooting + models + interiors)

Branch `v03r1/combat` from `game/grand-theft-pundit` @ 10ba585. Owner files: `js/06_entities.js`, `js/08_combat.js`,
`js/05b_assets_weapons.js`, `js/05d_models.js`, `js/06c_animation.js`, `js/13_interiors.js`, and `tests/combat.js`,
`actors.js`, `cover.js`, `characters.js`, `interiors.js`. Nothing outside these files was edited; what other areas need is
written below as precise proposals.

<!-- sections below are filled in as the work lands -->

## 1. One arsenal (shooting x content)

The shooting track's 25 fallback additions and the content track's 25 parity weapons overlapped: the merged table had 57
entries with two miniguns (`spin` / `minigun`), two "The Filibuster"s (`filibuster` pistol / `lmg`), `battlerifle` and
`battle_rifle`, `autoshotgun` and `auto_shotgun`, and so on. The parity table is the content of record (missions grant its ids),
so:

- `08_combat.js` `LEGACY` maps 11 parity ids to the fallback entry that duplicates them (`selfie_stick: selfie`,
  `heavy_pistol: filibuster`, `machine_pistol: threadpistol`, `pdw: liveblog`, `battle_rifle: battlerifle`,
  `both_barrels: doublebarrel`, `auto_shotgun: autoshotgun`, `heavy_sniper: heavysniper`, `sticky: stickynote`,
  `spin_smoke: smoke`, `minigun: spin`). When the parity table loads, the parity entry takes the fallback's engine-only fields
  as its base and the fallback id leaves the table; a legacy id still in a pocket (`player.weapons`, `ammo`, `weaponMods`) is
  migrated. Without the parity table the fallback table works as before.
- `normalize()` now copies the parity rows' engine fields (it dropped them): `spinUp`, `stun`, `fuse`, `blast`, `ring`,
  `cook`, `splash`, `burn`, `scope`, `scopedSpread`, `headMul`, `mobility`, `zoom` ...; `sticks` -> `stick`, `remote` -> a 3 s
  fuse, `smokeSeconds` -> `smoke`; a `heavy` rifle is a machine gun, a `heavy` special keeps its base class (the minigun stays
  in the Heavy slot); a lobbed thing that only shoves (the merch cannon) knocks over what it lands on instead of exploding.
  `w.mobility` overrides the class mobility.
- Result: 47 weapons, every `GTP.Content.parity.weapons` id present, no duplicates (checked in the browser).
- Stun weapons (`flare_gun`, `flashbang`, `merch_cannon`, hitscan `mute_button`) use their own radius, text and effect (a
  pink flare, a white flash, a puff of shirts) instead of the Hot Take's fire burst.
- `05b_assets_weapons.js`: meshes for the ten parity weapons that had none (`clipboard`, `golf_club`, `mic_stand`, `pocket`,
  `micro_smg`, `flare_gun`, `flashbang`, `grenade_launcher`, `merch_cannon`, `mute_button`); the 11 aliased ids draw the
  fallback's mesh (`ALIAS`, `GTP.Assets.weaponAlias`). Before, an id without a builder got a random builder of its class.
- Vertex colours were authored in sRGB and stored as if linear: every gun rendered washed-out grey (gunmetal `#26272c` showed
  as about `#6b6b6b`). `c()` now converts sRGB to linear like the models and interiors files; the tint matcher compares the
  exact linear values.
- The wheel's slot 2 is "Specials" (megaphone, flare gun, mute button, merch cannon); an unowned slot shows one of the original
  twelve first (the `combat.js` wheel failure: the rifle slot showed `carbine`).
- The shop: the v0.2 expansion rows (`Content.expansion.shop.items`) overwrote the parity weapon rows' unlock, so the pistol
  said "unlocks after m03b" while its ammo said m01c. A parity weapon now keeps its own unlock, name and price.
