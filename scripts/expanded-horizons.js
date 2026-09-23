/**
 * Shrimp's Expanded Horizons
 * A parallax horizon + points-of-interest overlay for the Foundry VTT
 * scene view — the free Shrimp's Distant Horizons window (parallax
 * terrain, draggable POIs, GM/Player view, per-scene save + live
 * GM->player sync) plus four deeper tools layered on top of it:
 * journal-linked POIs, save/load layout Presets, a procedural horizon
 * Generator, and a top-down radar "Vantage Point" view with per-POI
 * compass bearings and passive-Perception-gated visibility.
 *
 * v0.2.0 — rebuilt on top of Distant Horizons v1.0.6's ApplicationV2 +
 * HandlebarsApplicationMixin architecture (this module was previously
 * v0.1.0, a raw-DOM prototype port predating that rework). Every DH
 * v1.0.6 fix and structural change carries over unchanged — the same
 * window, same controls, same per-scene persistence and GM->player sync,
 * same GM-only permission gate, same v13 UI-chrome measuring fix, and the
 * same CSS scoping under #shrimp-expanded-horizons-root — with the four
 * Expanded-only features re-implemented as proper PARTS/actions/settings
 * instead of the old imperative DOM-injection style. See lang/en.json for
 * every user-facing string and templates/*.hbs for the markup.
 */

const MODULE_ID = 'shrimps-expanded-horizons';
const MODULE_BASE = `modules/${MODULE_ID}/`;
const TEMPLATE_BASE = `${MODULE_BASE}templates/`;

/* ---------------- Foundry file storage (layer/POI image uploads) ----------------
   Layer and POI images are chosen through Foundry's OWN FilePicker
   application — the exact file-browser dialog Foundry itself uses for a
   Tile's or an Actor's image field (see #onTriggerLayerUpload /
   #onTriggerPoiIconUpload below) — rather than a plain device "choose a
   file" input read into a base64 data: URI. That dialog handles uploading a
   new file into the world's Data storage
   (worlds/<world-id>/shrimps-expanded-horizons/…) itself when that's what the
   GM does, and also lets them pick a file already sitting there (or anywhere
   else on the server) without uploading a duplicate copy from their device
   every time. Either way, what comes back through its `callback` is always
   a real, lightweight server path — never a data: URI. A data: URI embeds
   the full image bytes (~33% larger, base64-encoded) directly into the
   Scene document's flags on every save, which bloats the scene, is re-sent
   in full on every sync push, and bypasses Foundry's own asset caching
   entirely. */
const _dhEnsuredDirs = new Set();
/** Pre-creates the module's own world-scoped subfolder ("layers" or "pois")
 *  so FilePicker has somewhere real to open into (via its `current` option)
 *  instead of erroring or falling back to some other location the first
 *  time a GM picks an image in a given world. */
async function ensureModuleUploadDir(subdir){
  const FP = foundry.applications.apps.FilePicker.implementation;
  const worldId = game.world.id;
  const base = `worlds/${worldId}/${MODULE_ID}`;
  const full = `${base}/${subdir}`;
  if (_dhEnsuredDirs.has(full)) return;
  // createDirectory() isn't recursive — the parent has to exist before the
  // child does — and throws if a directory already exists, which is the
  // expected/common case after the first upload, so that's swallowed.
  for (const dir of [base, full]) {
    if (_dhEnsuredDirs.has(dir)) continue;
    try { await FP.createDirectory('data', dir); }
    catch (err) { /* already exists — fine */ }
    _dhEnsuredDirs.add(dir);
  }
}

const ICONS = {
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="1.5"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>`,
  unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="1.5"></rect><path d="M8 10V7a4 4 0 0 1 7.4-2.1"></path></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path><path d="M6 7l1 13h10l1-13"></path></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"></path><path d="M6 10l6-6 6 6"></path><path d="M4 20h16"></path></svg>`,
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12C4.5 7 8 4.5 12 4.5S19.5 7 22 12c-2.5 5-6 7.5-10 7.5S4.5 17 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.6M19.4 12H22M4.2 19.8L6 18M18 6l1.8-1.8"></path></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5Z"></path></svg>`,
  sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"></circle><line x1="4" y1="12" x2="20" y2="12"></line><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"></circle><line x1="4" y1="18" x2="20" y2="18"></line><circle cx="11" cy="18" r="2" fill="currentColor" stroke="none"></circle></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"></path></svg>`,
  journal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"></path><line x1="4" y1="19.5" x2="20" y2="19.5"></line></svg>`,
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M15 9l-2 6-6 2 2-6 6-2Z"></path></svg>`
};

// Display-only path shown in upload-button tooltips, and the FilePicker
// `current` folder the upload dialogs below open into by default — the
// module's own upload directories, matching what ensureModuleUploadDir()
// above actually creates. Not resolvable until game.world is ready, so this
// stays a getter-backed object rather than a static string built at load time.
const STORAGE = {
  get layersUpload(){ return `worlds/${game.world.id}/${MODULE_ID}/layers/`; },
  get poisUpload(){ return `worlds/${game.world.id}/${MODULE_ID}/pois/`; }
};

/* ---------------- Default per-instance state factories ---------------- */
// Fresh copies per app instance (rather than module-scope mutable objects,
// as the pre-ApplicationV2 version used) so a closed-then-reopened window
// never accidentally shares state with a stale prior instance.
function defaultLayerConfig(){
  return [
    { id:1, color:"#0b0e14", speed:1.0,  baseZ:60, scale:1.0, enabled:true, biome:"mountains-1", yOffset:0, xOffset:0, customImage:null, customImageName:null, customImageRaw:null, mirrorTile:true, tintToColor:true, imageSettingsOpen:false, customImageBuiltin:false },
    { id:2, color:"#232a3d", speed:0.8,  baseZ:50, scale:0.9, enabled:true, biome:"mountains-2", yOffset:0, xOffset:0, customImage:null, customImageName:null, customImageRaw:null, mirrorTile:true, tintToColor:true, imageSettingsOpen:false, customImageBuiltin:false },
    { id:3, color:"#3d4863", speed:0.6,  baseZ:40, scale:0.8, enabled:true, biome:"img:forest-1", yOffset:0, xOffset:0, customImage:null, customImageName:null, customImageRaw:null, mirrorTile:true, tintToColor:true, imageSettingsOpen:false, customImageBuiltin:false },
    { id:4, color:"#5c6a89", speed:0.4,  baseZ:30, scale:0.7, enabled:true, biome:"hills-1",      yOffset:0, xOffset:0, customImage:null, customImageName:null, customImageRaw:null, mirrorTile:true, tintToColor:true, imageSettingsOpen:false, customImageBuiltin:false },
    { id:5, color:"#8b96ac", speed:0.2,  baseZ:20, scale:0.6, enabled:true, biome:"mountains-3",  yOffset:0, xOffset:0, customImage:null, customImageName:null, customImageRaw:null, mirrorTile:true, tintToColor:true, imageSettingsOpen:false, customImageBuiltin:false },
    { id:6, color:"#c7cedb", speed:0.05, baseZ:10, scale:0.5, enabled:true, biome:"mountains-1",  yOffset:0, xOffset:0, customImage:null, customImageName:null, customImageRaw:null, mirrorTile:true, tintToColor:true, imageSettingsOpen:false, customImageBuiltin:false },
  ];
}

// Terrain shading ramp (foreground -> farthest) per colour palette, so the
// layers themselves re-tint when the GM switches palette in settings.
const LAYER_PALETTES = {
  obsidian:  ["#0b0e14","#232a3d","#3d4863","#5c6a89","#8b96ac","#c7cedb"],
  verdant:   ["#0a140d","#173321","#254a30","#3a6a45","#5e8f68","#a8c9a0"],
  crimson:   ["#150a0c","#331419","#4d1f26","#6e2c35","#9c4a52","#d6a2a8"],
  arcane:    ["#0d0b16","#211a3a","#332a5c","#4a3e82","#6f5fb0","#b3a6e6"],
  ancient:   ["#2a1c0f","#4a3220","#6e4f32","#93714a","#b89a6e","#dcc9a0"],
  desert:    ["#241408","#4a2c12","#6e4318","#9c6624","#c9903c","#f0c878"],
  hellscape: ["#0a0605","#2a0f0a","#4d1810","#7a2415","#b03a1a","#e86a2a"],
  shadow:    ["#08090b","#181b1f","#2a2e34","#454b53","#6b7278","#a8b0b8"],
  fey:       ["#0a0f1c","#1a2440","#2a3866","#3f5a92","#5f8ab8","#a8d4d8"],
};
function applyLayerPaletteColors(layerConfig, paletteName){
  const ramp = LAYER_PALETTES[paletteName] || LAYER_PALETTES.obsidian;
  layerConfig.forEach((layer, i) => { layer.color = ramp[i] || layer.color; });
}

/* ---------------- Biomes: 3 procedural families x 3 numbered variants,
   plus Forest, which is entirely the two hand-drawn images below. ---------------- */
const BIOME_FAMILIES = [
  { key:'mountains', labelKey:'SHRIMPSEH.Biome.MountainsFamily', singularKey:'SHRIMPSEH.Biome.MountainSingular' },
  { key:'hills',     labelKey:'SHRIMPSEH.Biome.HillsFamily',     singularKey:'SHRIMPSEH.Biome.HillSingular' },
  { key:'desert',    labelKey:'SHRIMPSEH.Biome.DesertFamily',    singularKey:'SHRIMPSEH.Biome.DesertSingular' },
];
const VARIANT_PARAMS = {
  1: { seedMul:1.0, seedAdd:0,   ampMul:1.0  },
  2: { seedMul:1.6, seedAdd:57,  ampMul:1.18 },
  3: { seedMul:2.3, seedAdd:113, ampMul:0.82 },
};
// Forest has no procedural generator — it's just these two hand-drawn
// images (value prefixed "img:"). Picking one sets the layer's custom
// image straight from the bundled asset, still going through the
// mirror-tile / tint-to-colour pipeline like a manual upload.
const BUILTIN_LAYER_IMAGES = {
  forest: [
    { key:'forest-1', labelKey:'SHRIMPSEH.Biome.Forest1', src: MODULE_BASE + 'assets/forest-hand-1.png' },
    { key:'forest-2', labelKey:'SHRIMPSEH.Biome.Forest2', src: MODULE_BASE + 'assets/forest-hand-2.png' },
  ],
};
function biomeOptionsHtml(selected){
  const proceduralHtml = BIOME_FAMILIES.map(fam => {
    const opts = [1,2,3].map(v => {
      const val = `${fam.key}-${v}`;
      const label = game.i18n.format('SHRIMPSEH.Biome.NumberedLabel', { label: game.i18n.localize(fam.singularKey), n: v });
      return `<option value="${val}" ${val===selected?'selected':''}>${label}</option>`;
    }).join('');
    return `<optgroup label="${game.i18n.localize(fam.labelKey)}">${opts}</optgroup>`;
  }).join('');
  const forestOpts = BUILTIN_LAYER_IMAGES.forest
    .map(b => `<option value="img:${b.key}" ${('img:'+b.key)===selected?'selected':''}>${game.i18n.localize(b.labelKey)}</option>`).join('');
  return proceduralHtml + `<optgroup label="${game.i18n.localize('SHRIMPSEH.Biome.ForestGroup')}">${forestOpts}</optgroup>`;
}

const ICON_LABEL_KEYS = {
  tower:'SHRIMPSEH.POI.Icon.Tower', mine:'SHRIMPSEH.POI.Icon.Mine', cave:'SHRIMPSEH.POI.Icon.Cave',
  camp:'SHRIMPSEH.POI.Icon.Camp', ruins:'SHRIMPSEH.POI.Icon.Ruins', bridge:'SHRIMPSEH.POI.Icon.Bridge',
  danger:'SHRIMPSEH.POI.Icon.Danger', village:'SHRIMPSEH.POI.Icon.Village', tree:'SHRIMPSEH.POI.Icon.Tree',
  water:'SHRIMPSEH.POI.Icon.Water'
};
const ICON_FULLCOLOUR = {
  tower:'#9aa1ad', mine:'#7a5236', cave:'#2b2f38', camp:'#d1793f', ruins:'#ab9c80',
  bridge:'#7f92a6', danger:'#b7402f', village:'#caa159', tree:'#4f7d4c', water:'#3f80a8'
};
const POI_ICON_DEFS = {
  tower:  (f) => `<svg viewBox="0 0 60 100" width="100%" height="100%" fill="${f}"><path d="M10,100 L10,30 L0,30 L0,10 L15,10 L15,30 L25,30 L25,10 L40,10 L40,30 L30,30 L30,10 L45,10 L45,30 L60,30 L60,100 Z"/></svg>`,
  mine:   (f) => `<svg viewBox="0 0 100 80" width="100%" height="100%" fill="${f}"><polygon points="10,80 30,20 70,20 90,80"/><path d="M40,80 L40,40 L60,40 L60,80 Z" fill="rgba(255,255,255,0.18)"/></svg>`,
  cave:   (f) => `<svg viewBox="0 0 120 70" width="100%" height="100%" fill="${f}"><path d="M0,70 Q40,0 60,0 T120,70 Z"/><path d="M40,70 Q50,30 60,30 T80,70 Z" fill="rgba(255,255,255,0.18)"/></svg>`,
  camp:   (f) => `<svg viewBox="0 0 100 80" width="100%" height="100%" fill="${f}"><path d="M50,8 L92,80 L8,80 Z"/><path d="M50,8 L64,80 L36,80 Z" fill="rgba(0,0,0,0.28)"/></svg>`,
  ruins:  (f) => `<svg viewBox="0 0 60 100" width="100%" height="100%" fill="${f}"><rect x="10" y="6" width="12" height="18"/><rect x="18" y="26" width="24" height="58"/><rect x="8" y="84" width="44" height="10"/></svg>`,
  bridge: (f) => `<svg viewBox="0 0 120 60" width="100%" height="100%" fill="${f}"><path d="M0,60 L0,40 Q60,-8 120,40 L120,60 Z"/><rect x="14" y="40" width="8" height="20"/><rect x="98" y="40" width="8" height="20"/></svg>`,
  danger: (f) => `<svg viewBox="0 0 100 90" width="100%" height="100%" fill="${f}"><path d="M50,2 L98,88 L2,88 Z"/><rect x="45" y="30" width="10" height="30" fill="rgba(0,0,0,0.35)"/><rect x="45" y="66" width="10" height="10" fill="rgba(0,0,0,0.35)"/></svg>`,
  village:(f) => `<svg viewBox="0 0 120 70" width="100%" height="100%" fill="${f}"><path d="M4,70 L4,44 L20,28 L36,44 L36,70 Z"/><path d="M44,70 L44,36 L66,16 L88,36 L88,70 Z"/><path d="M96,70 L96,46 L110,34 L120,46 L120,70 Z" opacity="0.9"/></svg>`,
  tree:   (f) => `<svg viewBox="0 0 60 90" width="100%" height="100%" fill="${f}"><path d="M30,0 L50,35 L42,35 L58,60 L48,60 L60,90 L0,90 L12,60 L2,60 L18,35 L10,35 Z"/></svg>`,
  water:  (f) => `<svg viewBox="0 0 120 60" width="100%" height="100%" fill="${f}"><path d="M0,28 Q15,12 30,28 T60,28 T90,28 T120,28 L120,60 L0,60 Z"/></svg>`
};
function poiIconOptionsHtml(selected){
  return Object.keys(ICON_LABEL_KEYS).map(k =>
    `<option value="${k}" ${k===selected?'selected':''}>${game.i18n.localize(ICON_LABEL_KEYS[k])}</option>`
  ).join('');
}

/* ---------------- Procedural terrain generation (pure, unchanged) ---------------- */
// Tile is 3x the old width so the repeat is far less obvious. Every
// harmonic's frequency MUST be a whole number of cycles across the tile —
// sin(2π·k·x/width) only lands on the same value at x=0 and x=width when
// k is an integer, which is what makes the tile edges line up seamlessly
// under background-repeat. Variety instead comes from each of the 3
// numbered variants using its own distinct set of integer harmonics.
const FREQ_SETS = {
  mountains: { 1:[3,7,13,21,34], 2:[4,9,16,27,41], 3:[2,5,11,19,29] },
  hills:     { 1:[2,5,9,15],     2:[3,7,12,20],     3:[1,4,8,14]     },
  desert:    { 1:[2,4,7],        2:[3,6,10],        3:[1,3,6]        },
};
const PHASES = [0, 1.7, 3.9, 0.6, 2.4, 5.0];

// Small deterministic PRNG (mulberry32) — same integer seed always
// produces the same sequence, so a given layer's jagged peak layout
// (Mountain 1) stays fixed across re-renders instead of reshuffling
// every time initLayers() runs.
function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBiomePath(biomeFull, layerIdx){
  const [family, variantStr] = biomeFull.split('-');
  const variant = parseInt(variantStr, 10) || 1;
  const vp = VARIANT_PARAMS[variant] || VARIANT_PARAMS[1];
  const width = 3600, height = 400;
  const invertedIdx = 5 - layerIdx;
  const baseY = 130 + (invertedIdx * 46);
  let path = `M 0,${height} L 0,${baseY} `;
  const seed = layerIdx * 123.45 * vp.seedMul + vp.seedAdd;

  if (family === 'mountains' && variant === 1) {
    // Mountain 1: a sharp, jagged alpine skyline rather than the
    // smoother rolling profile variants 2/3 use. Summing several sine
    // harmonics (as the other variants do) always washes back out to
    // a rounded hump — sharp features at different frequencies land
    // at different x positions and average each other away. A real
    // jagged range instead reads as a few dominant angular peaks with
    // straight rocky slopes, so this builds that directly: an
    // envelope (max) of several triangular peaks — genuinely sharp,
    // straight-edged points, not an averaged curve — plus a small
    // sawtooth jitter riding on top for rugged edge detail. Peak
    // placement wraps around the tile width so the seam stays exact.
    const rng = mulberry32(Math.floor((seed + 1000) * 977));
    const peakCount = 4 + Math.floor(rng() * 2); // 4–5 bold summits
    const baseAmp = (92 + invertedIdx * 24) * vp.ampMul;
    const peaks = [];
    for (let i=0;i<peakCount;i++){
      const px = ((i + 0.5) / peakCount) * width + (rng() - 0.5) * (width / peakCount) * 0.7;
      const heightMul = 0.4 + Math.pow(rng(), 1.4) * 1.05; // a few short, one or two dramatic
      const halfWidth = (width / peakCount) * (0.24 + rng() * 0.3); // narrow => steep, knife-edge slopes
      peaks.push({ px: ((px % width) + width) % width, h: baseAmp * heightMul, hw: halfWidth });
    }
    const jitterFreqs = [19, 37, 61];
    for (let x=0; x<=width; x+=6) {
      let dy = 0;
      for (const pk of peaks){
        const d = Math.abs(x - pk.px);
        const wrapD = Math.min(d, width - d);
        const tri = Math.max(0, 1 - wrapD / pk.hw);
        dy = Math.max(dy, tri * pk.h);
      }
      // Fine rocky jaggedness — sharp, low-amplitude cusps riding on
      // the main envelope so it roughens slopes without smoothing
      // out the peaks above.
      let jitter = 0, jAmp = 17;
      for (let i=0;i<jitterFreqs.length;i++){
        jitter += (1 - Math.abs(Math.sin((x/width)*Math.PI*2*jitterFreqs[i] + seed*1.7 + i))) * jAmp;
        jAmp *= 0.5;
      }
      dy += jitter;
      path += `L ${x},${baseY-dy} `;
    }
  } else if (family === 'mountains') {
    const freqs = FREQ_SETS.mountains[variant];
    const amps=[(58+(invertedIdx*15))*vp.ampMul, 30*vp.ampMul, 17*vp.ampMul, 9*vp.ampMul, 5*vp.ampMul];
    for (let x=0; x<=width; x+=10) {
      let dy=0;
      for (let i=0;i<freqs.length;i++) dy += Math.abs(Math.sin((x/width)*Math.PI*2*freqs[i]+seed+PHASES[i])) * amps[i];
      path += `L ${x},${baseY-dy} `;
    }
  } else if (family === 'hills') {
    const freqs = FREQ_SETS.hills[variant];
    const amps=[44*vp.ampMul, 26*vp.ampMul, 14*vp.ampMul, 7*vp.ampMul];
    for (let x=0; x<=width; x+=15) {
      let dy=0;
      for (let i=0;i<freqs.length;i++) dy += Math.sin((x/width)*Math.PI*2*freqs[i]+seed+PHASES[i]) * amps[i];
      path += `L ${x},${baseY-dy} `;
    }
  } else if (family === 'desert') {
    const freqs = FREQ_SETS.desert[variant];
    const amps=[32*vp.ampMul, 17*vp.ampMul, 8*vp.ampMul];
    for (let x=0; x<=width; x+=20) {
      let dy=0;
      for (let i=0;i<freqs.length;i++) dy += Math.sin((x/width)*Math.PI*2*freqs[i]+seed+PHASES[i]) * amps[i];
      path += `L ${x},${baseY+44-dy} `;
    }
  }
  // Forest has no procedural case — it's always one of the two
  // hand-drawn images (BUILTIN_LAYER_IMAGES.forest), routed through the
  // customImage path rather than generateBiomePath.
  path += `L ${width},${baseY} L ${width},${height} Z`;
  return path;
}

/* ---------------- Small DOM/file utilities (pure, unchanged) ---------------- */
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
// Builds a [image][horizontally-flipped copy] tile on a canvas. Tiling
// that doubled image with repeat-x is guaranteed seam-free for ANY
// source image — the flip means every tile boundary lines up pixel-
// for-pixel with its neighbour, at the cost of every other repeat
// appearing mirrored.
function buildMirrorTile(img, cb){
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) { cb(null, null); return; }
  const canvas = document.createElement('canvas');
  canvas.width = w * 2; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  ctx.save();
  ctx.translate(w * 2, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
  cb(canvas.toDataURL('image/png'), { width: w * 2, height: h });
}
// Re-derives layer.customImage (what's actually painted) from
// layer.customImageRaw (what was uploaded) + layer.mirrorTile. Also
// reports the painted image's pixel dimensions via the callback's
// second argument — needed to snap the CSS tile width to a whole
// pixel so repeat-x tiling never lands on a fractional pixel and shows
// a hairline seam at the repeat edge.
function processCustomImage(layer, cb){
  if (!layer.customImageRaw) { cb(null, null); return; }
  const img = new Image();
  img.onload = () => {
    if (layer.mirrorTile) {
      buildMirrorTile(img, cb);
    } else {
      cb(layer.customImageRaw, { width: img.naturalWidth, height: img.naturalHeight });
    }
  };
  img.onerror = () => cb(layer.customImageRaw, null);
  img.src = layer.customImageRaw;
}

const HORIZON_LENGTH_MUL = { far: 1.5, medium: 2.4, close: 3.6 };
// Fixed floating-window size Vantage Point locks to for every viewer,
// every time it's toggled on — see ExpandedHorizonsApp#_setVantageActive.
const VANTAGE_LOCKED_SIZE = { width: 820, height: 604 };
const HORIZON_LENGTH_DESC_KEYS = {
  far: 'SHRIMPSEH.Settings.HorizonLength.DescFar',
  medium: 'SHRIMPSEH.Settings.HorizonLength.DescMedium',
  close: 'SHRIMPSEH.Settings.HorizonLength.DescClose'
};
const POI_STATE_ORDER = ['hidden','unknown','rumored','discovered'];
const POI_STATE_LABEL_KEYS = {
  hidden:'SHRIMPSEH.POI.State.Hidden', unknown:'SHRIMPSEH.POI.State.Unknown',
  rumored:'SHRIMPSEH.POI.State.Rumored', discovered:'SHRIMPSEH.POI.State.Discovered'
};
const POI_SIZE_MUL = { small:0.45, medium:0.7, large:1.0 };

/* ---------------- Procedural horizon generator (pure helpers) ----------------
   Ported from Enhanced Horizons v0.1.0's generator, unchanged in behaviour:
   a string seed hashes down to a mulberry32 integer seed, so the same
   typed-in seed always builds the same layers + POIs. */
function hashSeed(str){
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
const GEN_NAME_PARTS = {
  mountains: ['Peak', 'Pass', 'Crag', 'Outcrop', 'Cairn', 'Ridgeline'],
  hills: ['Barrow', 'Overlook', 'Knoll', 'Hollow', 'Rise', 'Croft'],
  desert: ['Dune', 'Oasis', 'Wastes', 'Mesa', 'Sinkhole', 'Wayshrine'],
  forest: ['Glade', 'Thicket', 'Hollow', 'Grove', 'Deadwood', 'Camp']
};
const GEN_ADJECTIVES = ['Old', 'Forsaken', 'Windswept', 'Sunken', 'Broken', "Traveler's", 'Silent', 'Lonely'];
const RUGGEDNESS_VARIANT = { calm: 1, rugged: 2, jagged: 3 };
const GEN_BIOME_FAMILIES = ['mountains', 'hills', 'desert', 'forest'];
const GEN_RUGGEDNESS_LABEL_KEYS = {
  calm: 'SHRIMPSEH.Generator.Ruggedness.Calm',
  rugged: 'SHRIMPSEH.Generator.Ruggedness.Rugged',
  jagged: 'SHRIMPSEH.Generator.Ruggedness.Jagged'
};
// Reuses the same family labels the free-form biome selects already
// localize (SHRIMPSDH.Biome.* in the original module, carried over here)
// so the generator's notification text and its own biome dropdown agree
// with the wording used everywhere else in the window.
const GEN_BIOME_LABEL_KEYS = {
  mountains: 'SHRIMPSEH.Biome.MountainsFamily',
  hills: 'SHRIMPSEH.Biome.HillsFamily',
  desert: 'SHRIMPSEH.Biome.DesertFamily',
  forest: 'SHRIMPSEH.Biome.ForestGroup'
};

/* ================================================================
 * ExpandedHorizonsApp — the module's single floating window, now a
 * proper ApplicationV2 + HandlebarsApplicationMixin class.
 *
 * Architecture notes (see README/PR notes for the fuller version):
 *  - window.frame is deliberately false: every pixel of this window's
 *    chrome (titlebar, segmented toggles, cog button, resize handle,
 *    compact "docked strip" mode, Free Dock dragging) is bespoke, with
 *    no analog in Foundry's own header/resize chrome, so there is
 *    nothing to hand over to it. What IS handed to ApplicationV2: the
 *    render/close lifecycle, PARTS + Handlebars templating,
 *    `_prepareContext`, the `actions` click-delegation map, the
 *    `foundry.applications.instances` singleton registry, and (for the
 *    undocked window) position bookkeeping via `this.setPosition()`
 *    instead of raw `element.style` writes.
 *  - `_insertElement` is overridden so the app's root element still
 *    lands inside the dedicated #shrimp-expanded-horizons-root wrapper
 *    div, preserving the CSS-scoping fix already shipped in
 *    styles/expanded-horizons.css (nothing there needed to change).
 *  - The compact/docked strip and Free Dock remain fully hand-rolled
 *    (custom class toggling + direct style/CSS-variable writes) per
 *    the brief — they are not ApplicationV2 "window" concepts at all.
 *  - Layer terrain + POI markers inside #layers-container are still
 *    built with direct, imperative DOM writes (initLayers/renderPOIs/
 *    updateVisuals) rather than Handlebars — that part is closer to a
 *    per-frame canvas-ish render loop (parallax pan, live dragging)
 *    than to templatable static markup, and stays that way on
 *    purpose. Everything else (window chrome, settings panel, the
 *    layer-rows/POI-table lists) is genuine Handlebars, driven by
 *    `_prepareContext()` and re-rendered via `this.render()`.
 * ================================================================ */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Seeds a freshly (re)opened window's pan position from wherever the
// window last was, purely for UX continuity — this is NOT persisted
// data (scrollX has never been part of the saved scene payload; a
// scene's actual saved horizon is unaffected either way).
let lastKnownScrollX = 500;

class ExpandedHorizonsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'eh-window',
    tag: 'div',
    classes: ['expanded-horizons-window'],
    window: { frame: false, positioned: true },
    actions: {
      toggleSettings: ExpandedHorizonsApp.#onToggleSettings,
      toggleLayersInfo: ExpandedHorizonsApp.#onToggleLayersInfo,
      setViewMode: ExpandedHorizonsApp.#onSetViewMode,
      setDaytime: ExpandedHorizonsApp.#onSetDaytime,
      toggleLockView: ExpandedHorizonsApp.#onToggleLockView,
      addPoi: ExpandedHorizonsApp.#onAddPoi,
      applyQuickBiome: ExpandedHorizonsApp.#onApplyQuickBiome,
      resetWindowPosition: ExpandedHorizonsApp.#onResetWindowPosition,
      toggleLayerEnabled: ExpandedHorizonsApp.#onToggleLayerEnabled,
      toggleLayerMirrorTile: ExpandedHorizonsApp.#onToggleLayerMirrorTile,
      toggleLayerTint: ExpandedHorizonsApp.#onToggleLayerTint,
      triggerLayerUpload: ExpandedHorizonsApp.#onTriggerLayerUpload,
      openLayerImageSettings: ExpandedHorizonsApp.#onOpenLayerImageSettings,
      clearLayerImage: ExpandedHorizonsApp.#onClearLayerImage,
      applyLayerImageSettings: ExpandedHorizonsApp.#onApplyLayerImageSettings,
      triggerPoiIconUpload: ExpandedHorizonsApp.#onTriggerPoiIconUpload,
      clearPoiIcon: ExpandedHorizonsApp.#onClearPoiIcon,
      focusPoi: ExpandedHorizonsApp.#onFocusPoi,
      togglePoiLock: ExpandedHorizonsApp.#onTogglePoiLock,
      deletePoi: ExpandedHorizonsApp.#onDeletePoi,
      alignPoiBearing: ExpandedHorizonsApp.#onAlignPoiBearing,
      toggleVantage: ExpandedHorizonsApp.#onToggleVantage,
      savePreset: ExpandedHorizonsApp.#onSavePreset,
      loadPreset: ExpandedHorizonsApp.#onLoadPreset,
      deletePreset: ExpandedHorizonsApp.#onDeletePreset,
      randomizeGenSeed: ExpandedHorizonsApp.#onRandomizeGenSeed,
      generateHorizon: ExpandedHorizonsApp.#onGenerateHorizon
    }
  };

  static PARTS = {
    window:      { template: `${TEMPLATE_BASE}window.hbs` },
    settings:    { template: `${TEMPLATE_BASE}settings.hbs` },
    layersInfo:  { template: `${TEMPLATE_BASE}layers-info.hbs` }
  };

  constructor(options={}){
    super(options);

    // Foundry's own real permission flag — not the mutable state.viewMode
    // a click can flip. See _prepareContext()'s `showGmControls` for
    // where this is enforced: state.viewMode's *default* below is just
    // the starting look, it is not itself a security boundary, and a
    // real player's client never renders the Layers/POI markup at all
    // (the `{{#if showGmControls}}` guard in window.hbs, backed by this
    // flag) regardless of what state.viewMode happens to hold.
    this.IS_GM = game.user?.isGM === true;

    this.layerConfig = defaultLayerConfig();
    this.uiState = {
      scrollX: lastKnownScrollX,
      viewMode: this.IS_GM ? 'gm' : 'player',
      compactMode: false,
      // Free Dock is a per-browser display preference, not scene data, so
      // it lives in a client-scoped game.settings entry rather than
      // following the world.
      freeDock: game.settings.get(MODULE_ID, 'freeDockEnabled'),
      compassMode: 'full',
      compassOpacity: 0.8,
      showDragHint: true,
      fullColourIcons: false,
      // Whether POIs can link to a real Journal Entry at all (settings ->
      // toggle). On by default (matches every earlier release, where
      // linking was always available); a GM running without journal
      // integration can turn it off to drop the Journal column/badges
      // entirely rather than ignoring an always-visible feature.
      journalLinkingEnabled: true,
      palette: 'obsidian',
      horizonLength: 'far',
      daytime: 'day',
      viewLocked: false,
      // Ships empty — POIs are scenario-specific, so the GM adds their own
      // via "+ Add POI" rather than starting from placeholder examples.
      pois: [],
      nextPoiId: 1
    };

    this._settingsOpen = false;
    this._layersInfoOpen = false;
    this._saveTimer = null;
    this._applyingRemote = false;
    this._paletteRev = 0;
    this._lastAppliedPaletteRev = -1;
    this._focusAnim = null;
    this._isPanning = false;
    this._panLastX = 0;
    this._poiDrag = null;
    this._winDrag = null;
    this._winResize = null;
    this._freeDockDrag = null;
    this._savedRect = null;
    this._compactPositionTimer = null;
    this._minWinWidth = 0;
    this._minWinHeight = 0;
    this._boundGlobalListeners = false;

    // Vantage Point (top-down radar view) — purely a local display toggle,
    // never saved to the scene or pushed to players, so it lives here
    // rather than in uiState. _vantagePrevSize remembers the floating
    // window's size from just before Vantage Point locked it to
    // VANTAGE_LOCKED_SIZE, so turning it back off restores exactly what
    // was there (see _setVantageActive).
    this._vantageActive = false;
    this._vantagePrevSize = null;

    // Procedural Generator + Presets form drafts — text/selection the GM
    // is actively composing in the settings panel. Kept on the instance
    // (not in uiState, which is scene-persisted) so an unrelated
    // this.render() elsewhere (e.g. toggling a layer) doesn't wipe a
    // half-typed preset name or seed back to blank — the settings PART is
    // rebuilt from _prepareContext() on every render, so anything the
    // template should keep showing has to live somewhere _prepareContext
    // can read it back from.
    this._genDraft = { biome:'mountains', comboA:'mountains', comboB:'hills', ruggedness:'rugged', density:4, seed:'' };
    this._presetNameDraft = '';
  }

  /* ---------------- Mounting: keep the CSS-scoping wrapper ---------------- */
  // Everything this module injects lives inside #shrimp-expanded-horizons-
  // root (see styles/expanded-horizons.css's header comment) so that every
  // rule scoped under it — including the palette custom properties and
  // the bare select/input[range]/table selectors — keeps applying only to
  // our own UI, never to the rest of Foundry's chrome or other modules.
  // ApplicationV2 would otherwise append straight to <body>.
  _insertElement(element){
    let root = document.getElementById('shrimp-expanded-horizons-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'shrimp-expanded-horizons-root';
      document.body.appendChild(root);
    }
    root.appendChild(element);
  }

  /* ---------------- Context for the Handlebars templates ---------------- */
  async _prepareContext(options){
    const s = this.uiState;
    const isGmView = s.viewMode === 'gm';
    // GM-only edit surface: the real permission gate (this.IS_GM) AND the
    // GM's own local preview toggle both have to agree — see the
    // constructor's IS_GM comment and this module's shipped permission fix.
    const showGmControls = this.IS_GM && isGmView;

    const modeText = game.i18n.localize(isGmView ? 'SHRIMPSEH.Subtitle.GM' : 'SHRIMPSEH.Subtitle.Player');
    const lockText = s.viewLocked ? game.i18n.localize('SHRIMPSEH.Subtitle.Locked') : '';
    const dockText = game.i18n.localize('SHRIMPSEH.Subtitle.DockHint');
    const subtitleText = game.i18n.format('SHRIMPSEH.Subtitle.Full', { mode: modeText, lock: lockText, dock: dockText });

    let rawDeg = (s.scrollX / 10) % 360;
    if (rawDeg < 0) rawDeg += 360;
    const directions = ['N','NE','E','SE','S','SW','W','NW'];
    const dirIndex = Math.round(rawDeg / 45) % 8;
    const compassText = s.compassMode === 'simple' ? directions[dirIndex] : `${directions[dirIndex]} ${Math.round(rawDeg)}°`;

    return {
      isGM: this.IS_GM,
      isGmView,
      showGmControls,
      isDay: s.daytime === 'day',
      subtitleText,
      viewLocked: s.viewLocked,
      lockViewTitle: s.viewLocked ? game.i18n.localize('SHRIMPSEH.LockView.Unlock') : game.i18n.localize('SHRIMPSEH.LockView.Lock'),
      lockViewIcon: s.viewLocked ? ICONS.lock : ICONS.unlock,
      layerCountText: this.layerConfig.filter(l => l.enabled).length,
      showDragHint: s.showDragHint,
      compassOpacity: s.compassOpacity,
      compassOff: s.compassMode === 'off',
      compassText,
      quickBiomeOptionsHtml: biomeOptionsHtml('mountains-1'),
      layers: this.layerConfig.map(l => this._layerRowContext(l)),
      pois: s.pois.map(p => this._poiRowContext(p)),
      iconSun: ICONS.sun, iconMoon: ICONS.moon,
      // settings PART
      compass: { full: s.compassMode==='full', simple: s.compassMode==='simple', off: s.compassMode==='off' },
      compassOpacityPct: Math.round(s.compassOpacity * 100),
      fullColourIcons: s.fullColourIcons,
      journalLinkingEnabled: s.journalLinkingEnabled,
      palette: s.palette,
      horizonLength: s.horizonLength,
      horizonLengthDesc: game.i18n.localize(HORIZON_LENGTH_DESC_KEYS[s.horizonLength] || HORIZON_LENGTH_DESC_KEYS.far),
      freeDock: s.freeDock,
      // Vantage Point toggle button
      vantageActive: this._vantageActive,
      // Presets (world-scoped, shared by every GM — see registerModuleSettings)
      presets: Object.keys(game.settings.get(MODULE_ID, 'presets') || {}).sort((a, b) => a.localeCompare(b)),
      presetNameDraft: this._presetNameDraft,
      // Procedural Generator draft
      genBiome: this._genDraft.biome,
      genComboA: this._genDraft.comboA,
      genComboB: this._genDraft.comboB,
      genComboVisible: this._genDraft.biome === 'combo',
      genRuggedness: this._genDraft.ruggedness,
      genDensity: this._genDraft.density,
      genSeed: this._genDraft.seed
    };
  }

  _layerRowContext(layer){
    const isUpload = !!layer.customImage && !layer.customImageBuiltin;
    const showImageSettings = isUpload && layer.imageSettingsOpen;
    return {
      id: layer.id, enabled: layer.enabled, color: layer.color,
      isUpload, showImageSettings,
      imageChipTitle: `${STORAGE.layersUpload}${layer.customImageName || ''}`,
      imageChipName: escapeHtml(layer.customImageName || 'custom'),
      biomeOptionsHtml: isUpload ? '' : biomeOptionsHtml(layer.biome),
      uploadTitle: game.i18n.format('SHRIMPSEH.Layers.UploadBtnTitle', { path: STORAGE.layersUpload }),
      imageSettingsBtnTitle: game.i18n.localize('SHRIMPSEH.Layers.ImageSettingsBtnTitle'),
      clearImageBtnTitle: game.i18n.localize('SHRIMPSEH.Layers.ClearImageBtnTitle'),
      mirrorTile: layer.mirrorTile, tintToColor: layer.tintToColor !== false,
      mirrorTileLabel: game.i18n.localize('SHRIMPSEH.Layers.MirrorTileLabel'),
      mirrorTileHint: game.i18n.localize('SHRIMPSEH.Layers.MirrorTileHint'),
      tintLabel: game.i18n.localize('SHRIMPSEH.Layers.TintLabel'),
      tintHint: game.i18n.localize('SHRIMPSEH.Layers.TintHint'),
      applyBtnLabel: game.i18n.localize('SHRIMPSEH.Layers.ApplyBtn'),
      axisYLabel: game.i18n.localize('SHRIMPSEH.Layers.AxisY'),
      axisXLabel: game.i18n.localize('SHRIMPSEH.Layers.AxisX'),
      toggleTitle: game.i18n.format('SHRIMPSEH.Layers.ToggleTitle', { id: layer.id }),
      yOffset: layer.yOffset, xOffset: layer.xOffset,
      iconSliders: ICONS.sliders, iconClear: ICONS.clear, iconUpload: ICONS.upload, iconCheck: ICONS.check
    };
  }

  _poiRowContext(poi){
    return {
      id: poi.id, name: poi.name, locked: poi.locked,
      journalLinkingEnabled: this.uiState.journalLinkingEnabled,
      bearing: Math.round(poi.bearing ?? 0),
      bearingTitle: game.i18n.localize('SHRIMPSEH.POI.BearingTitle'),
      bearingAlignTitle: game.i18n.localize('SHRIMPSEH.POI.BearingAlignTitle'),
      revealDC: poi.revealDC ?? 15,
      revealDCTitle: game.i18n.localize('SHRIMPSEH.POI.RevealDCTitle'),
      hasCustomIcon: !!poi.customIcon,
      customIconTitle: STORAGE.poisUpload,
      iconOptionsHtml: poi.customIcon ? '' : poiIconOptionsHtml(poi.icon),
      uploadIconTitle: game.i18n.format('SHRIMPSEH.POI.UploadBtnTitle', { path: STORAGE.poisUpload }),
      clearIconTitle: game.i18n.localize('SHRIMPSEH.POI.ClearIconBtnTitle'),
      layerOptionsHtml: this._poiLayerOptionsHtml(poi.layer),
      sizeOptionsHtml: this._poiSizeOptionsHtml(poi.size || 'large'),
      stateOptionsHtml: this._poiStateOptionsHtml(poi.state),
      journalOptionsHtml: this._poiJournalOptionsHtml(poi.journalId),
      sizeTitle: game.i18n.localize('SHRIMPSEH.POI.Size.TitleFull'),
      focusTitle: game.i18n.localize('SHRIMPSEH.POI.FocusBtnTitle'),
      lockTitle: poi.locked ? game.i18n.localize('SHRIMPSEH.POI.UnlockBtnTitle') : game.i18n.localize('SHRIMPSEH.POI.LockBtnTitle'),
      deleteTitle: game.i18n.localize('SHRIMPSEH.POI.DeleteBtnTitle'),
      lockIcon: poi.locked ? ICONS.lock : ICONS.unlock,
      iconClear: ICONS.clear, iconUpload: ICONS.upload, iconEye: ICONS.eye, iconTrash: ICONS.trash, iconCompass: ICONS.compass
    };
  }

  _poiLayerOptionsHtml(selectedId){
    return this.layerConfig.map(l => `<option value="${l.id}" ${selectedId==l.id?'selected':''}>L${l.id}</option>`).join('');
  }
  // "— None —" plus every real Foundry JournalEntry in this world, in the
  // order game.journal (a WorldCollection) already sorts them — same
  // source the read-only Journal Entries settings panel mirrors.
  _poiJournalOptionsHtml(selectedId){
    const none = `<option value="" ${!selectedId?'selected':''}>${game.i18n.localize('SHRIMPSEH.POI.JournalNone')}</option>`;
    const entries = game.journal ? Array.from(game.journal.contents) : [];
    const opts = entries.map(j => `<option value="${j.id}" ${selectedId===j.id?'selected':''}>${escapeHtml(j.name)}</option>`).join('');
    return none + opts;
  }
  _poiSizeOptionsHtml(selected){
    return [['small','SHRIMPSEH.POI.Size.Small'],['medium','SHRIMPSEH.POI.Size.Medium'],['large','SHRIMPSEH.POI.Size.Large']]
      .map(([val,key]) => `<option value="${val}" ${selected===val?'selected':''}>${game.i18n.localize(key)}</option>`).join('');
  }
  _poiStateOptionsHtml(selected){
    return POI_STATE_ORDER.map(s =>
      `<option value="${s}" ${selected===s?'selected':''}>${game.i18n.localize(POI_STATE_LABEL_KEYS[s])}</option>`
    ).join('');
  }

  /* ---------------- Render lifecycle ---------------- */
  _onFirstRender(context, options){
    // Listeners bound to `window`/`document` persist for the app's whole
    // lifetime and must be attached exactly once — everything else
    // (buttons, rows, sliders) lives inside content that _onRender
    // rebuilds every render, so those are (re)bound there instead.
    this._bindGlobalListeners();
    // ApplicationV2's own auto-centred initial placement would otherwise
    // win over styles/expanded-horizons.css's `#eh-window{left:3vw;
    // top:8vh}` (inline styles beat a stylesheet rule) — set the intended
    // starting position explicitly, through the framework's own position
    // API, so it lands where the original design always put it: an
    // out-of-the-way corner, not centred over the canvas.
    if (!this.uiState.compactMode) this.setPosition(this._computeDefaultPosition());
  }

  _computeDefaultPosition(){
    return {
      left: Math.round(window.innerWidth * 0.03),
      top: Math.round(window.innerHeight * 0.08),
      width: Math.min(820, Math.round(window.innerWidth * 0.94))
    };
  }

  _onRender(context, options){
    const el = this.element;

    // Restore popup open/closed state — the settings/layers-info PARTS
    // always render `hidden` by default; whether they're actually open
    // is UI chrome state that lives on the instance, not in the model
    // _prepareContext() describes.
    const settingsPanel = el.querySelector('#dh-settings');
    if (settingsPanel) {
      settingsPanel.hidden = !this._settingsOpen;
      if (this._settingsOpen) this._positionSettings();
    }
    const infoPopup = el.querySelector('#layers-info-popup');
    if (infoPopup) {
      infoPopup.hidden = !this._layersInfoOpen;
      if (this._layersInfoOpen) this._positionLayersInfo();
    }

    // Persistent chrome classes — these live on `this.element` itself,
    // which _onRender never replaces (only PART content is rebuilt), so
    // they're only *applied* here, never reset by a render.
    el.classList.toggle('compact', this.uiState.compactMode);
    el.classList.toggle('free-dock', this.uiState.compactMode && this.uiState.freeDock);
    el.classList.toggle('dragging', !!this._winDrag);
    el.classList.toggle('vantage-active', this._vantageActive);

    this._wireDynamicControls();

    // Rebuild the imperative horizon-view content (terrain layers + POI
    // markers) — #layers-container itself is always emptied by the
    // template, so this has to run after every render, same as the
    // original module's boot()/initLayers() did after every mutation.
    this._initLayers();

    if (this.uiState.compactMode) {
      if (this.uiState.freeDock) this._applyFreeDockPosition();
      else this._positionCompactDock();
    }

    if (!this._minWinWidth) {
      requestAnimationFrame(() => this._captureMinWindowSize());
    }
  }

  async _preClose(options){
    // Flush any pending debounced scene save immediately rather than
    // losing up to 500ms of edits to a close — the pre-ApplicationV2
    // version never truly unmounted (it only toggled display:none), so
    // it never needed this; a real close() does.
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this._flushSave();
    }
    if (this._compactPositionTimer) {
      window.clearInterval(this._compactPositionTimer);
      this._compactPositionTimer = null;
    }
    if (this._focusAnim) {
      cancelAnimationFrame(this._focusAnim.raf);
      this._focusAnim = null;
    }
    lastKnownScrollX = this.uiState.scrollX;
    this._unbindGlobalListeners();
  }

  /* ---------------- Global (window/document) listeners — bound once ---------------- */
  _bindGlobalListeners(){
    if (this._boundGlobalListeners) return;
    this._boundGlobalListeners = true;

    this._onWindowMouseMove = (e) => this._handleWindowMouseMove(e);
    this._onWindowMouseUp = () => this._handleWindowMouseUp();
    this._onWindowTouchMove = (e) => this._handleWindowTouchMove(e);
    this._onWindowTouchEnd = () => { this._isPanning = false; };
    this._onWindowResize = () => {
      this._updateVisuals();
      if (this.uiState.compactMode && !this.uiState.freeDock) this._positionCompactDock();
      if (this._settingsOpen) this._positionSettings();
      if (this._layersInfoOpen) this._positionLayersInfo();
    };
    this._onDocumentClick = (e) => {
      const el = this.element;
      if (!el) return;
      const settingsPanel = el.querySelector('#dh-settings');
      const cogBtn = el.querySelector('#cog-btn');
      if (settingsPanel && !settingsPanel.hidden && !settingsPanel.contains(e.target) && e.target !== cogBtn) {
        this._closeSettings();
      }
      const infoPopup = el.querySelector('#layers-info-popup');
      const infoBtn = el.querySelector('#layers-info-btn');
      if (infoPopup && !infoPopup.hidden && !infoPopup.contains(e.target) && e.target !== infoBtn) {
        this._closeLayersInfo();
      }
    };

    window.addEventListener('mousemove', this._onWindowMouseMove);
    window.addEventListener('mouseup', this._onWindowMouseUp);
    window.addEventListener('touchmove', this._onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', this._onWindowTouchEnd);
    window.addEventListener('resize', this._onWindowResize);
    document.addEventListener('click', this._onDocumentClick);
  }
  _unbindGlobalListeners(){
    if (!this._boundGlobalListeners) return;
    this._boundGlobalListeners = false;
    window.removeEventListener('mousemove', this._onWindowMouseMove);
    window.removeEventListener('mouseup', this._onWindowMouseUp);
    window.removeEventListener('touchmove', this._onWindowTouchMove);
    window.removeEventListener('touchend', this._onWindowTouchEnd);
    window.removeEventListener('resize', this._onWindowResize);
    document.removeEventListener('click', this._onDocumentClick);
  }

  /* ---------------- Per-render element wiring ---------------- */
  _wireDynamicControls(){
    const el = this.element;

    // -- Titlebar drag / resize / free-dock-handle / horizon panning --
    const draghandle = el.querySelector('#dh-draghandle');
    if (draghandle) {
      draghandle.addEventListener('mousedown', (e) => this._startWindowDrag(e));
      draghandle.addEventListener('dblclick', () => { if (!this.uiState.compactMode) this._enterCompact(); });
    }
    const horizonView = el.querySelector('#horizon-view');
    if (horizonView) {
      horizonView.addEventListener('mousedown', (e) => this._startPan(e));
      horizonView.addEventListener('touchstart', (e) => this._startPanTouch(e), { passive: true });
      horizonView.addEventListener('dblclick', () => { if (this.uiState.compactMode) this._exitCompact(); });
    }
    // Sits inside #horizon-view (see above), so its own mousedown has to
    // be stopped there or every click on it would also kick off a pan-drag.
    const vantageBtn = el.querySelector('#vantage-toggle-btn');
    if (vantageBtn) vantageBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    const resizeHandle = el.querySelector('#dh-resize-handle');
    if (resizeHandle) resizeHandle.addEventListener('mousedown', (e) => this._startWindowResize(e));
    const freeDockHandle = el.querySelector('#dh-free-dock-handle');
    if (freeDockHandle) freeDockHandle.addEventListener('mousedown', (e) => this._startFreeDockDrag(e));

    // -- Layer rows: biome select + Y/X offset sliders (delegated) --
    const layerRows = el.querySelector('#layer-rows');
    if (layerRows) {
      layerRows.addEventListener('change', (e) => this._onLayerRowsChange(e));
      layerRows.addEventListener('input', (e) => this._onLayerRowsInput(e));
    }

    // -- POI table: name/icon/layer/size/state + icon-file (delegated) --
    const poiList = el.querySelector('#poi-list');
    if (poiList) {
      poiList.addEventListener('change', (e) => this._onPoiListChange(e));
    }

    // -- Settings panel --
    const settingsPanel = el.querySelector('#dh-settings');
    if (settingsPanel) {
      settingsPanel.querySelector('#opt-compass-mode')?.addEventListener('change', (e) => {
        this.uiState.compassMode = e.target.value;
        this.render();
      });
      settingsPanel.querySelector('#opt-compass-opacity')?.addEventListener('input', (e) => {
        this.uiState.compassOpacity = parseInt(e.target.value, 10) / 100;
        el.querySelector('#compass-hud')?.style.setProperty('--compass-opacity', this.uiState.compassOpacity);
      });
      settingsPanel.querySelector('#opt-draghint')?.addEventListener('change', (e) => {
        this.uiState.showDragHint = e.target.checked;
        const hint = el.querySelector('#drag-hint');
        if (hint) hint.hidden = !this.uiState.showDragHint;
      });
      settingsPanel.querySelector('#opt-fullcolour')?.addEventListener('change', (e) => {
        this.uiState.fullColourIcons = e.target.checked;
        this._renderPOIs();
      });
      settingsPanel.querySelector('#opt-journal-linking')?.addEventListener('change', (e) => {
        this.uiState.journalLinkingEnabled = e.target.checked;
        this._scheduleSave();
        this.render();
      });
      settingsPanel.querySelector('#opt-palette')?.addEventListener('change', (e) => {
        this._applyPalette(e.target.value);
        // A deliberate GM push — see "Scene persistence + GM -> player
        // sync" below for what's actually shared vs. kept local. Takes
        // over for everyone, including a player who'd picked their own
        // palette since the GM's last push.
        this._pushPaletteIfGm();
      });
      settingsPanel.querySelector('#opt-horizon-length')?.addEventListener('change', (e) => {
        this.uiState.horizonLength = e.target.value;
        this._scheduleSave();
        this.render();
      });
      settingsPanel.querySelector('#opt-free-dock')?.addEventListener('change', (e) => {
        this.uiState.freeDock = e.target.checked;
        game.settings.set(MODULE_ID, 'freeDockEnabled', this.uiState.freeDock);
        el.classList.toggle('free-dock', this.uiState.freeDock);
        if (this.uiState.compactMode) {
          if (this.uiState.freeDock) this._applyFreeDockPosition();
          else {
            el.style.removeProperty('--free-dock-left');
            el.style.removeProperty('--free-dock-top');
            this._positionCompactDock();
          }
        }
      });

      // -- Presets: keep the typed-but-unsaved name in sync with the draft
      //    field _prepareContext() feeds back into the input's value, so
      //    it isn't lost to an unrelated re-render (see the constructor's
      //    _presetNameDraft comment). No save/render here — #onSavePreset
      //    reads the live input value directly when the button is clicked. --
      settingsPanel.querySelector('#preset-name-input')?.addEventListener('input', (e) => {
        this._presetNameDraft = e.target.value;
      });

      // -- Procedural Generator: every control just updates the draft
      //    object (see the constructor comment) rather than re-rendering,
      //    except the biome select, which needs to flip the combo row's
      //    visibility live. --
      settingsPanel.querySelector('#gen-biome-select')?.addEventListener('change', (e) => {
        this._genDraft.biome = e.target.value;
        const comboRow = settingsPanel.querySelector('#gen-combo-row');
        if (comboRow) comboRow.hidden = e.target.value !== 'combo';
      });
      settingsPanel.querySelector('#gen-combo-a')?.addEventListener('change', (e) => { this._genDraft.comboA = e.target.value; });
      settingsPanel.querySelector('#gen-combo-b')?.addEventListener('change', (e) => { this._genDraft.comboB = e.target.value; });
      settingsPanel.querySelector('#gen-ruggedness-select')?.addEventListener('change', (e) => { this._genDraft.ruggedness = e.target.value; });
      settingsPanel.querySelector('#gen-density-slider')?.addEventListener('input', (e) => {
        this._genDraft.density = parseInt(e.target.value, 10);
        const val = settingsPanel.querySelector('#gen-density-val');
        if (val) val.textContent = e.target.value;
      });
      settingsPanel.querySelector('#gen-seed-input')?.addEventListener('input', (e) => {
        this._genDraft.seed = e.target.value;
      });
    }
  }

  _onLayerRowsChange(e){
    const t = e.target;
    const layerId = parseInt(t.dataset.layerId, 10);
    const layer = this.layerConfig.find(l => l.id === layerId);
    if (!layer) return;
    if (t.classList.contains('layer-biome')) {
      this._applyBiomeOrImage(layer, t.value, () => this.render());
    }
  }
  _onLayerRowsInput(e){
    const t = e.target;
    const layerId = parseInt(t.dataset.layerId, 10);
    const layer = this.layerConfig.find(l => l.id === layerId);
    if (!layer) return;
    if (t.classList.contains('layer-offset-y')) {
      layer.yOffset = parseInt(t.value, 10);
      const row = t.closest('.layer-row');
      const val = row?.querySelectorAll('.val')[0];
      if (val) val.textContent = `${layer.yOffset}px`;
      requestAnimationFrame(() => this._updateVisuals());
    } else if (t.classList.contains('layer-offset-x')) {
      layer.xOffset = parseInt(t.value, 10);
      const row = t.closest('.layer-row');
      const val = row?.querySelectorAll('.val')[1];
      if (val) val.textContent = `${layer.xOffset}px`;
      requestAnimationFrame(() => this._updateVisuals());
    }
  }

  _onPoiListChange(e){
    const t = e.target;
    const poiId = parseInt(t.dataset.poiId, 10);
    const poi = this.uiState.pois.find(p => p.id === poiId);
    if (!poi) return;
    if (t.classList.contains('poi-name-input')) {
      poi.name = t.value;
      this._renderPOIs();
    } else if (t.classList.contains('poi-icon-select')) {
      poi.icon = t.value; poi.customIcon = null;
      this.render();
    } else if (t.classList.contains('poi-layer-select')) {
      // Keep the POI exactly where it visually is on screen — reassigning
      // a layer shouldn't teleport it, just change which terrain it's
      // pinned to (different pan speed / colour / Y-offset).
      const oldLayer = this.layerConfig.find(l => l.id === poi.layer);
      const newLayerId = parseInt(t.value, 10);
      const newLayer = this.layerConfig.find(l => l.id === newLayerId);
      if (oldLayer && newLayer) {
        const visualX = poi.xPos - (this.uiState.scrollX * oldLayer.speed) + oldLayer.xOffset;
        poi.xPos = visualX + (this.uiState.scrollX * newLayer.speed) - newLayer.xOffset;
        poi.offsetY = poi.offsetY - oldLayer.yOffset + newLayer.yOffset;
      }
      poi.layer = newLayerId;
      this._renderPOIs();
    } else if (t.classList.contains('size-sel')) {
      poi.size = t.value;
      this._renderPOIs();
    } else if (t.classList.contains('poi-state-select')) {
      // Only _renderPOIs() — a full this.render() here was re-rendering the
      // whole `window` PART, which re-runs _onFirstRender-style position
      // logic and snaps the window back to its default/minimum size,
      // discarding whatever size the GM had set. Every other per-POI field
      // in this table (layer, size, journal, bearing) already updates via
      // _renderPOIs() alone, with no window-level re-render.
      poi.state = t.value;
      this._renderPOIs();
    } else if (t.classList.contains('poi-journal-select')) {
      poi.journalId = t.value || null;
      this._renderPOIs();
    } else if (t.classList.contains('poi-bearing-input')) {
      let deg = parseInt(t.value, 10);
      if (Number.isNaN(deg)) deg = 0;
      poi.bearing = ((deg % 360) + 360) % 360;
      t.value = poi.bearing;
      this._renderPOIs();
    } else if (t.classList.contains('poi-dc-input')) {
      poi.revealDC = parseInt(t.value, 10) || 15;
      this._scheduleSave();
    }
  }

  /* ---------------- Action handlers (invoked by DEFAULT_OPTIONS.actions with `this` bound to the app instance) ---------------- */
  static #onToggleSettings(event){ event.stopPropagation(); this._toggleSettings(); }
  static #onToggleLayersInfo(event){ event.stopPropagation(); this._toggleLayersInfo(); }
  static #onSetViewMode(event, target){
    // Defense in depth on top of the toggle being absent from a real
    // player's rendered markup entirely (see showGmControls/IS_GM) — even
    // if this were somehow invoked (stale render, dev tools), an actual
    // player's client can never switch itself into 'gm' mode.
    if (!this.IS_GM) return;
    this.uiState.viewMode = target.dataset.mode;
    this.render();
  }
  static #onSetDaytime(event, target){
    this.uiState.daytime = target.dataset.time;
    this._scheduleSave();
    this.render();
  }
  static #onToggleLockView(){
    // Lock View is a GM action (it restricts what PLAYERS can do) — a real
    // player toggling their own lock would defeat the point of it. The
    // button itself is absent from a real player's rendered markup
    // (IS_GM guard in window.hbs); this is the same defense-in-depth as
    // the view-mode guard above.
    if (!this.IS_GM) return;
    this.uiState.viewLocked = !this.uiState.viewLocked;
    this._scheduleSave();
    this.render();
  }
  static #onAddPoi(){
    const icons = Object.keys(ICON_LABEL_KEYS);
    const firstEnabled = this.layerConfig.find(l => l.enabled) || this.layerConfig[3];
    this.uiState.pois.push({
      id: this.uiState.nextPoiId++,
      name: game.i18n.localize('SHRIMPSEH.POI.NewName'),
      layer: firstEnabled.id,
      xPos: this.uiState.scrollX + 300,
      offsetY: this._defaultOffsetYForLayer(firstEnabled.id),
      // Radar bearing starts wherever the horizon is currently facing — a
      // reasonable default for "I'm placing this where I'm looking right
      // now" — but is its own field from here on (see _currentHeadingDeg()'s
      // comment for why it isn't derived from xPos/layer.speed).
      bearing: this._currentHeadingDeg(),
      revealDC: 15,
      state: 'rumored',
      size: 'large',
      icon: icons[Math.floor(Math.random()*icons.length)],
      customIcon: null,
      locked: false,
      journalId: null
    });
    this.render();
  }
  static #onAlignPoiBearing(event, target){
    const poiId = parseInt(target.dataset.poiId, 10);
    const poi = this.uiState.pois.find(p => p.id === poiId);
    if (!poi) return;
    poi.bearing = this._currentHeadingDeg();
    // Unlike the bearing number input's own 'change' handler (which patches
    // the DOM value directly to avoid a full re-render mid-typing), this is
    // a single discrete click — a normal render() to refresh the table's
    // displayed value is simplest and matches every other POI action.
    this.render();
  }
  static #onApplyQuickBiome(event, target){
    const select = this.element.querySelector('#quick-biome-select');
    const b = select?.value || 'mountains-1';
    let remaining = this.layerConfig.length;
    const done = () => { remaining--; if (remaining <= 0) this.render(); };
    this.layerConfig.forEach(l => this._applyBiomeOrImage(l, b, done));
  }
  static #onResetWindowPosition(){ this._resetWindowPosition(); }
  static #onToggleLayerEnabled(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    layer.enabled = target.checked;
    this.render();
  }
  static #onToggleLayerMirrorTile(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    layer.mirrorTile = target.checked;
    processCustomImage(layer, (finalUrl, dims) => {
      layer.customImage = finalUrl;
      layer.customImageDims = dims;
      layer._processedFromRaw = layer.customImageRaw;
      this.render();
    });
  }
  static #onToggleLayerTint(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    layer.tintToColor = target.checked;
    this.render();
  }
  // Opens Foundry's OWN FilePicker application — the same file-browser
  // dialog Foundry uses for a Tile's or an Actor's image field — rather
  // than a plain OS "choose a file from my device" input. That dialog
  // lets the GM either upload a new file (still saved through Foundry's
  // own storage, same as before) or pick an image already sitting in the
  // module's upload folder or anywhere else on the server, without
  // re-uploading a duplicate copy from their device every time.
  static async #onTriggerLayerUpload(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    await ensureModuleUploadDir('layers'); // so there's a folder to land in/browse to
    new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current: layer.customImageRaw || STORAGE.layersUpload,
      callback: (path) => this._onLayerImagePicked(layer, path)
    }).render(true);
  }
  /** Shared by both the FilePicker "upload" and "select existing file"
   *  paths — either way `path` is already a real Foundry storage path
   *  (FilePicker itself does the uploading when that's what happened),
   *  never a base64 data: URI. */
  _onLayerImagePicked(layer, path){
    if (!path) return;
    layer.customImageRaw = path;
    layer.customImageName = path.split('/').pop();
    if (layer.mirrorTile === undefined) layer.mirrorTile = true;
    if (layer.tintToColor === undefined) layer.tintToColor = true;
    layer.imageSettingsOpen = true;
    layer.customImageBuiltin = false;
    processCustomImage(layer, (finalUrl, dims) => {
      layer.customImage = finalUrl;
      layer.customImageDims = dims;
      layer._processedFromRaw = layer.customImageRaw;
      this.render();
    });
  }
  static #onOpenLayerImageSettings(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    layer.imageSettingsOpen = true;
    this.render();
  }
  static #onClearLayerImage(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    layer.customImage = null; layer.customImageName = null; layer.customImageRaw = null;
    layer.customImageDims = null;
    layer._processedFromRaw = null;
    layer.imageSettingsOpen = false;
    // Forest has no procedural fallback (it's image-only), so clearing an
    // image-based layer needs a real biome to land on.
    if (!layer.biome || layer.biome.startsWith('img:')) layer.biome = 'mountains-1';
    this.render();
  }
  static #onApplyLayerImageSettings(event, target){
    const layer = this.layerConfig.find(l => l.id === parseInt(target.dataset.layerId, 10));
    if (!layer) return;
    layer.imageSettingsOpen = false;
    this.render();
  }
  // Same rationale as #onTriggerLayerUpload above: Foundry's own file
  // browser, not a bare device file input.
  static async #onTriggerPoiIconUpload(event, target){
    const poi = this.uiState.pois.find(p => p.id === parseInt(target.dataset.poiId, 10));
    if (!poi) return;
    await ensureModuleUploadDir('pois');
    new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current: poi.customIcon || STORAGE.poisUpload,
      callback: (path) => {
        if (!path) return;
        // No mirror-tile/derived-image step for a POI icon (unlike a layer
        // image) — the picked/uploaded path IS the final value.
        poi.customIcon = path;
        this.render();
      }
    }).render(true);
  }
  static #onClearPoiIcon(event, target){
    const poi = this.uiState.pois.find(p => p.id === parseInt(target.dataset.poiId, 10));
    if (!poi) return;
    poi.customIcon = null;
    this.render();
  }
  static #onFocusPoi(event, target){
    const poi = this.uiState.pois.find(p => p.id === parseInt(target.dataset.poiId, 10));
    if (poi) this._focusOnPoi(poi);
  }
  static #onTogglePoiLock(event, target){
    const poi = this.uiState.pois.find(p => p.id === parseInt(target.dataset.poiId, 10));
    if (!poi) return;
    poi.locked = !poi.locked;
    this.render();
  }
  static #onDeletePoi(event, target){
    const poiId = parseInt(target.dataset.poiId, 10);
    this.uiState.pois = this.uiState.pois.filter(p => p.id !== poiId);
    this.render();
  }

  /* ---------------- Vantage Point toggle ---------------- */
  static #onToggleVantage(){ this._setVantageActive(!this._vantageActive); }

  /* ---------------- Presets (world-scoped save/load/delete) ----------------
   * All three are gated on IS_GM as defense-in-depth to match the rest of
   * the GM-only action handlers above — the Presets section itself only
   * ever renders inside the `{{#if isGM}}` gm-only block of settings.hbs,
   * so a real player's client never has these buttons to begin with. */
  static async #onSavePreset(event, target){
    if (!this.IS_GM) return;
    const input = this.element.querySelector('#preset-name-input');
    const name = (input?.value || '').trim();
    if (!name) return;
    const presets = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'presets') || {});
    presets[name] = this._buildHorizonConfigPayload();
    await game.settings.set(MODULE_ID, 'presets', presets);
    this._presetNameDraft = '';
    // Every connected client (this one included) also gets a re-render
    // from the updateSetting hook below, but that's debounced by nothing
    // in particular — render immediately so the GM who just clicked Save
    // sees the cleared input and the new chip in the list without delay.
    this.render();
  }
  static #onLoadPreset(event, target){
    if (!this.IS_GM) return;
    const name = target.dataset.presetName;
    const presets = game.settings.get(MODULE_ID, 'presets') || {};
    const payload = presets[name];
    if (!payload) return;
    this._applyHorizonConfigPayload(payload).then(() => this._scheduleSave());
  }
  static async #onDeletePreset(event, target){
    if (!this.IS_GM) return;
    const name = target.dataset.presetName;
    const presets = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'presets') || {});
    delete presets[name];
    await game.settings.set(MODULE_ID, 'presets', presets);
    this.render();
  }

  /* ---------------- Procedural Generator ---------------- */
  static #onRandomizeGenSeed(){
    this._genDraft.seed = Math.random().toString(36).slice(2, 10);
    this.render();
  }
  static #onGenerateHorizon(){
    if (!this.IS_GM) return;
    this._generateHorizon();
  }

  /* ---------------- Settings / Layers-info popups (body-level, JS-positioned) ---------------- */
  _toggleSettings(){ this._settingsOpen ? this._closeSettings() : this._openSettings(); }
  _openSettings(){
    this._settingsOpen = true;
    const panel = this.element.querySelector('#dh-settings');
    const cogBtn = this.element.querySelector('#cog-btn');
    if (panel) panel.hidden = false;
    cogBtn?.classList.add('active');
    this._positionSettings();
  }
  _closeSettings(){
    this._settingsOpen = false;
    const panel = this.element.querySelector('#dh-settings');
    if (panel) panel.hidden = true;
    this.element.querySelector('#cog-btn')?.classList.remove('active');
  }
  _positionSettings(){
    const cogBtn = this.element.querySelector('#cog-btn');
    const panel = this.element.querySelector('#dh-settings');
    if (!cogBtn || !panel) return;
    const r = cogBtn.getBoundingClientRect();
    const width = 250;
    let left = r.right - width;
    left = Math.max(8, Math.min(window.innerWidth - width - 8, left));
    let top = r.bottom + 6;
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  _toggleLayersInfo(){ this._layersInfoOpen ? this._closeLayersInfo() : this._openLayersInfo(); }
  _openLayersInfo(){
    this._layersInfoOpen = true;
    const popup = this.element.querySelector('#layers-info-popup');
    if (popup) popup.hidden = false;
    this.element.querySelector('#layers-info-btn')?.classList.add('active');
    this._positionLayersInfo();
  }
  _closeLayersInfo(){
    this._layersInfoOpen = false;
    const popup = this.element.querySelector('#layers-info-popup');
    if (popup) popup.hidden = true;
    this.element.querySelector('#layers-info-btn')?.classList.remove('active');
  }
  _positionLayersInfo(){
    const btn = this.element.querySelector('#layers-info-btn');
    const popup = this.element.querySelector('#layers-info-popup');
    if (!btn || !popup) return;
    const r = btn.getBoundingClientRect();
    const width = 280;
    let left = r.left;
    left = Math.max(8, Math.min(window.innerWidth - width - 8, left));
    let top = r.bottom + 6;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  /* ---------------- Biome / custom image helpers ---------------- */
  _applyBiomeOrImage(layer, val, cb){
    if (val.startsWith('img:')) {
      const key = val.slice(4);
      const preset = Object.values(BUILTIN_LAYER_IMAGES).flat().find(b => b.key === key);
      if (!preset) { cb(); return; }
      layer.biome = val;
      layer.customImageRaw = preset.src;
      layer.customImageName = game.i18n.localize(preset.labelKey);
      layer.mirrorTile = true;
      layer.tintToColor = true;
      layer.imageSettingsOpen = false;
      layer.customImageBuiltin = true;
      processCustomImage(layer, (finalUrl, dims) => {
        layer.customImage = finalUrl;
        layer.customImageDims = dims;
        // Marks this derived bitmap as already up to date with the raw
        // source it was just built from, so a later _resolveLayerImages
        // pass (e.g. after this gets saved/synced and reloaded) doesn't
        // needlessly reprocess it again.
        layer._processedFromRaw = layer.customImageRaw;
        cb();
      });
    } else {
      layer.biome = val;
      layer.customImage = null; layer.customImageName = null; layer.customImageRaw = null;
      layer.customImageDims = null;
      layer.customImageBuiltin = false;
      layer._processedFromRaw = null;
      cb();
    }
  }

  /* ---------------- Procedural Generator ----------------
     Seeded PRNG (mulberry32 + hashSeed, both module-scope helpers above)
     so the same typed-in seed always builds the same layers + POIs,
     matching the setting note's promise. Replaces the current layers and
     POIs outright — same one-shot "Generate" action Enhanced Horizons
     v0.1.0 shipped, just re-homed onto this class and this.render(). */
  _applyFamilyToLayer(layer, family, baseVariant, rng, cb){
    if (family === 'forest') {
      const forestVariants = (BUILTIN_LAYER_IMAGES.forest || []).map(b => `img:${b.key}`);
      const val = forestVariants.length ? forestVariants[Math.floor(rng() * forestVariants.length)] : 'mountains-1';
      this._applyBiomeOrImage(layer, val, cb);
    } else {
      let variant = baseVariant + (rng() < 0.5 ? -1 : 1) * (rng() < 0.4 ? 1 : 0);
      variant = Math.min(3, Math.max(1, variant));
      this._applyBiomeOrImage(layer, `${family}-${variant}`, cb);
    }
  }
  _generateHorizon(){
    const { biome: biomeChoice, comboA, comboB, ruggedness, density, seed: seedInput } = this._genDraft;
    let seedText = (seedInput || '').trim();
    if (!seedText) { seedText = Math.random().toString(36).slice(2, 10); this._genDraft.seed = seedText; }
    const seededHash = hashSeed(seedText)();
    const rng = mulberry32(seededHash);
    const baseVariant = RUGGEDNESS_VARIANT[ruggedness] || 2;

    // Resolve what "Random" and "Combo" actually mean for this seed, using
    // the seeded rng so the same seed always resolves the same way.
    const useCombo = biomeChoice === 'combo';
    let resolvedFamily = biomeChoice;
    if (biomeChoice === 'random') resolvedFamily = GEN_BIOME_FAMILIES[Math.floor(rng() * GEN_BIOME_FAMILIES.length)];
    const familyForLayer = () => useCombo ? (rng() < 0.5 ? comboA : comboB) : resolvedFamily;
    const descriptorText = useCombo
      ? (comboA === comboB
          ? game.i18n.localize(GEN_BIOME_LABEL_KEYS[comboA] || GEN_BIOME_LABEL_KEYS.mountains)
          : `${game.i18n.localize(GEN_BIOME_LABEL_KEYS[comboA] || GEN_BIOME_LABEL_KEYS.mountains)}/${game.i18n.localize(GEN_BIOME_LABEL_KEYS[comboB] || GEN_BIOME_LABEL_KEYS.mountains)}`)
      : game.i18n.localize(GEN_BIOME_LABEL_KEYS[resolvedFamily] || GEN_BIOME_LABEL_KEYS.mountains);

    // Terrain: every layer gets a resolved biome family (fixed, a single
    // random pick, or one of the two combo picks), with the variant
    // wobbling ±1 around the chosen ruggedness so all 6 depths don't look
    // identically repeated.
    const layerFamilies = new Array(this.layerConfig.length);
    let remaining = this.layerConfig.length;
    const finishLayers = () => {
      remaining--;
      if (remaining > 0) return;

      // POIs: `density` of them (2-8), spread across a reasonable stretch
      // of horizon, each on a random enabled layer, starting Unknown so
      // there's something for the party to discover as they travel.
      this.uiState.pois = [];
      const icons = Object.keys(ICON_LABEL_KEYS);
      const spread = 2200;
      for (let i = 0; i < density; i++) {
        const layerIdx = Math.floor(rng() * this.layerConfig.length);
        const layerPick = this.layerConfig[layerIdx];
        const family = layerFamilies[layerIdx] || resolvedFamily || 'mountains';
        const adj = GEN_ADJECTIVES[Math.floor(rng() * GEN_ADJECTIVES.length)];
        const noun = (GEN_NAME_PARTS[family] || GEN_NAME_PARTS.mountains)[Math.floor(rng() * 6)];
        this.uiState.pois.push({
          id: this.uiState.nextPoiId++,
          name: `${adj} ${noun}`,
          layer: layerPick.id,
          xPos: this.uiState.scrollX - spread / 2 + rng() * spread,
          offsetY: this._defaultOffsetYForLayer(layerPick.id),
          bearing: Math.floor(rng() * 360),
          revealDC: 15,
          state: 'unknown',
          size: 'large',
          icon: icons[Math.floor(rng() * icons.length)],
          customIcon: null,
          locked: false,
          journalId: null
        });
      }
      const poiPhrase = density === 1
        ? game.i18n.localize('SHRIMPSEH.Generator.PoiCountSingular')
        : game.i18n.format('SHRIMPSEH.Generator.PoiCountPlural', { count: density });
      ui.notifications?.info(game.i18n.format('SHRIMPSEH.Generator.Notify', {
        ruggedness: game.i18n.localize(GEN_RUGGEDNESS_LABEL_KEYS[ruggedness] || GEN_RUGGEDNESS_LABEL_KEYS.rugged),
        descriptor: descriptorText,
        seed: seedText,
        poiPhrase
      }));
      // Rebuilds the layer rows, the terrain itself and the POI table all
      // at once, and — via _initLayers() -> _renderPOIs() -> _scheduleSave()
      // in the normal render lifecycle — schedules the save/sync too.
      this.render();
    };
    this.layerConfig.forEach((l, i) => {
      const family = familyForLayer();
      layerFamilies[i] = family;
      this._applyFamilyToLayer(l, family, baseVariant, rng, finishLayers);
    });
  }

  _applyPalette(paletteName){
    this.uiState.palette = paletteName;
    // Scoped to our own injected root, not the real page <html> — see the
    // CSS file's header comment on #shrimp-expanded-horizons-root for why
    // setting this (and our CSS vars) on the real :root would leak into
    // the rest of Foundry's UI.
    document.getElementById('shrimp-expanded-horizons-root')?.setAttribute('data-palette', this.uiState.palette);
    applyLayerPaletteColors(this.layerConfig, this.uiState.palette);
    this.render();
  }
  _defaultOffsetYForLayer(layerId){
    const layer = this.layerConfig.find(l => l.id === layerId) || this.layerConfig[3];
    const invertedIdx = 5 - (layer.id - 1);
    const baseY = 130 + (invertedIdx * 46);
    return 400 - baseY;
  }
  // Nearest (L1) to farthest, matching every other "layer order" both the
  // Vantage Point radar (ring order — see _renderRadar()) and the
  // Procedural Generator (per-layer biome picks) need — only enabled
  // layers count, in on-screen depth order.
  _orderedEnabledLayerIds(){
    return this.layerConfig.filter(l => l.enabled).map(l => l.id);
  }
  _fillerHeightFor(layer){
    return Math.max(0, -layer.yOffset);
  }
  _horizonHeightPx(){
    return this.uiState.compactMode ? 158 : 168;
  }
  _applyCustomImageSize(layer, bgEl){
    const dims = layer.customImageDims;
    const h = this._horizonHeightPx();
    if (!dims || !dims.width || !dims.height) {
      bgEl.style.webkitMaskSize = bgEl.style.maskSize = 'auto 100%';
      bgEl.style.backgroundSize = 'auto 100%';
      return;
    }
    const wPx = Math.round(dims.width * (h / dims.height));
    const sizeStr = `${wPx}px 100%`;
    bgEl.style.webkitMaskSize = sizeStr;
    bgEl.style.maskSize = sizeStr;
    bgEl.style.backgroundSize = sizeStr;
  }
  _refreshCustomImageSizes(){
    this.layerConfig.forEach(layer => {
      if (!layer.enabled || !layer.customImage) return;
      const bgEl = this.element.querySelector(`#layer-bg-${layer.id}`);
      if (bgEl) this._applyCustomImageSize(layer, bgEl);
    });
  }

  /* ---------------- Horizon layers + POI markers (imperative, per README notes above) ---------------- */
  _initLayers(){
    const container = this.element.querySelector('#layers-container');
    if (!container) return;
    container.innerHTML = '';
    [...this.layerConfig].reverse().forEach(layer => {
      if (!layer.enabled) return;

      const filler = document.createElement('div');
      filler.className = 'layer-filler';
      filler.id = `layer-fill-${layer.id}`;
      filler.style.zIndex = layer.baseZ;
      filler.style.background = layer.color;
      filler.style.height = `${this._fillerHeightFor(layer)}px`;
      container.appendChild(filler);

      const bgWrapper = document.createElement('div');
      bgWrapper.className = 'parallax-layer';
      bgWrapper.id = `layer-bg-${layer.id}`;
      bgWrapper.style.zIndex = layer.baseZ;

      if (layer.customImage) {
        if (layer.tintToColor !== false) {
          bgWrapper.classList.add('masked-custom');
          bgWrapper.style.background = layer.color;
          bgWrapper.style.webkitMaskImage = `url("${layer.customImage}")`;
          bgWrapper.style.maskImage = `url("${layer.customImage}")`;
        } else {
          bgWrapper.classList.remove('masked-custom');
          bgWrapper.style.backgroundImage = `url("${layer.customImage}")`;
        }
        this._applyCustomImageSize(layer, bgWrapper);
      } else {
        const svgPath = generateBiomePath(layer.biome, layer.id - 1);
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3600 400" preserveAspectRatio="none"><path fill="${layer.color}" d="${svgPath}"/></svg>`;
        bgWrapper.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svgString)}")`;
        bgWrapper.style.backgroundSize = '3600px 100%';
      }

      container.appendChild(bgWrapper);
    });
    this._renderPOIs();
  }

  _renderIconMarkup(poi, layer){
    if (poi.customIcon) {
      if (this.uiState.fullColourIcons) {
        return `<img src="${poi.customIcon}" style="width:100%;height:100%;object-fit:contain;display:block;">`;
      }
      return `<div style="width:100%;height:100%;background:${layer.color};
        -webkit-mask-image:url('${poi.customIcon}'); mask-image:url('${poi.customIcon}');
        -webkit-mask-size:contain; mask-size:contain;
        -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
        -webkit-mask-position:center; mask-position:center;"></div>`;
    }
    const defFn = POI_ICON_DEFS[poi.icon] || POI_ICON_DEFS.tower;
    const fill = this.uiState.fullColourIcons ? (ICON_FULLCOLOUR[poi.icon] || '#c9a75c') : layer.color;
    return defFn(fill);
  }

  /* ---------------- Passive Perception visibility (per-viewer, client-side only) ----------------
   * Deliberately per-CLIENT, not a shared/synced scene mutation: passive Perception is a
   * per-character stat in dnd5e, so two players can (and should) see different Hidden POIs
   * revealed depending on their own assigned character. Nothing here is ever written back
   * to poi.state/the scene — it's purely a rendering-time overlay recomputed on every
   * render, same as everything else in this class that's per-viewer (showGmControls, etc). */
  _myPassivePerception(){
    // game.user.character (the player's assigned PC) first — more reliable than whichever
    // token happens to be controlled on the current scene, since a player who hasn't
    // selected a token yet should still get their own passive Perception applied. Falls
    // back to a controlled token's actor, then a flat 10 (an untrained, unmodified passive
    // score) so this never throws for a GM previewing Player view with no assigned actor.
    const actor = game.user?.character || canvas.tokens?.controlled?.[0]?.actor || null;
    if (!actor) return 10;
    const passive = actor.system?.skills?.prc?.passive;
    if (typeof passive === 'number') return passive;
    // dnd5e always derives skills.prc.passive once the actor sheet has been opened once,
    // but a freshly-imported/never-opened actor can lack it — fall back to the dnd5e
    // formula (10 + Wisdom modifier, no proficiency) rather than treating it as 0.
    const wisMod = actor.system?.abilities?.wis?.mod;
    return 10 + (typeof wisMod === 'number' ? wisMod : 0);
  }
  // GM always sees the real, saved poi.state. For a player: Rumored and Discovered are
  // always visible to everyone unconditionally (a deliberate GM call already promoted
  // them past needing a Perception check). Unknown is the state passive Perception
  // actually gates — a player only sees the unidentified blip once their own passive
  // Perception meets or beats the POI's revealDC; otherwise it's as good as Hidden to
  // them. Hidden always stays Hidden to a player regardless of DC — existence itself is
  // a deliberate GM reveal (promoting to Unknown), never something a Perception score
  // alone unlocks.
  _effectivePoiState(poi){
    if (this.IS_GM) return poi.state;
    if (poi.state === 'rumored' || poi.state === 'discovered') return poi.state;
    if (poi.state === 'unknown') {
      return this._myPassivePerception() >= (poi.revealDC ?? 15) ? 'unknown' : 'hidden';
    }
    return 'hidden';
  }

  _renderPOIs(){
    const el = this.element;
    const container = el.querySelector('#layers-container');
    if (!container) return;
    el.querySelectorAll('.poi-container').forEach(node => node.remove());

    this.uiState.pois.forEach(poi => {
      const layer = this.layerConfig.find(l => l.id === parseInt(poi.layer, 10));
      if (!layer || !layer.enabled) return;
      // effState is what THIS viewer actually sees — the GM always sees
      // poi.state as truly saved, but a player may see a Hidden POI as
      // Unknown if their own passive Perception clears its revealDC (see
      // _effectivePoiState()). Never mutates poi.state itself — nothing
      // about a passive glimpse is written back to the scene, so different
      // players can end up seeing different things, on purpose.
      const effState = this._effectivePoiState(poi);
      if (effState === 'hidden') return;

      const poiEl = document.createElement('div');
      const draggable = this.uiState.viewMode === 'gm' && !this.uiState.compactMode && !poi.locked;
      poiEl.className = 'poi-container' + (draggable ? ' draggable' : '');
      poiEl.id = `poi-${poi.id}`;
      poiEl.style.zIndex = layer.baseZ + 5;

      const visualScale = layer.scale * 1.4 * (POI_SIZE_MUL[poi.size] || POI_SIZE_MUL.large);
      // Name card only appears once a POI is Discovered — Unknown and
      // Rumored give away that *something* is there, but never its name.
      let html = effState === 'discovered'
        ? `<div class="tooltip">${escapeHtml(poi.name)}${poi.locked ? ' \u{1F512}' : ''}</div><div class="poi-mark">`
        : `<div class="poi-mark">`;
      if (poi.locked) html += `<span class="lock-badge">${ICONS.lock}</span>`;

      if (effState === 'unknown') {
        html += `<div class="poi-rumor" style="font-size:${20+visualScale*4.5}px;">?</div>`;
      } else if (effState === 'rumored') {
        const iconMarkup = this._renderIconMarkup(poi, layer);
        html += `<div class="poi-rumor" style="font-size:${16+visualScale*3.5}px; margin-bottom:2px;">?</div>
                  <div class="poi-icon" style="width:${44*visualScale}px; height:${44*visualScale}px; opacity:0.35;">${iconMarkup}</div>`;
      } else if (effState === 'discovered') {
        const iconMarkup = this._renderIconMarkup(poi, layer);
        html += `<div class="poi-icon" style="width:${44*visualScale}px; height:${44*visualScale}px;">${iconMarkup}</div>`;
      }
      // A linked journal only ever shows once the POI is fully Discovered —
      // Unknown/Rumored give away that something's there, but the party
      // hasn't earned the actual lore entry yet. Also gated on the GM's
      // journal-linking toggle (settings), so turning that off hides any
      // existing badges immediately even though the underlying journalId
      // is left untouched on the POI (it simply stops being used).
      const journal = (this.uiState.journalLinkingEnabled && poi.journalId) ? game.journal?.get(poi.journalId) : null;
      if (journal && effState === 'discovered') {
        html += `<button type="button" class="poi-journal-badge" title="${game.i18n.format('SHRIMPSEH.POI.JournalBadgeTitle', { name: escapeHtml(journal.name) })}" aria-label="${game.i18n.localize('SHRIMPSEH.POI.JournalBadgeAria')}">${ICONS.journal}</button>`;
      }
      html += `</div>`;
      poiEl.innerHTML = html;

      if (draggable) {
        poiEl.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this._poiDrag = { poi, startClientX: e.clientX, startClientY: e.clientY, startXPos: poi.xPos, startOffsetY: poi.offsetY };
        });
      }
      if (journal && effState === 'discovered') {
        // Reachable by GM and player alike — reading the lore isn't a
        // GM-only action, unlike everything else this loop gates on
        // `draggable`/showGmControls.
        const badge = poiEl.querySelector('.poi-journal-badge');
        badge?.addEventListener('click', (e) => {
          e.stopPropagation();
          journal.sheet.render(true);
        });
        badge?.addEventListener('mousedown', (e) => e.stopPropagation());
      }

      container.appendChild(poiEl);
    });
    this._updateVisuals();
    this._renderRadar();
    // Covers both direct POI edits and layer edits — one debounced save
    // point for almost every persistable mutation. See "Scene persistence
    // + GM -> player sync" below for what's actually shared vs. kept local.
    this._scheduleSave();
  }

  /* ---------------- Radar (Vantage Point) ----------------
   * A fixed, north-up top-down view: 6 concentric rings = the 6 terrain
   * layers (nearest layer = innermost ring, via _orderedEnabledLayerIds()
   * — same depth ordering the old diorama used), the party fixed at
   * centre, and each POI plotted as a dot at its own layer's ring using
   * poi.bearing (0-359°, an independent field — see #onAddPoi's comment)
   * rather than anything derived from the horizon's xPos/layer.speed.
   *
   * Deliberately NOT rotated to track the current horizon heading: players
   * can't pan the horizon while the radar is showing (#horizon-view is
   * hidden, so its drag listener never fires), so there's no continuous
   * "camera" motion to rotate against — only a fixed heading at whatever
   * point Vantage Point was toggled on. Spinning the whole radar for that
   * would be disorienting for no benefit, so instead a single small
   * facing wedge at the centre rotates to show current heading against a
   * fixed compass, while the rings/dots themselves stay put. Cheap to
   * redraw from scratch on every call (rebuilt imperatively, same as
   * _initLayers()/_renderPOIs() — no per-frame cost since, unlike the old
   * diorama tilt, nothing here needs to run during horizon panning). */
  _renderRadar(){
    const svg = this.element?.querySelector('#radar-svg');
    if (!svg) return;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const cx = 160, cy = 160, maxR = 138;
    const ordered = this._orderedEnabledLayerIds(); // near -> far
    const ringCount = Math.max(ordered.length, 1);
    const ringStep = maxR / ringCount;
    const toXY = (bearingDeg, r) => {
      const rad = (bearingDeg - 90) * (Math.PI / 180); // bearing 0 (N) points up
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };
    const el = (tag, attrs) => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const k in attrs) node.setAttribute(k, attrs[k]);
      return node;
    };

    // Rings, one per enabled layer, nearest innermost. Coloured with the
    // layer's own palette colour so ring identity reads at a glance.
    ordered.forEach((layerId, i) => {
      const layer = this.layerConfig.find(l => l.id === layerId);
      const r = ringStep * (i + 1);
      const ring = el('circle', { cx, cy, r, class: 'radar-ring' });
      ring.style.stroke = layer?.color || 'var(--brass)';
      svg.appendChild(ring);
    });

    // 8-point compass spokes, fixed (never rotate) — the radar is north-up.
    const dirs = [['N',0],['NE',45],['E',90],['SE',135],['S',180],['SW',225],['W',270],['NW',315]];
    dirs.forEach(([label, deg]) => {
      const inner = toXY(deg, 14);
      const outer = toXY(deg, maxR);
      svg.appendChild(el('line', { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, class: 'radar-spoke' + (deg % 90 === 0 ? ' radar-spoke-cardinal' : '') }));
      const labelPos = toXY(deg, maxR + 12);
      const text = el('text', { x: labelPos.x, y: labelPos.y, class: 'radar-dir-label' });
      text.textContent = label;
      svg.appendChild(text);
    });

    // Facing wedge — the only thing that rotates, a small arrow at centre
    // showing which way the horizon is currently pointed.
    const heading = this._currentHeadingDeg();
    const tip = toXY(heading, 20);
    const baseL = toXY(heading - 150, 7);
    const baseR = toXY(heading + 150, 7);
    svg.appendChild(el('polygon', {
      points: `${tip.x},${tip.y} ${baseL.x},${baseL.y} ${baseR.x},${baseR.y}`,
      class: 'radar-facing-wedge'
    }));

    // Party marker, fixed at centre.
    svg.appendChild(el('circle', { cx, cy, r: 5, class: 'radar-party-dot' }));

    // POI dots. Hover is handled by a custom positioned HTML tooltip (see
    // #radar-tooltip below) rather than the native SVG <title> — a native
    // title only appears after the browser's own OS-timed hover delay and
    // can't be styled/positioned reliably, which is why the name wasn't
    // showing up consistently. A <title> is still added too, as a harmless
    // no-cost fallback for any input method the custom tooltip can't reach.
    const tooltip = this.element?.querySelector('#radar-tooltip');
    this.uiState.pois.forEach(poi => {
      const effState = this._effectivePoiState(poi);
      if (effState === 'hidden') return;
      const layerIdx = ordered.indexOf(parseInt(poi.layer, 10));
      if (layerIdx === -1) return; // layer disabled, or not found
      const r = ringStep * (layerIdx + 1);
      const bearing = ((poi.bearing ?? 0) % 360 + 360) % 360;
      const { x, y } = toXY(bearing, r);

      const dot = el('circle', { cx: x, cy: y, r: effState === 'unknown' ? 3.5 : 5, class: `radar-poi radar-poi-${effState}` });
      const tooltipText = effState === 'discovered'
        ? poi.name
        : game.i18n.localize('SHRIMPSEH.Radar.UnknownTooltip');
      const title = el('title', {});
      title.textContent = tooltipText;
      dot.appendChild(title);

      if (tooltip) {
        const showTooltip = (clientX, clientY) => {
          const hostRect = tooltip.offsetParent?.getBoundingClientRect() || this.element.getBoundingClientRect();
          tooltip.textContent = tooltipText;
          tooltip.style.left = `${clientX - hostRect.left}px`;
          tooltip.style.top = `${clientY - hostRect.top}px`;
          tooltip.style.display = 'block';
        };
        dot.addEventListener('mouseenter', (e) => showTooltip(e.clientX, e.clientY));
        dot.addEventListener('mousemove', (e) => showTooltip(e.clientX, e.clientY));
        dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
      }

      const journal = (this.uiState.journalLinkingEnabled && poi.journalId) ? game.journal?.get(poi.journalId) : null;
      if (effState === 'discovered' && journal) {
        dot.classList.add('radar-poi-linked');
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          journal.sheet.render(true);
        });
      }
      svg.appendChild(dot);
    });
  }

  _focusOnPoi(poi){
    const layer = this.layerConfig.find(l => l.id === parseInt(poi.layer, 10));
    if (!layer) return;
    const horizonView = this.element.querySelector('#horizon-view');
    const centerPx = (horizonView?.clientWidth || 0) / 2;
    const target = (poi.xPos + layer.xOffset - centerPx) / (layer.speed || 0.0001);
    this._animatePanTo(target);
  }

  _animatePanTo(targetScrollX, duration = 650){
    if (this._focusAnim) cancelAnimationFrame(this._focusAnim.raf);
    const startX = this.uiState.scrollX;
    const delta = targetScrollX - startX;
    if (Math.abs(delta) < 0.5) { this.uiState.scrollX = targetScrollX; this._updateVisuals(); return; }
    const startTime = performance.now();
    const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    this._focusAnim = { raf: 0 };
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      this.uiState.scrollX = startX + delta * easeInOutCubic(t);
      this._updateVisuals();
      if (t < 1) {
        this._focusAnim.raf = requestAnimationFrame(step);
      } else {
        this._focusAnim = null;
      }
    };
    this._focusAnim.raf = requestAnimationFrame(step);
  }

  // The compass's own scroll->degree conversion (10px of horizon pan = 1°),
  // used for both the compass HUD text and the radar's facing indicator +
  // new-POI bearing default. NOT used to derive an existing POI's bearing —
  // see the bearing-field comment in #onAddPoi for why that's a separate,
  // explicitly-set field instead of something computed from xPos/layer.speed.
  _currentHeadingDeg(){
    let deg = (this.uiState.scrollX / 10) % 360;
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }

  _updateVisuals(){
    const el = this.element;
    if (!el) return;
    const rawDeg = this._currentHeadingDeg();
    const directions = ['N','NE','E','SE','S','SW','W','NW'];
    const dirIndex = Math.round(rawDeg / 45) % 8;
    const compassText = el.querySelector('#compass-text');
    if (compassText) {
      compassText.textContent = this.uiState.compassMode === 'simple'
        ? directions[dirIndex]
        : `${directions[dirIndex]} ${Math.round(rawDeg)}°`;
    }

    this.layerConfig.forEach(layer => {
      if (!layer.enabled) return;
      const bgEl = el.querySelector(`#layer-bg-${layer.id}`);
      if (bgEl) {
        const posX = `${-this.uiState.scrollX * layer.speed + layer.xOffset}px`;
        bgEl.style.backgroundPositionX = posX;
        if (bgEl.classList.contains('masked-custom')) {
          bgEl.style.webkitMaskPositionX = posX;
          bgEl.style.maskPositionX = posX;
        }
        bgEl.style.transform = `translateY(${layer.yOffset}px)`;
      }
      const fillEl = el.querySelector(`#layer-fill-${layer.id}`);
      if (fillEl) fillEl.style.height = `${this._fillerHeightFor(layer)}px`;
    });

    this.uiState.pois.forEach(poi => {
      const poiEl = el.querySelector(`#poi-${poi.id}`);
      if (!poiEl) return;
      const layer = this.layerConfig.find(l => l.id === parseInt(poi.layer, 10));
      if (!layer) return;
      const visualX = poi.xPos - (this.uiState.scrollX * layer.speed) + layer.xOffset;
      poiEl.style.transform = `translateX(${visualX}px) translateY(${layer.yOffset}px)`;
      poiEl.style.bottom = `${poi.offsetY}px`;
    });
  }

  /* ---------------- Vantage Point mode ----------------
     A separate, much larger top-down radar view (see _renderRadar()):
     #horizon-view (the flat parallax strip) is swapped out for #radar-view
     for as long as this is active, purely via the .vantage-active CSS
     class — no DOM teardown, so toggling back off is instant. Purely a
     local display toggle — never persisted to the scene or pushed to
     players, works the same whether the window is docked or undocked. */
  _setVantageActive(active){
    const el = this.element;
    if (!el) return;
    this._vantageActive = active;
    el.querySelector('#vantage-toggle-btn')?.classList.toggle('active', active);
    el.querySelector('#horizon-wrap')?.classList.toggle('vantage-active', active);
    // Drives the .vantage-active CSS on the window root, which hides
    // #controls (the Layers/POI panel) and lets #horizon-wrap flex to
    // fill whatever room that frees up — Vantage Point's extra size is
    // for the horizon itself, not the panel underneath it.
    el.classList.toggle('vantage-active', active);
    if (this.uiState.compactMode) {
      // Docked/compact mode is left docked — its height is always
      // content-driven from #horizon-wrap's flex-basis (see the
      // .compact.vantage-active CSS rule), so there's no window sizing to
      // do here at all; the fixed size below only applies to the floating
      // window.
    } else if (active) {
      // Vantage Point locks the floating window to one fixed size
      // (820x604) for every viewer, every time — not whatever size the
      // window happened to be at, and not something recomputed from the
      // window's current content. Position bookkeeping goes through
      // this.setPosition() (not raw element.style writes) so it stays
      // consistent with ApplicationV2's own position state. The window's
      // size just before Vantage Point was toggled on is remembered so
      // turning it back off restores exactly what was there.
      this._vantagePrevSize = { width: this.position.width, height: this.position.height };
      this.setPosition(VANTAGE_LOCKED_SIZE);
    } else if (this._vantagePrevSize) {
      this.setPosition({ width: this._vantagePrevSize.width, height: this._vantagePrevSize.height });
      this._vantagePrevSize = null;
    }
    // The radar's own SVG viewBox is a fixed 320x320 regardless of window
    // size (it scales via preserveAspectRatio, not by recomputing points),
    // so there's no geometry to redo here beyond redrawing it — but do
    // that redraw right away rather than waiting for the next POI/layer
    // change, so switching modes shows the radar immediately.
    this._renderRadar();
  }

  /* ---------------- Horizon pan + POI free placement ---------------- */
  _panMultiplier(){ return HORIZON_LENGTH_MUL[this.uiState.horizonLength] || HORIZON_LENGTH_MUL.far; }
  // Lock View only restricts panning in Player view — the GM can always
  // scroll (e.g. to set up the shot) before locking it for the players.
  _canPan(){ return !(this.uiState.viewLocked && this.uiState.viewMode === 'player'); }

  _startPan(e){
    if (!this._canPan()) return;
    this._isPanning = true; this._panLastX = e.clientX;
    this.element.querySelector('#horizon-view')?.classList.add('dragging');
  }
  _startPanTouch(e){
    if (!this._canPan()) return;
    this._isPanning = true; this._panLastX = e.touches[0].clientX;
  }
  _handleWindowMouseMove(e){
    if (this._poiDrag) {
      const dx = e.clientX - this._poiDrag.startClientX;
      const dy = e.clientY - this._poiDrag.startClientY;
      this._poiDrag.poi.xPos = this._poiDrag.startXPos + dx;
      this._poiDrag.poi.offsetY = this._poiDrag.startOffsetY - dy;
      requestAnimationFrame(() => this._updateVisuals());
      return;
    }
    if (this._winDrag) { this._onWindowDragMove(e); return; }
    if (this._winResize) { this._onWindowResizeMove(e); return; }
    if (this._freeDockDrag) { this._onFreeDockDragMove(e); return; }
    if (!this._isPanning) return;
    this.uiState.scrollX -= (e.clientX - this._panLastX) * this._panMultiplier();
    this._panLastX = e.clientX;
    requestAnimationFrame(() => this._updateVisuals());
  }
  _handleWindowMouseUp(){
    this._isPanning = false;
    this.element?.querySelector('#horizon-view')?.classList.remove('dragging');
    // A POI drag updates poi.xPos/offsetY directly every frame (via
    // _updateVisuals(), not _renderPOIs()) so dragging stays smooth — but
    // that means it never went through _renderPOIs()'s _scheduleSave()
    // call either, so the new position was never saved or pushed to
    // players. Save once here, when the drag actually ends.
    const wasDraggingPoi = !!this._poiDrag;
    this._poiDrag = null;
    if (wasDraggingPoi) this._scheduleSave();

    if (this._winDrag) this._endWindowDrag();
    if (this._winResize) this._endWindowResize();
    if (this._freeDockDrag) this._endFreeDockDrag();
  }
  _handleWindowTouchMove(e){
    if (!this._isPanning) return;
    this.uiState.scrollX -= (e.touches[0].clientX - this._panLastX) * this._panMultiplier();
    this._panLastX = e.touches[0].clientX;
    requestAnimationFrame(() => this._updateVisuals());
  }

  /* ---------------- Window drag / resize (undocked only) ----------------
     Bespoke titlebar, so this is hand-rolled rather than handed to
     ApplicationV2's own header-drag — but position bookkeeping still goes
     through this.setPosition() rather than raw element.style writes,
     keeping this.position accurate for anything else that reads it. */
  _startWindowDrag(e){
    if (this.uiState.compactMode) return;
    this._closeSettings();
    const rect = this.element.getBoundingClientRect();
    this._winDrag = { startClientX: e.clientX, startClientY: e.clientY, startLeft: rect.left, startTop: rect.top };
    this.element.classList.add('dragging');
  }
  _onWindowDragMove(e){
    const dx = e.clientX - this._winDrag.startClientX;
    const dy = e.clientY - this._winDrag.startClientY;
    let left = this._winDrag.startLeft + dx;
    let top = this._winDrag.startTop + dy;
    const rect = this.element.getBoundingClientRect();
    left = Math.max(4, Math.min(window.innerWidth - rect.width - 4, left));
    top = Math.max(4, Math.min(window.innerHeight - 40, top));
    this.setPosition({ left, top });
  }
  _endWindowDrag(){
    this._winDrag = null;
    this.element.classList.remove('dragging');
  }

  _startWindowResize(e){
    if (this.uiState.compactMode) return;
    e.stopPropagation();
    e.preventDefault();
    this._closeSettings();
    const rect = this.element.getBoundingClientRect();
    this._winResize = { startClientX: e.clientX, startClientY: e.clientY, startWidth: rect.width, startHeight: rect.height };
  }
  _onWindowResizeMove(e){
    const dx = e.clientX - this._winResize.startClientX;
    const dy = e.clientY - this._winResize.startClientY;
    const maxWidth = window.innerWidth - 8;
    const maxHeight = window.innerHeight - 8;
    const newWidth = Math.max(this._minWinWidth, Math.min(maxWidth, this._winResize.startWidth + dx));
    const newHeight = Math.max(this._minWinHeight, Math.min(maxHeight, this._winResize.startHeight + dy));
    this.setPosition({ width: newWidth, height: newHeight });
  }
  _endWindowResize(){ this._winResize = null; }

  _captureMinWindowSize(){
    const rect = this.element.getBoundingClientRect();
    this._minWinWidth = rect.width;
    this._minWinHeight = rect.height;
  }

  _resetWindowPosition(){
    this.element.style.height = '';
    this.setPosition(this._computeDefaultPosition());
    this._closeSettings();
  }

  /* ---------------- Compact dock mode ----------------
     Docked mode used to just span the full viewport width flush to the
     bottom, which put it behind Foundry's own scene-controls column,
     sidebar and hotbar rather than sitting above them. This measures
     Foundry's real UI chrome and insets the docked strip to fit the gap
     between the side columns and above the hotbar instead. It looks for
     Foundry's standard element ids (#ui-left, #sidebar — #ui-right on
     older versions — and #hotbar); if none of them exist it leaves the
     CSS fallback inset in place.

     Foundry v13 restructured these landmarks: #ui-left is no longer the
     narrow toolbar itself but a much wider layout wrapper, and #sidebar
     collapses to zero width until a tab is expanded. Trusting the
     landmark element's OWN bounding box grossly overshoots on v13.
     Measuring the widest/narrowest edge among the landmark's own VISIBLE
     children instead tracks whatever is actually painted on any version. */
  _visibleRightEdge(el){
    if (!el) return null;
    const kids = Array.from(el.children).filter(c => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (kids.length) return Math.max(...kids.map(c => c.getBoundingClientRect().right));
    const rect = el.getBoundingClientRect();
    return (rect.width > 0 && rect.height > 0) ? rect.right : null;
  }
  _visibleLeftEdge(el){
    if (!el) return null;
    const kids = Array.from(el.children).filter(c => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (kids.length) return Math.min(...kids.map(c => c.getBoundingClientRect().left));
    const rect = el.getBoundingClientRect();
    return (rect.width > 0 && rect.height > 0) ? rect.left : null;
  }
  _measureDockGeometry(){
    const margin = 12;
    const leftEl = document.getElementById('ui-left');
    const rightEl = document.getElementById('sidebar') || document.getElementById('ui-right');
    const hotbarEl = document.getElementById('hotbar');

    let leftNeeded = margin, rightNeeded = margin;
    const leftEdge = this._visibleRightEdge(leftEl);
    if (leftEdge !== null) leftNeeded = leftEdge + margin;
    const rightEdge = this._visibleLeftEdge(rightEl);
    if (rightEdge !== null) rightNeeded = Math.max(0, window.innerWidth - rightEdge) + margin;
    const inset = Math.max(leftNeeded, rightNeeded);

    let bottom = null;
    if (hotbarEl) {
      const hRect = hotbarEl.getBoundingClientRect();
      if (hRect.width > 0 && hRect.height > 0) bottom = Math.max(0, window.innerHeight - hRect.top) + margin;
    }
    return { inset, bottom };
  }
  _positionCompactDock(){
    if (!this.uiState.compactMode || this.uiState.freeDock) return;
    const { inset, bottom } = this._measureDockGeometry();
    const el = this.element;
    el.style.left = `${inset}px`;
    el.style.right = `${inset}px`;
    if (bottom !== null) el.style.bottom = `${bottom}px`;
  }

  /* ---------------- Free Dock (drag the docked strip anywhere, per-browser) ---------------- */
  _clampFreeDockX(x){
    const w = this.element.getBoundingClientRect().width || Math.min(820, window.innerWidth * 0.94);
    return Math.max(0, Math.min(window.innerWidth - w, x));
  }
  _clampFreeDockY(y){
    const h = this.element.getBoundingClientRect().height || 158;
    return Math.max(0, Math.min(window.innerHeight - h, y));
  }
  _applyFreeDockPosition(){
    const el = this.element;
    const saved = game.settings.get(MODULE_ID, 'freeDockPos');
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      el.style.setProperty('--free-dock-left', `${this._clampFreeDockX(saved.left)}px`);
      el.style.setProperty('--free-dock-top', `${this._clampFreeDockY(saved.top)}px`);
      return;
    }
    // First time Free Dock is turned on: seed it from wherever the
    // auto-centred dock currently sits, so the strip doesn't jump the
    // moment the toggle is flipped.
    const geo = this._measureDockGeometry();
    const inset = geo.inset;
    const bottom = geo.bottom !== null ? geo.bottom : 60;
    const height = el.getBoundingClientRect().height || 158;
    const left = inset;
    const top = window.innerHeight - bottom - height;
    el.style.setProperty('--free-dock-left', `${this._clampFreeDockX(left)}px`);
    el.style.setProperty('--free-dock-top', `${this._clampFreeDockY(top)}px`);
  }
  _startFreeDockDrag(e){
    if (!this.uiState.compactMode || !this.uiState.freeDock) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = this.element.getBoundingClientRect();
    this._freeDockDrag = { startClientX: e.clientX, startClientY: e.clientY, startLeft: rect.left, startTop: rect.top };
  }
  _onFreeDockDragMove(e){
    const dx = e.clientX - this._freeDockDrag.startClientX;
    const dy = e.clientY - this._freeDockDrag.startClientY;
    const left = this._clampFreeDockX(this._freeDockDrag.startLeft + dx);
    const top = this._clampFreeDockY(this._freeDockDrag.startTop + dy);
    this.element.style.setProperty('--free-dock-left', `${left}px`);
    this.element.style.setProperty('--free-dock-top', `${top}px`);
  }
  _endFreeDockDrag(){
    const rect = this.element.getBoundingClientRect();
    game.settings.set(MODULE_ID, 'freeDockPos', { left: rect.left, top: rect.top });
    this._freeDockDrag = null;
  }

  _enterCompact(){
    if (this.uiState.compactMode) return;
    const el = this.element;
    this._savedRect = {
      left: el.style.left, top: el.style.top,
      width: el.style.width, height: el.style.height
    };
    this.uiState.compactMode = true;
    el.classList.add('compact');
    el.classList.toggle('free-dock', this.uiState.freeDock);
    el.style.left = ''; // clear any stale inline left so the CSS fallback can apply if #ui-left isn't found
    el.style.width = '';
    el.style.height = '';
    this._refreshCustomImageSizes();
    if (this.uiState.freeDock) this._applyFreeDockPosition();
    else this._positionCompactDock();
    // Re-measure on a light interval rather than chasing every possible
    // Foundry event that could resize the sidebar/hotbar — cheap, and
    // catches all of them uniformly.
    this._compactPositionTimer = window.setInterval(() => this._positionCompactDock(), 500);
    this._closeSettings();
    this._renderPOIs();
  }
  _exitCompact(){
    if (!this.uiState.compactMode) return;
    const el = this.element;
    this.uiState.compactMode = false;
    el.classList.remove('compact');
    el.classList.remove('free-dock');
    el.style.removeProperty('--free-dock-left');
    el.style.removeProperty('--free-dock-top');
    if (this._compactPositionTimer) { window.clearInterval(this._compactPositionTimer); this._compactPositionTimer = null; }
    el.style.right = '';
    el.style.bottom = '';
    this._refreshCustomImageSizes();
    if (this._savedRect) {
      el.style.left = this._savedRect.left;
      el.style.top = this._savedRect.top;
      el.style.width = this._savedRect.width;
      el.style.height = this._savedRect.height;
    }
    this._renderPOIs();
  }

  /* ---------------- Scene persistence + GM -> player sync ----------------
     The shared parts of a horizon setup — terrain layers, POIs, palette,
     horizon length, day/night state and the view lock — are what the GM
     builds and wants every player to see, so they're saved on the current
     *scene* (scene.setFlag) rather than a world setting: a GM running a
     multi-leg journey will typically swap scenes per leg, and each scene
     keeps its own horizon. Free Dock, window position/size, the local
     GM/Player preview toggle, and cosmetic display prefs (compass
     mode/opacity, drag hint, full-colour icons) stay exactly as before —
     purely local, per-browser, never saved or shared.

     Foundry already pushes every Scene update to all connected clients
     over its own socket layer and fires an 'updateScene' hook on each of
     them, and a client that joins later just reads the current flag value
     straight off the scene document — so writing to scene.setFlag is
     *both* the save and the live push to players, no separate socket
     channel needed. Only an actual GM's client may write (game.user.isGM),
     so a player who happens to have the local GM-preview toggle on can
     never overwrite the real shared setup — their edits just won't save. */
  _activeScene(){
    return (typeof canvas !== 'undefined' && canvas?.scene) || game.scenes?.viewed || null;
  }
  _buildHorizonConfigPayload(){
    // Palette is deliberately NOT part of this payload — it has its own
    // scene flag and its own sync/apply functions below ("Palette sync"),
    // so that a routine save here (a POI move, a layer edit, day/night...)
    // never carries a stale palette value that would stomp a player's own
    // local override.
    return {
      v: 1,
      layers: this.layerConfig.map(l => {
        // customImage/customImageDims are the DERIVED bitmap — mirror-tiled
        // and/or tint-baked by processCustomImage() from customImageRaw —
        // not the source image itself. They're plain base64 data: URIs and
        // can be regenerated locally from customImageRaw at any time (see
        // _resolveLayerImages), so excluding them here keeps this payload
        // (and the socket push to every connected player) to the lightweight
        // source reference only, instead of carrying a second, derivative
        // copy of the same image on every save. _processedFromRaw is purely
        // local bookkeeping (which raw value the derived fields currently
        // reflect) and has no meaning on another client either.
        const { customImage, customImageDims, _processedFromRaw, ...rest } = l;
        return rest;
      }),
      pois: this.uiState.pois.map(p => ({ ...p })),
      nextPoiId: this.uiState.nextPoiId,
      horizonLength: this.uiState.horizonLength,
      daytime: this.uiState.daytime,
      viewLocked: this.uiState.viewLocked,
      // Affects what players see (Journal badges), so it's a synced scene
      // setting like horizonLength/daytime/viewLocked above, not a purely
      // local GM preference (unlike fullColourIcons/freeDock).
      journalLinkingEnabled: this.uiState.journalLinkingEnabled
    };
  }
  _scheduleSave(){
    if (!game.user?.isGM) return;
    if (this._applyingRemote) return;
    const scene = this._activeScene();
    if (!scene) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    // Debounced — a POI drag or a burst of layer edits fires this many
    // times a second; only the settled result after ~half a second of
    // quiet actually needs to hit the database and push to players.
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flushSave();
    }, 500);
  }
  _flushSave(){
    const scene = this._activeScene();
    if (!scene) return;
    scene.setFlag(MODULE_ID, 'horizonConfig', this._buildHorizonConfigPayload()).catch(err => {
      console.error(`${MODULE_ID} | failed to save horizon config to scene`, err);
      ui.notifications?.error(game.i18n.localize('SHRIMPSEH.Notify.SaveError'));
    });
  }
  _applyHorizonConfigPayload(payload, { rerender = true } = {}){
    if (!payload) return Promise.resolve();
    this._applyingRemote = true;
    // A scene saved by a build of this module before the upload-storage fix
    // still has its layers' derived customImage/customImageDims bitmaps
    // written directly into the saved payload (see _buildHorizonConfigPayload
    // for why that's no longer done) — often hundreds of KB of base64 per
    // layer. Loading that payload alone doesn't fix it: nothing else writes
    // back to this scene's flag until the GM happens to edit something, so
    // the stale, oversized data would otherwise just sit there indefinitely.
    // Detected here and flushed back out in the new, stripped shape once
    // the image rebuild below finishes — a one-time, self-limiting migration
    // per scene, since a payload this saves is never stale again afterward.
    const isStalePreUploadFixPayload = Array.isArray(payload.layers) &&
      payload.layers.some(l => l && ('customImage' in l || 'customImageDims' in l));
    if (Array.isArray(payload.layers) && payload.layers.length) {
      payload.layers.forEach((saved, i) => {
        const layer = this.layerConfig[i];
        if (!layer || !saved) return;
        Object.assign(layer, saved);
        // The incoming payload never carries customImage/customImageDims
        // (see _buildHorizonConfigPayload) — if this layer's customImageRaw
        // just came back empty (the GM cleared the image remotely),
        // Object.assign alone won't null out the locally-cached derived
        // bitmap from before, so that has to be done explicitly here.
        if (!layer.customImageRaw) {
          layer.customImage = null;
          layer.customImageDims = null;
          layer._processedFromRaw = null;
        }
      });
    }
    if (Array.isArray(payload.pois)) this.uiState.pois = payload.pois.map(p => ({ ...p }));
    if (typeof payload.nextPoiId === 'number') this.uiState.nextPoiId = payload.nextPoiId;
    if (payload.horizonLength) this.uiState.horizonLength = payload.horizonLength;
    if (payload.daytime) this.uiState.daytime = payload.daytime;
    if (typeof payload.viewLocked === 'boolean') this.uiState.viewLocked = payload.viewLocked;
    if (typeof payload.journalLinkingEnabled === 'boolean') this.uiState.journalLinkingEnabled = payload.journalLinkingEnabled;
    // Any layer whose customImageRaw is now set but has no matching derived
    // customImage (a fresh upload from another client, or a payload that
    // never carried the derived bitmap in the first place) needs that
    // rebuilt locally before it's safe to paint — see _resolveLayerImages.
    // Returned as a promise so boot() can await the full apply (merge +
    // image rebuild) before doing its own pass for the no-payload case.
    return new Promise(resolve => {
      this._resolveLayerImages(() => {
        this._applyingRemote = false;
        if (rerender && this.rendered) this.render();
        // Only the GM's own client writes scene flags (_flushSave/_scheduleSave
        // both already no-op for a non-GM) — a player loading the same stale
        // data just gets the locally-rebuilt image, no write attempted.
        if (isStalePreUploadFixPayload && game.user?.isGM) this._flushSave();
        resolve();
      });
    });
  }
  _loadHorizonConfigForActiveScene(opts){
    const scene = this._activeScene();
    const payload = scene?.getFlag(MODULE_ID, 'horizonConfig');
    if (payload) return this._applyHorizonConfigPayload(payload, opts);
    return Promise.resolve();
  }

  /* ---- Palette sync: the GM's palette pushes as an initial/updated
     default, but a player who then picks their own is left alone — not
     immediately re-stomped by the next unrelated config save above (a POI
     move, a layer edit...) — until the GM deliberately pushes a NEW
     palette, which takes over again for everyone. Tracked with a small
     revision number on its own scene flag, kept separate from
     horizonConfig above specifically so "the GM changed the palette again"
     and "something else about the horizon changed" stay distinguishable. */
  _pushPaletteIfGm(){
    if (!game.user?.isGM) return;
    const scene = this._activeScene();
    if (!scene) return;
    this._paletteRev += 1;
    this._lastAppliedPaletteRev = this._paletteRev; // already applied locally by the caller
    scene.setFlag(MODULE_ID, 'horizonPalette', { palette: this.uiState.palette, rev: this._paletteRev }).catch(err => {
      console.error(`${MODULE_ID} | failed to push palette to scene`, err);
      ui.notifications?.error(game.i18n.localize('SHRIMPSEH.Notify.PaletteError'));
    });
  }
  _acceptPalettePush(payload){
    if (!payload || typeof payload.rev !== 'number') return;
    this._paletteRev = Math.max(this._paletteRev, payload.rev);
    // A player's own local override IS allowed to be replaced here — but
    // only by a revision newer than the one they last accepted, so this
    // only fires for a genuinely new GM push, never for a routine config
    // save that happens to still reference the old palette.
    if (payload.palette && payload.rev > this._lastAppliedPaletteRev) {
      this._applyPalette(payload.palette);
      this._lastAppliedPaletteRev = payload.rev;
    }
  }
  _loadPushedPaletteForActiveScene(){
    const scene = this._activeScene();
    const payload = scene?.getFlag(MODULE_ID, 'horizonPalette');
    if (payload) this._acceptPalettePush(payload);
  }

  // Called from the module-scope updateScene Hook (registered once,
  // routed to whichever instance is currently open — see below).
  handleUpdateScene(scene, changes, options, userId){
    if (userId === game.user?.id) return;
    if (this._activeScene()?.id !== scene.id) return;
    if (!changes.flags?.[MODULE_ID]) return;
    if ('horizonConfig' in changes.flags[MODULE_ID]) this._loadHorizonConfigForActiveScene();
    if ('horizonPalette' in changes.flags[MODULE_ID]) this._acceptPalettePush(changes.flags[MODULE_ID].horizonPalette);
  }
  // Switching scenes shows that scene's own saved horizon (or the shipped
  // defaults, if the GM hasn't set one up on it yet).
  handleCanvasReady(){
    this._loadHorizonConfigForActiveScene();
    this._loadPushedPaletteForActiveScene();
  }

  /* ---------------- Boot ---------------- */
  // Rebuilds the DERIVED image bitmaps (layer.customImage/customImageDims —
  // mirror-tiled and/or tint-baked via processCustomImage) from each
  // layer's lightweight customImageRaw source. Needed in two cases:
  //   1. A layer whose starting biome is a built-in image preset (e.g. the
  //      default Forest layer) has no customImageRaw yet at all — one gets
  //      assigned from BUILTIN_LAYER_IMAGES first, same as any other source.
  //   2. A layer whose customImageRaw came from a loaded/synced payload
  //      (a GM's own save, or another client's push) but whose derived
  //      customImage is stale or missing — payloads never carry the derived
  //      fields (see _buildHorizonConfigPayload), only the source path, so
  //      this is what turns that source back into a paintable bitmap.
  // _processedFromRaw is the local-only marker for "already resolved from
  // this exact raw value" — it's what lets this run again after every load
  // without needlessly reprocessing every layer that hasn't actually changed.
  _resolveLayerImages(cb){
    const pending = this.layerConfig.filter(l => {
      const needsBuiltin = l.biome && l.biome.startsWith('img:') && !l.customImageRaw;
      const needsReprocess = l.customImageRaw && l._processedFromRaw !== l.customImageRaw;
      return needsBuiltin || needsReprocess;
    });
    if (!pending.length) { cb(); return; }
    let remaining = pending.length;
    const done = () => { remaining--; if (remaining <= 0) cb(); };
    pending.forEach(layer => {
      if (layer.biome && layer.biome.startsWith('img:') && !layer.customImageRaw) {
        const key = layer.biome.slice(4);
        const preset = BUILTIN_LAYER_IMAGES.forest.find(b => b.key === key);
        if (preset) {
          layer.customImageRaw = preset.src;
          layer.customImageName = game.i18n.localize(preset.labelKey);
          layer.mirrorTile = true;
          layer.tintToColor = true;
          layer.customImageBuiltin = true;
        }
      }
      if (!layer.customImageRaw) { done(); return; }
      processCustomImage(layer, (finalUrl, dims) => {
        layer.customImage = finalUrl;
        layer.customImageDims = dims;
        layer._processedFromRaw = layer.customImageRaw;
        done();
      });
    });
  }

  /** Entry point used by the scene-control toggle — see Hooks.on('getSceneControlButtons') below. */
  async boot(){
    // Pull in this scene's saved setup (if any) before the very first
    // paint, so players and a reconnecting GM see the real thing straight
    // away instead of the shipped defaults flashing first.
    await this._loadHorizonConfigForActiveScene({ rerender: false });
    this._loadPushedPaletteForActiveScene();
    // Also covers the no-saved-payload case (a scene with no horizonConfig
    // flag yet) — _loadHorizonConfigForActiveScene above is then a no-op,
    // so built-in preset layers still need their first resolve pass here.
    await new Promise(resolve => this._resolveLayerImages(resolve));
    await this.render({ force: true });
  }
}

/* ---------------- Foundry lifecycle ---------------- */

// Free Dock's enabled-state and dragged position are per-browser display
// preferences, not scene data, so they're registered as client-scoped
// settings (config: false — there's a dedicated toggle/handle in the
// module's own UI, no need to also surface these in Foundry's Module
// Settings screen) rather than world-scoped ones. Must be registered in
// 'init', before anything reads them.
function registerModuleSettings(){
  game.settings.register(MODULE_ID, 'freeDockEnabled', {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });
  game.settings.register(MODULE_ID, 'freeDockPos', {
    scope: 'client',
    config: false,
    type: Object,
    default: null
  });
  // Presets are reusable named horizon layouts, not tied to one scene —
  // world-scoped (shared by every GM, not per-browser like Free Dock) so a
  // preset saved by one GM is immediately available to any other.
  game.settings.register(MODULE_ID, 'presets', {
    scope: 'world',
    config: false,
    type: Object,
    default: {}
  });
}

Hooks.once('init', async () => {
  registerModuleSettings();
  // Registers the two repeated-row templates as named Handlebars partials
  // ("eh-layer-row"/"eh-poi-row" — matching the {{> eh-layer-row}} /
  // {{> eh-poi-row}} calls in templates/window.hbs), Foundry-style: the
  // object form of loadTemplates() both preloads and registers each entry
  // under its given key.
  await foundry.applications.handlebars.loadTemplates({
    'eh-layer-row': `${TEMPLATE_BASE}layer-row.hbs`,
    'eh-poi-row': `${TEMPLATE_BASE}poi-row.hbs`
  });
});

// Adds a toggle button to the Notes scene-controls group (the same group
// journal pins live under) so the GM can show or hide the Expanded
// Horizons window without it crowding the token tools. "fa-solid
// fa-mountain" is Font Awesome's layered/overlapping mountain-range
// glyph — matches what the module actually draws, and (unlike a custom
// SVG) renders correctly through every Foundry version's own scene
// control markup without extra wiring.
//
// The button itself stays visible/usable to every client, GM or player —
// each person just shows or hides their OWN window; it's the window's
// *contents* that differ by role (see showGmControls in _prepareContext).
Hooks.on('getSceneControlButtons', (controls) => {
  // v11/v12 pass an array of control groups; v13 passes an object keyed
  // by group name. "notes" is Foundry's built-in journal-pin tool group.
  const notesControls = Array.isArray(controls)
    ? controls.find(c => c.name === 'notes')
    : controls?.notes;
  if (!notesControls) return;
  const tool = {
    name: 'expanded-horizons',
    title: game.i18n.localize('SHRIMPSEH.SceneControlTitle'),
    icon: 'fa-solid fa-mountain',
    toggle: true,
    active: !!foundry.applications.instances.get('eh-window'),
    // Foundry v13's SceneControls core (#onChangeTool/#onChange) invokes
    // tool.onChange(event, active) for every tool click, toggle or plain
    // button alike — it never calls onClick. A tool can't be both
    // toggle:true and button:true either; Foundry normalizes that down to
    // toggle-only, so declaring both (as an earlier build of this file
    // did) silently produced a button that did nothing when clicked.
    onChange: (event, toggled) => {
      // Singleton toggle pattern (see the project's ApplicationV2
      // reference doc): open a fresh instance if none exists, close the
      // existing one otherwise. Any in-progress debounced scene save is
      // flushed on close (ExpandedHorizonsApp#_preClose), and the pan
      // position (not itself persisted scene data) carries over to the
      // next open via the module-scope lastKnownScrollX seed, so toggling
      // the window off and back on feels like hide/show even though the
      // Application instance itself is actually destroyed and recreated.
      const existing = foundry.applications.instances.get('eh-window');
      if (toggled) {
        if (!existing) new ExpandedHorizonsApp().boot();
      } else {
        existing?.close();
      }
    }
  };
  if (Array.isArray(notesControls.tools)) {
    notesControls.tools.push(tool);
  } else if (notesControls.tools) {
    notesControls.tools[tool.name] = tool;
  }
});

// React only to changes another client made — never to the echo of our
// own save, which would otherwise re-render mid-drag or mid-keystroke on
// the GM's own screen. Registered once at module scope (Hooks persist
// across the app being closed/reopened) and routed to whichever instance
// is currently open, if any.
Hooks.on('updateScene', (scene, changes, options, userId) => {
  const app = foundry.applications.instances.get('eh-window');
  app?.handleUpdateScene(scene, changes, options, userId);
});
// Switching scenes shows that scene's own saved horizon (or the shipped
// defaults, if the GM hasn't set one up on it yet).
Hooks.on('canvasReady', () => {
  const app = foundry.applications.instances.get('eh-window');
  app?.handleCanvasReady();
});

// The 'presets' setting is a shared world value (see registerModuleSettings
// above) — this fires on every connected client (including the one that
// made the change) whenever any GM saves/loads/deletes a preset, so the
// Presets list in an open settings panel stays in sync without a manual
// refresh. Harmless to re-render even while the settings panel is closed —
// _onRender already only *shows* the settings PART when _settingsOpen is
// true, it still has to rebuild its (hidden) content either way.
Hooks.on('updateSetting', (setting) => {
  if (setting.key !== `${MODULE_ID}.presets`) return;
  const app = foundry.applications.instances.get('eh-window');
  if (app?.rendered) app.render();
});

// Keeps every POI row's Journal <select> (see _poiJournalOptionsHtml) in
// sync with the real Journal directory — re-rendered whenever it changes,
// so a journal created/renamed/deleted while the window is open is picked
// up without a reload. A deleted entry also has to drop out of any POI's
// Journal select and its saved journalId, or a stale link would silently
// point at nothing.
function refreshExpandedHorizonsJournalUI(){
  const app = foundry.applications.instances.get('eh-window');
  if (app?.rendered) app.render();
}
Hooks.on('createJournalEntry', refreshExpandedHorizonsJournalUI);
Hooks.on('updateJournalEntry', refreshExpandedHorizonsJournalUI);
Hooks.on('deleteJournalEntry', (entry) => {
  const app = foundry.applications.instances.get('eh-window');
  if (app) {
    app.uiState.pois.forEach(p => { if (p.journalId === entry.id) p.journalId = null; });
  }
  refreshExpandedHorizonsJournalUI();
});
