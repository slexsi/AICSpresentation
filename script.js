const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
const hitWindow = 40;
let notes = [];
let score = 0;
let gameActive = false;

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

// Add Magenta Controls
const magentaControls = document.createElement("div");
magentaControls.innerHTML = `
  <button id="loadModelBtn">🧠 Load Magenta Model</button>
  <span id="modelStatus" style="margin-left: 20px; color: #0f8">Magenta: Not Loaded</span>
`;
document.body.insertBefore(magentaControls, canvas.nextSibling);

// Audio
const audioElement = new Audio("song.mp3");
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- Magenta.js Real AI ---
let musicRNN;
let isModelLoaded = false;
let noteSequence = [];

// Load Magenta model
async function loadMagentaModel() {
  const status = document.getElementById('modelStatus');
  status.textContent = "Magenta: Loading...";
  status.style.color = "#ff0";
  
  try {
    // Import Magenta - this is the REAL Google-trained model
    musicRNN = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
    await musicRNN.initialize();
    
    status.textContent = "Magenta: Loaded ✅";
    status.style.color = "#0f8";
    isModelLoaded = true;
    console.log("Magenta model loaded successfully!");
  } catch (error) {
    status.textContent = "Magenta: Failed to load ❌";
    status.style.color = "#f00";
    console.error("Failed to load Magenta:", error);
  }
}

// Generate notes using Magenta's pre-trained model
async function generateNotesWithMagenta(quantizedSteps = 4) {
  if (!isModelLoaded) return [];
  
  try {
    // Create a simple seed for the AI to continue from
    const seed = {
      notes: [
        { pitch: 60, quantizedStartStep: 0, quantizedEndStep: 1 }, // C
        { pitch: 62, quantizedStartStep: 2, quantizedEndStep: 3 }, // D
      ],
      totalQuantizedSteps: quantizedSteps,
      quantizationInfo: { stepsPerQuarter: 4 }
    };
    
    // Let Magenta generate the continuation (REAL AI!)
    const generatedSequence = await musicRNN.continueSequence(seed, 20, 0.5);
    
    // Convert Magenta's musical notes to game notes
    const gameNotes = generatedSequence.notes.map(note => {
      // Map pitches to lanes (60-67 maps to 0-3 lanes)
      const lane = (note.pitch - 60) % lanes.length;
      // Convert quantized steps to timing
      const spawnTime = note.quantizedStartStep * 0.5; // 0.5 seconds per step
      
      return {
        lane: Math.max(0, Math.min(lanes.length - 1, lane)),
        spawnTime: spawnTime,
        duration: (note.quantizedEndStep - note.quantizedStartStep) * 0.5
      };
    });
    
    console.log("Magenta generated notes:", gameNotes);
    return gameNotes;
    
  } catch (error) {
    console.error("Magenta generation failed:", error);
    return [];
  }
}

// Real-time beat detection with Magenta influence
function shouldSpawnNote(rms, lastNoteTime, currentTime, beatProbability) {
  if (!isModelLoaded) {
    // Fallback: simple rhythm-based spawning
    return rms > 0.2 && (currentTime - lastNoteTime > 0.3);
  }
  
  // Use Magenta's generated sequence as a guide
  const nextNote = noteSequence.find(note => 
    note.spawnTime > currentTime && 
    note.spawnTime <= currentTime + 0.2
  );
  
  return nextNote !== undefined;
}

// --- File upload ---
songUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  audioElement.src = URL.createObjectURL(file);
  resetGame();
});

// --- Magenta Button Events ---
document.getElementById('loadModelBtn').addEventListener('click', loadMagentaModel);

// --- Play button ---
playBtn.addEventListener("click", async () => {
  if (gameActive) return;
  
  resetGame();
  playBtn.textContent = "Loading...";
  gameActive = true;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(audioContext.destination);

    let lastNoteTime = 0;

    // Generate note sequence with Magenta when song starts
    if (isModelLoaded) {
      noteSequence = await generateNotesWithMagenta();
      console.log("Using Magenta-generated sequence:", noteSequence);
    }

    // Stop when music ends
    audioElement.addEventListener('ended', () => {
      console.log("Music ended - stopping game");
      gameActive = false;
      playBtn.textContent = "▶️ Play Song";
      if (analyzer) analyzer.stop();
    });

    analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source: sourceNode,
      bufferSize: 1024,
      featureExtractors: ["rms"],
      callback: (features) => {
        if (!features || !gameActive) return;
        const rms = features.rms;
        const now = audioContext.currentTime;

        // Store RMS
        rmsHistory.push(rms);
        if (rmsHistory.length > historyLength) rmsHistory.shift();

        // Use REAL Magenta AI for note generation
        const recentRms = rmsHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const shouldSpawn = shouldSpawnNote(recentRms, lastNoteTime, now, 0.5);

        let noteSpawned = false;
        if (shouldSpawn && (now - lastNoteTime > 0.2)) {
          lastNoteTime = now;
          
          // Choose lane based on Magenta or random fallback
          let laneIndex;
          if (isModelLoaded && noteSequence.length > 0) {
            // Use Magenta's suggested lane
            const nextNote = noteSequence.shift();
            laneIndex = nextNote.lane;
          } else {
            // Fallback: random lane
            laneIndex = Math.floor(Math.random() * lanes.length);
          }
          
          notes.push({ 
            lane: laneIndex, 
            y: 0, 
            hit: false,
            aiGenerated: isModelLoaded // Track if Magenta generated this
          });
          noteSpawned = true;
        }

        // AI visualization
        aiHistory.push({
          magentaActive: isModelLoaded ? 1 : 0,
          notesRemaining: noteSequence.length,
          spawned: noteSpawned ? 1 : 0,
          music: recentRms
        });
        if (aiHistory.length > aiCanvas.width) aiHistory.shift();
        drawAIVisualization();
      },
    });

    analyzer.start();
    await audioElement.play();
    playBtn.textContent = "Playing...";
    gameLoop();
  } catch (err) {
    console.error(err);
    playBtn.textContent = "▶️ Try Again";
    gameActive = false;
  }
});

// --- Key input ---
const keys = {};
window.addEventListener("keydown", (e) => { 
  const key = e.key.toLowerCase();
  keys[key] = true; 
  
  const laneIndex = lanes.indexOf(key);
  if (laneIndex !== -1) {
    let hit = false;
    notes.forEach(note => {
      if (note.lane === laneIndex && Math.abs(note.y - hitY) < hitWindow && !note.hit) {
        score += note.aiGenerated ? 150 : 100; // Bonus for AI-generated notes
        scoreEl.textContent = "Score: " + score;
        note.hit = true;
        hit = true;
      }
    });
  }
});

window.addEventListener("keyup", (e) => { 
  keys[e.key.toLowerCase()] = false; 
});

// --- Main game loop ---
function gameLoop() {
  if (!gameActive) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // Draw hit line
  ctx.fillStyle = isModelLoaded ? "#8f4" : "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // Draw notes (Magenta-generated notes are blue)
  notes.forEach((n) => {
    n.y += 5;
    ctx.fillStyle = n.aiGenerated ? "#48f" : "red"; // Blue for AI notes
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += n.aiGenerated ? 150 : 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
    }
  });

  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  // Display Magenta info
  ctx.fillStyle = "white";
  ctx.font = "14px Arial";
  ctx.fillText(`Magenta: ${isModelLoaded ? "ACTIVE" : "OFF"}`, 10, 30);
  ctx.fillText(`AI Notes: ${noteSequence.length}`, 10, 50);
  ctx.fillText(`Score: ${score}`, 10, 70);

  requestAnimationFrame(gameLoop);
}

// --- Enhanced AI Visualization ---
function drawAIVisualization() {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  
  aiHistory.forEach((data, i) => {
    // Draw Magenta activity
    const magentaHeight = data.magentaActive * aiCanvas.height * 0.3;
    aiCtx.fillStyle = "#8f4";
    aiCtx.fillRect(i, aiCanvas.height - magentaHeight, 1, magentaHeight);

    // Draw music intensity
    const musicHeight = data.music * aiCanvas.height * 0.5;
    aiCtx.fillStyle = "#f80";
    aiCtx.fillRect(i, aiCanvas.height - musicHeight, 1, musicHeight);

    // Mark when note spawned
    if (data.spawned) {
      aiCtx.fillStyle = data.magentaActive ? "#48f" : "#f00";
      aiCtx.fillRect(i, 0, 1, aiCanvas.height);
    }
  });

  // Draw legends
  aiCtx.fillStyle = "#8f4";
  aiCtx.fillText("Magenta", 10, 15);
  aiCtx.fillStyle = "#f80";
  aiCtx.fillText("Music", 10, 30);
  aiCtx.fillStyle = "#48f";
  aiCtx.fillText("AI Note", 10, 45);
}

// --- Reset ---
function resetGame() {
  if (analyzer) analyzer.stop();
  if (audioContext) audioContext.close();

  notes = [];
  score = 0;
  rmsHistory = [];
  aiHistory = [];
  noteSequence = [];
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
  gameActive = false;
}
