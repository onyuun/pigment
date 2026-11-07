(() => {
  'use strict';

  const DEFAULT_HEX = '#D48C70';
  const STATE_KEY = 'pigment-state-v1';
  const SAVED_PALETTES_KEY = 'pigment-saved-palettes-v1';
  const CANVAS_SIZE = 280;
  const DEG_TO_RAD = Math.PI / 180;

  const HARMONY_OFFSETS = Object.freeze({
    complementary: [0, 180],
    analogous: [0, -30, 30],
    triadic: [0, 120, 240],
    split: [0, 150, 210],
  });

  const HARMONY_DESCRIPTIONS = Object.freeze({
    complementary: 'A high-contrast pair for focal accents, graphic silhouettes, and decisive color separation.',
    analogous: 'A close-knit three-color flow that keeps a painting calm while giving the eye gentle movement.',
    triadic: 'Three evenly spaced hues for a balanced, energetic palette with clear visual hierarchy.',
    split: 'A softer alternative to complementary contrast: one anchor hue plus two neighbors of its opposite.',
  });

  const LIGHTING_COPY = Object.freeze({
    warm: {
      label: 'Warm lighting',
      shadowShift: 'Cooler hue · deeper value',
      highlightShift: 'Warmer hue · lifted value',
    },
    cool: {
      label: 'Cool lighting',
      shadowShift: 'Warmer hue · deeper value',
      highlightShift: 'Cooler hue · lifted value',
    },
  });

  const MOODS = Object.freeze({
    golden: {
      label: 'Golden Hour Sunset',
      description: 'Honeyed light, terracotta warmth, and a quiet blue counterpoint for late-day scenes.',
      hue: 38,
      recipe: [
        { name: 'Dusk Umber', hue: -22, saturation: 54, lightness: 29 },
        { name: 'Burnished Clay', hue: -10, saturation: 68, lightness: 42 },
        { name: 'Sunlit Ochre', hue: 2, saturation: 72, lightness: 56 },
        { name: 'Apricot Glow', hue: 16, saturation: 66, lightness: 69 },
        { name: 'Horizon Blue', hue: 166, saturation: 42, lightness: 56 },
      ],
    },
    ghost: {
      label: 'Ghost Town',
      description: 'Weathered stone, faded sage, and a pale sky for lonely architecture and quiet air.',
      hue: 196,
      recipe: [
        { name: 'Ash Soil', hue: -20, saturation: 12, lightness: 24 },
        { name: 'Weathered Sage', hue: -5, saturation: 22, lightness: 39 },
        { name: 'Dusty Facade', hue: 8, saturation: 17, lightness: 56 },
        { name: 'Bleached Light', hue: 22, saturation: 13, lightness: 76 },
        { name: 'Cold Sky', hue: 30, saturation: 26, lightness: 68 },
      ],
    },
    cyberpunk: {
      label: 'Cyberpunk Neon',
      description: 'Electric magenta and cyan held together by deep violet shadows and acid highlights.',
      hue: 316,
      recipe: [
        { name: 'Black Violet', hue: -20, saturation: 72, lightness: 18 },
        { name: 'Laser Magenta', hue: 0, saturation: 91, lightness: 48 },
        { name: 'Neon Orchid', hue: 22, saturation: 89, lightness: 62 },
        { name: 'Plasma Cyan', hue: 224, saturation: 86, lightness: 62 },
        { name: 'Acid Signal', hue: 112, saturation: 78, lightness: 72 },
      ],
    },
    overcast: {
      label: 'Overcast Day',
      description: 'Soft slate, rain-washed greens, and restrained highlights for diffuse natural light.',
      hue: 207,
      recipe: [
        { name: 'Rain Shadow', hue: -28, saturation: 24, lightness: 24 },
        { name: 'Slate Blue', hue: -8, saturation: 31, lightness: 42 },
        { name: 'Wet Concrete', hue: 5, saturation: 14, lightness: 59 },
        { name: 'Moss Reflection', hue: -62, saturation: 28, lightness: 52 },
        { name: 'Cloud Light', hue: 20, saturation: 11, lightness: 79 },
      ],
    },
  });

  const state = {
    baseHex: DEFAULT_HEX,
    lighting: 'warm',
    manualColors: { shadow: null, highlight: null, bounce: null },
    visibility: { shadow: true, highlight: true, bounce: true },
    harmony: 'analogous',
    mood: 'golden',
    moodPrompt: '',
    customMoodActive: false,
    includeBaseColor: true,
    grayscale: false,
    moodPalette: [],
  };

  let dom = {};
  let wheelDragging = false;
  let toastTimer = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeHue(value) {
    return ((value % 360) + 360) % 360;
  }

  function circularDistance(a, b) {
    const distance = Math.abs(normalizeHue(a) - normalizeHue(b));
    return Math.min(distance, 360 - distance);
  }

  function shortestHueLerp(from, to, amount) {
    const start = normalizeHue(from);
    const delta = ((normalizeHue(to) - start + 540) % 360) - 180;
    return normalizeHue(start + delta * amount);
  }

  function parseHex(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return null;
    let hex = trimmed.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map((digit) => digit + digit).join('');
    const number = Number.parseInt(hex, 16);
    return {
      r: (number >> 16) & 255,
      g: (number >> 8) & 255,
      b: number & 255,
    };
  }

  function canonicalizeHex(value) {
    const rgb = parseHex(value);
    return rgb ? rgbToHex(rgb) : null;
  }

  function componentToHex(value) {
    return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0').toUpperCase();
  }

  function rgbToHex(rgb) {
    return `#${componentToHex(rgb.r)}${componentToHex(rgb.g)}${componentToHex(rgb.b)}`;
  }

  function rgbToHsl(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    let hue = 0;
    let saturation = 0;

    if (max !== min) {
      const delta = max - min;
      saturation = lightness > 0.5
        ? delta / (2 - max - min)
        : delta / (max + min);
      switch (max) {
        case r:
          hue = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          hue = (b - r) / delta + 2;
          break;
        default:
          hue = (r - g) / delta + 4;
      }
      hue *= 60;
    }

    return {
      h: normalizeHue(hue),
      s: saturation * 100,
      l: lightness * 100,
    };
  }

  function hueToRgb(p, q, t) {
    let adjusted = t;
    if (adjusted < 0) adjusted += 1;
    if (adjusted > 1) adjusted -= 1;
    if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
    if (adjusted < 1 / 2) return q;
    if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
    return p;
  }

  function hslToRgb(hue, saturation, lightness) {
    const h = normalizeHue(hue) / 360;
    const s = clamp(saturation, 0, 100) / 100;
    const l = clamp(lightness, 0, 100) / 100;

    if (s === 0) {
      const value = Math.round(l * 255);
      return { r: value, g: value, b: value };
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hueToRgb(p, q, h) * 255),
      b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    };
  }

  function hslToHex(hue, saturation, lightness) {
    return rgbToHex(hslToRgb(hue, saturation, lightness));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function uniqueHexes(colors) {
    const seen = new Set();
    return colors
      .map((color) => canonicalizeHex(color))
      .filter((color) => {
        if (!color || seen.has(color)) return false;
        seen.add(color);
        return true;
      });
  }

  function readStoredState() {
    try {
      const raw = window.localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const baseHex = canonicalizeHex(saved.base || saved.baseHex);
      if (baseHex) state.baseHex = baseHex;
      const lighting = saved.mode || saved.lighting;
      if (lighting === 'warm' || lighting === 'cool') state.lighting = lighting;
      if (Object.prototype.hasOwnProperty.call(HARMONY_OFFSETS, saved.harmony)) state.harmony = saved.harmony;
      if (Object.prototype.hasOwnProperty.call(MOODS, saved.mood)) state.mood = saved.mood;
      if (typeof saved.grayscale === 'boolean') state.grayscale = saved.grayscale;
      if (saved.visibility && typeof saved.visibility === 'object') {
        ['shadow', 'highlight', 'bounce'].forEach((name) => {
          if (typeof saved.visibility[name] === 'boolean') state.visibility[name] = saved.visibility[name];
        });
      } else if (typeof saved.bounceEnabled === 'boolean') {
        state.visibility.bounce = saved.bounceEnabled;
      }
      if (saved.manualColors && typeof saved.manualColors === 'object') {
        ['shadow', 'highlight', 'bounce'].forEach((name) => {
          state.manualColors[name] = canonicalizeHex(saved.manualColors[name]);
        });
      }
      if (typeof saved.moodPrompt === 'string') state.moodPrompt = saved.moodPrompt.slice(0, 120);
      state.customMoodActive = saved.customMoodActive === true && Boolean(state.moodPrompt);
      if (typeof saved.includeBaseColor === 'boolean') state.includeBaseColor = saved.includeBaseColor;
    } catch (_error) {
      // Storage is optional; the studio remains usable when it is unavailable.
    }
  }

  function persistState() {
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify({
        base: state.baseHex,
        mode: state.lighting,
        baseHex: state.baseHex,
        lighting: state.lighting,
        harmony: state.harmony,
        mood: state.mood,
        grayscale: state.grayscale,
        visibility: state.visibility,
        manualColors: state.manualColors,
        moodPrompt: state.moodPrompt,
        customMoodActive: state.customMoodActive,
        includeBaseColor: state.includeBaseColor,
      }));
    } catch (_error) {
      // Private browsing and blocked storage should not interrupt color work.
    }
  }

  function getDerivedColors() {
    const base = rgbToHsl(parseHex(state.baseHex));
    const lighting = state.lighting;
    const shadowTarget = lighting === 'warm' ? 260 : 45;
    const highlightTarget = lighting === 'warm' ? 45 : 260;
    const shadowSaturation = base.s === 0 ? 8 : base.s + 8;
    const highlightSaturation = Math.max(0, base.s - 14);

    const automaticShadow = hslToHex(
      shortestHueLerp(base.h, shadowTarget, 0.3),
      clamp(shadowSaturation, 0, 100),
      clamp(base.l - 22, 1, 99),
    );
    const automaticHighlight = hslToHex(
      shortestHueLerp(base.h, highlightTarget, 0.3),
      clamp(highlightSaturation, 0, 100),
      clamp(base.l + 18, 1, 99),
    );
    const bounceTarget = lighting === 'warm' ? 218 : 36;
    const automaticBounce = hslToHex(
      shortestHueLerp(base.h, bounceTarget, 0.82),
      clamp(base.s * (lighting === 'warm' ? 0.34 : 0.5), 14, lighting === 'warm' ? 38 : 48),
      clamp(base.l * (lighting === 'warm' ? 0.78 : 0.68), 14, 82),
    );

    return {
      base,
      baseHex: state.baseHex,
      automaticShadow,
      automaticHighlight,
      automaticBounce,
      shadow: state.manualColors.shadow || automaticShadow,
      highlight: state.manualColors.highlight || automaticHighlight,
      bounce: state.manualColors.bounce || automaticBounce,
    };
  }

  function getHarmonyHues(baseHue, harmony = state.harmony) {
    const offsets = HARMONY_OFFSETS[harmony] || HARMONY_OFFSETS.analogous;
    return offsets.map((offset) => normalizeHue(baseHue + offset));
  }

  function getHarmonyColors(baseHue, baseSaturation, baseLightness, harmony = state.harmony) {
    return getHarmonyHues(baseHue, harmony).map((hue) => hslToHex(hue, baseSaturation, baseLightness));
  }

  function getMoodPalette(moodKey = state.mood) {
    const profile = MOODS[moodKey] || MOODS.golden;
    return profile.recipe.map((entry) => {
      const hue = normalizeHue(profile.hue + entry.hue + randomBetween(-3.5, 3.5));
      const saturation = clamp(entry.saturation + randomBetween(-3, 3), 0, 100);
      const lightness = clamp(entry.lightness + randomBetween(-2.5, 2.5), 4, 96);
      return {
        name: entry.name,
        hex: hslToHex(hue, saturation, lightness),
      };
    });
  }

  function query(selector, root = document) {
    return root.querySelector(selector);
  }

  function cacheDom() {
    dom = {
      root: document.documentElement,
      body: document.body,
      baseColor: query('#base-color'),
      hexInput: query('#hex-input'),
      saturation: query('#saturation'),
      lightness: query('#lightness'),
      saturationValue: query('#saturation-value'),
      lightnessValue: query('#lightness-value'),
      hueValue: query('#hue-value'),
      wheelHue: query('#wheel-hue'),
      canvas: query('#color-wheel'),
      harmonySwatches: query('#harmony-swatches'),
      harmonyDescription: query('#harmony-description'),
      shadowColor: query('#shadow-color'),
      shadowDot: query('#shadow-swatch .color-dot'),
      shadowHex: query('#shadow-hex'),
      shadowAuto: query('#shadow-auto'),
      midtoneDot: query('#midtone-dot'),
      midtoneHex: query('#midtone-hex'),
      highlightColor: query('#highlight-color'),
      highlightDot: query('#highlight-swatch .color-dot'),
      highlightHex: query('#highlight-hex'),
      highlightAuto: query('#highlight-auto'),
      bounceColor: query('#bounce-color'),
      bounceDot: query('#bounce-swatch .color-dot'),
      bounceHex: query('#bounce-hex'),
      bounceAuto: query('#bounce-auto'),
      visibilityButtons: Array.from(document.querySelectorAll('[data-visibility]')),
      shadowShift: query('#shadow-shift'),
      highlightShift: query('#highlight-shift'),
      bounceShift: query('#bounce-shift'),
      sphere: query('#sphere'),
      lightingLabel: query('#lighting-label'),
      shadowRecipe: query('#shadow-recipe'),
      highlightRecipe: query('#highlight-recipe'),
      bounceRecipe: query('#bounce-recipe'),
      moodPrompt: query('#mood-prompt'),
      moodPromptForm: query('#mood-prompt-form'),
      includeBaseColor: query('#include-base-color'),
      moodContextHelp: query('#mood-context-help'),
      generateMood: query('#generate-mood'),
      moodSwatches: query('#mood-swatches'),
      moodDescription: query('#mood-description'),
      grayscaleToggle: query('#grayscale-toggle'),
      grayscaleStatus: query('#grayscale-status'),
      toast: query('#toast'),
      toastMessage: query('#toast-message'),
      resetColor: query('#reset-color'),
      randomColor: query('#random-color'),
      savePalette: query('#save-palette'),
      savedPalettesButton: query('#saved-palettes-button'),
      savedDialog: query('#saved-dialog'),
      savedPalettesList: query('#saved-palettes-list'),
      guideButton: query('#guide-button'),
      guideDialog: query('#guide-dialog'),
      exportPalette: query('#export-palette'),
      exportDialog: query('#export-dialog'),
      exportSummary: query('#export-summary'),
      exportCss: query('#export-css'),
      exportGpl: query('#export-gpl'),
      studioButton: query('#studio-button'),
      year: query('#year'),
      lightingButtons: Array.from(document.querySelectorAll('[data-lighting]')),
      harmonyButtons: Array.from(document.querySelectorAll('[data-harmony]')),
    };

    if (!dom.hueValue && dom.wheelHue && dom.wheelHue.parentElement) {
      const hueOutput = document.createElement('output');
      hueOutput.id = 'hue-value';
      hueOutput.hidden = true;
      hueOutput.setAttribute('aria-hidden', 'true');
      dom.wheelHue.parentElement.appendChild(hueOutput);
      dom.hueValue = hueOutput;
    }
  }

  function showToast(message) {
    if (!dom.toastMessage) return;
    dom.toastMessage.textContent = message;
    if (dom.toast) {
      dom.toast.hidden = false;
      dom.toast.classList.add('is-visible');
      dom.toast.classList.add('show', 'visible');
      dom.toast.dataset.visible = 'true';
    }
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      if (!dom.toast) return;
      dom.toast.classList.remove('is-visible');
      dom.toast.classList.remove('show', 'visible');
      dom.toast.dataset.visible = 'false';
      toastTimer = window.setTimeout(() => {
        dom.toast.hidden = true;
        dom.toastMessage.textContent = '';
      }, 200);
    }, 2400);
  }

  function fallbackCopyText(text) {
    if (!document.body || typeof document.execCommand !== 'function') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_error) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyHex(value) {
    const hex = canonicalizeHex(value);
    if (!hex) {
      showToast('Copy failed — invalid hex.');
      return false;
    }

    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(hex);
        copied = true;
      } catch (_error) {
        copied = fallbackCopyText(hex);
      }
    } else {
      copied = fallbackCopyText(hex);
    }

    if (copied) {
      showToast(`Hex Copied! ${hex}`);
    } else {
      showToast('Copy failed — check clipboard permissions.');
    }
    return copied;
  }

  function updateColorControl(input, dot, hexButton, autoButton, hex, name, isManual) {
    if (input) input.value = hex.toLowerCase();
    if (dot) dot.style.backgroundColor = hex;
    if (hexButton) {
      hexButton.textContent = hex;
      hexButton.dataset.copy = hex;
      hexButton.setAttribute('aria-label', `Copy ${name} ${hex}`);
    }
    if (autoButton) {
      autoButton.hidden = !isManual;
      autoButton.setAttribute('aria-label', `Restore automatic ${name}`);
    }
  }

  function setActiveButtons(buttons, activeValue, attributeName) {
    buttons.forEach((button) => {
      const isActive = button.dataset[attributeName] === activeValue;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function renderHarmonySwatches(colors, hues) {
    if (!dom.harmonySwatches) return;
    dom.harmonySwatches.replaceChildren();
    colors.forEach((hex, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch harmony-swatch';
      button.dataset.copy = hex;
      button.setAttribute('aria-label', `Copy ${index === 0 ? 'Base' : `Harmony ${String(index).padStart(2, '0')}`} ${hex}`);

      const chip = document.createElement('span');
      chip.className = 'harmony-chip';
      chip.style.backgroundColor = hex;
      chip.setAttribute('aria-hidden', 'true');

      const info = document.createElement('span');
      info.className = 'harmony-info';

      const name = document.createElement('span');
      name.className = 'swatch-name';
      name.textContent = index === 0 ? 'Base' : `Harmony ${String(index).padStart(2, '0')}`;

      const details = document.createElement('span');
      details.className = 'swatch-hex';
      details.textContent = hex;

      const copyIcon = document.createElement('span');
      copyIcon.className = 'copy-icon';
      copyIcon.setAttribute('aria-hidden', 'true');
      copyIcon.innerHTML = '<svg viewBox="0 0 16 16" focusable="false"><use href="#icon-copy"></use></svg>';

      info.append(name, details, copyIcon);
      button.append(chip, info);
      dom.harmonySwatches.appendChild(button);
    });

    // Keep the hue array available to the canvas render without adding another DOM contract.
    dom.harmonySwatches.dataset.hues = hues.join(',');
  }

  function createCopyButton(hex) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-hex';
    button.dataset.copy = hex;
    button.textContent = hex;
    return button;
  }

  async function fetchGeminiPalette(prompt, baseColor, lighting) {
    const response = await fetch('/api/generateMood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        baseColor: state.includeBaseColor ? baseColor : null,
        lighting: state.includeBaseColor ? lighting : null,
        useBaseColor: state.includeBaseColor,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `Palette request failed with status ${response.status}.`);
    if (!Array.isArray(data?.colors)) throw new Error('Palette API returned no colors.');

    const colors = data.colors.map((value) => canonicalizeHex(value));
    if (colors.length !== 5) throw new Error('Palette API must return exactly five hex colors.');
    if (colors.some((value) => !value)) throw new Error('Gemini returned a non-hex color.');
    return colors;
  }

  function setGenerateLoading(isLoading) {
    if (!dom.generateMood) return;
    dom.generateMood.disabled = isLoading;
    dom.generateMood.setAttribute('aria-busy', String(isLoading));
    const label = query('.generate-label', dom.generateMood);
    if (label) label.textContent = isLoading ? 'Generating…' : 'Generate';
  }

  function renderRecipe(element, prefix, hex, modeNodes) {
    if (!element) return;
    element.replaceChildren();
    element.append(document.createTextNode(`${prefix} `));
    element.appendChild(createCopyButton(hex));
    modeNodes.forEach((node, index) => {
      if (index === 0) element.append(document.createTextNode(node.before));
      const strong = document.createElement('strong');
      strong.textContent = node.mode;
      element.append(strong);
      element.append(document.createTextNode(node.after));
    });
    const caution = document.createElement('span');
    caution.className = 'recipe-caution';
    caution.textContent = ' Starting point only: blend colors and adjust for your compositing setup; a recipe cannot guarantee an exact final match.';
    element.append(caution);
  }

  function renderMoodPalette() {
    if (!dom.moodSwatches) return;
    if (!Array.isArray(state.moodPalette)) state.moodPalette = [];
    dom.moodSwatches.replaceChildren();
    state.moodPalette.forEach((entry, index) => {
      const hex = canonicalizeHex(entry.hex) || DEFAULT_HEX;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch mood-swatch';
      button.dataset.copy = hex;
      button.style.setProperty('--swatch', hex);
      button.setAttribute('aria-label', `Copy ${entry.name} ${hex}`);

      const color = document.createElement('span');
      color.className = 'mood-color';
      color.style.backgroundColor = hex;
      color.setAttribute('aria-hidden', 'true');

      const meta = document.createElement('span');
      meta.className = 'mood-meta';
      const name = document.createElement('span');
      name.className = 'mood-color-name';
      name.textContent = entry.name || `Mood ${String(index + 1).padStart(2, '0')}`;
      const value = document.createElement('span');
      value.className = 'swatch-hex';
      value.textContent = hex;
      meta.append(name, value);

      button.append(color, meta);
      dom.moodSwatches.appendChild(button);
    });
  }

  function huePoint(hue, radius) {
    const angle = (hue - 90) * DEG_TO_RAD;
    return {
      x: CANVAS_SIZE / 2 + Math.cos(angle) * radius,
      y: CANVAS_SIZE / 2 + Math.sin(angle) * radius,
    };
  }

  function drawColorWheel() {
    if (!dom.canvas || typeof dom.canvas.getContext !== 'function') return;
    const context = dom.canvas.getContext('2d');
    if (!context) return;

    dom.canvas.setAttribute('role', 'slider');
    dom.canvas.setAttribute('tabindex', '0');
    dom.canvas.setAttribute('aria-valuemin', '0');
    dom.canvas.setAttribute('aria-valuemax', '359');

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (dom.canvas.width !== CANVAS_SIZE * dpr || dom.canvas.height !== CANVAS_SIZE * dpr) {
      dom.canvas.width = CANVAS_SIZE * dpr;
      dom.canvas.height = CANVAS_SIZE * dpr;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const colors = getDerivedColors();
    const harmonyHues = getHarmonyHues(colors.base.h);
    const outerRadius = 116;
    const innerRadius = 88;
    const center = CANVAS_SIZE / 2;

    for (let hue = 0; hue < 360; hue += 1) {
      const start = (hue - 90) * DEG_TO_RAD;
      const end = (hue + 1.3 - 90) * DEG_TO_RAD;
      const active = harmonyHues.some((activeHue) => circularDistance(hue + 0.5, activeHue) <= 9);
      context.beginPath();
      context.arc(center, center, outerRadius, start, end);
      context.arc(center, center, innerRadius, end, start, true);
      context.closePath();
      context.fillStyle = `hsla(${hue}, ${colors.base.s}%, ${colors.base.l}%, ${active ? 0.96 : 0.19})`;
      context.fill();
    }

    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1;
    context.setLineDash([2, 4]);
    const markerPoints = harmonyHues.map((hue) => huePoint(hue, 102));
    if (markerPoints.length > 1) {
      context.beginPath();
      context.moveTo(markerPoints[0].x, markerPoints[0].y);
      for (let index = 1; index < markerPoints.length; index += 1) {
        context.lineTo(markerPoints[index].x, markerPoints[index].y);
      }
      if (markerPoints.length > 2) context.closePath();
      context.stroke();
    }
    context.restore();

    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 1;
    for (let hue = 0; hue < 360; hue += 15) {
      const innerTick = huePoint(hue, 123);
      const outerTick = huePoint(hue, 129);
      context.beginPath();
      context.moveTo(innerTick.x, innerTick.y);
      context.lineTo(outerTick.x, outerTick.y);
      context.stroke();
    }
    context.restore();

    markerPoints.forEach((point, index) => {
      context.beginPath();
      context.arc(point.x, point.y, index === 0 ? 7 : 6, 0, Math.PI * 2);
      context.fillStyle = index === 0 ? 'rgba(255, 255, 255, 0.96)' : 'rgba(17, 21, 27, 0.84)';
      context.fill();
      if (index === 0) {
        context.strokeStyle = 'rgba(12, 15, 19, 0.92)';
        context.lineWidth = 4;
        context.stroke();
      }
      context.beginPath();
      context.arc(point.x, point.y, index === 0 ? 5.5 : 5, 0, Math.PI * 2);
      context.strokeStyle = '#FFFFFF';
      context.lineWidth = 2;
      context.stroke();
    });

    dom.canvas.setAttribute('aria-valuenow', String(Math.round(colors.base.h)));
  }

  function updateWheelHueLabel(hue) {
    if (dom.wheelHue) dom.wheelHue.textContent = String(Math.round(normalizeHue(hue)));
    if (dom.hueValue) dom.hueValue.textContent = String(Math.round(normalizeHue(hue)));
  }

  function renderColorState() {
    const colors = getDerivedColors();
    const base = colors.base;

    if (dom.baseColor) dom.baseColor.value = colors.baseHex.toLowerCase();
    if (dom.hexInput && document.activeElement !== dom.hexInput) dom.hexInput.value = colors.baseHex;
    if (dom.saturation) dom.saturation.value = String(Math.round(base.s));
    if (dom.lightness) dom.lightness.value = String(Math.round(base.l));
    if (dom.saturationValue) dom.saturationValue.textContent = `${Math.round(base.s)}%`;
    if (dom.lightnessValue) dom.lightnessValue.textContent = `${Math.round(base.l)}%`;
    updateWheelHueLabel(base.h);

    updateColorControl(dom.shadowColor, dom.shadowDot, dom.shadowHex, dom.shadowAuto,
      colors.shadow, 'shadow color', Boolean(state.manualColors.shadow));
    updateColorControl(null, dom.midtoneDot, dom.midtoneHex, null,
      colors.baseHex, 'base color', false);
    updateColorControl(dom.highlightColor, dom.highlightDot, dom.highlightHex, dom.highlightAuto,
      colors.highlight, 'highlight color', Boolean(state.manualColors.highlight));
    updateColorControl(dom.bounceColor, dom.bounceDot, dom.bounceHex, dom.bounceAuto,
      colors.bounce, 'bounce light color', Boolean(state.manualColors.bounce));

    if (dom.shadowShift) dom.shadowShift.textContent = LIGHTING_COPY[state.lighting].shadowShift;
    if (dom.highlightShift) dom.highlightShift.textContent = LIGHTING_COPY[state.lighting].highlightShift;
    if (dom.bounceShift) dom.bounceShift.textContent = state.lighting === 'warm'
      ? 'Cool ambient fill'
      : 'Warm earth bounce';
    if (dom.lightingLabel) dom.lightingLabel.textContent = LIGHTING_COPY[state.lighting].label;

    if (dom.sphere) {
      dom.sphere.style.setProperty('--base', colors.baseHex);
      dom.sphere.style.setProperty('--shadow', colors.shadow);
      dom.sphere.style.setProperty('--highlight', colors.highlight);
      dom.sphere.style.setProperty('--bounce', colors.bounce);
      dom.sphere.style.setProperty('--sphere-shadow', state.visibility.shadow ? colors.shadow : colors.baseHex);
      dom.sphere.style.setProperty('--sphere-highlight', state.visibility.highlight ? colors.highlight : colors.baseHex);
      dom.sphere.dataset.shadow = state.visibility.shadow ? 'on' : 'off';
      dom.sphere.dataset.highlight = state.visibility.highlight ? 'on' : 'off';
      dom.sphere.dataset.bounce = state.visibility.bounce ? 'on' : 'off';
    }
    if (dom.root) {
      dom.root.style.setProperty('--base', colors.baseHex);
      dom.root.style.setProperty('--shadow', colors.shadow);
      dom.root.style.setProperty('--highlight', colors.highlight);
      dom.root.style.setProperty('--bounce', colors.bounce);
    }

    setActiveButtons(dom.lightingButtons, state.lighting, 'lighting');
    setActiveButtons(dom.harmonyButtons, state.harmony, 'harmony');
    dom.visibilityButtons.forEach((button) => {
      const visible = state.visibility[button.dataset.visibility] !== false;
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${button.dataset.visibility} light on sphere`);
      button.classList.toggle('is-hidden', !visible);
    });

    const harmonyHues = getHarmonyHues(base.h);
    const harmonyColors = getHarmonyColors(base.h, base.s, base.l);
    renderHarmonySwatches(harmonyColors, harmonyHues);
    if (dom.harmonyDescription) dom.harmonyDescription.textContent = HARMONY_DESCRIPTIONS[state.harmony];

    renderRecipe(dom.shadowRecipe, 'For shadows, use', colors.shadow, [
      { before: ' on a ', mode: 'Multiply 60%', after: ' layer. ' },
    ]);
    renderRecipe(dom.highlightRecipe, 'For highlights and rim light, use', colors.highlight, [
      { before: ' with ', mode: 'Add (Glow) 25%', after: ' for luminous accents, or ' },
      { before: '', mode: 'Overlay 40%', after: ' for a firmer lift. ' },
    ]);
    renderRecipe(dom.bounceRecipe, 'For reflected fill, use', colors.bounce, [
      { before: ' near the shadow edge on a ', mode: 'Screen 25%', after: ' layer. ' },
    ]);

    if (dom.moodPrompt && document.activeElement !== dom.moodPrompt) dom.moodPrompt.value = state.moodPrompt;
    if (dom.includeBaseColor) dom.includeBaseColor.checked = state.includeBaseColor;
    if (dom.moodContextHelp) dom.moodContextHelp.textContent = state.includeBaseColor
      ? 'ON · Gemini harmonizes the palette with your selected base color and lighting.'
      : 'OFF · Gemini follows only the mood description and ignores the selected base color.';
    if (dom.moodDescription) dom.moodDescription.textContent = state.customMoodActive
      ? state.includeBaseColor
        ? `Gemini palette tuned to “${state.moodPrompt}”, your ${state.baseHex} base, and ${state.lighting} lighting.`
        : `Gemini palette tuned only to “${state.moodPrompt}”, independent of your base color.`
      : '';
    renderMoodPalette();

    if (dom.grayscaleToggle) dom.grayscaleToggle.setAttribute('aria-pressed', String(state.grayscale));
    if (dom.grayscaleStatus) dom.grayscaleStatus.textContent = state.grayscale ? 'Value check' : 'Color view';
    if (dom.body) dom.body.classList.toggle('grayscale', state.grayscale);
    if (dom.year) dom.year.textContent = String(new Date().getFullYear());

    drawColorWheel();
    renderExportSummary();
  }

  function setBaseColor(value, { persist = true } = {}) {
    const hex = canonicalizeHex(value);
    if (!hex) return false;
    state.baseHex = hex;
    if (dom.hexInput) dom.hexInput.setAttribute('aria-invalid', 'false');
    renderColorState();
    if (persist) persistState();
    return true;
  }

  function setManualColor(name, value) {
    if (!Object.prototype.hasOwnProperty.call(state.manualColors, name)) return;
    const hex = canonicalizeHex(value);
    if (!hex) return;
    state.manualColors[name] = hex;
    renderColorState();
    persistState();
  }

  function restoreAutomaticColor(name) {
    if (!Object.prototype.hasOwnProperty.call(state.manualColors, name)) return;
    state.manualColors[name] = null;
    renderColorState();
    persistState();
    showToast(`Automatic ${name} color restored.`);
  }

  async function generateCustomMood() {
    const prompt = dom.moodPrompt ? dom.moodPrompt.value.trim().slice(0, 120) : '';
    if (!prompt) {
      showToast('Describe your mood to generate a palette.');
      if (dom.moodPrompt) dom.moodPrompt.focus();
      return false;
    }

    setGenerateLoading(true);
    try {
      const colors = await fetchGeminiPalette(prompt, state.baseHex, state.lighting);
      state.moodPrompt = prompt;
      state.customMoodActive = true;
      state.moodPalette = colors.map((hex, index) => ({
        name: `Gemini ${String(index + 1).padStart(2, '0')}`,
        hex,
      }));
      renderColorState();
      persistState();
      showToast('Gemini generated a five-color mood palette.');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gemini could not generate a palette.');
      return false;
    } finally {
      setGenerateLoading(false);
    }
  }

  function updateBaseHue(hue) {
    const base = rgbToHsl(parseHex(state.baseHex));
    state.baseHex = hslToHex(normalizeHue(hue), base.s, base.l);
    renderColorState();
    persistState();
  }

  function commitHexInput() {
    if (!dom.hexInput) return;
    if (!setBaseColor(dom.hexInput.value)) {
      dom.hexInput.setAttribute('aria-invalid', 'true');
      showToast('Enter a valid 3- or 6-digit hex.');
    }
  }

  function setLighting(mode) {
    if (mode !== 'warm' && mode !== 'cool') return;
    state.lighting = mode;
    renderColorState();
    persistState();
  }

  function setHarmony(harmony) {
    if (!Object.prototype.hasOwnProperty.call(HARMONY_OFFSETS, harmony)) return;
    state.harmony = harmony;
    renderColorState();
    persistState();
  }

  function randomizeBaseColor() {
    const hue = randomBetween(0, 360);
    const saturation = randomBetween(40, 75);
    const lightness = randomBetween(45, 70);
    state.manualColors = { shadow: null, highlight: null, bounce: null };
    setBaseColor(hslToHex(hue, saturation, lightness));
  }

  function resetColor() {
    setBaseColor(DEFAULT_HEX);
  }

  function updateGrayscale() {
    state.grayscale = !state.grayscale;
    renderColorState();
    persistState();
  }

  function getCurrentPaletteColors() {
    const colors = getDerivedColors();
    const harmony = getHarmonyColors(colors.base.h, colors.base.s, colors.base.l);
    const mood = (state.moodPalette || []).map((entry) => entry.hex);
    return uniqueHexes([colors.shadow, colors.baseHex, colors.highlight, colors.bounce, ...harmony, ...mood]);
  }

  function readSavedPalettes() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SAVED_PALETTES_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
        : [];
    } catch (_error) {
      return [];
    }
  }

  function writeSavedPalettes(palettes) {
    try {
      window.localStorage.setItem(SAVED_PALETTES_KEY, JSON.stringify(palettes.slice(0, 12)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function savePalette() {
    const colors = getCurrentPaletteColors();
    const palettes = readSavedPalettes();
    palettes.unshift({
      createdAt: Date.now(),
      mood: state.mood,
      moodPrompt: state.customMoodActive ? state.moodPrompt : '',
      harmony: state.harmony,
      lighting: state.lighting,
      colors,
    });
    if (writeSavedPalettes(palettes)) {
      showToast('Palette saved.');
      renderSavedPalettes();
    } else {
      showToast('Palette could not be saved.');
    }
  }

  function renderSavedPalettes() {
    if (!dom.savedPalettesList) return;
    const palettes = readSavedPalettes();
    dom.savedPalettesList.replaceChildren();
    if (!palettes.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No saved palettes yet.';
      dom.savedPalettesList.appendChild(empty);
      return;
    }

    palettes.slice(0, 12).forEach((entry, index) => {
      const section = document.createElement('section');
      section.className = 'saved-palette-entry saved-palette';
      const title = document.createElement('h3');
      const date = new Date(Number(entry.createdAt));
      title.textContent = Number.isNaN(date.getTime())
        ? `Saved palette ${String(index + 1).padStart(2, '0')}`
        : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      section.appendChild(title);

      const colors = document.createElement('div');
      colors.className = 'saved-colors';
      uniqueHexes(Array.isArray(entry.colors) ? entry.colors : []).forEach((hex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'saved-color saved-swatch';
        button.dataset.copy = hex;
        button.style.setProperty('--swatch', hex);
        button.textContent = hex;
        button.setAttribute('aria-label', `Copy ${hex}`);
        colors.appendChild(button);
      });
      section.appendChild(colors);
      dom.savedPalettesList.appendChild(section);
    });
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.hidden = false;
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.hidden = true;
      dialog.removeAttribute('open');
    }
  }

  function closeAllDialogs() {
    document.querySelectorAll('dialog').forEach((dialog) => closeDialog(dialog));
  }

  function renderExportSummary() {
    if (!dom.exportSummary) return;
    const count = getCurrentPaletteColors().length;
    dom.exportSummary.textContent = `${count} colors, ready for your next canvas.`;
  }

  function getPaletteEntries() {
    const colors = getDerivedColors();
    const baseHsl = colors.base;
    const harmony = getHarmonyColors(baseHsl.h, baseHsl.s, baseHsl.l);
    const mood = (state.moodPalette || []).map((entry) => ({
      hex: canonicalizeHex(entry.hex) || DEFAULT_HEX,
      name: entry.name || 'Mood color',
    }));
    const entries = [
      { hex: colors.shadow, name: 'Shadow' },
      { hex: colors.baseHex, name: 'Base' },
      { hex: colors.highlight, name: 'Highlight' },
      { hex: colors.bounce, name: 'Bounce Light' },
    ];
    harmony.forEach((hex, index) => entries.push({
      hex,
      name: index === 0 ? 'Harmony Base' : `Harmony ${String(index).padStart(2, '0')}`,
    }));
    mood.forEach((entry) => entries.push(entry));

    const seen = new Set();
    return entries.filter((entry) => {
      if (seen.has(entry.hex)) return false;
      seen.add(entry.hex);
      return true;
    });
  }

  function hexToRgbText(hex) {
    const rgb = parseHex(hex);
    return rgb ? `${rgb.r} ${rgb.g} ${rgb.b}` : '0 0 0';
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.setAttribute('aria-hidden', 'true');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportCss() {
    const colors = getDerivedColors();
    const entries = getPaletteEntries();
    const harmony = entries.filter((entry) => entry.name.indexOf('Harmony') === 0);
    const lines = [
      '/* Pigment palette export */',
      ':root {',
      `  --pigment-shadow: ${colors.shadow};`,
      `  --pigment-base: ${colors.baseHex};`,
      `  --pigment-highlight: ${colors.highlight};`,
      `  --pigment-bounce: ${colors.bounce};`,
    ];
    harmony.forEach((entry, index) => lines.push(`  --pigment-harmony-${String(index + 1).padStart(2, '0')}: ${entry.hex};`));
    const moodEntries = entries.filter((entry) => (state.moodPalette || []).some((color) => color.name === entry.name));
    moodEntries.forEach((entry, index) => lines.push(`  --pigment-mood-${String(index + 1).padStart(2, '0')}: ${entry.hex};`));
    lines.push('}', '');
    downloadText('pigment-palette.css', lines.join('\n'), 'text/css;charset=utf-8');
    showToast('CSS palette exported.');
  }

  function exportGpl() {
    const entries = getPaletteEntries();
    const lines = [
      'GIMP Palette',
      'Name: Pigment Palette',
      `Columns: ${Math.min(5, Math.max(1, entries.length))}`,
      '#',
    ];
    entries.forEach((entry) => lines.push(`${hexToRgbText(entry.hex)}\t${entry.name}`));
    downloadText('pigment-palette.gpl', `${lines.join('\n')}\n`, 'text/plain;charset=utf-8');
    showToast('GIMP palette exported.');
  }

  function pointerHue(event) {
    if (!dom.canvas) return null;
    const rect = dom.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (event.clientX - rect.left) * CANVAS_SIZE / rect.width;
    const y = (event.clientY - rect.top) * CANVAS_SIZE / rect.height;
    const dx = x - CANVAS_SIZE / 2;
    const dy = y - CANVAS_SIZE / 2;
    const radius = Math.sqrt(dx * dx + dy * dy);
    if (radius < 70) return null;
    return normalizeHue(Math.atan2(dy, dx) / DEG_TO_RAD + 90);
  }

  function handleWheelPointerDown(event) {
    const hue = pointerHue(event);
    if (hue === null) return;
    wheelDragging = true;
    if (typeof dom.canvas.setPointerCapture === 'function') {
      try {
        dom.canvas.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Pointer capture is optional in older browsers.
      }
    }
    updateBaseHue(hue);
    event.preventDefault();
  }

  function handleWheelPointerMove(event) {
    if (!wheelDragging) return;
    const hue = pointerHue(event);
    if (hue === null) return;
    updateBaseHue(hue);
    event.preventDefault();
  }

  function stopWheelDrag() {
    wheelDragging = false;
  }

  function handleWheelKeydown(event) {
    if (!dom.canvas) return;
    const current = rgbToHsl(parseHex(state.baseHex)).h;
    let next = null;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 359;
    if (next === null) return;
    event.preventDefault();
    updateBaseHue(next);
  }

  function bindEvents() {
    if (dom.baseColor) {
      dom.baseColor.addEventListener('input', () => setBaseColor(dom.baseColor.value));
      dom.baseColor.addEventListener('change', () => setBaseColor(dom.baseColor.value));
    }
    if (dom.hexInput) {
      dom.hexInput.addEventListener('change', commitHexInput);
      dom.hexInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitHexInput();
        }
      });
    }
    if (dom.saturation) {
      dom.saturation.addEventListener('input', () => {
        const base = rgbToHsl(parseHex(state.baseHex));
        setBaseColor(hslToHex(base.h, Number(dom.saturation.value), base.l));
      });
    }
    if (dom.lightness) {
      dom.lightness.addEventListener('input', () => {
        const base = rgbToHsl(parseHex(state.baseHex));
        setBaseColor(hslToHex(base.h, base.s, Number(dom.lightness.value)));
      });
    }

    [
      [dom.shadowColor, 'shadow', dom.shadowAuto],
      [dom.highlightColor, 'highlight', dom.highlightAuto],
      [dom.bounceColor, 'bounce', dom.bounceAuto],
    ].forEach(([input, name, reset]) => {
      if (input) {
        const applyColor = () => setManualColor(name, input.value);
        input.addEventListener('input', applyColor);
        input.addEventListener('change', applyColor);
      }
      if (reset) reset.addEventListener('click', () => restoreAutomaticColor(name));
    });
    dom.visibilityButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.visibility;
        if (!Object.prototype.hasOwnProperty.call(state.visibility, name)) return;
        state.visibility[name] = !state.visibility[name];
        renderColorState();
        persistState();
      });
    });

    dom.lightingButtons.forEach((button) => {
      button.addEventListener('click', () => setLighting(button.dataset.lighting));
    });
    dom.harmonyButtons.forEach((button) => {
      button.addEventListener('click', () => setHarmony(button.dataset.harmony));
    });

    if (dom.canvas) {
      dom.canvas.addEventListener('pointerdown', handleWheelPointerDown);
      dom.canvas.addEventListener('pointermove', handleWheelPointerMove);
      dom.canvas.addEventListener('pointerup', stopWheelDrag);
      dom.canvas.addEventListener('pointercancel', stopWheelDrag);
      dom.canvas.addEventListener('pointerleave', () => {
        if (!wheelDragging) return;
        // Keep dragging active while the pointer is captured; do not alter the hue here.
      });
      dom.canvas.addEventListener('keydown', handleWheelKeydown);
    }

    if (dom.moodPromptForm) {
      dom.moodPromptForm.addEventListener('submit', (event) => {
        event.preventDefault();
        generateCustomMood();
      });
    }
    if (dom.includeBaseColor) {
      dom.includeBaseColor.addEventListener('change', () => {
        state.includeBaseColor = dom.includeBaseColor.checked;
        renderColorState();
        persistState();
      });
    }
    if (dom.grayscaleToggle) dom.grayscaleToggle.addEventListener('click', updateGrayscale);
    if (dom.resetColor) dom.resetColor.addEventListener('click', resetColor);
    if (dom.randomColor) dom.randomColor.addEventListener('click', randomizeBaseColor);
    if (dom.savePalette) dom.savePalette.addEventListener('click', savePalette);

    if (dom.savedPalettesButton) {
      dom.savedPalettesButton.addEventListener('click', () => {
        renderSavedPalettes();
        openDialog(dom.savedDialog);
      });
    }
    if (dom.guideButton) dom.guideButton.addEventListener('click', () => openDialog(dom.guideDialog));
    if (dom.exportPalette) {
      dom.exportPalette.addEventListener('click', () => {
        renderExportSummary();
        openDialog(dom.exportDialog);
      });
    }
    if (dom.exportCss) dom.exportCss.addEventListener('click', exportCss);
    if (dom.exportGpl) dom.exportGpl.addEventListener('click', exportGpl);
    if (dom.studioButton) {
      dom.studioButton.addEventListener('click', () => {
        closeAllDialogs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    document.addEventListener('click', (event) => {
      const copyTarget = event.target.closest('[data-copy]');
      if (copyTarget) {
        event.preventDefault();
        copyHex(copyTarget.dataset.copy);
        return;
      }
      const closeTarget = event.target.closest('[data-close-dialog]');
      if (closeTarget) {
        closeDialog(closeTarget.closest('dialog'));
      }
      if (event.target.tagName === 'DIALOG' && event.target.open) {
        const panel = event.target.querySelector('.dialog-panel');
        if (!panel || !panel.contains(event.target)) closeDialog(event.target);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        // Native dialogs close themselves; this also handles the fallback dialog path.
        document.querySelectorAll('dialog[open]').forEach((dialog) => closeDialog(dialog));
      }
    });
  }

  function initialize() {
    if (window.__pigmentInitialized) return;
    window.__pigmentInitialized = true;
    readStoredState();
    cacheDom();
    state.moodPalette = Array.isArray(state.moodPalette) ? state.moodPalette : [];
    bindEvents();
    renderColorState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
