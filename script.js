const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const lanes = 4;
const laneWidth = canvas.width / lanes;
const hitY = canvas.height - 100;

let notes = [];
let startTime = null;
let audio = null;

// Load audio file
document.getElementById("file").addEventListener("change", function(e){
  const file = e.target.files[0];
  audio = new Audio(URL.createObjectURL(file));
});

// Generate notes using Magenta Drum RNN
document.getElementById("generateBtn").addEventListener("click", async function(){
  if (!audio) return alert("Please select an audio file first!");

  const model = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit');
  await model.initialize();

  // A tiny seed sequence (empty drum sequence)
  const seed = {
    notes: [],
    totalTime: 1
  };

  const sequence = await model.continueSequence(seed, 32, 1.0); // 32 steps
  // Convert notes to lanes
  notes = sequence.notes.map(n => ({
    time: n.startTime, 
    lane: n.pitch % lanes
  }));

  audio.play();
  startTime = performance.now();
  requestAnimationFrame(gameLoop);
});

// Draw lanes and notes
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw lanes
  for (let i = 0; i < lanes; i++) {
    ctx.fillStyle = "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  }

  // Draw hit line
  ctx.fillStyle = "white";
  ctx.fillRect(0, hitY, canvas.width, 4);

  // Draw notes
  const now = (performance.now() - startTime) / 1000;
  for (const note of notes) {
    const y = (note.time - now) * 200 + hitY; // speed multiplier
    if (y < canvas.height && y > -20) {
      ctx.fillStyle = "red";
      ctx.fillRect(note.lane * laneWidth + 10, y, laneWidth - 20, 20);
    }
  }
}

// Simple hit detection
document.addEventListener("keydown", (e)=>{
  const keyMap = ["a","s","k","l"];
  const lane = keyMap.indexOf(e.key);
  if (lane === -1) return;

  const now = (performance.now() - startTime) / 1000;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.lane === lane && Math.abs(note.time - now) < 0.2) {
      notes.splice(i,1); // remove hit note
      break;
    }
  }
});

function gameLoop() {
  draw();
  if (audio && !audio.paused) requestAnimationFrame(gameLoop);
}
