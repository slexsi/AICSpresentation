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

// --- Neural network: multi-level beat detection ---
function getShortTermEnergy(history, windowSize = 10) {
  const recent = history.slice(-windowSize);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return avg;
}

let nnModel = {
  predict: (input) => {
    const avgEnergy = getShortTermEnergy(input, 10);
    const last = input[input.length - 1] || 0;
    const delta = last - (input[input.length - 2] || 0);

    // Combine base energy + spike detection
    let beatProb = avgEnergy * 10 + delta * 50;
    beatProb = Math.min(Math.max(beatProb, 0), 1);

    // Map to speed levels: slow (3), medium (6), fast (10)
    if (beatProb > 0.6) return 10;
    if (beatProb > 0.2) return 6;
    return 3;
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

        // --- Predict speed from multi-level beat detection ---
        const targetSpeed = nnModel.predict(rmsHistory);
        currentSpeed += (targetSpeed - currentSpeed) * smoothingFactor;

        // Spawn note if beat probability (speed > 3.5)
        if (targetSpeed > 3.5 && now - lastNoteTime > 0.2) {
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
  const barWidth = (currentSpeed / 10) * canvas.width;
  const red = Math.floor((currentSpeed / 10) * 255);
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
  currentSpeed = 5;
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
