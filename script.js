const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
const hitWindow = 40;
let notes = [];
let score = 0;

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

// --- AI speed ---
let currentSpeed = 5;          // initial note speed
const smoothingFactor = 0.05;  // smoothing for gradual change

// Player stats
let playerStats = {
  hits: 0,
  misses: 0,
  combo: 0
};

// Simple neural network: higher RMS -> higher beat probability
let nnModel = {
  predict: (input) => {
    const avg = input.reduce((a, b) => a + b, 0) / input.length;
    return Math.min(avg * 20, 1); // output 0-1
  }
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

        // --- Neural network beat probability ---
        const inputWindow = rmsHistory.slice(-20);
        const beatProb = nnModel.predict(inputWindow);

        // --- Adjust speed based on beat and player performance ---
        const performanceFactor = Math.min(1, playerStats.hits / Math.max(1, playerStats.hits + playerStats.misses));
        const targetSpeed = 3 + beatProb * 7 + performanceFactor * 2; // 3-12 range
        currentSpeed = currentSpeed + (targetSpeed - currentSpeed) * smoothingFactor;

        // Spawn note
        if (beatProb > 0.5 && now - lastNoteTime > 0.2) {
          lastNoteTime = now;
          const laneIndex = Math.floor(Math.random() * lanes.length);
          notes.push({ lane: laneIndex, y: 0, hit: false, speed: currentSpeed });
        }
      },
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

  // Draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // Draw hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // --- Draw AI speed bar above hit line ---
  const barWidth = (currentSpeed / 12) * canvas.width; // normalize to max speed
  const red = Math.floor((currentSpeed / 12) * 255);
  const blue = 255 - red;
  ctx.fillStyle = `rgb(${red},0,${blue})`;
  ctx.fillRect(0, hitY - 10, barWidth, 5);

  // Draw notes
  notes.forEach((n) => {
    n.y += n.speed;
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
      playerStats.hits++;
      playerStats.combo++;
    }
  });

  // Count misses
  notes.forEach((n) => {
    if (!n.hit && n.y > hitY + hitWindow) {
      n.hit = true;
      playerStats.misses++;
      playerStats.combo = 0;
    }
  });

  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  requestAnimationFrame(gameLoop);
}

// --- Reset ---
function resetGame() {
  if (analyzer) analyzer.stop();
  if (audioContext) audioContext.close();

  notes = [];
  score = 0;
  rmsHistory = [];
  playerStats = { hits: 0, misses: 0, combo: 0 };
  currentSpeed = 5;
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
