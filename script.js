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
  <button id="saveBtn">💾 Save Model</button>
  <button id="loadBtn">📂 Load Model</button>
  <span id="modelStatus" style="margin-left: 20px; color: #0f8">Model: Not Trained</span>
`;
document.body.insertBefore(mlControls, canvas.nextSibling);

// Audio
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- REAL Neural Network with TensorFlow.js ---
let model;
let isTraining = false;
let trainingData = [];
const MAX_TRAINING_DATA = 1000;
let playerStats = {
  hits: 0,
  misses: 0,
  accuracy: 0.5,
  currentStreak: 0,
  totalNotes: 0
};

// Initialize the neural network
async function createModel() {
  model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [5], units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 8, activation: 'relu' }),
      tf.layers.dense({ units: 2, activation: 'sigmoid' })
    ]
  });

  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  await loadModel();
  return model;
}

// Collect training data during gameplay
function collectTrainingData(inputFeatures, actualResult, playerAction) {
  if (trainingData.length >= MAX_TRAINING_DATA) {
    trainingData.shift();
  }

  trainingData.push({
    input: inputFeatures,
    output: actualResult,
    timestamp: Date.now(),
    playerAction: playerAction
  });

  document.getElementById('modelStatus').textContent = 
    `Model: ${trainingData.length}/${MAX_TRAINING_DATA} samples`;
}

// Train the model
async function trainModel() {
  if (trainingData.length < 20) {
    alert(`Need at least 20 samples to train. Currently: ${trainingData.length}`);
    return;
  }

  isTraining = true;
  const trainBtn = document.getElementById('trainBtn');
  trainBtn.textContent = "Training...";
  trainBtn.disabled = true;

  try {
    const inputs = trainingData.map(data => data.input);
    const outputs = trainingData.map(data => data.output);

    const inputTensor = tf.tensor2d(inputs);
    const outputTensor = tf.tensor2d(outputs);

    await model.fit(inputTensor, outputTensor, {
      epochs: 10,
      batchSize: 8,
      validationSplit: 0.1
    });

    inputTensor.dispose();
    outputTensor.dispose();

    document.getElementById('modelStatus').textContent = "Model: Trained ✅";
    await saveModel();
    
  } catch (error) {
    console.error('Training failed:', error);
    document.getElementById('modelStatus').textContent = "Model: Training Failed ❌";
  }

  isTraining = false;
  trainBtn.textContent = "🔧 Train Model";
  trainBtn.disabled = false;
}

// Save model to browser storage
async function saveModel() {
  try {
    await model.save('indexeddb://rhythm-game-model');
    console.log('Model saved successfully');
  } catch (error) {
    console.error('Failed to save model:', error);
  }
}

// Load model from browser storage
async function loadModel() {
  try {
    model = await tf.loadLayersModel('indexeddb://rhythm-game-model');
    document.getElementById('modelStatus').textContent = "Model: Loaded ✅";
    console.log('Model loaded successfully');
  } catch (error) {
    console.log('No saved model found, creating new one');
    document.getElementById('modelStatus').textContent = "Model: New (Needs Training)";
  }
}

// Predict using the neural network
async function predictWithNN(inputFeatures) {
  if (!model || trainingData.length < 10) {
    const avgRms = inputFeatures[0];
    return {
      shouldSpawn: avgRms > 0.05,
      difficulty: 0.5
    };
  }

  const inputTensor = tf.tensor2d([inputFeatures]);
  const prediction = model.predict(inputTensor);
  const result = await prediction.data();
  inputTensor.dispose();
  prediction.dispose();

  return {
    shouldSpawn: result[0] > 0.5,
    difficulty: result[1]
  };
}

// Initialize ML system
createModel();

// --- File upload ---
songUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  audioElement.src = URL.createObjectURL(file);
  resetGame();
});

// --- ML Button Events ---
document.getElementById('trainBtn').addEventListener('click', trainModel);
document.getElementById('saveBtn').addEventListener('click', saveModel);
document.getElementById('loadBtn').addEventListener('click', loadModel);

// --- Fixed Play button ---
playBtn.addEventListener("click", async () => {
  // If already playing and "Try Again" is clicked, do full reset
  if (playBtn.textContent === "▶️ Try Again") {
    resetGame();
    // Small delay to ensure clean reset
    setTimeout(() => {
      playBtn.click(); // Trigger play again
    }, 100);
    return;
  }

  playBtn.textContent = "Loading...";
  playBtn.disabled = true;

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    await audioContext.resume();

    // Recreate source node each time
    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(audioContext.destination);

    let lastNoteTime = 0;

    analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source: sourceNode,
      bufferSize: 1024,
      featureExtractors: ["rms"],
      callback: async (features) => {
        if (!features) return;
        const rms = features.rms;
        const now = audioContext.currentTime;

        rmsHistory.push(rms);
        if (rmsHistory.length > historyLength) rmsHistory.shift();

        playerStats.accuracy = playerStats.hits / (playerStats.hits + playerStats.misses || 1);
        
        const recentRms = rmsHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const inputFeatures = [
          recentRms,
          playerStats.accuracy,
          playerStats.currentStreak / 10,
          0.5,
          Math.min((now - lastNoteTime) * 2, 1)
        ];

        const prediction = await predictWithNN(inputFeatures);

        let noteSpawned = false;
        if (prediction.shouldSpawn && (now - lastNoteTime > 0.2)) {
          lastNoteTime = now;
          const laneIndex = Math.floor(Math.random() * lanes.length);
          notes.push({ 
            lane: laneIndex, 
            y: 0, 
            hit: false,
            spawnTime: now
          });
          noteSpawned = true;
          playerStats.totalNotes++;
        }

        if (noteSpawned) {
          setTimeout(() => {
            const note = notes.find(n => n.spawnTime === now && !n.hit);
            const wasHit = !note;
            
            collectTrainingData(
              inputFeatures,
              [wasHit ? 1 : 0, prediction.difficulty],
              { spawned: true, wasHit: wasHit }
            );
          }, 1000);
        }

        aiHistory.push({
          confidence: prediction.shouldSpawn ? 1 : 0,
          difficulty: prediction.difficulty,
          spawned: noteSpawned
        });
        if (aiHistory.length > aiCanvas.width) aiHistory.shift();
        drawAIVisualization();
      },
    });

    analyzer.start();
    await audioElement.play();
    playBtn.textContent = "Playing...";
    playBtn.disabled = false;
    gameLoop();
  } catch (err) {
    console.error(err);
    playBtn.textContent = "▶️ Try Again";
    playBtn.disabled = false;
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
        score += 100;
        scoreEl.textContent = "Score: " + score;
        note.hit = true;
        hit = true;
      }
    });
    
    if (hit) {
      playerStats.hits++;
      playerStats.currentStreak++;
    }
  }
});

window.addEventListener("keyup", (e) => { 
  keys[e.key.toLowerCase()] = false; 
});

// --- Main game loop ---
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  notes.forEach((n) => {
    n.y += 5;
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    if (n.y > hitY + hitWindow && !n.hit) {
      n.hit = true;
      playerStats.misses++;
      playerStats.currentStreak = 0;
    }
  });

  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  ctx.fillStyle = "white";
  ctx.font = "14px Arial";
  ctx.fillText(`Training Samples: ${trainingData.length}`, 10, 30);
  ctx.fillText(`Model: ${isTraining ? 'Training...' : (trainingData.length > 20 ? 'Ready' : 'Needs Data')}`, 10, 50);

  requestAnimationFrame(gameLoop);
}

// --- Enhanced AI Visualization ---
function drawAIVisualization() {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  
  aiHistory.forEach((data, i) => {
    const confidenceHeight = data.confidence * aiCanvas.height;
    aiCtx.fillStyle = "#08f";
    aiCtx.fillRect(i, aiCanvas.height - confidenceHeight, 1, confidenceHeight);

    const difficultyHeight = data.difficulty * aiCanvas.height * 0.3;
    aiCtx.fillStyle = "#f08";
    aiCtx.fillRect(i, aiCanvas.height - difficultyHeight, 1, difficultyHeight);

    if (data.spawned) {
      aiCtx.fillStyle = "#0f8";
      aiCtx.fillRect(i, 0, 1, aiCanvas.height);
    }
  });

  aiCtx.fillStyle = "#08f";
  aiCtx.fillText("Confidence", 10, 15);
  aiCtx.fillStyle = "#f08";
  aiCtx.fillText("Difficulty", 10, 30);
  aiCtx.fillStyle = "#0f8";
  aiCtx.fillText("Note Spawn", 10, 45);
}

// --- Reset Function ---
function resetGame() {
  if (analyzer) {
    analyzer.stop();
  }
  
  notes = [];
  score = 0;
  rmsHistory = [];
  aiHistory = [];
  playerStats = {
    hits: 0,
    misses: 0,
    accuracy: 0.5,
    currentStreak: 0,
    totalNotes: 0
  };
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
