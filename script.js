// ===== script.js (AI-driven Magenta block notes, synced) =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const songUpload = document.getElementById("songUpload");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
let notes = [];
let score = 0;

// Audio
let audioCtx, sourceNode;
let isPlaying = false;
let songStartTime = 0;

// Magenta RNN
let rnn;
let sequenceToSpawn = [];
let sequenceIndex = 0;

// Random lane colors
const laneColors = ["#0ff", "#f0f", "#ff0", "#0f8"];

// --- Load Magenta model ---
async function loadRNN() {
  console.log("⏳ Loading Magenta model...");
  rnn = new mm.MusicRNN(window.location.origin + "/drum_kit_rnn.mag");
  await rnn.initialize();
  console.log("✅ Magenta model loaded successfully!");
}

// --- Generate a seed and continuation sequence ---
async function generateRNNSequence() {
  if (!rnn) return;

  // simple seed: four notes on different pitches
  const seedSeq = mm.sequences.createNoteSequence({
    notes: [
      { pitch: 36, startTime: 0, endTime: 0.25 },
      { pitch: 38, startTime: 0.5, endTime: 0.75 },
      { pitch: 42, startTime: 1.0, endTime: 1.25 },
      { pitch: 46, startTime: 1.5, endTime: 1.75 },
    ],
    totalTime: 2,
  });

  const continuation = await rnn.continueSequence(seedSeq, 32, 1.0);

  // map generated notes to our lanes
  sequenceToSpawn = continuation.notes.map(n => ({
    time: n.startTime,
    lane: n.pitch % 4, // simple mapping pitch -> lane index
  }));

  sequenceIndex = 0;
}

// --- Spawn notes based on current song time ---
function spawnNotesFromRNN() {
  if (!isPlaying) return;
  const currentTime = audioCtx.currentTime - songStartTime; // relative to song start

  while (
    sequenceIndex < sequenceToSpawn.length &&
    sequenceToSpawn[sequenceIndex].time <= currentTime
  ) {
    const laneIndex = sequenceToSpawn[sequenceIndex].lane;
    notes.push({ lane: laneIndex, y: -20, hit: false });
    sequenceIndex++;
  }
}

// --- Draw & update notes ---
function drawNotes() {
  notes.forEach(note => {
    ctx.fillStyle = laneColors[note.lane];
    ctx.fillRect(note.lane * laneWidth + 10, note.y, laneWidth - 20, 20);
  });
}

function updateNotes() {
  notes.forEach(note => (note.y += 4)); // falling speed
  notes = notes.filter(note => note.y < canvas.height + 20 && !note.hit);
}

// --- Game loop ---
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // spawn notes from RNN
  spawnNotesFromRNN();

  // draw & update notes
  drawNotes();
  updateNotes();

  requestAnimationFrame(gameLoop);
}

// --- Key input for hits ---
const keys = {};
document.addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; });
document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

function checkHits() {
  notes.forEach(note => {
    if (keys[lanes[note.lane]] && Math.abs(note.y - hitY) < 30 && !note.hit) {
      score += 10;
      note.hit = true;
      scoreEl.textContent = `Score: ${score}`;
    }
  });
}
setInterval(checkHits, 20);

// --- Start audio and RNN sequence ---
async function startSong(file) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioCtx.destination);

  // generate RNN sequence BEFORE starting audio
  await generateRNNSequence();

  songStartTime = audioCtx.currentTime;
  sourceNode.start();
  isPlaying = true;
  gameLoop();
}

// --- File upload ---
songUpload.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  startSong(file);
});

// --- Load model on page load ---
loadRNN();
