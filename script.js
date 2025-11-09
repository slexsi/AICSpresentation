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
const aiCanvas = document.getElementById("rmsCanvas");
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

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- Neural Network Model for adaptive difficulty ---
const model = tf.sequential();
model.add(tf.layers.dense({ inputShape: [4], units: 8, activation: 'relu' }));
model.add(tf.layers.dense({ units: 3, activation: 'linear' })); // outputs: [noteSpeed, spawnRate, complexity]
model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

// --- Training data (simple initial rules) ---
const trainInputs = tf.tensor2d([
  [0.9, 1, 0.2, 10],   // excellent
  [0.5, 5, 0.5, 2],    // average
  [0.2, 10, 0.8, 0]    // poor
]);
const trainOutputs = tf.tensor2d([
  [8, 2, 0.8],  // fast notes, frequent, complex
  [5, 1, 0.5],  // medium
  [2, 0.5, 0.2] // slow & simple
]);
model.fit(trainInputs, trainOutputs, { epochs: 50 });

// --- Track player performance ---
let playerStats = {
  hits: 0,
  misses: 0,
  totalReaction: 0,
  combo: 0
};

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

        rmsHistory.push(rms);
        if (rmsHistory.length > historyLength) rmsHistory.shift();

        // --- Use RMS history for beat probability ---
        const inputWindow = rmsHistory.slice(-20);
        const beatProb = inputWindow.reduce((a,b)=>a+b,0)/inputWindow.length * 20;

        // --- spawn note if probability high ---
        if (beatProb > 0.5 && now - lastNoteTime > 0.2) {
          lastNoteTime = now;

          // --- Predict adaptive difficulty ---
          const perfVector = [
            playerStats.hits / Math.max(1, playerStats.hits + playerStats.misses),
            playerStats.misses,
            playerStats.totalReaction / Math.max(1, playerStats.hits),
            playerStats.combo
          ];
          const pred = model.predict(tf.tensor2d([perfVector])).dataSync();
          const noteSpeed = Math.max(2, pred[0]);
          const complexity = Math.min(1, pred[2]);

          // spawn note
          const lanesToUse = complexity >= 0.5 ? lanes.length : 1;
          const laneIndex = Math.floor(Math.random() * lanesToUse);
          notes.push({ lane: laneIndex, y: 0, hit: false, speed: noteSpeed });
        }

        // --- AI visualization ---
        aiHistory.push(beatProb);
        if (aiHistory.length > aiCanvas.width) aiHistory.shift();
        drawAIVisualization();
      }
    });

    analyzer.start();
    await audioElement.play();
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
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // draw hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // draw notes
  notes.forEach((n) => {
    n.y += n.speed || 5; // adaptive speed
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;

      // update player stats
      playerStats.hits++;
      playerStats.combo++;
      playerStats.totalReaction += Math.abs(n.y - hitY)/60; // rough timing
    }
  });

  // missed notes
  notes.forEach(n => {
    if (!n.hit && n.y > hitY + hitWindow) {
      playerStats.misses++;
      playerStats.combo = 0;
      n.hit = true; // mark as processed
    }
  });

  notes = notes.filter(n => n.y < canvas.height && !n.hit);

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
  if (analyzer) analyzer.stop();
  if (audioContext) audioContext.close();

  notes = [];
  score = 0;
  rmsHistory = [];
  aiHistory = [];
  scoreEl.textContent = "Score: 0";
  playerStats = { hits:0, misses:0, totalReaction:0, combo:0 };
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
