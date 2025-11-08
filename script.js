const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a","s","k","l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
const hitWindow = 40;

let notes = [];
let score = 0;

// Buttons and audio
const playBtn = document.createElement("button");
playBtn.textContent = "▶️ Play Song";
document.body.insertBefore(playBtn, canvas.nextSibling);

const songUpload = document.getElementById("songUpload");
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode;
let drumRNN;
const MODEL_URL = "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn";

// --- Load Drum RNN ---
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
  playBtn.textContent = "Loading...";

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(audioContext.destination);

    await audioElement.play();
    playBtn.textContent = "Playing...";

    // Load RNN if not loaded
    if (!drumRNN) await loadRNN();

    // Generate notes from Drum RNN
    const seedSeq = { notes: [] }; // empty seed
    const rnnSeq = await drumRNN.continueSequence(seedSeq, 64, 1.0);

    rnnSeq.notes.forEach(n => {
      let lane;
      if (n.pitch === 36) lane = 0;
      else if (n.pitch === 38) lane = 1;
      else lane = 2;
      notes.push({ lane, y: 0, hit: false, type:"rnn", time:n.startTime, spawned:false });
    });

    gameLoop();
  } catch(err) {
    console.error(err);
    playBtn.textContent = "▶️ Try Again";
  }
});

// --- Key input ---
const keys = {};
window.addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

// --- Game loop ---
const NOTE_SPEED = 200;
function gameLoop() {
  const now = audioContext ? audioContext.currentTime : 0;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw lanes
  lanes.forEach((k,i)=>{
    ctx.fillStyle = keys[k] ? "#0f0":"#333";
    ctx.fillRect(i*laneWidth,0,laneWidth-2,canvas.height);
  });

  // hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0,hitY,canvas.width,5);

  // spawn notes
  notes.forEach(n=>{
    if(n.type==="rnn" && n.time && !n.spawned && n.time-now<=1.5) n.spawned=true;
  });

  // draw notes
  notes.forEach(n=>{
    if(n.type==="rnn" && n.time && !n.spawned) return;

    if(n.type==="rnn") n.y = hitY - (n.time - now)*NOTE_SPEED;

    ctx.fillStyle = "blue";
    ctx.fillRect(n.lane*laneWidth+5, n.y, laneWidth-10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if(Math.abs(n.y-hitY)<hitWindow && keyPressed && !n.hit){
      score+=100;
      scoreEl.textContent = "Score: "+score;
      n.hit=true;
    }
  });

  notes = notes.filter(n=>!n.hit && n.y<canvas.height+30);
  requestAnimationFrame(gameLoop);
}

// --- Reset ---
function resetGame(){
  if(audioContext) audioContext.close();
  notes=[];
  score=0;
  scoreEl.textContent="Score: 0";
  playBtn.disabled=false;
  playBtn.textContent="▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime=0;
}
