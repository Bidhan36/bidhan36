(() => {
"use strict";

/* ---------------------------------------------------------------------
   Daphe Sky — a Flappy-style game starring the Himalayan Monal (Daphe),
   Nepal's national bird, flying over the Himalayas and Kathmandu.
   Pure canvas + WebAudio, no external assets, so nothing can fail to load.
--------------------------------------------------------------------- */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const scoreEl = document.getElementById("score");
const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const startBtn = document.getElementById("startBtn");
const retryBtn = document.getElementById("retryBtn");
const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl = document.getElementById("bestScore");
const bestStartEl = document.getElementById("bestStart");
const muteBtn = document.getElementById("muteBtn");

const STORAGE_BEST = "daphe-sky-best";
const STORAGE_MUTE = "daphe-sky-muted";

let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layoutWorld();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 60));

/* ------------------------------- Audio -------------------------------- */

let actx = null;
let muted = localStorage.getItem(STORAGE_MUTE) === "1";
updateMuteIcon();

function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  }
  if (actx && actx.state === "suspended") actx.resume();
}

function tone({ freq = 440, dur = 0.12, type = "sine", vol = 0.2, slideTo = null, delay = 0 }) {
  if (muted || !actx) return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(actx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.15, vol = 0.25, lowpass = 1200 }) {
  if (muted || !actx) return;
  const bufferSize = Math.floor(actx.sampleRate * dur);
  const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = actx.createBufferSource();
  src.buffer = buffer;
  const filter = actx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const gain = actx.createGain();
  gain.gain.setValueAtTime(vol, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  src.connect(filter).connect(gain).connect(actx.destination);
  src.start();
}

const sfx = {
  flap: () => noiseBurst({ dur: 0.14, vol: 0.18, lowpass: 1800 }),
  score: () => { tone({ freq: 880, dur: 0.1, type: "triangle", vol: 0.18 }); tone({ freq: 1320, dur: 0.14, type: "triangle", vol: 0.16, delay: 0.06 }); },
  hit: () => { noiseBurst({ dur: 0.3, vol: 0.3, lowpass: 700 }); tone({ freq: 160, dur: 0.3, type: "sawtooth", vol: 0.2, slideTo: 40 }); },
};

muteBtn.addEventListener("click", () => {
  muted = !muted;
  localStorage.setItem(STORAGE_MUTE, muted ? "1" : "0");
  updateMuteIcon();
});
function updateMuteIcon() { muteBtn.textContent = muted ? "🔇" : "🔊"; }

/* ------------------------------ World ---------------------------------- */

const GRAVITY = 1900;
const FLAP_VELOCITY = -560;
const MAX_FALL = 900;
const BIRD_X_RATIO = 0.3;
const BIRD_RADIUS = 20;
const PIPE_WIDTH = 88;
const PIPE_GAP_BASE = 235;
const PIPE_GAP_MIN = 190;
const SPEED_BASE = 210;
const SPEED_MAX = 340;
const PIPE_INTERVAL_BASE = 1.55;

let groundH = 120;

const State = { START: 0, PLAYING: 1, OVER: 2 };
let state = State.START;

const bird = { x: 0, y: 0, vy: 0, rot: 0, wing: 0 };

let pipes = [];
let particles = [];
let distanceSinceSpawn = 0;
let elapsed = 0;
let score = 0;
let best = parseInt(localStorage.getItem(STORAGE_BEST) || "0", 10);
bestStartEl.textContent = best;

/* Parallax scenery layers, generated once per resize so shapes match canvas size. */
let peaksFar = [], peaksNear = [], skylineBuildings = [], flagPoles = [], clouds = [];

function rand(a, b) { return a + Math.random() * (b - a); }
function seededPeaks(count, baseH, jitter, seedOffset) {
  const pts = [];
  let x = -100;
  for (let i = 0; i < count; i++) {
    const w = rand(140, 260);
    pts.push({ x, w, h: baseH + Math.sin(i * 1.7 + seedOffset) * jitter + rand(-20, 20) });
    x += w * rand(0.55, 0.8);
  }
  return pts;
}

function layoutWorld() {
  groundH = Math.max(90, Math.min(140, H * 0.14));
  bird.x = W * BIRD_X_RATIO;
  if (state === State.START) bird.y = H * 0.42;

  peaksFar = seededPeaks(14, H * 0.34, 40, 1);
  peaksNear = seededPeaks(10, H * 0.22, 30, 5);

  skylineBuildings = [];
  let x = -60;
  let i = 0;
  while (x < W + 400) {
    const w = rand(70, 130);
    const h = rand(60, 150);
    const isPagoda = i % 3 === 0;
    skylineBuildings.push({ x, w, h, isPagoda, tiers: 2 + Math.floor(rand(0, 3)) });
    x += w + rand(6, 20);
    i++;
  }

  flagPoles = [];
  for (let f = 0; f < Math.ceil(W / 260) + 2; f++) {
    flagPoles.push({ x: rand(0, W) + f * 260, h: rand(40, 90), phase: rand(0, Math.PI * 2) });
  }

  if (clouds.length === 0) {
    for (let c = 0; c < 6; c++) {
      clouds.push({ x: rand(0, W), y: rand(H * 0.06, H * 0.32), s: rand(0.6, 1.3), speed: rand(8, 18) });
    }
  }
}

/* ------------------------------ Bird gradient --------------------------- */

function drawDaphe(x, y, rot, wingPhase) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // tail feathers (iridescent copper/teal fan)
  ctx.save();
  ctx.rotate(0.15);
  const tailGrad = ctx.createLinearGradient(-34, 0, -8, 0);
  tailGrad.addColorStop(0, "#7a3ec4");
  tailGrad.addColorStop(0.5, "#2f8f8a");
  tailGrad.addColorStop(1, "#0d5f5c");
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.quadraticCurveTo(-30, -14, -36, -2);
  ctx.quadraticCurveTo(-30, 10, -6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // body
  const bodyGrad = ctx.createRadialGradient(-4, -10, 4, 0, 0, 26);
  bodyGrad.addColorStop(0, "#3fd6c8");
  bodyGrad.addColorStop(0.45, "#2f9fd6");
  bodyGrad.addColorStop(0.8, "#5b3fc9");
  bodyGrad.addColorStop(1, "#402a8a");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  // belly copper patch
  const bellyGrad = ctx.createLinearGradient(0, 4, 14, 16);
  bellyGrad.addColorStop(0, "#e08a3c");
  bellyGrad.addColorStop(1, "#c4531f");
  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(6, 8, 12, 9, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // wing (flap animation)
  const wingLift = Math.sin(wingPhase) * 0.9;
  ctx.save();
  ctx.translate(-2, -2);
  ctx.rotate(-0.4 - wingLift);
  const wingGrad = ctx.createLinearGradient(0, 0, 22, 20);
  wingGrad.addColorStop(0, "#1fb8a8");
  wingGrad.addColorStop(1, "#274fc9");
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(18, -6, 26, 6);
  ctx.quadraticCurveTo(14, 14, 0, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // head
  const headGrad = ctx.createRadialGradient(14, -12, 2, 15, -9, 12);
  headGrad.addColorStop(0, "#3ee0c6");
  headGrad.addColorStop(1, "#1d6fbf");
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(15, -9, 10.5, 0, Math.PI * 2);
  ctx.fill();

  // crest (Monal's signature crown)
  ctx.fillStyle = "#0f9e93";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(11 + i * 3, -20 + Math.abs(i) * 2, 2.4, 6, i * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // beak
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.moveTo(24, -9);
  ctx.lineTo(34, -6);
  ctx.lineTo(24, -3);
  ctx.closePath();
  ctx.fill();

  // eye
  ctx.fillStyle = "#101010";
  ctx.beginPath();
  ctx.arc(18, -11, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(18.8, -11.8, 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ------------------------------ Scenery draw ---------------------------- */

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#ffb457");
  g.addColorStop(0.35, "#ff8f6b");
  g.addColorStop(0.65, "#ef6f9e");
  g.addColorStop(1, "#8a5bc9");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // sun
  const sunX = W * 0.78, sunY = H * 0.22;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
  sunGrad.addColorStop(0, "rgba(255,246,214,0.95)");
  sunGrad.addColorStop(1, "rgba(255,246,214,0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff3d6";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(dt) {
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const c of clouds) {
    c.x -= c.speed * dt;
    if (c.x < -120) c.x = W + 60;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.s, c.s);
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(22, -6, 20, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(-20, -4, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPeakRow(peaks, scrollX, baseY, colorTop, colorBottom, snow) {
  ctx.beginPath();
  ctx.moveTo(-50, baseY);
  for (const p of peaks) {
    const px = ((p.x - scrollX) % (W + 400)) - 200;
    ctx.lineTo(px, baseY - p.h);
    ctx.lineTo(px + p.w, baseY);
  }
  ctx.lineTo(W + 50, baseY);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, baseY - 260, 0, baseY);
  g.addColorStop(0, colorTop);
  g.addColorStop(1, colorBottom);
  ctx.fillStyle = g;
  ctx.fill();

  if (snow) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const p of peaks) {
      const px = ((p.x - scrollX) % (W + 400)) - 200;
      const apexX = px + p.w * 0.5;
      const apexY = baseY - p.h;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(apexX - p.w * 0.16, apexY + p.h * 0.24);
      ctx.lineTo(apexX - p.w * 0.05, apexY + p.h * 0.16);
      ctx.lineTo(apexX + p.w * 0.06, apexY + p.h * 0.27);
      ctx.lineTo(apexX + p.w * 0.17, apexY + p.h * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawSkyline(scrollX, baseY) {
  for (const b of skylineBuildings) {
    const bx = ((b.x - scrollX) % (W + 400)) - 200;
    if (b.isPagoda) {
      drawPagoda(bx, baseY, b.w, b.h, b.tiers);
    } else {
      ctx.fillStyle = "#3a2b55";
      ctx.fillRect(bx, baseY - b.h, b.w, b.h);
      ctx.fillStyle = "rgba(255,214,140,0.5)";
      for (let wy = baseY - b.h + 10; wy < baseY - 8; wy += 16) {
        for (let wx = bx + 8; wx < bx + b.w - 8; wx += 16) {
          if ((Math.floor(wx + wy) % 3) === 0) ctx.fillRect(wx, wy, 6, 8);
        }
      }
    }
  }
}

function drawPagoda(x, baseY, w, h, tiers) {
  const cx = x + w / 2;
  ctx.fillStyle = "#4a3468";
  ctx.fillRect(x + w * 0.3, baseY - h * 0.5, w * 0.4, h * 0.5);
  let tierY = baseY - h * 0.5;
  let tierW = w;
  for (let t = 0; t < tiers; t++) {
    const roofH = h * 0.16;
    ctx.fillStyle = t % 2 === 0 ? "#c0432e" : "#a8351f";
    ctx.beginPath();
    ctx.moveTo(cx - tierW / 2, tierY);
    ctx.lineTo(cx + tierW / 2, tierY);
    ctx.lineTo(cx + tierW / 2 - 8, tierY - roofH);
    ctx.lineTo(cx - tierW / 2 + 8, tierY - roofH);
    ctx.closePath();
    ctx.fill();
    tierY -= roofH + h * 0.12;
    tierW *= 0.72;
  }
  // spire
  ctx.fillStyle = "#e8b923";
  ctx.beginPath();
  ctx.moveTo(cx - 3, tierY + 6);
  ctx.lineTo(cx + 3, tierY + 6);
  ctx.lineTo(cx, tierY - 16);
  ctx.closePath();
  ctx.fill();
}

function drawPrayerFlags(t) {
  ctx.lineWidth = 2;
  const colors = ["#3fa9f5", "#f5f5f5", "#e6483f", "#5cc65c", "#f2c94c"];
  for (const f of flagPoles) {
    const poleTopY = H - groundH - f.h;
    ctx.strokeStyle = "#6b4a2e";
    ctx.beginPath();
    ctx.moveTo(f.x, H - groundH + 4);
    ctx.lineTo(f.x, poleTopY);
    ctx.stroke();

    const span = 90;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(f.x, poleTopY);
    const sagY = poleTopY + 18 + Math.sin(t * 1.2 + f.phase) * 4;
    ctx.quadraticCurveTo(f.x + span / 2, sagY, f.x + span, poleTopY + 6);
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const fx = f.x + (span / 6) * i + 6;
      const along = i / 6;
      const fy = poleTopY + (18 + Math.sin(t * 1.2 + f.phase) * 4) * Math.sin(along * Math.PI) + along * 6;
      const flap = Math.sin(t * 5 + i + f.phase) * 3;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + 7 + flap * 0.3, fy + 9 + flap);
      ctx.lineTo(fx - 7 + flap * 0.3, fy + 9 + flap);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawGround(scrollX) {
  const y = H - groundH;
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, "#3f8f4f");
  g.addColorStop(1, "#215c30");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, groundH);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  const tw = 46;
  const offset = scrollX % tw;
  for (let x = -offset; x < W + tw; x += tw) {
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x + tw / 2, y + 4);
    ctx.lineTo(x + tw, y + 10);
    ctx.lineTo(x + tw, y + 16);
    ctx.lineTo(x, y + 16);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(0, y, W, 4);
}

/* -------------------------------- Pipes --------------------------------- */

function currentGap() {
  const shrink = Math.min(score * 3, PIPE_GAP_BASE - PIPE_GAP_MIN);
  return PIPE_GAP_BASE - shrink;
}
function currentSpeed() {
  return Math.min(SPEED_BASE + score * 4, SPEED_MAX);
}
function currentInterval() {
  return Math.max(1.05, PIPE_INTERVAL_BASE - score * 0.01);
}

function spawnPipe() {
  const gap = currentGap();
  const margin = 70;
  const usable = H - groundH - margin * 2 - gap;
  const gapY = margin + Math.random() * Math.max(40, usable);
  pipes.push({ x: W + PIPE_WIDTH, gapY, gap, passed: false, sway: rand(0, Math.PI * 2) });
}

function drawPillarSegment(x, top, height, flip) {
  const w = PIPE_WIDTH;
  const woodGrad = ctx.createLinearGradient(x, 0, x + w, 0);
  woodGrad.addColorStop(0, "#8a5a2e");
  woodGrad.addColorStop(0.5, "#b9793f");
  woodGrad.addColorStop(1, "#7a4d26");
  ctx.fillStyle = woodGrad;
  ctx.fillRect(x, top, w, height);

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 3;
  for (let ring = 1; ring < height / 34; ring++) {
    const ry = top + ring * 34;
    ctx.beginPath();
    ctx.moveTo(x + 4, ry);
    ctx.lineTo(x + w - 4, ry);
    ctx.stroke();
  }

  // cap
  const capY = flip ? top + height - 16 : top;
  ctx.fillStyle = "#c0432e";
  ctx.fillRect(x - 6, capY, w + 12, 16);
  ctx.fillStyle = "#e8b923";
  ctx.fillRect(x - 6, capY + (flip ? 0 : 12), w + 12, 4);

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 8, top);
  ctx.lineTo(x + 8, top + height);
  ctx.stroke();
}

function drawPipes(t) {
  for (const p of pipes) {
    const topH = p.gapY;
    const botY = p.gapY + p.gap;
    const botH = H - groundH - botY;
    drawPillarSegment(p.x, 0, topH, false);
    drawPillarSegment(p.x, botY, botH, true);

    // hanging flag between pillars for flavour
    const flap = Math.sin(t * 4 + p.sway) * 4;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(p.x + 10, topH);
    ctx.lineTo(p.x + PIPE_WIDTH - 10, topH);
    ctx.stroke();
    const colors = ["#3fa9f5", "#e6483f", "#5cc65c", "#f2c94c"];
    for (let i = 0; i < 3; i++) {
      const fx = p.x + 14 + i * ((PIPE_WIDTH - 28) / 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(fx, topH);
      ctx.lineTo(fx + 6 + flap * 0.2, topH + 10 + flap);
      ctx.lineTo(fx - 6 + flap * 0.2, topH + 10 + flap);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/* ------------------------------ Particles -------------------------------- */

function spawnFeather(x, y) {
  particles.push({ x, y, vx: rand(-60, -20), vy: rand(-40, 40), life: 0.9, rot: rand(0, Math.PI * 2), spin: rand(-4, 4) });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt + 40 * dt;
    p.rot += p.spin * dt;
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = "#2f9fd6";
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* -------------------------------- Game flow ------------------------------ */

function resetGame() {
  bird.x = W * BIRD_X_RATIO;
  bird.y = H * 0.42;
  bird.vy = 0;
  bird.rot = 0;
  bird.wing = 0;
  pipes = [];
  particles = [];
  distanceSinceSpawn = 0;
  elapsed = 0;
  score = 0;
  scoreEl.textContent = "0";
}

function flap() {
  ensureAudio();
  if (state === State.START) {
    startGame();
    return;
  }
  if (state === State.OVER) return;
  bird.vy = FLAP_VELOCITY;
  sfx.flap();
  spawnFeather(bird.x - 14, bird.y + 6);
}

function startGame() {
  resetGame();
  state = State.PLAYING;
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  bird.vy = FLAP_VELOCITY * 0.7;
}

function endGame() {
  if (state === State.OVER) return;
  state = State.OVER;
  sfx.hit();
  if (score > best) {
    best = score;
    localStorage.setItem(STORAGE_BEST, String(best));
  }
  finalScoreEl.textContent = String(score);
  bestScoreEl.textContent = String(best);
  setTimeout(() => gameOverScreen.classList.remove("hidden"), 420);
}

function rectCircleCollide(cx, cy, r, rx, ry, rw, rh) {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX, dy = cy - nearestY;
  return (dx * dx + dy * dy) < r * r;
}

function update(dt) {
  if (state !== State.PLAYING) return;
  elapsed += dt;

  bird.vy += GRAVITY * dt;
  if (bird.vy > MAX_FALL) bird.vy = MAX_FALL;
  bird.y += bird.vy * dt;

  const targetRot = Math.max(-0.5, Math.min(1.3, bird.vy / 600));
  bird.rot += (targetRot - bird.rot) * Math.min(1, dt * 10);
  bird.wing += dt * 14;

  const speed = currentSpeed();
  distanceSinceSpawn += speed * dt;
  const spawnDist = currentInterval() * speed;
  if (distanceSinceSpawn >= spawnDist) {
    distanceSinceSpawn = 0;
    spawnPipe();
  }

  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    p.x -= speed * dt;

    if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
      p.passed = true;
      score++;
      scoreEl.textContent = String(score);
      sfx.score();
    }

    if (p.x < -PIPE_WIDTH - 10) {
      pipes.splice(i, 1);
      continue;
    }

    if (
      bird.x + BIRD_RADIUS * 0.55 > p.x &&
      bird.x - BIRD_RADIUS * 0.55 < p.x + PIPE_WIDTH
    ) {
      const hitR = BIRD_RADIUS * 0.62;
      if (
        rectCircleCollide(bird.x, bird.y, hitR, p.x, 0, PIPE_WIDTH, p.gapY) ||
        rectCircleCollide(bird.x, bird.y, hitR, p.x, p.gapY + p.gap, PIPE_WIDTH, H)
      ) {
        endGame();
      }
    }
  }

  if (bird.y + BIRD_RADIUS * 0.6 > H - groundH) {
    bird.y = H - groundH - BIRD_RADIUS * 0.6;
    endGame();
  }
  if (bird.y - BIRD_RADIUS * 0.6 < 0) {
    bird.y = BIRD_RADIUS * 0.6;
    bird.vy = 0;
  }

  updateParticles(dt);
}

function render(dt) {
  drawSky();

  const running = state === State.PLAYING || state === State.OVER;
  const buildingScroll = running ? worldScroll * 0.5 : elapsed * 20;
  const groundScroll = running ? worldScroll : elapsed * 60;

  drawPeakRow(peaksFar, elapsed * 12, H - groundH - H * 0.02, "#c98bd6", "#7a5bc9", true);
  drawPeakRow(peaksNear, elapsed * 28, H - groundH + 6, "#b06fb0", "#5b3f8f", false);
  drawClouds(dt);
  drawSkyline(buildingScroll, H - groundH + 4);
  drawPrayerFlags(elapsed);
  if (running) drawPipes(elapsed);
  drawGround(groundScroll);
  drawParticles();

  const wingPhase = state === State.PLAYING ? bird.wing : Math.sin(elapsed * 3) * 1;
  const bobY = state === State.START ? Math.sin(elapsed * 2.4) * 8 : 0;
  drawDaphe(bird.x, bird.y + bobY, bird.rot, wingPhase);
}

let worldScroll = 0;

let lastTime = performance.now();
function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05; // clamp huge gaps (tab switch) to avoid tunneling

  if (state === State.PLAYING) worldScroll += currentSpeed() * dt;

  update(dt);
  render(dt);
  requestAnimationFrame(loop);
}

/* -------------------------------- Input ----------------------------------- */

function onPointerDown(e) {
  e.preventDefault();
  flap();
}
canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    flap();
  }
});
startBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); flap(); });
retryBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ensureAudio();
  startGame();
});

/* -------------------------------- Boot ------------------------------------ */

resize();
requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(loop); });
})();
