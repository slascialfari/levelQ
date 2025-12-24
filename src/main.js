// LevelQ Proto — real backgrounds + glowing portals + sprite character
// Features:
// - Random AI/static universes
// - Invisible logical floor
// - Glowing breathing portals
// - Sprite character (idle + walk)
// - Subtle walk-cycle vertical bob (B)
//
// Shadow REMOVED by design.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;

// Logical floor (never drawn, never moves)
const FLOOR_Y = 600;

// Portal collision + visual anchor
const PORTAL = {
  w: 22,
  h: 86,
  insetX: 18,
};

// Sprite config (matches your current folders)
const SPRITES = {
  idle: { folder: "assets/sprites/hero_idle_12f", count: 4, fps: 8 },
  walk: { folder: "assets/sprites/hero_walk_12f", count: 6, fps: 12 },
};

// -------- TWEAKABLE VISUAL CONSTANTS --------
const SPRITE_SCALE = 2.5;   // Scale hero up/down
const FEET_FUDGE_PX = 0;    // + up, - down (padding correction)

// Portal pulse (A)
const PORTAL_PULSE_SPEED = 2.2;
const PORTAL_PULSE_AMOUNT = 0.10;
const PORTAL_PULSE_BASE = 0.92;

// Walk micro-bob (B)
const WALK_BOB_PX = 2; // Try 3–4 if you want it more visible, 0 disables it
// -------------------------------------------

let levelData = [];
const levelImages = new Map();

let heroIdleFrames = [];
let heroWalkFrames = [];

let timeSec = 0;

const state = {
  levelIndex: 0,
  transitioning: false,
  transitionUntil: 0,
  lastPortalSide: null,
};

const player = {
  w: 26,
  h: 56,
  x: Math.floor(W / 2),
  speed: 260,
  visible: true,

  facing: 1,
  anim: "idle",
  frameIndex: 0,
  frameTimer: 0,
};

function playerGroundY() {
  return FLOOR_Y - player.h;
}
player.y = playerGroundY();

const input = { left: false, right: false };

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") input.left = true;
  if (e.key === "ArrowRight") input.right = true;
});

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") input.left = false;
  if (e.key === "ArrowRight") input.right = false;
});

// ---------- Helpers ----------
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randInt(min, maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

function portals() {
  const y = FLOOR_Y - PORTAL.h;
  return {
    left:  { x: PORTAL.insetX, y, w: PORTAL.w, h: PORTAL.h },
    right: { x: W - PORTAL.insetX - PORTAL.w, y, w: PORTAL.w, h: PORTAL.h },
  };
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ---------- Loaders ----------
async function loadLevels() {
  const res = await fetch("data/levels.json");
  const json = await res.json();
  levelData = json.levels;

  await Promise.all(
    levelData.map(
      (lvl) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.src = lvl.image;
          img.onload = () => {
            levelImages.set(lvl.id, img);
            resolve();
          };
          img.onerror = () => reject(`Failed to load ${lvl.image}`);
        })
    )
  );

  state.levelIndex = randInt(0, levelData.length - 1);
}

function loadFrameSequence(folder, count) {
  const frames = [];
  const promises = [];

  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, "0");
    const img = new Image();
    img.src = `${folder}/frame_${n}.png`;
    frames.push(img);

    promises.push(
      new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(`Failed to load ${img.src}`);
      })
    );
  }

  return Promise.all(promises).then(() => frames);
}

async function loadSprites() {
  [heroIdleFrames, heroWalkFrames] = await Promise.all([
    loadFrameSequence(SPRITES.idle.folder, SPRITES.idle.count),
    loadFrameSequence(SPRITES.walk.folder, SPRITES.walk.count),
  ]);
}

// ---------- Level ----------
function currentLevel() {
  return levelData[state.levelIndex];
}

function drawLevelBackground() {
  const img = levelImages.get(currentLevel().id);
  if (img) ctx.drawImage(img, 0, 0, W, H);
}

// ---------- Portals ----------
function drawPortals() {
  const { left, right } = portals();
  drawPortal(left);
  drawPortal(right);
}

function drawPortal(p) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const rX = p.w * 0.9;
  const rY = p.h * 0.55;

  const pulse =
    PORTAL_PULSE_BASE +
    PORTAL_PULSE_AMOUNT * Math.sin(timeSec * PORTAL_PULSE_SPEED);

  ctx.save();
  ctx.fillStyle = "#39ff14";

  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rX * 1.3 * pulse, rY * 1.3 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rX * 1.1 * pulse, rY * 1.1 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#39ff14";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rX, rY, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// ---------- Player ----------
function currentFrames() {
  return player.anim === "walk" ? heroWalkFrames : heroIdleFrames;
}

function currentFps() {
  return player.anim === "walk" ? SPRITES.walk.fps : SPRITES.idle.fps;
}

function drawPlayer() {
  if (!player.visible) return;

  const frames = currentFrames();
  const img = frames[player.frameIndex];
  if (!img) return;

  const drawW = img.width * SPRITE_SCALE;
  const drawH = img.height * SPRITE_SCALE;

  // (B) Walk micro-bob — subtle vertical motion synced to walk cycle
  let walkBob = 0;
  if (player.anim === "walk" && WALK_BOB_PX > 0 && heroWalkFrames.length) {
    const phase = (player.frameIndex / heroWalkFrames.length) * Math.PI * 2;
    walkBob = Math.sin(phase) * WALK_BOB_PX;
  }

  const x = Math.round(player.x);
  const y = Math.round(FLOOR_Y - drawH - FEET_FUDGE_PX + walkBob);

  ctx.save();
  if (player.facing === -1) {
    ctx.translate(x + drawW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, y, drawW, drawH);
  } else {
    ctx.drawImage(img, x, y, drawW, drawH);
  }
  ctx.restore();
}

// ---------- Transitions ----------
function triggerPortal(side) {
  if (state.transitioning) return;
  state.transitioning = true;
  state.transitionUntil = performance.now() + 180;
  state.lastPortalSide = side;
  player.visible = false;
}

function finishTransition() {
  state.levelIndex = randInt(0, levelData.length - 1);

  const { left, right } = portals();
  player.x =
    state.lastPortalSide === "left"
      ? right.x - player.w - 10
      : left.x + left.w + 10;

  player.anim = "idle";
  player.frameIndex = 0;
  player.frameTimer = 0;
  player.visible = true;
  state.transitioning = false;
}

// ---------- Loop ----------
let lastT = performance.now();

function loop(t) {
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;
  timeSec += dt;

  if (!state.transitioning) {
    let vx = 0;
    if (input.left) vx -= 1;
    if (input.right) vx += 1;

    if (vx !== 0) player.facing = vx > 0 ? 1 : -1;
    player.anim = vx === 0 ? "idle" : "walk";

    player.x += vx * player.speed * dt;
    player.x = clamp(player.x, 0, W - player.w);

    const fps = currentFps();
    player.frameTimer += dt;
    if (player.frameTimer >= 1 / fps) {
      player.frameTimer -= 1 / fps;
      player.frameIndex = (player.frameIndex + 1) % currentFrames().length;
    }

    const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    const { left, right } = portals();
    if (rectsOverlap(pRect, left)) triggerPortal("left");
    else if (rectsOverlap(pRect, right)) triggerPortal("right");
  } else if (performance.now() >= state.transitionUntil) {
    finishTransition();
  }

  ctx.clearRect(0, 0, W, H);
  drawLevelBackground();
  drawPortals();
  drawPlayer();

  requestAnimationFrame(loop);
}

// ---------- Boot ----------
Promise.all([loadLevels(), loadSprites()])
  .then(() => requestAnimationFrame(loop))
  .catch((e) => {
    console.error(e);
    ctx.fillText("Asset loading error. Check console.", 20, 30);
  });
