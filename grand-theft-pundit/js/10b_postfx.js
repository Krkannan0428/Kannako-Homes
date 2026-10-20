/* 10b_postfx.js: post-processing pipeline (render target + depth, SSAO, bloom, ACES tonemapping,
   color grading, vignette, FXAA) and quality presets. Owned by the graphics track. Stub until
   implemented: GTP.PostFX.enabled false means Render draws straight to the canvas. */
(function () {
  var GTP = window.GTP = window.GTP || {};
  GTP.PostFX = GTP.PostFX || {
    enabled: false,
    init: function () {},
    resize: function () {},
    render: function (renderer, scene, camera) { renderer.render(scene, camera); },
    setPreset: function () {}
  };
})();
