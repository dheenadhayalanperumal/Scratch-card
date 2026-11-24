"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/clock";
import * as sound from "@/lib/sound";

/**
 * Canvas fireworks ported from the classic "Happy Diwali" fireworks demo
 * the user supplied (itself the well-known CodePen fireworks simulation).
 *
 * What makes that demo look different from a CSS spark burst is all here:
 *  - two canvases: a fading "trails" layer (stars/sparks/flashes are drawn
 *    once and decay) under a "main" layer redrawn each frame with the
 *    bright head of every star, both composited with lighten/lighter so
 *    overlapping light adds up instead of painting over;
 *  - shells are real projectiles: a heavy comet climbs under gravity with
 *    a spiralling spark trail, burns out, then bursts on death;
 *  - bursts distribute stars over a spherical surface (createBurst), so
 *    shells read as round 3D explosions rather than flat rings, with
 *    pistils, streamers, rings, crossettes, crackle, strobe, ghost,
 *    willow, palm, floral and falling-leaves variants;
 *  - stars keep emitting glitter sparks as they fall.
 *
 * Two modes:
 *  - "ambient": endless auto-fire show (the Diwali skin's background).
 *    Silent — a landing page shouldn't boom unprompted.
 *  - "celebration": a short scripted volley for the win reveal, with the
 *    demo's lift/burst/crackle/small-burst sounds (synthesized in
 *    lib/sound.js — this app ships no audio files).
 */

const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;
const GRAVITY = 0.9; // per-frame gravity increment used by the demo's physics

const COLOR = {
  Red: "#ff0043",
  Green: "#14fc56",
  Blue: "#1e7fff",
  Purple: "#e60aff",
  Gold: "#ffbf36",
  White: "#ffffff",
};
// Special invisible color (not rendered — physics still apply).
const INVISIBLE = "_INVISIBLE_";
const COLOR_CODES = Object.values(COLOR);
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function randomColorSimple() {
  return COLOR_CODES[(Math.random() * COLOR_CODES.length) | 0];
}

let lastColor;
function randomColor({ notSame = false, notColor = null, limitWhite = false } = {}) {
  let color = randomColorSimple();
  if (limitWhite && color === COLOR.White && Math.random() < 0.6) color = randomColorSimple();
  if (notSame) while (color === lastColor) color = randomColorSimple();
  else if (notColor) while (color === notColor) color = randomColorSimple();
  lastColor = color;
  return color;
}

const whiteOrGold = () => (Math.random() < 0.5 ? COLOR.Gold : COLOR.White);

function makePistilColor(shellColor) {
  return shellColor === COLOR.White || shellColor === COLOR.Gold
    ? randomColor({ notColor: shellColor })
    : whiteOrGold();
}

/* ---------------- Shell factories (configs mirror the demo) ---------------- */

function makeShellFactories(qualityScale) {
  const crysanthemumShell = (size = 1) => {
    const glitter = Math.random() < 0.25;
    const singleColor = Math.random() < 0.72;
    const color = singleColor
      ? randomColor({ limitWhite: true })
      : [randomColor(), randomColor({ notSame: true })];
    const pistil = singleColor && Math.random() < 0.42;
    const pistilColor = pistil && makePistilColor(color);
    const secondColor =
      singleColor && (Math.random() < 0.2 || color === COLOR.White)
        ? pistilColor || randomColor({ notColor: color, limitWhite: true })
        : null;
    const streamers = !pistil && color !== COLOR.White && Math.random() < 0.42;
    const starDensity = (glitter ? 1.1 : 1.25) * qualityScale;
    return {
      shellSize: size,
      spreadSize: 300 + size * 100,
      starLife: 900 + size * 200,
      starDensity,
      color,
      secondColor,
      glitter: glitter ? "light" : "",
      glitterColor: whiteOrGold(),
      pistil,
      pistilColor,
      streamers,
    };
  };

  const ghostShell = (size = 1) => {
    const shell = crysanthemumShell(size);
    shell.starLife *= 1.5;
    const ghostColor = randomColor({ notColor: COLOR.White });
    shell.streamers = true;
    shell.pistil = Math.random() < 0.42;
    shell.pistilColor = shell.pistil && makePistilColor(ghostColor);
    shell.color = INVISIBLE;
    shell.secondColor = ghostColor;
    shell.glitter = "";
    return shell;
  };

  const strobeShell = (size = 1) => {
    const color = randomColor({ limitWhite: true });
    return {
      shellSize: size,
      spreadSize: 280 + size * 92,
      starLife: 1100 + size * 200,
      starLifeVariation: 0.4,
      starDensity: 1.1 * qualityScale,
      color,
      glitter: "light",
      glitterColor: COLOR.White,
      strobe: true,
      strobeColor: Math.random() < 0.5 ? COLOR.White : null,
      pistil: Math.random() < 0.5,
      pistilColor: makePistilColor(color),
    };
  };

  const palmShell = (size = 1) => {
    const thick = Math.random() < 0.5;
    return {
      shellSize: size,
      color: randomColor(),
      spreadSize: 250 + size * 75,
      starDensity: (thick ? 0.15 : 0.4) * qualityScale,
      starLife: 1800 + size * 200,
      glitter: thick ? "thick" : "heavy",
    };
  };

  const ringShell = (size = 1) => {
    const color = randomColor();
    const pistil = Math.random() < 0.75;
    return {
      shellSize: size,
      ring: true,
      color,
      spreadSize: 300 + size * 100,
      starLife: 900 + size * 200,
      starCount: 2.2 * PI_2 * (size + 1),
      starDensity: qualityScale,
      pistil,
      pistilColor: makePistilColor(color),
      glitter: !pistil ? "light" : "",
      glitterColor: color === COLOR.Gold ? COLOR.Gold : COLOR.White,
      streamers: Math.random() < 0.3,
    };
  };

  const crossetteShell = (size = 1) => {
    const color = randomColor({ limitWhite: true });
    return {
      shellSize: size,
      spreadSize: 300 + size * 100,
      starLife: 750 + size * 160,
      starLifeVariation: 0.4,
      starDensity: 0.85 * qualityScale,
      color,
      crossette: true,
      pistil: Math.random() < 0.5,
      pistilColor: makePistilColor(color),
    };
  };

  const floralShell = (size = 1) => ({
    shellSize: size,
    spreadSize: 300 + size * 120,
    starDensity: 0.12 * qualityScale,
    starLife: 500 + size * 50,
    starLifeVariation: 0.5,
    color:
      Math.random() < 0.65
        ? "random"
        : Math.random() < 0.15
          ? randomColor()
          : [randomColor(), randomColor({ notSame: true })],
    floral: true,
  });

  const fallingLeavesShell = (size = 1) => ({
    shellSize: size,
    color: INVISIBLE,
    spreadSize: 300 + size * 120,
    starDensity: 0.12 * qualityScale,
    starLife: 500 + size * 50,
    starLifeVariation: 0.5,
    glitter: "medium",
    glitterColor: COLOR.Gold,
    fallingLeaves: true,
  });

  const willowShell = (size = 1) => ({
    shellSize: size,
    spreadSize: 300 + size * 100,
    starDensity: 0.6 * qualityScale,
    starLife: 3000 + size * 300,
    glitter: "willow",
    glitterColor: COLOR.Gold,
    color: INVISIBLE,
  });

  const crackleShell = (size = 1) => {
    const color = Math.random() < 0.75 ? COLOR.Gold : randomColor();
    return {
      shellSize: size,
      spreadSize: 380 + size * 75,
      starDensity: (0.65 + qualityScale * 0.35) * qualityScale,
      starLife: 600 + size * 100,
      starLifeVariation: 0.32,
      glitter: "light",
      glitterColor: COLOR.Gold,
      color,
      crackle: true,
      pistil: Math.random() < 0.65,
      pistilColor: makePistilColor(color),
    };
  };

  const horsetailShell = (size = 1) => {
    const color = randomColor();
    return {
      shellSize: size,
      horsetail: true,
      color,
      spreadSize: 250 + size * 38,
      starDensity: 0.9 * qualityScale,
      starLife: 2500 + size * 300,
      glitter: "medium",
      glitterColor: Math.random() < 0.5 ? whiteOrGold() : color,
      strobe: color === COLOR.White,
    };
  };

  const shellTypes = {
    Crackle: crackleShell,
    Crossette: crossetteShell,
    Crysanthemum: crysanthemumShell,
    "Falling Leaves": fallingLeavesShell,
    Floral: floralShell,
    Ghost: ghostShell,
    "Horse Tail": horsetailShell,
    Palm: palmShell,
    Ring: ringShell,
    Strobe: strobeShell,
    Willow: willowShell,
  };
  const shellNames = Object.keys(shellTypes);

  const randomShellName = () =>
    Math.random() < 0.5
      ? "Crysanthemum"
      : shellNames[(Math.random() * (shellNames.length - 1) + 1) | 0];

  // Processing-intensive variants excluded from fast/random volleys.
  const fastBlacklist = ["Falling Leaves", "Floral", "Willow"];
  const randomFastShell = () => {
    let name = randomShellName();
    while (fastBlacklist.includes(name)) name = randomShellName();
    return shellTypes[name];
  };

  return { shellTypes, randomShellName, randomFastShell, crysanthemumShell };
}

/* ---------------- Component ---------------- */

export default function FireworksEngine({ mode = "ambient", withSound = false }) {
  const trailsRef = useRef(null);
  const mainRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const trailsCanvas = trailsRef.current;
    const mainCanvas = mainRef.current;
    if (!trailsCanvas || !mainCanvas) return;
    const parent = trailsCanvas.parentElement;
    const trailsCtx = trailsCanvas.getContext("2d");
    const mainCtx = mainCanvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 520;
    const qualityScale = isSmall ? 0.75 : 1;

    let stageW = 0;
    let stageH = 0;
    const resize = () => {
      const r = parent.getBoundingClientRect();
      stageW = Math.max(1, r.width);
      stageH = Math.max(1, r.height);
      for (const [canvas, ctx] of [
        [trailsCanvas, trailsCtx],
        [mainCanvas, mainCtx],
      ]) {
        canvas.width = stageW * dpr;
        canvas.height = stageH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    // Shell "size" selector equivalent: 2 on phones, 3 on larger stages.
    const baseSize = clamp(Math.min(stageW, stageH) / 170, 1.6, 3);
    const { shellTypes, randomShellName, randomFastShell, crysanthemumShell } =
      makeShellFactories(qualityScale);

    /* ----- particle stores, keyed by color like the demo ----- */
    const starActive = {};
    const sparkActive = {};
    COLOR_CODES_W_INVIS.forEach((c) => {
      starActive[c] = [];
      sparkActive[c] = [];
    });
    const starPool = [];
    const sparkPool = [];
    const flashes = [];
    let starTotal = 0;
    const MAX_STARS = isSmall ? 650 : 1100;
    const MAX_SPARKS = isSmall ? 700 : 1300;

    function addSpark(x, y, color, angle, speed, life) {
      if (color === INVISIBLE) return;
      let total = 0;
      COLOR_CODES.forEach((c) => (total += sparkActive[c].length));
      if (total >= MAX_SPARKS) return;
      const s = sparkPool.pop() || {};
      s.x = x; s.y = y; s.prevX = x; s.prevY = y;
      s.color = color;
      s.speedX = Math.sin(angle) * speed;
      s.speedY = Math.cos(angle) * speed;
      s.life = life;
      sparkActive[color].push(s);
    }

    function addStar(x, y, color, angle, speed, life, offX = 0, offY = 0) {
      if (starTotal >= MAX_STARS) return null;
      const s = starPool.pop() || {};
      s.visible = true;
      s.heavy = false;
      s.x = x; s.y = y; s.prevX = x; s.prevY = y;
      s.color = color;
      s.speedX = Math.sin(angle) * speed + offX;
      s.speedY = Math.cos(angle) * speed + offY;
      s.life = life;
      s.fullLife = life;
      s.spinAngle = Math.random() * PI_2;
      s.spinSpeed = 0.8;
      s.spinRadius = 0;
      s.sparkFreq = 0;
      s.sparkSpeed = 1;
      s.sparkTimer = 0;
      s.sparkColor = color;
      s.sparkLife = 750;
      s.sparkLifeVariation = 0.25;
      s.strobe = false;
      s.strobeFreq = 0;
      s.secondColor = null;
      s.transitionTime = 0;
      s.colorChanged = false;
      s.onDeath = null;
      s.updateFrame = -1;
      starActive[color].push(s);
      starTotal++;
      return s;
    }

    function returnStar(star) {
      starTotal--;
      if (star.onDeath) star.onDeath(star);
      star.onDeath = null;
      starPool.push(star);
    }

    /* ----- burst geometry (spherical surface distribution) ----- */
    function createParticleArc(start, arcLength, count, randomness, factory) {
      const angleDelta = arcLength / count;
      const end = start + arcLength - angleDelta * 0.5;
      if (end > start) {
        for (let a = start; a < end; a += angleDelta) factory(a + Math.random() * angleDelta * randomness);
      } else {
        for (let a = start; a > end; a += angleDelta) factory(a + Math.random() * angleDelta * randomness);
      }
    }

    function createBurst(count, factory, startAngle = 0, arcLength = PI_2) {
      const R = 0.5 * Math.sqrt(count / Math.PI);
      const C = 2 * R * Math.PI;
      const cHalf = C / 2;
      for (let i = 0; i <= cHalf; i++) {
        const ringAngle = (i / cHalf) * PI_HALF;
        const ringSize = Math.cos(ringAngle);
        const partsPerFullRing = C * ringSize;
        const partsPerArc = partsPerFullRing * (arcLength / PI_2);
        const angleInc = PI_2 / partsPerFullRing;
        const angleOffset = Math.random() * angleInc + startAngle;
        const maxRandom = angleInc * 0.33;
        for (let j = 0; j < partsPerArc; j++) {
          factory(angleInc * j + angleOffset + Math.random() * maxRandom, ringSize);
        }
      }
    }

    /* ----- star death effects ----- */
    function crossetteEffect(star) {
      const startAngle = Math.random() * PI_HALF;
      createParticleArc(startAngle, PI_2, 4, 0.5, (angle) => {
        addStar(star.x, star.y, star.color, angle, Math.random() * 0.6 + 0.75, 600);
      });
    }

    function floralEffect(star) {
      createBurst(12 + 6 * (isSmall ? 1 : 2), (angle, speedMult) => {
        addStar(star.x, star.y, star.color, angle, speedMult * 2.4, 1000 + Math.random() * 300, star.speedX, star.speedY);
      });
      flashes.push({ x: star.x, y: star.y, radius: 46 });
      if (withSound) sound.playFireworkBurstSmall();
    }

    function fallingLeavesEffect(star) {
      createBurst(7, (angle, speedMult) => {
        const ns = addStar(star.x, star.y, INVISIBLE, angle, speedMult * 2.4, 2400 + Math.random() * 600, star.speedX, star.speedY);
        if (!ns) return;
        ns.sparkColor = COLOR.Gold;
        ns.sparkFreq = 144 / qualityScale;
        ns.sparkSpeed = 0.28;
        ns.sparkLife = 750;
        ns.sparkLifeVariation = 3.2;
      });
      flashes.push({ x: star.x, y: star.y, radius: 46 });
      if (withSound) sound.playFireworkBurstSmall();
    }

    function crackleEffect(star) {
      const count = isSmall ? 16 : 32;
      createParticleArc(0, PI_2, count, 1.8, (angle) => {
        addSpark(star.x, star.y, COLOR.Gold, angle, Math.pow(Math.random(), 0.45) * 2.4, 300 + Math.random() * 200);
      });
    }

    /* ----- Shell ----- */
    class Shell {
      constructor(options) {
        Object.assign(this, options);
        this.starLifeVariation = options.starLifeVariation || 0.125;
        this.color = options.color || randomColor();
        this.glitterColor = options.glitterColor || this.color;
        if (!this.starCount) {
          const density = options.starDensity || 1;
          const scaledSize = this.spreadSize / 54;
          this.starCount = Math.max(6, scaledSize * scaledSize * density);
        }
        this.comet = null;
      }

      launch(position, launchHeight) {
        const width = stageW;
        const height = stageH;
        const hpad = 60;
        const vpad = 50;
        const minHeight = height - height * 0.45;
        const launchX = position * (width - hpad * 2) + hpad;
        const launchY = height;
        const burstY = minHeight - launchHeight * (minHeight - vpad);
        const launchDistance = launchY - burstY;
        // The demo derives launch velocity from a power curve and lets the
        // comet's life timer expire near the apex. Under this port's
        // per-frame drag/gravity that estimate undershoots (the comet falls
        // back before reaching burst height), so tune the velocity by
        // simulating the climb: pick the speed that reaches burstY in
        // roughly 70 frames (~1.1s), and burst exactly on arrival below.
        let launchVelocity = Math.pow(launchDistance * 0.04, 0.64);
        const simulateClimb = (v) => {
          let y = 0;
          let vy = -v;
          for (let f = 0; f < 420; f++) {
            y += vy;
            vy *= 0.992;
            vy += 0.015;
            if (y <= -launchDistance) return f + 1;
            if (vy >= 0) return Infinity;
          }
          return Infinity;
        };
        for (let attempt = 0; attempt < 24; attempt++) {
          const frames = simulateClimb(launchVelocity);
          if (frames === Infinity) launchVelocity *= 1.18;
          else if (frames > 84) launchVelocity *= 1.1;
          else if (frames < 52) launchVelocity *= 0.92;
          else break;
        }

        const comet = addStar(
          launchX,
          launchY,
          typeof this.color === "string" && this.color !== "random" ? this.color : COLOR.White,
          Math.PI,
          launchVelocity * (this.horsetail ? 1.2 : 1),
          launchVelocity * (this.horsetail ? 100 : 400)
        );
        if (!comet) return;
        this.comet = comet;
        comet.heavy = true;
        comet.isComet = true;
        comet.targetY = burstY;
        // Fallback if frame timing drifts from the simulated climb.
        const climbFrames = simulateClimb(launchVelocity);
        if (climbFrames !== Infinity) comet.life = Math.min(comet.life, climbFrames * 16.7 * 1.8);
        comet.spinRadius = rand(0.32, 0.85);
        comet.sparkFreq = isSmall ? 24 : 16;
        comet.sparkLife = 320;
        comet.sparkLifeVariation = 3;
        if (this.glitter === "willow" || this.fallingLeaves) {
          comet.sparkFreq = 20;
          comet.sparkSpeed = 0.5;
          comet.sparkLife = 500;
        }
        if (this.color === INVISIBLE) comet.sparkColor = COLOR.Gold;
        if (Math.random() > 0.4 && !this.horsetail) {
          comet.secondColor = INVISIBLE;
          comet.transitionTime = Math.pow(Math.random(), 1.5) * 700 + 500;
        }
        comet.onDeath = (c) => this.burst(c.x, c.y);
        if (withSound) sound.playFireworkLaunch();
      }

      burst(x, y) {
        const speed = this.spreadSize / 96;
        let color;
        let onDeath = null;
        let sparkFreq, sparkSpeed, sparkLife;
        let sparkLifeVariation = 0.25;
        let playedDeathSound = false;

        if (this.crossette)
          onDeath = (star) => {
            if (!playedDeathSound) {
              playedDeathSound = true;
              if (withSound) sound.playFireworkCrackle();
            }
            crossetteEffect(star);
          };
        if (this.crackle)
          onDeath = (star) => {
            if (!playedDeathSound) {
              playedDeathSound = true;
              if (withSound) sound.playFireworkCrackle();
            }
            crackleEffect(star);
          };
        if (this.floral) onDeath = floralEffect;
        if (this.fallingLeaves) onDeath = fallingLeavesEffect;

        if (this.glitter === "light") { sparkFreq = 400; sparkSpeed = 0.3; sparkLife = 300; sparkLifeVariation = 2; }
        else if (this.glitter === "medium") { sparkFreq = 200; sparkSpeed = 0.44; sparkLife = 700; sparkLifeVariation = 2; }
        else if (this.glitter === "heavy") { sparkFreq = 80; sparkSpeed = 0.8; sparkLife = 1400; sparkLifeVariation = 2; }
        else if (this.glitter === "thick") { sparkFreq = 16; sparkSpeed = 1.5; sparkLife = 1400; sparkLifeVariation = 3; }
        else if (this.glitter === "streamer") { sparkFreq = 32; sparkSpeed = 1.05; sparkLife = 620; sparkLifeVariation = 2; }
        else if (this.glitter === "willow") { sparkFreq = 120; sparkSpeed = 0.34; sparkLife = 1400; sparkLifeVariation = 3.8; }
        if (sparkFreq) sparkFreq /= qualityScale;

        const starFactory = (angle, speedMult) => {
          const standardInitialSpeed = this.spreadSize / 1800;
          const star = addStar(
            x, y,
            color || randomColor(),
            angle,
            speedMult * speed,
            this.starLife + Math.random() * this.starLife * this.starLifeVariation,
            this.horsetail && this.comet ? this.comet.speedX : 0,
            this.horsetail && this.comet ? this.comet.speedY : -standardInitialSpeed
          );
          if (!star) return;
          if (this.secondColor) {
            star.transitionTime = this.starLife * (Math.random() * 0.05 + 0.32);
            star.secondColor = this.secondColor;
          }
          if (this.strobe) {
            star.transitionTime = this.starLife * (Math.random() * 0.08 + 0.46);
            star.strobe = true;
            star.strobeFreq = Math.random() * 20 + 40;
            if (this.strobeColor) star.secondColor = this.strobeColor;
          }
          star.onDeath = onDeath;
          if (this.glitter) {
            star.sparkFreq = sparkFreq;
            star.sparkSpeed = sparkSpeed;
            star.sparkLife = sparkLife;
            star.sparkLifeVariation = sparkLifeVariation;
            star.sparkColor = this.glitterColor;
            star.sparkTimer = Math.random() * star.sparkFreq;
          }
        };

        if (typeof this.color === "string") {
          color = this.color === "random" ? null : this.color;
          if (this.ring) {
            const ringStartAngle = Math.random() * Math.PI;
            const ringSquash = Math.pow(Math.random(), 2) * 0.85 + 0.15;
            createParticleArc(0, PI_2, this.starCount, 0, (angle) => {
              const ix = Math.sin(angle) * speed * ringSquash;
              const iy = Math.cos(angle) * speed;
              const dist = Math.hypot(ix, iy);
              const newAngle = Math.atan2(ix, iy) + ringStartAngle;
              const star = addStar(x, y, color, newAngle, dist, this.starLife + Math.random() * this.starLife * this.starLifeVariation);
              if (star && this.glitter) {
                star.sparkFreq = sparkFreq;
                star.sparkSpeed = sparkSpeed;
                star.sparkLife = sparkLife;
                star.sparkLifeVariation = sparkLifeVariation;
                star.sparkColor = this.glitterColor;
                star.sparkTimer = Math.random() * star.sparkFreq;
              }
            });
          } else {
            createBurst(this.starCount, starFactory);
          }
        } else if (Array.isArray(this.color)) {
          if (Math.random() < 0.5) {
            const start = Math.random() * Math.PI;
            color = this.color[0];
            createBurst(this.starCount, starFactory, start, Math.PI);
            color = this.color[1];
            createBurst(this.starCount, starFactory, start + Math.PI, Math.PI);
          } else {
            color = this.color[0];
            createBurst(this.starCount / 2, starFactory);
            color = this.color[1];
            createBurst(this.starCount / 2, starFactory);
          }
        }

        if (this.pistil) {
          const inner = new Shell({
            spreadSize: this.spreadSize * 0.5,
            starLife: this.starLife * 0.6,
            starLifeVariation: this.starLifeVariation,
            starDensity: 1.4,
            color: this.pistilColor,
            glitter: "light",
            glitterColor: this.pistilColor === COLOR.Gold ? COLOR.Gold : COLOR.White,
          });
          inner.burst(x, y);
        }

        if (this.streamers) {
          const inner = new Shell({
            spreadSize: this.spreadSize * 0.9,
            starLife: this.starLife * 0.8,
            starLifeVariation: this.starLifeVariation,
            starCount: Math.floor(Math.max(6, this.spreadSize / 45)),
            color: COLOR.White,
            glitter: "streamer",
          });
          inner.burst(x, y);
        }

        flashes.push({ x, y, radius: this.spreadSize / 4 });

        // Only the launched shell booms; pistil/streamer sub-shells don't.
        if (this.comet && withSound) {
          const scale = clamp(0.7 + (this.shellSize / baseSize) * 0.3, 0.7, 1);
          sound.playFireworkBurst(scale, { crackle: Boolean(this.crackle || this.crossette) });
        }
      }
    }

    /* ----- launch positions / sequences (ambient) ----- */
    const fitH = (p) => (1 - 0.36) * p + 0.18;
    const fitV = (p) => p * 0.75;

    function getRandomShellSize() {
      const maxVariance = Math.min(2.5, baseSize);
      const variance = Math.random() * maxVariance;
      const size = baseSize - variance;
      const height = maxVariance === 0 ? Math.random() : 1 - variance / maxVariance;
      const centerOffset = Math.random() * (1 - height * 0.65) * 0.5;
      const x = Math.random() < 0.5 ? 0.5 - centerOffset : 0.5 + centerOffset;
      return { size, x: fitH(x), height: fitV(height) };
    }

    function launchFromFactory(factory, size, x, height) {
      new Shell(factory(size)).launch(x, height);
    }

    function seqRandomShell() {
      const s = getRandomShellSize();
      launchFromFactory(shellTypes[randomShellName()], s.size, s.x, s.height);
      return 900 + Math.random() * 600 + 1200;
    }

    function seqTwoRandom() {
      const a = getRandomShellSize();
      const b = getRandomShellSize();
      launchFromFactory(shellTypes[randomShellName()], a.size, 0.3 + rand(-0.1, 0.1), a.height);
      timers.push(setTimeout(() => launchFromFactory(shellTypes[randomShellName()], b.size, 0.7 + rand(-0.1, 0.1), b.height), 100));
      return 1500 + Math.random() * 600;
    }

    function seqTriple() {
      const factory = randomFastShell();
      const small = Math.max(0, baseSize - 1.25);
      launchFromFactory(factory, baseSize, 0.5 + rand(-0.04, 0.04), 0.7);
      timers.push(setTimeout(() => launchFromFactory(factory, small, 0.2 + rand(-0.04, 0.04), 0.1), 1000 + Math.random() * 400));
      timers.push(setTimeout(() => launchFromFactory(factory, small, 0.8 + rand(-0.04, 0.04), 0.1), 1000 + Math.random() * 400));
      return 4000;
    }

    function seqPyramid() {
      const barrageHalf = stageW > 800 ? 7 : 4;
      const small = Math.max(0, baseSize - 3);
      const main = Math.random() < 0.78 ? shellTypes.Crysanthemum : shellTypes.Ring;
      const launchAt = (x, special, delay) => {
        timers.push(
          setTimeout(() => {
            const factory = special ? shellTypes[randomShellName()] : main;
            const height = x <= 0.5 ? x / 0.5 : (1 - x) / 0.5;
            launchFromFactory(factory, special ? baseSize : small, x, special ? 0.75 : height * 0.42);
          }, delay)
        );
      };
      let delay = 0;
      for (let count = 0; count <= barrageHalf; count++) {
        if (count === barrageHalf) launchAt(0.5, true, delay);
        else {
          const offset = (count / barrageHalf) * 0.5;
          launchAt(offset, false, delay);
          launchAt(1 - offset, false, delay + rand(30, 60));
        }
        delay += 200;
      }
      return 3400 + barrageHalf * 250;
    }

    let isFirstSeq = true;
    function startSequence() {
      if (isFirstSeq) {
        isFirstSeq = false;
        new Shell(crysanthemumShell(baseSize)).launch(0.5, 0.5);
        return 2400;
      }
      const r = Math.random();
      if (r < 0.1) return seqPyramid();
      if (r < 0.6) return seqRandomShell();
      if (r < 0.8) return seqTwoRandom();
      return seqTriple();
    }

    /* ----- celebration volley ----- */
    const timers = [];
    if (mode === "celebration") {
      const volley = [
        { at: 0, x: 0.26, h: 0.62, type: "Crysanthemum" },
        { at: 380, x: 0.74, h: 0.66, type: "Ring" },
        { at: 760, x: 0.5, h: 0.78, type: "Crackle" },
        { at: 1250, x: 0.35, h: 0.55, type: "Strobe" },
        { at: 1450, x: 0.65, h: 0.58, type: "Palm" },
        { at: 2000, x: 0.5, h: 0.72, type: "Crysanthemum" },
      ];
      volley.forEach((v) => {
        timers.push(
          setTimeout(() => launchFromFactory(shellTypes[v.type], baseSize, v.x, v.h), v.at)
        );
      });
    }

    /* ----- simulation ----- */
    let currentFrame = 0;
    let autoLaunchTime = 0;

    function update(frameMs) {
      currentFrame++;
      const timeStep = frameMs; // ms, simSpeed = 1
      const speedScale = frameMs / 16.666;
      const starDrag = Math.pow(1 - (1 - 0.98), speedScale); // 0.98^scale
      const starDragHeavy = Math.pow(0.992, speedScale);
      const sparkDrag = Math.pow(0.9, speedScale);
      const gAcc = (timeStep / 1000) * GRAVITY * speedScale;

      if (mode === "ambient") {
        autoLaunchTime -= timeStep;
        if (autoLaunchTime <= 0) autoLaunchTime = startSequence() * 1.25;
      }

      COLOR_CODES_W_INVIS.forEach((color) => {
        const stars = starActive[color];
        for (let i = stars.length - 1; i >= 0; i--) {
          const star = stars[i];
          if (star.updateFrame === currentFrame) continue;
          star.updateFrame = currentFrame;
          star.life -= timeStep;
          if (star.life <= 0) {
            stars.splice(i, 1);
            returnStar(star);
          } else {
            const burnRate = Math.pow(star.life / star.fullLife, 0.5);
            const burnInverse = 1 - burnRate;
            star.prevX = star.x;
            star.prevY = star.y;
            star.x += star.speedX * speedScale;
            star.y += star.speedY * speedScale;
            if (!star.heavy) {
              star.speedX *= starDrag;
              star.speedY *= starDrag;
            } else {
              star.speedX *= starDragHeavy;
              star.speedY *= starDragHeavy;
            }
            star.speedY += gAcc;

            // Shells burst on reaching their target height (see launch()).
            if (star.isComet && star.y <= star.targetY) {
              stars.splice(i, 1);
              returnStar(star);
              continue;
            }

            if (star.spinRadius) {
              star.spinAngle += star.spinSpeed * speedScale;
              star.x += Math.sin(star.spinAngle) * star.spinRadius * speedScale;
              star.y += Math.cos(star.spinAngle) * star.spinRadius * speedScale;
            }

            if (star.sparkFreq) {
              star.sparkTimer -= timeStep;
              while (star.sparkTimer < 0) {
                star.sparkTimer += star.sparkFreq * 0.75 + star.sparkFreq * burnInverse * 4;
                addSpark(
                  star.x, star.y,
                  star.sparkColor,
                  Math.random() * PI_2,
                  Math.random() * star.sparkSpeed * burnRate,
                  star.sparkLife * 0.8 + Math.random() * star.sparkLifeVariation * star.sparkLife
                );
              }
            }

            if (star.life < star.transitionTime) {
              if (star.secondColor && !star.colorChanged) {
                star.colorChanged = true;
                const old = star.color;
                star.color = star.secondColor;
                stars.splice(i, 1);
                starActive[star.secondColor].push(star);
                if (star.secondColor === INVISIBLE) star.sparkFreq = 0;
                void old;
              }
              if (star.strobe) {
                star.visible = Math.floor(star.life / star.strobeFreq) % 3 === 0;
              }
            }
          }
        }

        const sparks = sparkActive[color];
        for (let i = sparks.length - 1; i >= 0; i--) {
          const spark = sparks[i];
          spark.life -= timeStep;
          if (spark.life <= 0) {
            sparks.splice(i, 1);
            sparkPool.push(spark);
          } else {
            spark.prevX = spark.x;
            spark.prevY = spark.y;
            spark.x += spark.speedX * speedScale;
            spark.y += spark.speedY * speedScale;
            spark.speedX *= sparkDrag;
            spark.speedY *= sparkDrag;
            spark.speedY += gAcc;
          }
        }
      });
    }

    function render() {
      // Trails decay toward transparent (this layer sits over the page's
      // themed background, so fading to black would paint a black box).
      trailsCtx.globalCompositeOperation = "destination-out";
      trailsCtx.fillStyle = "rgba(0, 0, 0, 0.175)";
      trailsCtx.fillRect(0, 0, stageW, stageH);

      mainCtx.clearRect(0, 0, stageW, stageH);

      // Burst flashes on the trails layer.
      trailsCtx.globalCompositeOperation = "source-over";
      while (flashes.length) {
        const f = flashes.pop();
        const g = trailsCtx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        g.addColorStop(0.024, "rgba(255, 255, 255, 1)");
        g.addColorStop(0.125, "rgba(255, 160, 20, 0.2)");
        g.addColorStop(0.32, "rgba(255, 140, 20, 0.11)");
        g.addColorStop(1, "rgba(255, 120, 20, 0)");
        trailsCtx.fillStyle = g;
        trailsCtx.fillRect(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
      }

      trailsCtx.globalCompositeOperation = "lighter";
      trailsCtx.lineWidth = 2.2;
      trailsCtx.lineCap = isSmall ? "square" : "round";
      mainCtx.strokeStyle = "#fff";
      mainCtx.lineWidth = 1;
      mainCtx.beginPath();
      COLOR_CODES.forEach((color) => {
        const stars = starActive[color];
        if (!stars.length) return;
        trailsCtx.strokeStyle = color;
        trailsCtx.beginPath();
        stars.forEach((star) => {
          if (!star.visible) return;
          trailsCtx.moveTo(star.prevX, star.prevY);
          trailsCtx.lineTo(star.x, star.y);
          mainCtx.moveTo(star.x, star.y);
          mainCtx.lineTo(star.x - star.speedX * 1.6, star.y - star.speedY * 1.6);
        });
        trailsCtx.stroke();
      });
      mainCtx.stroke();

      trailsCtx.lineWidth = 1;
      trailsCtx.lineCap = "butt";
      COLOR_CODES.forEach((color) => {
        const sparks = sparkActive[color];
        if (!sparks.length) return;
        trailsCtx.strokeStyle = color;
        trailsCtx.beginPath();
        sparks.forEach((spark) => {
          trailsCtx.moveTo(spark.prevX, spark.prevY);
          trailsCtx.lineTo(spark.x, spark.y);
        });
        trailsCtx.stroke();
      });
    }

    let raf;
    let last = performance.now();
    function frame(now) {
      const dt = clamp(now - last, 0, 50);
      last = now;
      if (dt > 0) {
        update(dt);
        render();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      ro.disconnect();
    };
  }, [mode, withSound, reduced]);

  if (reduced) return null;

  const canvasStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    mixBlendMode: "lighten",
  };
  return (
    <>
      <canvas ref={trailsRef} style={canvasStyle} aria-hidden="true" />
      <canvas ref={mainRef} style={canvasStyle} aria-hidden="true" />
    </>
  );
}
