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
const audioElement = new Audio("song.mp3");
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- Drum RNN ---
let drumRNN;
async function loadRNN() {
  drumRNN = new mm.MusicRNN(
    "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn"
  );
  await drumRNN.initialize();
  console.log("Drum RNN loaded!");
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
  playBtn.textContent = "Loading...";

  try {
    // --- Initialize AudioContext ---
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(audioContext.destination);

    // --- RMS Analyzer ---
    analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source: sourceNode,
      bufferSize: 1024,
      featureExtractors: ["rms"],
      callback: (features) => {
        if (!features) return;
        const rms = features.rms;
        rmsHistory.push(rms);
        if (rmsHistory.length > historyLength) rmsHistory.shift();

        // Simple beat detection
        const avg = rmsHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const beatProb = Math.min(avg * 20, 1);
        if (beatProb > 0.5 && audioContext.currentTime - lastRMSNoteTime > 0.2) {
          lastRMSNoteTime = audioContext.currentTime;
          const laneIndex = Math.floor(Math.random() * lanes.length);
          notes.push({ lane: laneIndex, y: 0, hit: false });
        }

        // AI visualization
        aiHistory.push(beatProb);
        if (aiHistory.length > aiCanvas.width) aiHistory.shift();
        drawAIVisualization(false);
      },
    });

    analyzer.start();

    // --- Generate Drum RNN notes ---
    if (!drumRNN) await loadRNN();
    const seedSeq = { notes: [] }; // start empty
    const rnnSeq = await drumRNN.continueSequence(seedSeq, 64, 1.0);

    rnnSeq.notes.forEach((n) => {
      let lane;
      if (n.pitch === 36) lane = 0; // kick
      else if (n.pitch === 38) lane = 1; // snare
      else lane = 2; // hi-hat/others

      notes.push({
        lane,
        y: 0,
        hit: false,
        time: n.startTime,
        spawned: false,
      });
    });

    startTime = audioContext.currentTime;
    lastRMSNoteTime = 0;
    await audioElement.play();
    playBtn.textContent = "Playing...";

    gameLoop();
  } catch (err) {
    console.error(err);
    playBtn.textContent = "▶️ Try Again";
  }
});

let startTime = 0;
let lastRMSNoteTime = 0;

// --- Key input ---
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

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

  // spawn RNN notes over time
  notes.forEach((n) => {
    if (n.time !== undefined && !n.spawned && n.time - now <= 0.5) {
      n.spawned = true;
    }
  });

  // draw notes
  notes.forEach((n) => {
    if (n.time !== undefined && !n.spawned) return;

    n.y += 5;
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    if (Math.abs(n.y - hitY) < hitWindow && keys[lanes[n.lane]] && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
    }
  });

  notes = notes.filter((n) => !n.hit && n.y < canvas.height);

  requestAnimationFrame(gameLoop);
}

// --- AI Visualization ---
function drawAIVisualization(noteSpawned) {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  aiHistory.forEach((val, i) => {
    const h = val * aiCanvas.height;
    aiCtx.fillStyle = "#08f";
    aiCtx.fillRect(i, aiCanvas.height - h, 1, h);
  });
}

// --- Reset ---
function resetGame() {
  if (analyzer) analyzer.stop();
  if (audioContext) audioContext.close();

  notes = [];
  score = 0;
  rmsHistory = [];
  aiHistory = [];
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
