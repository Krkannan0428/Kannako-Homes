/* Grand Theft Pundit: 21_content_cast.js
 * GTP.Content.cast stub. The content agent writes the real cast (original
 * fictional parody archetypes only; see CONTENT_RULES.md). `player` must exist.
 */
(function () {
  'use strict';
  var GTP = window.GTP = window.GTP || {};
  GTP.Content = GTP.Content || {};

  GTP.Content.cast = {
    player: {
      id: 'player',
      name: 'The Pundit',
      role: 'campus-debate pundit with a folding table',
      portrait: { skin: '#e8c39e', hair: 'side', hairColor: '#3a2a1a', glasses: false, hat: null, extra: 'mic', tie: '#b3122e' },
      look: { skin: '#e8c39e', shirt: '#f4f4f4', pants: '#2a2f4a', hair: '#3a2a1a', tie: '#b3122e' },
      color: '#ff3fa4',
      voice: 'smug',
      bio: 'Owns one folding table, one microphone and zero doubts.'
    }
  };
})();
