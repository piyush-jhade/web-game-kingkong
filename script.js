/* ============================================================
   KING KONG RAMPAGE – script.js
   Endless runner: burning city background, King Kong chaser,
   random instant speed boost / slowdown pickups on the road.
   ============================================================ */

// ─── Canvas Setup ────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', () => {
  resizeCanvas();
  initBackground(); // rebuild background layers on resize
});

// ─── Game Constants ──────────────────────────────────────────
const GROUND_RATIO   = 0.72;   // ground y as fraction of canvas height
const PLAYER_W       = 28;
const PLAYER_H       = 52;
const GRAVITY        = 0.55;
const JUMP_FORCE     = -14;
const SLIDE_DURATION = 600;    // ms

const BASE_SPEED     = 5;      // starting scroll speed
const MAX_SPEED      = 20;
const SPEED_INC      = 0.0007; // gentle natural increase per frame

// Random speed event constants
const BOOST_AMOUNT   = 5;      // +speed units instantly
const SLOW_AMOUNT    = 4;      // -speed units instantly
const EFFECT_DURATION = 2000;  // ms – how long the HUD label shows

// ─── Game State ──────────────────────────────────────────────
let state     = 'idle';   // 'idle' | 'playing' | 'dead'
let score     = 0;
let bestScore = 0;
let speed     = BASE_SPEED;
// naturalBase tracks the gradually increasing base speed separately
// so boost/slow changes don't get overwritten by the formula each frame
let naturalBase = BASE_SPEED;
let frameCount = 0;
let lastTime   = 0;
let animId;

// Speed effect label (boost / slow)
let effectLabel    = '';
let effectTimer    = 0;
let effectColor    = '#fff';

// Obstacle hit stun – when player hits something, they stagger
// Kong lunges forward during this window
let stunTimer     = 0;       // counts down in ms
const STUN_DURATION = 1200;  // ms player is stunned after obstacle hit
let kongLunging   = false;   // true while Kong is closing the gap after hit

// ─── Player ──────────────────────────────────────────────────
const player = {
  x: 0, y: 0,
  vy: 0,
  isOnGround: true,
  isSliding: false,
  slideTimer: 0,
  jumpsLeft: 2,
};

function playerRect() {
  const gY = groundY();
  if (player.isSliding) {
    return { x: player.x, y: gY - 20, w: PLAYER_W + 12, h: 20 };
  }
  return { x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H };
}
function groundY() { return canvas.height * GROUND_RATIO; }

// ─── Obstacles ───────────────────────────────────────────────
let obstacles    = [];
let obstacleTimer = 0;
function obstacleInterval() {
  return Math.max(38, 108 - speed * 3.8);
}

function spawnObstacle() {
  const gY = groundY();
  const types = ['car','car','barrier','barrier','hole'];
  const type  = types[Math.floor(Math.random() * types.length)];

  if (type === 'car') {
    obstacles.push({ type:'car', x: canvas.width + 20,
      y: gY - 38, w: 70, h: 38 });
  } else if (type === 'barrier') {
    const tall = Math.random() > 0.5;
    obstacles.push({ type:'barrier', x: canvas.width + 20,
      y: tall ? gY - 70 : gY - 32,
      w: 18, h: tall ? 70 : 32 });
  } else {
    obstacles.push({ type:'hole', x: canvas.width + 20,
      y: gY, w: 80 + Math.random() * 60, h: canvas.height });
  }
}

// ─── Speed Pickups (boost ⚡ or slow ❄) ──────────────────────
let pickups      = [];
let pickupTimer  = 0;
// Spawn a pickup every 3-7 seconds roughly
function pickupInterval() { return 180 + Math.floor(Math.random() * 240); }
let nextPickupIn = pickupInterval();

function spawnPickup() {
  const gY = groundY();
  const isBoost = Math.random() > 0.45; // slightly more boosts than slows
  pickups.push({
    type:   isBoost ? 'boost' : 'slow',
    x:      canvas.width + 30,
    y:      gY - 36,
    w:      28, h: 28,
    pulse:  0,   // animation counter
  });
}

// ─── Background System ───────────────────────────────────────
// Three layers: far buildings, mid buildings, foreground rubble
let bgFar   = [];  // distant silhouettes
let bgMid   = [];  // mid-distance burning buildings
let bgDebris = []; // falling debris / ash particles

// Fire particles on buildings
let fireParticles = [];

// Lightning bolts
let lightnings = [];
let lightningTimer = 0;

// Smoke clouds scrolling
let smokeClouds = [];

function initBackground() {
  bgFar    = [];
  bgMid    = [];
  bgDebris = [];
  smokeClouds = [];
  fireParticles = [];
  lightnings = [];

  // Far buildings
  for (let i = 0; i < 22; i++) {
    bgFar.push(makeFarBuilding(Math.random() * canvas.width));
  }
  // Mid buildings
  for (let i = 0; i < 16; i++) {
    bgMid.push(makeMidBuilding(Math.random() * canvas.width));
  }
  // Initial smoke
  for (let i = 0; i < 12; i++) {
    smokeClouds.push(makeSmoke(Math.random() * canvas.width,
      groundY() * (0.1 + Math.random() * 0.5)));
  }
}

function makeFarBuilding(x) {
  const gY = groundY();
  const w  = 30 + Math.random() * 80;
  const h  = 60 + Math.random() * (gY * 0.65);
  return {
    x, w, h,
    // Some buildings are already partially collapsed (random top shape)
    crumble: Math.random() > 0.55,
    crumbleOffset: Math.random() * 20,
    color: `hsl(${15 + Math.random()*20},${20 + Math.random()*15}%,${7 + Math.random()*8}%)`,
    fireX: Math.random() * w,
    hasFire: Math.random() > 0.4,
    speed: 0.25,
  };
}

function makeMidBuilding(x) {
  const gY = groundY();
  const w  = 50 + Math.random() * 110;
  const h  = 80 + Math.random() * (gY * 0.78);
  return {
    x, w, h,
    crumble: Math.random() > 0.4,
    crumbleOffset: 5 + Math.random() * 30,
    color: `hsl(${20 + Math.random()*25},${25 + Math.random()*20}%,${10 + Math.random()*10}%)`,
    hasFire: Math.random() > 0.3,
    fireX: w * 0.2 + Math.random() * w * 0.6,
    speed: 0.55,
    windows: makeBuildingWindows(w, h),
    // Some mid buildings are tilting
    tilt: (Math.random() - 0.5) * 0.06,
  };
}

function makeBuildingWindows(bw, bh) {
  const wins = [];
  const cols = Math.floor(bw / 14);
  const rows = Math.floor(bh / 20);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.5) {
        wins.push({
          cx: 7 + c * 14,
          cy: bh - 14 - r * 20,
          // Burning windows flicker orange/yellow
          lit: Math.random() > 0.3,
          fireWin: Math.random() > 0.6,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  return wins;
}

function makeSmoke(x, y) {
  return {
    x, y,
    r:     20 + Math.random() * 50,
    alpha: 0.05 + Math.random() * 0.18,
    drift: (Math.random() - 0.5) * 0.4,
    rise:  0.3 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
  };
}

// ─── Debris particles (falling bricks / embers) ───────────────
function spawnDebris() {
  const gY = groundY();
  for (let i = 0; i < 2; i++) {
    bgDebris.push({
      x:     Math.random() * canvas.width,
      y:     -10,
      vx:    (Math.random() - 0.5) * 2 - speed * 0.1,
      vy:    1 + Math.random() * 3,
      size:  2 + Math.random() * 5,
      rot:   Math.random() * Math.PI * 2,
      rotV:  (Math.random() - 0.5) * 0.2,
      type:  Math.random() > 0.5 ? 'brick' : 'ember',
      alpha: 0.7 + Math.random() * 0.3,
      life:  1,
    });
  }
}

// ─── Lightning ────────────────────────────────────────────────
function spawnLightning() {
  const x = canvas.width * (0.2 + Math.random() * 0.6);
  const segs = [];
  let cx = x, cy = 0;
  while (cy < groundY() * 0.85) {
    const nx = cx + (Math.random() - 0.5) * 80;
    const ny = cy + 30 + Math.random() * 50;
    segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
    cx = nx; cy = ny;
  }
  lightnings.push({ segs, life: 1, alpha: 1 });
}

// ─── King Kong ────────────────────────────────────────────────
const kong = {
  x: -320,
  chestBeatPhase: 0,
  roarTimer: 0,
};

// ─── Particles (player dust / hit sparks) ────────────────────
let particles = [];
function addDustParticles() {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: player.x + Math.random() * PLAYER_W,
      y: groundY(),
      vx: -speed * 0.25 - Math.random() * 2,
      vy: -Math.random() * 2,
      life: 1,
      size: 3 + Math.random() * 4,
    });
  }
}

// ─── Screen shake ─────────────────────────────────────────────
let shakeFrames = 0, shakeAmp = 0;

// ─── Stars / embers in sky ────────────────────────────────────
let stars = [];
function initStars() {
  stars = [];
  for (let i = 0; i < 100; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * groundY() * 0.6,
      r: 0.5 + Math.random() * 1.5,
      spd: 0.04 + Math.random() * 0.15,
      ember: Math.random() > 0.65,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

// ─── Audio ───────────────────────────────────────────────────
let audioCtx;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playTone(freq, type = 'square', dur = 0.08, vol = 0.08) {
  try {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.value = vol;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}
function sfxJump()   { playTone(350, 'sine',    0.12, 0.10); }
function sfxSlide()  { playTone(160, 'sawtooth', 0.09, 0.06); }
function sfxHit()    { playTone(70,  'sawtooth', 0.30, 0.15); }
function sfxStomp()  { playTone(48,  'sine',     0.25, 0.12); }
function sfxBoost()  {
  playTone(520, 'square', 0.05, 0.07);
  setTimeout(() => playTone(660, 'square', 0.08, 0.07), 60);
  setTimeout(() => playTone(880, 'sine',   0.10, 0.08), 130);
}
function sfxSlow()   {
  playTone(300, 'sawtooth', 0.05, 0.07);
  setTimeout(() => playTone(200, 'sawtooth', 0.08, 0.07), 70);
  setTimeout(() => playTone(120, 'sine',     0.12, 0.08), 150);
}

// ─── Input ───────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (state !== 'playing') return;
  if (['Space','ArrowUp','KeyW'].includes(e.code)) doJump();
  if (['ArrowDown','KeyS'].includes(e.code))       doSlide();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state !== 'playing') return;
  const t = e.changedTouches[0];
  if (t.clientY < canvas.height / 2) doJump(); else doSlide();
}, { passive: false });

function doJump() {
  if (player.jumpsLeft > 0) {
    player.vy         = JUMP_FORCE * (player.jumpsLeft === 2 ? 1 : 0.85);
    player.isOnGround = false;
    player.isSliding  = false;
    player.jumpsLeft--;
    sfxJump();
  }
}
function doSlide() {
  if (player.isOnGround && !player.isSliding) {
    player.isSliding  = true;
    player.slideTimer = SLIDE_DURATION;
    sfxSlide();
  }
}

// ─── Lifecycle ───────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

function startGame() {
  document.getElementById('ui-overlay').classList.remove('visible');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  score         = 0;
  speed         = BASE_SPEED;
  naturalBase   = BASE_SPEED;
  frameCount    = 0;
  obstacles     = [];
  obstacleTimer = 0;
  pickups       = [];
  pickupTimer   = 0;
  nextPickupIn  = pickupInterval();
  particles     = [];
  shakeFrames   = 0;
  effectLabel   = '';
  effectTimer   = 0;
  stunTimer     = 0;
  kongLunging   = false;

  const gY = groundY();
  player.x          = canvas.width * 0.18;
  player.y          = gY - PLAYER_H;
  player.vy         = 0;
  player.isOnGround = true;
  player.isSliding  = false;
  player.slideTimer = 0;
  player.jumpsLeft  = 2;

  kong.x            = -320;
  kong.chestBeatPhase = 0;

  initBackground();
  initStars();

  state    = 'playing';
  if (animId) cancelAnimationFrame(animId);
  lastTime = performance.now();
  animId   = requestAnimationFrame(loop);
}

function gameOver() {
  state = 'dead';
  sfxHit();
  shakeFrames = 35; shakeAmp = 16;

  const sc = Math.floor(score);
  if (sc > bestScore) bestScore = sc;

  document.getElementById('final-score').textContent = sc + ' m';
  const bEl = document.getElementById('best-score-display');
  bEl.textContent = sc > 0 && sc === bestScore ? '★ NEW BEST!' : `Best: ${bestScore} m`;

  setTimeout(() => {
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('ui-overlay').classList.add('visible');
  }, 700);
}

// ─── Game Loop ───────────────────────────────────────────────
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 16.67, 3);
  lastTime = timestamp;
  update(dt);
  draw();
  animId = requestAnimationFrame(loop);
}

// ─── Update ──────────────────────────────────────────────────
function update(dt) {
  if (state !== 'playing') return;
  frameCount++;
  const gY = groundY();

  // ── Natural speed increase ──
  // naturalBase is the slowly increasing floor; speed can be above/below it
  // due to pickups, but it always drifts back toward naturalBase over time
  naturalBase = Math.min(BASE_SPEED + frameCount * SPEED_INC, MAX_SPEED);
  // Gently nudge speed back toward naturalBase (so boosts/slows fade back naturally)
  if (stunTimer <= 0) {
    speed += (naturalBase - speed) * 0.012 * dt;
    speed  = Math.max(BASE_SPEED * 0.4, Math.min(speed, MAX_SPEED));
  }

  // ── Score ──
  score += speed * 0.02 * dt;
  document.getElementById('score-val').textContent = Math.floor(score);
  document.getElementById('speed-val').textContent = (speed / BASE_SPEED).toFixed(1);

  // ── Effect label fade ──
  if (effectTimer > 0) {
    effectTimer -= 16.67 * dt;
    const el = document.getElementById('effect-display');
    el.textContent  = effectLabel;
    el.style.color  = effectColor;
    el.style.textShadow = `0 0 12px ${effectColor}`;
    el.style.opacity = Math.min(1, effectTimer / 400).toFixed(2);
  } else {
    document.getElementById('effect-display').textContent = '';
  }

  // ── Player physics ──
  if (!player.isSliding) {
    player.vy += GRAVITY * dt;
    player.y  += player.vy * dt;
  }
  if (player.y + PLAYER_H >= gY) {
    player.y = gY - PLAYER_H;
    player.vy = 0;
    player.isOnGround = true;
    player.jumpsLeft  = 2;
  } else {
    player.isOnGround = false;
  }
  if (player.isSliding) {
    player.slideTimer -= 16.67 * dt;
    if (player.slideTimer <= 0) player.isSliding = false;
  }
  if (player.isOnGround && frameCount % 4 === 0) addDustParticles();

  // ── Obstacles ──
  obstacleTimer++;
  if (obstacleTimer >= obstacleInterval()) {
    spawnObstacle(); obstacleTimer = 0;
  }
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= speed * dt;
    if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
  }

  // ── Speed Pickups ──
  pickupTimer++;
  if (pickupTimer >= nextPickupIn) {
    spawnPickup();
    pickupTimer  = 0;
    nextPickupIn = pickupInterval();
  }
  const pr = playerRect();
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.x     -= speed * dt;
    pk.pulse += 0.1 * dt;
    if (pk.x + pk.w < 0) { pickups.splice(i, 1); continue; }

    // Collect pickup
    if (rectsOverlap(pr, pk)) {
      if (pk.type === 'boost') {
        // Instant speed spike on top of whatever speed currently is
        speed        = Math.min(speed + BOOST_AMOUNT, MAX_SPEED);
        effectLabel  = '⚡ SPEED BOOST!';
        effectTimer  = EFFECT_DURATION;
        effectColor  = '#ffe066';
        sfxBoost();
        shakeFrames  = 6; shakeAmp = 4;
      } else {
        // Instant speed drop — floor at 40% of base so game stays playable
        speed        = Math.max(speed - SLOW_AMOUNT, BASE_SPEED * 0.5);
        effectLabel  = '❄ SLOWDOWN!';
        effectTimer  = EFFECT_DURATION;
        effectColor  = '#00cfff';
        sfxSlow();
      }
      pickups.splice(i, 1);
    }
  }

  // ── Collision with obstacles ──
  // Holes = instant death (you fall in). Cars/barriers = stun + Kong lunge.
  for (const obs of obstacles) {
    if (obs.type === 'hole') {
      const footX = player.x + PLAYER_W / 2;
      if (footX > obs.x && footX < obs.x + obs.w && player.y + PLAYER_H > gY - 2) {
        gameOver(); return;
      }
    } else if (obs.type !== 'hole' && rectsOverlap(pr, obs) && stunTimer <= 0) {
      // HIT! Stun the player — slow them down instantly
      stunTimer   = STUN_DURATION;
      kongLunging = true;
      // Speed drops hard on impact — player staggers
      speed       = Math.max(speed * 0.3, BASE_SPEED * 0.4);
      // Knock player upward slightly (stumble effect)
      player.vy   = JUMP_FORCE * 0.45;
      player.isOnGround = false;
      // Big screen shake
      shakeFrames = 18; shakeAmp = 12;
      sfxHit();
      // Show stun effect label
      effectLabel = '💥 STUMBLED!';
      effectTimer = STUN_DURATION;
      effectColor = '#ff4400';
      // Remove the obstacle so player passes through after hit
      obstacles.splice(obstacles.indexOf(obs), 1);
      break;
    }
  }

  // ── Stun timer countdown ──
  if (stunTimer > 0) {
    stunTimer -= 16.67 * dt;
    if (stunTimer <= 0) {
      stunTimer   = 0;
      kongLunging = false;
    }
  }

  // ── King Kong chase ──
  kong.chestBeatPhase += 0.08 * dt;
  const targetX = player.x - canvas.width * 0.28;

  if (kongLunging) {
    // Kong SPRINTS toward player after they hit an obstacle
    // Much faster catch-up — will reach player if stun lasts too long
    kong.x += (speed * 1.8 + 6) * dt;
  } else {
    // Normal steady chase
    const catchSpeed = speed * 0.52 * dt;
    if (kong.x < targetX)           kong.x += catchSpeed;
    else if (kong.x > targetX + 20) kong.x -= catchSpeed * 0.25;
  }

  // Kong reaches player → game over
  if (kong.x + 110 >= player.x + 8) { gameOver(); return; }

  // Stomp shake
  if (frameCount % Math.max(22, Math.floor(75 - speed * 1.8)) === 0) {
    shakeFrames = 7; shakeAmp = Math.min(3 + speed * 0.35, 9);
    sfxStomp();
  }

  // ── Background updates ──

  // Scroll far buildings
  for (let i = bgFar.length - 1; i >= 0; i--) {
    bgFar[i].x -= bgFar[i].speed * speed * 0.3 * dt;
    if (bgFar[i].x + bgFar[i].w < 0) {
      bgFar.splice(i, 1);
      bgFar.push(makeFarBuilding(canvas.width + Math.random() * 60));
    }
  }
  // Scroll mid buildings
  for (let i = bgMid.length - 1; i >= 0; i--) {
    bgMid[i].x -= bgMid[i].speed * speed * 0.48 * dt;
    if (bgMid[i].x + bgMid[i].w < 0) {
      bgMid.splice(i, 1);
      bgMid.push(makeMidBuilding(canvas.width + Math.random() * 80));
    }
  }

  // Fire particles
  if (frameCount % 2 === 0) {
    // Spawn fire on burning buildings
    for (const b of bgMid) {
      if (b.hasFire && Math.random() > 0.6) {
        fireParticles.push({
          x:    b.x + b.fireX + (Math.random()-0.5) * 20,
          y:    groundY() - b.h + (Math.random() * b.h * 0.3),
          vx:   (Math.random()-0.5) * 1.5,
          vy:   -(1.5 + Math.random() * 3),
          life: 1,
          size: 4 + Math.random() * 12,
          hue:  20 + Math.random() * 40,
        });
      }
    }
  }
  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const fp = fireParticles[i];
    fp.x    += fp.vx * dt;
    fp.y    += fp.vy * dt;
    fp.vy   -= 0.04 * dt; // rise
    fp.life -= 0.025 * dt;
    if (fp.life <= 0) fireParticles.splice(i, 1);
  }
  // Cap fire particles
  if (fireParticles.length > 400) fireParticles.splice(0, 50);

  // Debris
  if (frameCount % 8 === 0) spawnDebris();
  for (let i = bgDebris.length - 1; i >= 0; i--) {
    const d = bgDebris[i];
    d.x   += d.vx * dt;
    d.y   += d.vy * dt;
    d.vy  += 0.08 * dt;
    d.rot += d.rotV * dt;
    d.life -= 0.005 * dt;
    if (d.y > canvas.height + 20 || d.life <= 0) bgDebris.splice(i, 1);
  }

  // Smoke
  for (let i = smokeClouds.length - 1; i >= 0; i--) {
    const s = smokeClouds[i];
    s.x    -= (s.drift + speed * 0.4) * dt;
    s.y    -= s.rise * dt;
    s.phase += 0.012 * dt;
    s.r    += 0.06 * dt;
    s.alpha -= 0.0003 * dt;
    if (s.x + s.r < 0 || s.alpha <= 0 || s.y < -s.r * 2) {
      smokeClouds.splice(i, 1);
      smokeClouds.push(makeSmoke(canvas.width + Math.random() * 100,
        groundY() * (0.1 + Math.random() * 0.55)));
    }
  }

  // Lightning
  lightningTimer += dt;
  if (lightningTimer > 80 + Math.random() * 200) {
    spawnLightning();
    lightningTimer = 0;
  }
  for (let i = lightnings.length - 1; i >= 0; i--) {
    lightnings[i].life -= 0.08 * dt;
    if (lightnings[i].life <= 0) lightnings.splice(i, 1);
  }

  // Stars/embers
  for (const s of stars) {
    s.x    -= s.spd * speed * dt;
    s.phase += 0.04 * dt;
    if (s.x < 0) s.x = canvas.width;
  }

  // Player particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x   += p.vx * dt;
    p.y   += p.vy * dt;
    p.life -= 0.05 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Shake decay
  if (shakeFrames > 0) shakeFrames--;
}

// ─── Draw ─────────────────────────────────────────────────────
function draw() {
  const W  = canvas.width;
  const H  = canvas.height;
  const gY = groundY();

  ctx.save();

  // Screen shake
  if (shakeFrames > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmp,
      (Math.random() - 0.5) * shakeAmp
    );
  }

  // ── Sky – dark smoke-choked night ──
  const sky = ctx.createLinearGradient(0, 0, 0, gY);
  sky.addColorStop(0,   '#0d0003');
  sky.addColorStop(0.4, '#1a0508');
  sky.addColorStop(0.8, '#2a1005');
  sky.addColorStop(1,   '#3d1a00');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // ── Stars / embers in sky ──
  for (const s of stars) {
    if (s.ember) {
      // Glowing orange embers
      const flicker = 0.4 + 0.6 * Math.abs(Math.sin(s.phase));
      ctx.globalAlpha = flicker * 0.9;
      ctx.fillStyle   = `hsl(${20 + Math.random()*30},100%,60%)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(s.phase);
      ctx.fillStyle   = '#ffeedd';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ── Lightning bolts ──
  for (const lt of lightnings) {
    ctx.globalAlpha = lt.life * 0.9;
    ctx.strokeStyle = `rgba(200,210,255,${lt.life})`;
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#aaccff';
    ctx.shadowBlur  = 20;
    for (const seg of lt.segs) {
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // ── Far buildings ──
  for (const b of bgFar) drawFarBuilding(b, gY);

  // ── Fire particles (behind mid buildings) ──
  drawFireParticles();

  // ── Mid buildings ──
  for (const b of bgMid) drawMidBuilding(b, gY);

  // ── Smoke clouds ──
  for (const s of smokeClouds) {
    ctx.globalAlpha = s.alpha;
    const sGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    sGrad.addColorStop(0,   'rgba(60,40,30,0.9)');
    sGrad.addColorStop(0.6, 'rgba(40,25,20,0.5)');
    sGrad.addColorStop(1,   'rgba(20,10,5,0)');
    ctx.fillStyle = sGrad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── King Kong ──
  drawKingKong(kong.x, gY);

  // ── Ground – cracked, glowing road ──
  // Dark asphalt
  ctx.fillStyle = '#0e0a05';
  ctx.fillRect(0, gY, W, H - gY);

  // Cracks / glowing lava lines in road
  ctx.strokeStyle = 'rgba(255,80,0,0.4)';
  ctx.lineWidth   = 2;
  for (let cx = (-(frameCount * speed * 0.5) % 120); cx < W; cx += 120) {
    ctx.beginPath();
    ctx.moveTo(cx, gY + 5);
    ctx.lineTo(cx + 40, gY + 20);
    ctx.lineTo(cx + 70, gY + 8);
    ctx.stroke();
  }

  // Road lane lines (red-tinted)
  ctx.strokeStyle = 'rgba(255,80,0,0.3)';
  ctx.lineWidth = 3;
  ctx.setLineDash([40, 30]);
  ctx.lineDashOffset = -(frameCount * 0.5 * speed) % 70;
  ctx.beginPath(); ctx.moveTo(0, gY + 18); ctx.lineTo(W, gY + 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, gY + 36); ctx.lineTo(W, gY + 36); ctx.stroke();
  ctx.setLineDash([]);

  // Ground edge glow (orange/fire)
  const roadGlow = ctx.createLinearGradient(0, gY - 3, 0, gY + 12);
  roadGlow.addColorStop(0, 'rgba(255,100,0,0.5)');
  roadGlow.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = roadGlow;
  ctx.fillRect(0, gY - 3, W, 15);

  // ── Obstacles ──
  for (const obs of obstacles) drawObstacle(obs, gY);

  // ── Speed Pickups ──
  for (const pk of pickups) drawPickup(pk);

  // ── Dust particles ──
  for (const p of particles) {
    ctx.globalAlpha = p.life * 0.5;
    ctx.fillStyle   = '#ff9944';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Player ──
  drawPlayer(gY);

  // Stun flash – red overlay on player when stumbling
  if (stunTimer > 0) {
    const stunAlpha = (Math.sin(frameCount * 0.6) * 0.5 + 0.5) * 0.55 * (stunTimer / STUN_DURATION);
    const pr2 = playerRect();
    ctx.globalAlpha = stunAlpha;
    ctx.fillStyle   = '#ff2200';
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur  = 18;
    ctx.fillRect(pr2.x - 4, pr2.y - 4, pr2.w + 8, pr2.h + 8);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // ── Falling debris / embers ──
  for (const d of bgDebris) {
    ctx.save();
    ctx.globalAlpha = d.life * d.alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    if (d.type === 'brick') {
      ctx.fillStyle = `hsl(${15 + Math.random()*10},50%,35%)`;
      ctx.fillRect(-d.size / 2, -d.size / 3, d.size, d.size * 0.6);
    } else {
      // Ember
      ctx.fillStyle = `hsl(${20 + Math.random()*30},100%,60%)`;
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // ── Kong danger vignette (red on left) ──
  const proximity = Math.max(0, 1 - (player.x - kong.x - 200) / (canvas.width * 0.45));
  if (proximity > 0.3) {
    const iv = (proximity - 0.3) / 0.7;
    const vig = ctx.createLinearGradient(0, 0, W * 0.4, 0);
    vig.addColorStop(0, `rgba(200,50,0,${0.3 * iv})`);
    vig.addColorStop(1, 'rgba(200,50,0,0)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

// ─── Draw: Far Building ───────────────────────────────────────
function drawFarBuilding(b, gY) {
  const bx = Math.floor(b.x);
  const by = Math.floor(gY - b.h);
  ctx.fillStyle = b.color;

  if (b.crumble) {
    // Jagged crumbled top
    ctx.beginPath();
    ctx.moveTo(bx, gY);
    ctx.lineTo(bx, by + b.crumbleOffset);
    ctx.lineTo(bx + b.w * 0.15, by);
    ctx.lineTo(bx + b.w * 0.3, by + b.crumbleOffset * 0.6);
    ctx.lineTo(bx + b.w * 0.5, by + b.crumbleOffset * 0.2);
    ctx.lineTo(bx + b.w * 0.7, by + b.crumbleOffset * 0.8);
    ctx.lineTo(bx + b.w * 0.85, by + b.crumbleOffset * 0.3);
    ctx.lineTo(bx + b.w, by + b.crumbleOffset * 0.5);
    ctx.lineTo(bx + b.w, gY);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(bx, by, b.w, b.h);
  }

  // Glow on top of burning buildings
  if (b.hasFire) {
    const fg = ctx.createLinearGradient(bx, by, bx, by + 40);
    fg.addColorStop(0, 'rgba(255,80,0,0.35)');
    fg.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(bx, by, b.w, 40);
  }
}

// ─── Draw: Mid Building ──────────────────────────────────────
function drawMidBuilding(b, gY) {
  const bx = Math.floor(b.x);
  const by = Math.floor(gY - b.h);

  ctx.save();
  if (b.tilt !== 0) {
    ctx.translate(bx + b.w / 2, gY);
    ctx.rotate(b.tilt);
    ctx.translate(-(bx + b.w / 2), -gY);
  }

  ctx.fillStyle = b.color;
  if (b.crumble) {
    ctx.beginPath();
    ctx.moveTo(bx, gY);
    ctx.lineTo(bx, by + b.crumbleOffset);
    ctx.lineTo(bx + b.w * 0.12, by);
    ctx.lineTo(bx + b.w * 0.28, by + b.crumbleOffset * 0.5);
    ctx.lineTo(bx + b.w * 0.45, by + b.crumbleOffset * 0.15);
    ctx.lineTo(bx + b.w * 0.62, by + b.crumbleOffset * 0.7);
    ctx.lineTo(bx + b.w * 0.78, by + b.crumbleOffset * 0.25);
    ctx.lineTo(bx + b.w * 0.9,  by + b.crumbleOffset * 0.55);
    ctx.lineTo(bx + b.w, by + b.crumbleOffset * 0.3);
    ctx.lineTo(bx + b.w, gY);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(bx, by, b.w, b.h);
  }

  // Windows – flickering fire-orange
  for (const win of b.windows) {
    if (!win.lit) continue;
    const flicker = 0.5 + 0.5 * Math.sin(frameCount * 0.1 + win.phase);
    if (win.fireWin) {
      ctx.fillStyle   = `hsl(${20 + flicker * 30},100%,${50 + flicker * 20}%)`;
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur  = 8;
    } else {
      ctx.fillStyle = `rgba(255,200,80,${0.3 + flicker * 0.4})`;
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 0.7 + flicker * 0.3;
    ctx.fillRect(bx + win.cx - 3, by + win.cy - 4, 7, 9);
  }
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;

  // Orange glow from fire on top / windows
  if (b.hasFire) {
    const fg = ctx.createLinearGradient(bx, by, bx, by + 60);
    fg.addColorStop(0, 'rgba(255,90,0,0.5)');
    fg.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(bx, by, b.w, 60);
  }

  ctx.restore();
}

// ─── Draw: Fire Particles ────────────────────────────────────
function drawFireParticles() {
  for (const fp of fireParticles) {
    ctx.globalAlpha = fp.life * 0.8;
    ctx.fillStyle   = `hsl(${fp.hue},100%,${40 + (1 - fp.life) * 30}%)`;
    ctx.shadowColor = `hsl(${fp.hue},100%,50%)`;
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.arc(fp.x, fp.y, fp.size * fp.life * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}

// ─── Draw: Obstacle ──────────────────────────────────────────
function drawObstacle(obs, gY) {
  if (obs.type === 'car') {
    // Body
    ctx.fillStyle = `hsl(${(Math.floor(obs.x / 10) * 37) % 360},65%,40%)`;
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    // Windshield
    ctx.fillStyle = '#001015';
    ctx.fillRect(obs.x + 12, obs.y + 4, obs.w - 30, obs.h * 0.45);
    // Wheels
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(obs.x + 14, obs.y + obs.h, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(obs.x + obs.w - 14, obs.y + obs.h, 9, 0, Math.PI * 2); ctx.fill();
    // Headlights
    ctx.fillStyle   = 'rgba(255,180,60,0.9)';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur  = 14;
    ctx.fillRect(obs.x - 5, obs.y + obs.h * 0.5, 5, 8);
    ctx.shadowBlur  = 0;
    // Smoke from car
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(frameCount * 0.1 + obs.x);
    ctx.fillStyle   = '#555';
    ctx.beginPath();
    ctx.arc(obs.x + obs.w * 0.5, obs.y - 8, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (obs.type === 'barrier') {
    ctx.fillStyle = '#333';
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    ctx.fillStyle = '#ff5500';
    for (let sy = obs.y; sy < obs.y + obs.h; sy += 18) {
      ctx.fillRect(obs.x, sy, obs.w, 7);
    }
    ctx.strokeStyle = 'rgba(255,150,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
  } else {
    // Hole / pit
    ctx.fillStyle = '#000';
    ctx.fillRect(obs.x, obs.y, obs.w, canvas.height);
    // Lava glow at bottom
    const lGrad = ctx.createLinearGradient(0, obs.y, 0, obs.y + 40);
    lGrad.addColorStop(0, 'rgba(255,60,0,0.7)');
    lGrad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = lGrad;
    ctx.fillRect(obs.x, obs.y, obs.w, 40);
    // Edge glow
    ctx.strokeStyle = 'rgba(255,80,0,0.9)';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur  = 14;
    ctx.beginPath(); ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(obs.x + obs.w, obs.y); ctx.lineTo(obs.x + obs.w, canvas.height); ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// ─── Draw: Speed Pickups ──────────────────────────────────────
function drawPickup(pk) {
  const cx = pk.x + pk.w / 2;
  const cy = pk.y + pk.h / 2;
  const pulse = 1 + 0.15 * Math.sin(pk.pulse * 3);
  const r     = (pk.w / 2) * pulse;

  if (pk.type === 'boost') {
    // Yellow lightning bolt pickup
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = '#ffe066';
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(pk.pulse * 4);

    // Draw ⚡ symbol manually
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,0,0.2)';
    ctx.fill();

    ctx.fillStyle = '#ffe066';
    ctx.font = `bold ${Math.round(pk.h * 0.85)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', cx, cy + 1);

    // Floating label
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillStyle = '#ffe066';
    ctx.fillText('BOOST', cx, pk.y - 10);

  } else {
    // Blue ice/slow pickup
    ctx.shadowColor = '#00cfff';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = 'rgba(0,180,255,0.2)';
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(pk.pulse * 4);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle    = '#00cfff';
    ctx.font         = `bold ${Math.round(pk.h * 0.85)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❄', cx, cy + 1);

    ctx.font = '10px Share Tech Mono, monospace';
    ctx.fillStyle = '#00cfff';
    ctx.fillText('SLOW', cx, pk.y - 10);
  }
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ─── Draw: Player ─────────────────────────────────────────────
function drawPlayer(gY) {
  const pr = playerRect();

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(player.x + PLAYER_W / 2, gY + 2, PLAYER_W * 0.7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (player.isSliding) {
    ctx.fillStyle   = '#00aaff';
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur  = 14;
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#fff';
    ctx.fillRect(pr.x + pr.w - 14, pr.y - 6, 14, 8);
    return;
  }

  const px = player.x;
  const py = player.y;
  const legSwing = player.isOnGround ? Math.sin(frameCount * 0.38) * 10 : 0;

  // Legs
  ctx.fillStyle = '#1a2e4a';
  ctx.fillRect(px + 4, py + PLAYER_H * 0.55, 10, PLAYER_H * 0.45 + legSwing);
  ctx.fillRect(px + PLAYER_W - 14, py + PLAYER_H * 0.55, 10, PLAYER_H * 0.45 - legSwing);

  // Shoes
  ctx.fillStyle = '#ff4400';
  ctx.fillRect(px + 2, py + PLAYER_H - 8 + legSwing, 14, 8);
  ctx.fillRect(px + PLAYER_W - 16, py + PLAYER_H - 8 - legSwing, 14, 8);

  // Body
  ctx.fillStyle   = '#ffaa00';
  ctx.shadowColor = '#ffaa00';
  ctx.shadowBlur  = 10;
  ctx.fillRect(px, py + PLAYER_H * 0.22, PLAYER_W, PLAYER_H * 0.38);
  ctx.shadowBlur = 0;

  // Arms
  ctx.fillStyle = '#ffaa00';
  ctx.fillRect(px - 6, py + PLAYER_H * 0.25 + legSwing * 0.5,  8, PLAYER_H * 0.25);
  ctx.fillRect(px + PLAYER_W - 2, py + PLAYER_H * 0.25 - legSwing * 0.5, 8, PLAYER_H * 0.25);

  // Head
  ctx.fillStyle = '#f5c07a';
  ctx.fillRect(px + 4, py, PLAYER_W - 8, PLAYER_H * 0.24);

  // Helmet
  ctx.fillStyle = '#ff4400';
  ctx.fillRect(px + 2, py, PLAYER_W - 4, 10);
  ctx.fillStyle = 'rgba(255,200,0,0.6)';
  ctx.fillRect(px + 4, py + 2, PLAYER_W - 8, 6);
}

// ─── Draw: King Kong ──────────────────────────────────────────
function drawKingKong(kx, gY) {
  // Scale by proximity to player
  const prox = Math.max(0, 1 - (player.x - kx - 100) / (canvas.width * 0.45));
  const sc   = 1 + prox * 0.5;

  const bodyH = 230 * sc;
  const bodyW = 110 * sc;
  const bodyY = gY - bodyH;

  // Stomp / walk cycle
  const walk    = Math.sin(kong.chestBeatPhase * 2.5);
  const wobbleY = Math.abs(walk) * (4 + speed * 0.3);

  ctx.save();
  ctx.translate(kx, -wobbleY);

  // ── Shadow under Kong ──
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(bodyW * 0.5, gY + 4, bodyW * 0.7, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Legs ──
  const legL = walk * 18 * sc;
  ctx.fillStyle = '#1a0e00';
  // Left leg
  ctx.beginPath();
  ctx.roundRect(8 * sc, bodyY + bodyH * 0.72, 34 * sc, bodyH * 0.28 + legL, 6);
  ctx.fill();
  // Right leg
  ctx.beginPath();
  ctx.roundRect(60 * sc, bodyY + bodyH * 0.72, 34 * sc, bodyH * 0.28 - legL, 6);
  ctx.fill();
  // Feet
  ctx.fillStyle = '#130900';
  ctx.beginPath();
  ctx.ellipse(25 * sc, gY - 2 + legL, 26 * sc, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(77 * sc, gY - 2 - legL, 26 * sc, 14, 0, 0, Math.PI * 2); ctx.fill();
  // Toe knuckles
  ctx.fillStyle = '#0a0500';
  for (let t = 0; t < 3; t++) {
    ctx.beginPath(); ctx.arc((10 + t*9) * sc, gY - 6 + legL, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc((62 + t*9) * sc, gY - 6 - legL, 4, 0, Math.PI * 2); ctx.fill();
  }

  // ── Body ──
  const bodyGrad = ctx.createRadialGradient(
    bodyW * 0.4, bodyY + bodyH * 0.5, bodyW * 0.1,
    bodyW * 0.4, bodyY + bodyH * 0.5, bodyW * 0.8
  );
  bodyGrad.addColorStop(0, '#3d2200');
  bodyGrad.addColorStop(0.5, '#1e1000');
  bodyGrad.addColorStop(1, '#0d0500');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(15 * sc, gY);
  ctx.bezierCurveTo(
    -10 * sc, bodyY + bodyH * 0.7,
    -5 * sc,  bodyY + bodyH * 0.3,
    bodyW * 0.22, bodyY + bodyH * 0.05
  );
  ctx.bezierCurveTo(
    bodyW * 0.35, bodyY - 5 * sc,
    bodyW * 0.65, bodyY - 5 * sc,
    bodyW * 0.8, bodyY + bodyH * 0.05
  );
  ctx.bezierCurveTo(
    bodyW + 5 * sc, bodyY + bodyH * 0.3,
    bodyW + 10 * sc, bodyY + bodyH * 0.7,
    bodyW - 10 * sc, gY
  );
  ctx.closePath();
  ctx.fill();

  // Chest highlight
  const chestGrad = ctx.createRadialGradient(bodyW*0.45, bodyY+bodyH*0.45, 0, bodyW*0.45, bodyY+bodyH*0.45, bodyW*0.4);
  chestGrad.addColorStop(0, 'rgba(80,40,0,0.5)');
  chestGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = chestGrad;
  ctx.beginPath();
  ctx.ellipse(bodyW*0.45, bodyY+bodyH*0.45, bodyW*0.38, bodyH*0.28, 0, 0, Math.PI*2);
  ctx.fill();

  // ── Arms ──
  const beatAnim = Math.abs(Math.sin(kong.chestBeatPhase)) > 0.85; // chest beat moment
  const armRaised = beatAnim ? -30 * sc : 0;

  ctx.fillStyle = '#1a0e00';

  // Left arm
  ctx.save();
  ctx.translate(0, bodyY + bodyH * 0.22);
  ctx.rotate(-0.25 + (armRaised ? -0.5 : walk * 0.3));
  ctx.beginPath();
  ctx.roundRect(-14 * sc, 0, 18 * sc, 80 * sc, 8);
  ctx.fill();
  // Left hand / fist
  ctx.fillStyle = '#130900';
  ctx.beginPath();
  ctx.ellipse(0, 80 * sc, 13 * sc, 11 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Right arm (the one closer to player)
  ctx.save();
  ctx.translate(bodyW, bodyY + bodyH * 0.22);
  ctx.rotate(0.25 + (armRaised ? 0.5 : -walk * 0.3));
  ctx.fillStyle = '#1a0e00';
  ctx.beginPath();
  ctx.roundRect(0, 0, 18 * sc, 80 * sc, 8);
  ctx.fill();
  // Right hand / fist reaching toward player
  ctx.fillStyle = '#130900';
  ctx.beginPath();
  ctx.ellipse(9 * sc, 80 * sc, 13 * sc, 11 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Chest beat animation – pound marks
  if (beatAnim) {
    ctx.fillStyle   = 'rgba(255,80,0,0.15)';
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur  = 30;
    ctx.beginPath();
    ctx.ellipse(bodyW * 0.45, bodyY + bodyH * 0.42, bodyW * 0.32, bodyH * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Neck ──
  ctx.fillStyle = '#1a0e00';
  ctx.beginPath();
  ctx.roundRect(bodyW*0.32, bodyY - 8*sc, bodyW*0.3, 16*sc, 4);
  ctx.fill();

  // ── Head ──
  const headW = 90 * sc;
  const headH = 70 * sc;
  const headX = bodyW * 0.14;
  const headY = bodyY - headH + 6 * sc;

  // Head shape
  const headGrad = ctx.createRadialGradient(headX+headW*0.4, headY+headH*0.4, 0, headX+headW*0.4, headY+headH*0.4, headW*0.7);
  headGrad.addColorStop(0, '#2d1800');
  headGrad.addColorStop(1, '#0d0500');
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.moveTo(headX + headW*0.1, headY + headH);
  ctx.bezierCurveTo(headX - 5*sc, headY + headH*0.6, headX, headY + headH*0.1, headX + headW*0.3, headY);
  ctx.bezierCurveTo(headX + headW*0.4, headY - 15*sc, headX + headW*0.7, headY - 10*sc, headX + headW, headY + headH*0.2);
  ctx.bezierCurveTo(headX + headW + 10*sc, headY + headH*0.45, headX + headW + 5*sc, headY + headH*0.75, headX + headW*0.9, headY + headH);
  ctx.closePath();
  ctx.fill();

  // Brow ridge
  ctx.fillStyle = '#0a0400';
  ctx.beginPath();
  ctx.ellipse(headX + headW*0.45, headY + headH*0.28, headW*0.42, 9*sc, -0.1, 0, Math.PI*2);
  ctx.fill();

  // Eyes – angry red glow
  const eyeFlicker = 0.7 + 0.3 * Math.abs(Math.sin(frameCount * 0.12));
  ctx.fillStyle   = `rgba(255,${Math.floor(20*eyeFlicker)},0,${eyeFlicker})`;
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur  = 18;
  // Left eye
  ctx.beginPath(); ctx.ellipse(headX + headW*0.3, headY + headH*0.4, 7*sc, 5*sc, -0.2, 0, Math.PI*2); ctx.fill();
  // Right eye
  ctx.beginPath(); ctx.ellipse(headX + headW*0.65, headY + headH*0.38, 7*sc, 5*sc, 0.2, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(headX + headW*0.3, headY + headH*0.4, 3*sc, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(headX + headW*0.65, headY + headH*0.38, 3*sc, 0, Math.PI*2); ctx.fill();

  // Nostrils
  ctx.fillStyle = '#0a0400';
  ctx.beginPath(); ctx.ellipse(headX + headW*0.4, headY + headH*0.6, 5*sc, 4*sc, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + headW*0.58, headY + headH*0.6, 5*sc, 4*sc,  0.3, 0, Math.PI*2); ctx.fill();

  // Mouth – snarl
  ctx.strokeStyle = '#0a0400';
  ctx.lineWidth   = 3 * sc;
  ctx.beginPath();
  ctx.moveTo(headX + headW*0.2, headY + headH*0.78);
  ctx.quadraticCurveTo(headX + headW*0.5, headY + headH*0.9, headX + headW*0.82, headY + headH*0.76);
  ctx.stroke();
  // Teeth
  ctx.fillStyle = '#eeeecc';
  for (let t = 0; t < 4; t++) {
    const tx = headX + headW * (0.26 + t * 0.15);
    const ty = headY + headH * 0.8;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + 5*sc, ty + 10*sc);
    ctx.lineTo(tx + 10*sc, ty);
    ctx.closePath();
    ctx.fill();
  }

  // Roar breath when very close
  if (prox > 0.6) {
    ctx.globalAlpha = (prox - 0.6) * 2 * (0.5 + 0.5 * Math.sin(frameCount * 0.2));
    const fireLen = 80 + Math.random() * 80;
    const fGrad = ctx.createLinearGradient(
      headX + headW + 10*sc, headY + headH*0.75,
      headX + headW + 10*sc + fireLen, headY + headH*0.75
    );
    fGrad.addColorStop(0, '#ffee00');
    fGrad.addColorStop(0.3, '#ff6600');
    fGrad.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(headX + headW,        headY + headH*0.65);
    ctx.lineTo(headX + headW + fireLen, headY + headH*0.75);
    ctx.lineTo(headX + headW,        headY + headH*0.85);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ─── Utility ─────────────────────────────────────────────────
function rectsOverlap(a, b) {
  if (b.type === 'hole') return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
