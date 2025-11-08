const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a","s","k","l"];
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

let audioContext, sourceNode, startTime;

// --- Drum RNN ---
let drumRNN;
const MODEL_URL = "./models/drum_kit_rnn/"; // local folder

async function loadRNN() {
  drumRNN = new mm.MusicRNN(MODEL_URL);
  await drumRNN.initialize();
  console.log("Drum RNN Loaded!");
}

// --- Upload song ---
songUpload.addEventListener("change", e => {
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

    // --- Generate AI notes ---
    const seed = { notes: [] };
    const rnnSequence = await drumRNN.continueSequence(seed, 64, 1.0);

    notes = rnnSequence.notes.map(n => ({
      lane: pitchToLane(n.pitch),
      time: n.startTime,
      y: 0,
      hit: false,
      spawned: false
    }));

    playBtn.textContent = "Playing...";
    gameLoop();

  } catch(err) {
    console.error(err);
    playBtn.textContent = "▶️ Try Again";
  }
});

// --- Map drum pitch to lane ---
function pitchToLane(pitch) {
  if (pitch === 36) return 0; // kick
  if (pitch === 38) return 1; // snare
  if (pitch === 42) return 2; // hi-hat
  return 3; // other drums
}

// --- Key input ---
const keys = {};
window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

// --- Game loop ---
const NOTE_SPEED = 200; // pixels/sec

function gameLoop() {
  const now = audioContext.currentTime - startTime;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw lanes
  lanes.forEach((key,i)=>{
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i*laneWidth,0,laneWidth-2,canvas.height);
  });

  // hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0,hitY,canvas.width,5);

  // spawn notes
  notes.forEach(n => { if(!n.spawned && n.time - now <= 1.5) n.spawned = true });

  // draw notes
  notes.forEach(n => {
    if(!n.spawned) return;
    n.y = hitY - (n.time - now)*NOTE_SPEED;
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane*laneWidth+5,n.y,laneWidth-10,30);

    if(Math.abs(n.y - hitY)<hitWindow && keys[lanes[n.lane]] && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: "+score;
      n.hit = true;
    }
  });

  requestAnimationFrame(gameLoop);
}

// --- Reset ---
function resetGame() {
  if(audioContext) audioContext.close();
  notes = [];
  score = 0;
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
