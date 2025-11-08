const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
const hitWindow = 40;
let notes = [];
let score = 0;

// AI visualization canvas
const aiCanvas = document.createElement("canvas");
aiCanvas.width = 600;
aiCanvas.height = 100;
aiCanvas.style.background = "#111";
aiCanvas.style.marginTop = "20px";
document.body.insertBefore(aiCanvas, canvas);
const aiCtx = aiCanvas.getContext("2d");
let aiHistory = [];

// Buttons
const playBtn = document.createElement("button");
playBtn.textContent = "▶️ Play Song";
document.body.insertBefore(playBtn, canvas.nextSibling);
const songUpload = document.getElementById("songUpload");

// Audio
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, startTime;

// --- Drum RNN AI ---
let drumRNN;
const MODEL_URL = "./models/drum_kit_rnn/"; // your local folder

async function loadRNN() {
  drumRNN = new mm.MusicRNN(MODEL_URL);
  await drumRNN.initialize();
  console.log("Drum RNN Loaded!");
}

// --- File upload ---
songUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  audioElement.src = URL.createObjectURL(file);
  resetGame();
});

// --- Play button ---
playBtn.addEventListener("click", async () => {
  resetGame();
  playBtn.textContent = "Loading AI...";

  try {
    if (!drumRNN) await loadRNN();

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(audioContext.destination);

    startTime = audioContext.currentTime;

    await audioElement.play();

    // --- Generate AI Notes ---
    const seedSequence = { notes: [] }; // start empty
    const rnnSeq = await drumRNN.continueSequence(seedSequence, 64, 1.0);
    notes = rnnSeq.notes.map(n => {
      let lane;
      if (n.pitch === 36) lane = 0; // kick
      else if (n.pitch === 38) lane = 1; // snare
      else lane = 2; // hi-hat/others

      return { lane, time: n.startTime, y: 0, hit: false, spawned: false };
    });

    playBtn.textContent = "Playing...";
    gameLoop();
  } catch (err) {
    console.error(err);
    playBtn.textContent = "▶️ Try Again";
  }
});

// --- Key input ---
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

// --- Main game loop ---
const NOTE_SPEED = 200; // pixels/sec

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

  // spawn AI notes a bit early
  notes.forEach(n => {
    if (!n.spawned && n.time - now <= 1.5) n.spawned = true;
  });

  // draw notes
  notes.forEach(n => {
    if (!n.spawned) return;

    n.y = hitY - (n.time - now) * NOTE_SPEED;

    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
    }
  });

  // keep AI visualization (optional: mark spawned notes)
  aiHistory.push(notes.filter(n => n.spawned && !n.hit).length / lanes.length);
  if (aiHistory.length > aiCanvas.width) aiHistory.shift();
  drawAIVisualization();

  requestAnimationFrame(gameLoop);
}

// --- AI Visualization ---
function drawAIVisualization() {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  aiHistory.forEach((val, i) => {
    const h = val * aiCanvas.height;
    aiCtx.fillStyle = "#08f";
    aiCtx.fillRect(i, aiCanvas.height - h, 1, h);
  });
}

// --- Reset ---
function resetGame() {
  if (audioContext) audioContext.close();

  notes = [];
  score = 0;
  aiHistory = [];
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
