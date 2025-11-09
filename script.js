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
  <button id="loadMagentaBtn">🧠 Load Magenta AI</button>
  <span id="modelStatus" style="margin-left: 20px; color: #0f8">Magenta: Not Loaded</span>
`;
document.body.insertBefore(magentaControls, canvas.nextSibling);

// Audio
const audioElement = new Audio("song.mp3");
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- REAL Magenta.js Beat Detection ---
let onsetDetector;
let isMagentaLoaded = false;
let beatPredictions = [];
let lastProcessedTime = 0;

// Load Magenta's pre-trained onset detection model
async function loadMagentaModel() {
    const status = document.getElementById('modelStatus');
    status.textContent = "Magenta: Loading...";
    status.style.color = "#ff0";
    
    try {
        // REAL pre-trained model for beat detection
        onsetDetector = await mm.OnsetsAndFrames.initialize(
            'https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni'
        );
        
        status.textContent = "Magenta: Beat Detection Ready ✅";
        status.style.color = "#0f8";
        isMagentaLoaded = true;
        console.log("Magenta onset detection model loaded!");
    } catch (error) {
        console.error("Magenta failed to load:", error);
        status.textContent = "Magenta: Failed to load ❌";
        status.style.color = "#f00";
    }
}

// Process audio buffer with Magenta
async function processAudioWithMagenta(audioBuffer, currentTime) {
    if (!isMagentaLoaded || currentTime - lastProcessedTime < 0.5) return;
    
    try {
        // Convert to the format Magenta expects
        const monoAudio = convertToMono(audioBuffer);
        
        // Get beat predictions from REAL pre-trained model
        const predictions = await onsetDetector.onset(monoAudio);
        beatPredictions = Array.from(predictions);
        
        lastProcessedTime = currentTime;
        console.log("Magenta processed audio, found", predictions.length, "predictions");
    } catch (error) {
        console.error("Magenta processing failed:", error);
    }
}

// Convert stereo to mono for Magenta
function convertToMono(audioBuffer) {
    if (audioBuffer.length === 1) return audioBuffer[0];
    
    const mono = new Float32Array(audioBuffer[0].length);
    for (let i = 0; i < audioBuffer[0].length; i++) {
        mono[i] = (audioBuffer[0][i] + audioBuffer[1][i]) / 2;
    }
    return mono;
}

// Check if Magenta detects a beat
function checkMagentaBeat(currentTime, bufferIndex) {
    if (!isMagentaLoaded || beatPredictions.length === 0) return false;
    
    const predictionIndex = Math.min(bufferIndex, beatPredictions.length - 1);
    const beatProbability = beatPredictions[predictionIndex];
    
    // Use Magenta's confidence score
    return beatProbability > 0.7; // High confidence beat
}

// --- File upload ---
songUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    audioElement.src = URL.createObjectURL(file);
    resetGame();
});

// --- Magenta Button Events ---
document.getElementById('loadMagentaBtn').addEventListener('click', loadMagentaModel);

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
        let bufferIndex = 0;

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
            bufferSize: 2048, // Larger buffer for better Magenta analysis
            featureExtractors: ["rms", "buffer"],
            callback: async (features) => {
                if (!features || !gameActive) return;
                const rms = features.rms;
                const now = audioContext.currentTime;

                // Store RMS
                rmsHistory.push(rms);
                if (rmsHistory.length > historyLength) rmsHistory.shift();

                // Process with Magenta AI
                if (isMagentaLoaded && features.buffer) {
                    await processAudioWithMagenta(features.buffer, now);
                }

                let noteSpawned = false;
                let spawnReason = "rhythm";
                
                // Check for Magenta-detected beat first
                if (isMagentaLoaded && checkMagentaBeat(now, bufferIndex)) {
                    if (now - lastNoteTime > 0.2) {
                        lastNoteTime = now;
                        const laneIndex = Math.floor(Math.random() * lanes.length);
                        notes.push({ 
                            lane: laneIndex, 
                            y: 0, 
                            hit: false,
                            aiDetected: true // Mark as AI-detected
                        });
                        noteSpawned = true;
                        spawnReason = "magenta";
                        console.log("MAGENTA BEAT DETECTED!");
                    }
                }
                // Fallback to rhythm-based spawning
                else if (!isMagentaLoaded) {
                    const inputWindow = rmsHistory.slice(-20);
                    const avgRms = inputWindow.reduce((a, b) => a + b, 0) / inputWindow.length;
                    const beatProb = Math.min(avgRms * 20, 1);

                    if (beatProb > 0.5 && now - lastNoteTime > 0.2) {
                        lastNoteTime = now;
                        const laneIndex = Math.floor(Math.random() * lanes.length);
                        notes.push({ lane: laneIndex, y: 0, hit: false, aiDetected: false });
                        noteSpawned = true;
                        spawnReason = "fallback";
                    }
                }

                bufferIndex++;

                // AI visualization
                aiHistory.push({
                    beatProb: isMagentaLoaded ? (beatPredictions[bufferIndex % beatPredictions.length] || 0) : Math.min(rms * 20, 1),
                    magentaActive: isMagentaLoaded ? 1 : 0,
                    spawned: noteSpawned ? 1 : 0,
                    spawnReason: spawnReason
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
                // Bonus points for AI-detected beats
                score += note.aiDetected ? 150 : 100;
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

    // Draw hit line (green when Magenta is active)
    ctx.fillStyle = isMagentaLoaded ? "#8f4" : "yellow";
    ctx.fillRect(0, hitY, canvas.width, 5);

    // Draw notes (blue for AI-detected, red for rhythm-based)
    notes.forEach((n) => {
        n.y += 5;
        ctx.fillStyle = n.aiDetected ? "#48f" : "red";
        ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

        const keyPressed = keys[lanes[n.lane]];
        if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
            score += n.aiDetected ? 150 : 100;
            scoreEl.textContent = "Score: " + score;
            n.hit = true;
        }
    });

    notes = notes.filter(n => !n.hit && n.y < canvas.height);

    // Display AI info
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText(`Magenta: ${isMagentaLoaded ? "ACTIVE" : "OFF"}`, 10, 30);
    ctx.fillText(`Score: ${score}`, 10, 50);
    ctx.fillText(`AI Notes: ${notes.filter(n => n.aiDetected).length}`, 10, 70);

    requestAnimationFrame(gameLoop);
}

// --- Enhanced AI Visualization ---
function drawAIVisualization() {
    aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
    
    aiHistory.forEach((data, i) => {
        // Draw beat probability
        const beatHeight = data.beatProb * aiCanvas.height;
        aiCtx.fillStyle = data.magentaActive ? "#8f4" : "#08f";
        aiCtx.fillRect(i, aiCanvas.height - beatHeight, 1, beatHeight);

        // Mark when note spawned
        if (data.spawned) {
            aiCtx.fillStyle = data.spawnReason === "magenta" ? "#48f" : "#f00";
            aiCtx.fillRect(i, 0, 1, aiCanvas.height);
        }
    });

    // Draw legends
    aiCtx.fillStyle = "#8f4";
    aiCtx.fillText("Magenta Beat Prob", 10, 15);
    aiCtx.fillStyle = "#48f";
    aiCtx.fillText("AI Note", 10, 30);
    aiCtx.fillStyle = "#f00";
    aiCtx.fillText("Rhythm Note", 10, 45);
}

// --- Reset ---
function resetGame() {
    if (analyzer) analyzer.stop();
    if (audioContext) audioContext.close();

    notes = [];
    score = 0;
    rmsHistory = [];
    aiHistory = [];
    beatPredictions = [];
    scoreEl.textContent = "Score: 0";
    playBtn.disabled = false;
    playBtn.textContent = "▶️ Play Song";
    audioElement.pause();
    audioElement.currentTime = 0;
    gameActive = false;
}
