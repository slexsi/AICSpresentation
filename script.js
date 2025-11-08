// --- Canvas & Score ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
const hitWindow = 50;
let notes = [];
let score = 0;

// --- Audio & Buttons ---
const songUpload = document.getElementById("songUpload");
const playBtn = document.getElementById("playBtn");
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode;
let startTime = 0;

// --- AI Model ---
let drumRNN;
const MODEL_URL = "./models/drum_kit_rnn/";

// Load local Drum RNN model
async function loadRNN() {
  drumRNN = new mm.MusicRNN(MODEL_URL);
  await drumRNN.initialize();
  console.log("Drum RNN Loaded!");
}

// --- File Upload ---
songUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  audioElement.src = URL.createObjectURL(file);
  resetGame();
});

// --- Play Song ---
playBtn.addEventListener("click", async () => {
  if (!drumRNN) {
    playBtn.textContent = "Loading AI...";
    await loadRNN();
  }

  resetGame();
  playBtn.textContent = "Playing...";

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();

  sourceNode = audioContext.createMediaElementSource(audioElement);
  sourceNode.connect(audioContext.destination);

  startTime = audioContext.currentTime;
  await audioElement.play();

  // --- Generate AI Notes ---
  const seedSequence = { notes: [] }; // empty or simple pattern
  const rnnSeq = await drumRNN.continueSequence(seedSequence, 64, 1.0);
  notes = rnnSeq.notes.map(n => {
    let lane;
    if (n.pitch === 36) lane = 0; // kick
    else if (n.pitch === 38) lane = 1; // snare
    else lane = 2; // hi-hat / others
    return { lane, time: n.startTime, y: 0, hit: false, spawned: false };
  });

  gameLoop();
});

// --- Key Input ---
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

// --- Game Loop ---
function gameLoop() {
  const now = audioContext.currentTime - startTime;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // draw hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // spawn AI notes based on time
  notes.forEach(n => {
    if (!n.spawned && n.time <= now) n.spawned = true;
  });

  // draw notes
  notes.forEach(n => {
    if (!n.spawned) return;
    n.y += 5; // speed, adjust for tempo
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
    }
  });

  // remove hit/off-screen notes
  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  requestAnimationFrame(gameLoop);
}

// --- Reset Game ---
function resetGame() {
  if (audioContext) audioContext.close();
  notes = [];
  score = 0;
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
