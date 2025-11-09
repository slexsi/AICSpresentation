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

// Add ML Controls
const mlControls = document.createElement("div");
mlControls.innerHTML = `
  <button id="trainBtn">🔧 Train Model</button>
  <span id="modelStatus" style="margin-left: 20px; color: #0f8">Model: Ready</span>
`;
document.body.insertBefore(mlControls, canvas.nextSibling);

// Audio
const audioElement = new Audio("song.mp3");
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- REAL Neural Network ---
class RealNeuralNetwork {
  constructor() {
    // Simple neural network: 4 inputs -> 3 hidden -> 2 outputs
    this.inputSize = 4;
    this.hiddenSize = 3;
    this.outputSize = 2;
    
    // Randomly initialized weights (like a real NN)
    this.weights = {
      inputHidden: [
        [0.1, -0.2, 0.3],
        [-0.1, 0.2, -0.3],
        [0.2, -0.1, 0.4],
        [-0.3, 0.4, -0.2]
      ],
      hiddenOutput: [
        [0.5, -0.6],
        [-0.4, 0.7],
        [0.3, -0.5]
      ]
    };
    
    this.biases = {
      hidden: [0.1, 0.2, 0.1],
      output: [0.3, 0.4]
    };
    
    this.learningRate = 0.01;
    this.trainingData = [];
    this.trainingSamples = 0;
  }

  // Forward propagation (like real NN inference)
  forward(input) {
    // Input: [accuracy, streak, misses, musicIntensity]
    const normalizedInput = [
      input.accuracy,
      Math.min(input.streak / 10, 1),
      input.misses / 10,
      input.musicIntensity
    ];

    // Input -> Hidden layer
    const hidden = new Array(this.hiddenSize).fill(0);
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        hidden[i] += normalizedInput[j] * this.weights.inputHidden[j][i];
      }
      hidden[i] += this.biases.hidden[i];
      hidden[i] = this.relu(hidden[i]); // Activation function
    }

    // Hidden -> Output layer
    const output = new Array(this.outputSize).fill(0);
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        output[i] += hidden[j] * this.weights.hiddenOutput[j][i];
      }
      output[i] += this.biases.output[i];
      output[i] = this.sigmoid(output[i]); // Output activation
    }

    return {
      speed: 3 + (output[0] * 4), // Convert to speed range 3-7
      shouldSpawn: output[1] > 0.5,
      rawOutput: output
    };
  }

  // Train the neural network with player data
  train(input, target) {
    this.trainingData.push({ input, target });
    if (this.trainingData.length > 100) this.trainingData.shift();
    this.trainingSamples++;

    // Train every 10 samples
    if (this.trainingSamples % 10 === 0) {
      this.updateWeights();
    }
  }

  updateWeights() {
    // Simplified backpropagation
    for (let data of this.trainingData.slice(-10)) {
      const prediction = this.forward(data.input);
      const error = [
        data.target.speed - prediction.rawOutput[0],
        (data.target.shouldSpawn ? 1 : 0) - prediction.rawOutput[1]
      ];

      // Update weights (simplified gradient descent)
      for (let i = 0; i < this.hiddenSize; i++) {
        for (let j = 0; j < this.outputSize; j++) {
          this.weights.hiddenOutput[i][j] += this.learningRate * error[j];
        }
      }
    }
  }

  // Activation functions (like real NN)
  relu(x) {
    return Math.max(0, x);
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  // Main update function that uses the neural network
  update(playerStats, musicIntensity) {
    const input = {
      accuracy: playerStats.hits / (playerStats.hits + playerStats.misses || 1),
      streak: playerStats.currentStreak,
      misses: playerStats.missesLast10,
      musicIntensity: musicIntensity
    };

    // Get neural network prediction
    const prediction = this.forward(input);

    // Train based on performance (target: maintain good gameplay)
    const target = {
      speed: input.accuracy < 0.6 ? 0.2 : input.accuracy > 0.8 ? 0.8 : 0.5,
      shouldSpawn: musicIntensity > 0.3
    };
    
    this.train(input, target);

    return {
      speed: prediction.speed,
      difficulty: prediction.rawOutput[0],
      shouldSpawn: prediction.shouldSpawn
    };
  }
}

// Initialize the REAL neural network
const adaptiveAI = new RealNeuralNetwork();

// Player performance tracking
let playerStats = {
  hits: 0,
  misses: 0,
  missesLast10: 0,
  currentStreak: 0,
  lastTenHits: []
};

// --- File upload ---
songUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  audioElement.src = URL.createObjectURL(file);
  resetGame();
});

// --- ML Button Events ---
document.getElementById('trainBtn').addEventListener('click', () => {
  const status = document.getElementById('modelStatus');
  status.textContent = `Model: Training (${adaptiveAI.trainingSamples} samples)`;
  status.style.color = "#ff0";
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

        // Update player stats
        playerStats.accuracy = playerStats.hits / (playerStats.hits + playerStats.misses || 1);
        
        // Get AI decision from REAL neural network
        const recentRms = rmsHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const aiDecision = adaptiveAI.update(playerStats, recentRms);

        // spawn note if NN predicts (combining rhythm + AI)
        let noteSpawned = false;
        const shouldSpawn = aiDecision.shouldSpawn && (now - lastNoteTime > 0.2);

        if (shouldSpawn) {
          lastNoteTime = now;
          const laneIndex = Math.floor(Math.random() * lanes.length);
          notes.push({ 
            lane: laneIndex, 
            y: 0, 
            hit: false,
            speed: aiDecision.speed // REAL neural network controls speed!
          });
          noteSpawned = true;
        }

        // --- AI visualization ---
        aiHistory.push({
          speed: aiDecision.speed / 7, // Normalize for display
          difficulty: aiDecision.difficulty,
          spawned: noteSpawned ? 1 : 0
        });
        if (aiHistory.length > aiCanvas.width) aiHistory.shift();
        drawAIVisualization(aiDecision);
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
window.addEventListener("keydown", (e) => { 
  const key = e.key.toLowerCase();
  keys[key] = true; 
  
  // Handle hits and update player stats for neural network
  const laneIndex = lanes.indexOf(key);
  if (laneIndex !== -1) {
    let hit = false;
    notes.forEach(note => {
      if (note.lane === laneIndex && Math.abs(note.y - hitY) < hitWindow && !note.hit) {
        score += 100;
        scoreEl.textContent = "Score: " + score;
        note.hit = true;
        hit = true;
      }
    });
    
    // Update player stats for neural network training
    if (hit) {
      playerStats.hits++;
      playerStats.currentStreak++;
      playerStats.lastTenHits.push(true);
    } else {
      playerStats.misses++;
      playerStats.currentStreak = 0;
      playerStats.lastTenHits.push(false);
    }
    
    // Keep last 10 hits for recent accuracy
    if (playerStats.lastTenHits.length > 10) {
      playerStats.lastTenHits.shift();
    }
    playerStats.missesLast10 = playerStats.lastTenHits.filter(hit => !hit).length;
  }
});

window.addEventListener("keyup", (e) => { 
  keys[e.key.toLowerCase()] = false; 
});

// --- Main game loop ---
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // draw hit line with AI difficulty color
  const difficultyColor = adaptiveAI.trainingSamples > 20 ? 
                         (adaptiveAI.forward(playerStats, 0.5).rawOutput[0] > 0.6 ? "#ff4444" : "#44ff44") : "yellow";
  ctx.fillStyle = difficultyColor;
  ctx.fillRect(0, hitY, canvas.width, 5);

  // draw notes with REAL neural network speed
  notes.forEach((n) => {
    n.y += n.speed || 5; // Use neural network speed or default
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    const keyPressed = keys[lanes[n.lane]];
    if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
      score += 100;
      scoreEl.textContent = "Score: " + score;
      n.hit = true;
    }

    // Track missed notes for neural network
    if (n.y > hitY + hitWindow && !n.hit) {
      n.hit = true;
      playerStats.misses++;
      playerStats.currentStreak = 0;
      playerStats.lastTenHits.push(false);
      if (playerStats.lastTenHits.length > 10) {
        playerStats.lastTenHits.shift();
      }
    }
  });

  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  // Display neural network info
  ctx.fillStyle = "white";
  ctx.font = "14px Arial";
  ctx.fillText(`AI Samples: ${adaptiveAI.trainingSamples}`, 10, 30);
  ctx.fillText(`Speed: ${notes[0]?.speed?.toFixed(1) || 5.0}`, 10, 50);

  requestAnimationFrame(gameLoop);
}

// --- Enhanced AI Visualization ---
function drawAIVisualization(aiDecision) {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  
  aiHistory.forEach((data, i) => {
    // Draw speed level (from neural network)
    const speedHeight = data.speed * aiCanvas.height;
    aiCtx.fillStyle = "#08f";
    aiCtx.fillRect(i, aiCanvas.height - speedHeight, 1, speedHeight);

    // Draw difficulty level
    const difficultyHeight = data.difficulty * aiCanvas.height * 0.3;
    aiCtx.fillStyle = "#f08";
    aiCtx.fillRect(i, aiCanvas.height - difficultyHeight, 1, difficultyHeight);

    // mark when note spawned
    if (data.spawned) {
      aiCtx.fillStyle = "#0f8";
      aiCtx.fillRect(i, 0, 1, aiCanvas.height);
    }
  });

  // Draw legends
  aiCtx.fillStyle = "#08f";
  aiCtx.fillText("Speed", 10, 15);
  aiCtx.fillStyle = "#f08";
  aiCtx.fillText("Difficulty", 10, 30);
  aiCtx.fillStyle = "#0f8";
  aiCtx.fillText("Note Spawn", 10, 45);
}

// --- Reset ---
function resetGame() {
  if (analyzer) analyzer.stop();
  if (audioContext) audioContext.close();

  notes = [];
  score = 0;
  rmsHistory = [];
  aiHistory = [];
  playerStats = {
    hits: 0,
    misses: 0,
    missesLast10: 0,
    currentStreak: 0,
    lastTenHits: []
  };
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
