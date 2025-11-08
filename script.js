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

// Buttons and file input
const playBtn = document.createElement("button");
playBtn.textContent = "▶️ Play Song";
document.body.insertBefore(playBtn, canvas.nextSibling);
const songUpload = document.getElementById("songUpload");

// Audio
const audioElement = new Audio(); // no default source
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- RMS mock neural network ---
let nnModel = {
  predict: (input) => {
    const avg = input.reduce((a, b) => a + b, 0) / input.length;
    return Math.min(avg * 20, 1); // 0 -> 1
  },
};

// --- Drum RNN setup ---
let drumRNN;
const MODEL_URL = "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn";

async function loadRNN() {
  if (!mm) {
    console.error("Magenta not loaded!");
    return;
  }
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
  playBtn.textContent = "Loading...";

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(audioContext.destination);

    let lastNoteTime = 0;
    analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source: sourceNode,
      bufferSize: 1024,
      featureExtractors: ["rms"],
      callback: (features) => {
        if (!features) return;
        const rms = features.rms;
        const now = audioContext.currentTime;

        // --- store RMS ---
        rmsHistory.push(rms);
        if (rmsHistory.length > historyLength) rmsHistory.shift();

        // --- neural network decision ---
        const inputWindow = rmsHistory.slice(-20);
        const beatProb = nnModel.predict(inputWindow);

        // spawn RMS note
        if (beatProb > 0.5 && now - lastNoteTime > 0.2) {
          lastNoteTime = now;
          const laneIndex = Math.floor(Math.random() * lanes.length);
          notes.push({ lane: laneIndex, y: 0, hit: false, type: "RMS" });
        }

        // --- AI visualization ---
        aiHistory.push(beatProb);
        if (aiHistory.length > aiCanvas.width) aiHistory.shift();
        drawAIVisualization(beatProb > 0.5);
      },
    });
    analyzer.start();

    // --- Play audio ---
    await audioElement.play();
    playBtn.textContent = "Playing...";

    // --- Load Drum RNN ---
    if (!drumRNN) await loadRNN();

    // Generate Drum RNN notes
    const seedSeq = { notes: [] };
    const rnnSeq = await drumRNN.continueSequence(seedSeq, 64, 1.0);
    rnnSeq.notes.forEach(n => {
      let lane;
      if (n.pitch === 36) lane = 0;
      else if (n.pitch === 38) lane = 1;
      else lane = 2;
      notes.push({ lane, y: 0, hit: false, time: n.startTime, spawned: false, type: "RNN" });
    });

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
const NOTE_SPEED = 200;
function gameLoop() {
  const now = audioContext ? audioContext.currentTime : 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // spawn Drum RNN notes
  notes.forEach(n => {
    if (n.type === "RNN" && !n.spawned && n.time - now <= 1.5) n.spawned = true;
  });

  // draw notes
  notes.forEach(n => {
    if (n.type === "RNN" && !n.spawned) return;

    if (n.type === "RMS") n.y += 5; // RMS notes
    else n.y = hitY - (n.time - now) * NOTE_SPEED; // RNN notes

    // assign colors based on lane and type
    let color = "#f00"; // default
    if (n.lane === 0) color = n.type === "RMS" ? "#f55" : "#a00";
    else if (n.lane === 1) color = n.type === "RMS" ? "#55f" : "#00a";
    else if (n.lane === 2) color = n.type === "RMS" ? "#5f5" : "#0a0";
    else if (n.lane === 3) color = n.type === "RMS" ? "#f5f" : "#a0a";

    ctx.fillStyle = color;
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
    }
  });

  // remove notes that are hit or out of screen
  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  requestAnimationFrame(gameLoop);
}

// --- AI Visualization ---
function drawAIVisualization(noteSpawned) {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  aiHistory.forEach((val, i) => {
    const h = val * aiCanvas.height;
    aiCtx.fillStyle = "#08f";
    aiCtx.fillRect(i, aiCanvas.height - h, 1, h);

    if (val > 0.5 && noteSpawned) {
      aiCtx.fillStyle = "#0f8";
      aiCtx.fillRect(i, 0, 1, aiCanvas.height);
    }
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
