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
const audioElement = new Audio("song.mp3");
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- REAL Neural Network with TensorFlow.js ---
let model;
let isTraining = false;
let trainingData = [];
const MAX_TRAINING_DATA = 1000;

// Initialize the neural network
async function createModel() {
  model = tf.sequential({
    layers: [
      // Input: [rms, accuracy, streak, difficulty, timing]
      tf.layers.dense({ inputShape: [5], units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 8, activation: 'relu' }),
      // Output: [should_spawn, optimal_difficulty]
      tf.layers.dense({ units: 2, activation: 'sigmoid' })
    ]
  });

  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
    metrics: ['accuracy']
  });

  // Try to load saved model
  await loadModel();
  return model;
}

// Collect training data during gameplay
function collectTrainingData(inputFeatures, actualResult, playerAction) {
  if (trainingData.length >= MAX_TRAINING_DATA) {
    trainingData.shift(); // Remove oldest data
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
  if (trainingData.length < 50) {
    alert(`Need at least 50 samples to train. Currently: ${trainingData.length}`);
    return;
  }

  isTraining = true;
  const trainBtn = document.getElementById('trainBtn');
  trainBtn.textContent = "Training...";
  trainBtn.disabled = true;

  try {
    // Prepare training data
    const inputs = [];
    const outputs = [];

    trainingData.forEach(data => {
      inputs.push(data.input);
      outputs.push(data.output);
    });

    const inputTensor = tf.tensor2d(inputs);
    const outputTensor = tf.tensor2d(outputs);

    // Train the model
    await model.fit(inputTensor, outputTensor, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss = ${logs.loss}`);
        }
      }
    });

    // Clean up tensors
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
    // Fallback to simple rule-based system if no model
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
    let playerStats = {
      hits: 0,
      misses: 0,
      accuracy: 0.5,
      currentStreak: 0,
      totalNotes: 0
    };

    analyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source: sourceNode,
      bufferSize: 1024,
      featureExtractors: ["rms"],
      callback: async (features) => {
        if (!features) return;
        const rms = features.rms;
        const now = audioContext.currentTime;

        // Store RMS
        rmsHistory.push(rms);
        if (rmsHistory.length > historyLength) rmsHistory.shift();

        // Calculate player accuracy in real-time
        playerStats.accuracy = playerStats.hits / (playerStats.hits + playerStats.misses || 1);
        
        // Prepare features for neural network
        const recentRms = rmsHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const inputFeatures = [
          recentRms,                    // Music intensity
          playerStats.accuracy,         // Player skill
          playerStats.currentStreak / 10, // Current performance
          0.5,                         // Current difficulty (placeholder)
          Math.min((now - lastNoteTime) * 2, 1) // Time since last note
        ];

        // Get prediction from neural network
        const prediction = await predictWithNN(inputFeatures);

        // Spawn note based on neural network decision
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

        // Collect training data (learn from player performance)
        if (noteSpawned) {
          setTimeout(() => {
            // Check if this note was hit (success) or missed (failure)
            const note = notes.find(n => n.spawnTime === now && !n.hit);
            const wasHit = !note; // If note doesn't exist anymore, it was hit
            
            collectTrainingData(
              inputFeatures,
              [wasHit ? 1 : 0, prediction.difficulty], // Target: should have spawned? what difficulty?
              { spawned: true, wasHit: wasHit }
            );
          }, 1000); // Wait 1 second to see if note gets hit
        }

        // AI visualization
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
    gameLoop(playerStats);
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
  
  // Handle hits
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
    
    // Update player stats for ML
    if (hit) {
      if (typeof playerStats !== 'undefined') {
        playerStats.hits++;
        playerStats.currentStreak++;
      }
    }
  }
});

window.addEventListener("keyup", (e) => { 
  keys[e.key.toLowerCase()] = false; 
});

// --- Main game loop ---
function gameLoop(playerStats) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw lanes
  lanes.forEach((key, i) => {
    ctx.fillStyle = keys[key] ? "#0f0" : "#333";
    ctx.fillRect(i * laneWidth, 0, laneWidth - 2, canvas.height);
  });

  // Draw hit line
  ctx.fillStyle = "yellow";
  ctx.fillRect(0, hitY, canvas.width, 5);

  // Draw notes and track misses
  notes.forEach((n) => {
    n.y += 5;
    ctx.fillStyle = "red";
    ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

    // Track missed notes (passed hit line without being hit)
    if (n.y > hitY + hitWindow && !n.hit && playerStats) {
      n.hit = true; // Mark as hit to remove, but count as miss
      playerStats.misses++;
      playerStats.currentStreak = 0;
    }
  });

  notes = notes.filter(n => !n.hit && n.y < canvas.height);

  // Draw ML info
  ctx.fillStyle = "white";
  ctx.font = "14px Arial";
  ctx.fillText(`Training Samples: ${trainingData.length}`, 10, 30);
  ctx.fillText(`Model: ${isTraining ? 'Training...' : (trainingData.length > 50 ? 'Ready' : 'Needs Data')}`, 10, 50);

  requestAnimationFrame(() => gameLoop(playerStats));
}

// --- Enhanced AI Visualization ---
function drawAIVisualization() {
  aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
  
  aiHistory.forEach((data, i) => {
    // Draw confidence level
    const confidenceHeight = data.confidence * aiCanvas.height;
    aiCtx.fillStyle = "#08f";
    aiCtx.fillRect(i, aiCanvas.height - confidenceHeight, 1, confidenceHeight);

    // Draw difficulty level
    const difficultyHeight = data.difficulty * aiCanvas.height * 0.3;
    aiCtx.fillStyle = "#f08";
    aiCtx.fillRect(i, aiCanvas.height - difficultyHeight, 1, difficultyHeight);

    // Mark when note spawned
    if (data.spawned) {
      aiCtx.fillStyle = "#0f8";
      aiCtx.fillRect(i, 0, 1, aiCanvas.height);
    }
  });

  // Draw legends
  aiCtx.fillStyle = "#08f";
  aiCtx.fillText("Confidence", 10, 15);
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
  scoreEl.textContent = "Score: 0";
  playBtn.disabled = false;
  playBtn.textContent = "▶️ Play Song";
  audioElement.pause();
  audioElement.currentTime = 0;
}
