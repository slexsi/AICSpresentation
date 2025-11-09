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
const aiCanvas = document.getElementById("aiCanvas");
const aiCtx = aiCanvas.getContext("2d");
let aiHistory = [];

// Buttons
const playBtn = document.getElementById("playBtn");
const songUpload = document.getElementById("songUpload");
const loadMagentaBtn = document.getElementById("loadMagentaBtn");
const modelStatus = document.getElementById("modelStatus");

// Lane key elements
const laneKeys = {
    'a': document.getElementById('keyA'),
    's': document.getElementById('keyS'), 
    'k': document.getElementById('keyK'),
    'l': document.getElementById('keyL')
};

// Audio
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- REAL Magenta.js Integration ---
let onsetDetector;
let isMagentaLoaded = false;
let magentaActuallyWorking = false;
let beatPredictions = [];
let lastMagentaProcessTime = 0;

// Load Magenta's pre-trained onset detection model
async function loadMagentaModel() {
    modelStatus.textContent = "Magenta: Loading...";
    modelStatus.style.color = "#ff0";
    loadMagentaBtn.disabled = true;
    
    try {
        // REAL pre-trained model for beat detection
        onsetDetector = await mm.OnsetsAndFrames.initialize(
            'https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni'
        );
        
        // Test if it actually works
        const testBuffer = new Float32Array(2048).fill(0.1);
        const testPredictions = await onsetDetector.onset(testBuffer);
        
        if (testPredictions && testPredictions.length > 0) {
            modelStatus.textContent = "Magenta: ACTIVE ✅";
            modelStatus.style.color = "#0f8";
            isMagentaLoaded = true;
            magentaActuallyWorking = true;
            console.log("🎵 Magenta beat detection ACTIVE");
        } else {
            throw new Error("Model loaded but not functioning");
        }
        
    } catch (error) {
        console.error("❌ Magenta failed:", error);
        modelStatus.textContent = "Magenta: FAILED ❌";
        modelStatus.style.color = "#f00";
        isMagentaLoaded = false;
        magentaActuallyWorking = false;
    }
    
    loadMagentaBtn.disabled = false;
}

// Process audio with REAL Magenta AI
async function processAudioWithMagenta(audioBuffer, currentTime) {
    if (!magentaActuallyWorking || currentTime - lastMagentaProcessTime < 0.3) {
        return false;
    }
    
    try {
        // Convert to mono for Magenta
        const monoAudio = convertToMono(audioBuffer);
        
        // REAL AI PROCESSING - This uses the pre-trained model
        const predictions = await onsetDetector.onset(monoAudio);
        beatPredictions = Array.from(predictions);
        
        lastMagentaProcessTime = currentTime;
        
        // Check if we detected any strong beats
        const strongBeats = beatPredictions.filter(prob => prob > 0.7).length;
        if (strongBeats > 0) {
            console.log(`🎯 Magenta detected ${strongBeats} beats`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error("Magenta processing error:", error);
        magentaActuallyWorking = false;
        modelStatus.textContent = "Magenta: ERROR ❌";
        return false;
    }
}

// Convert stereo to mono for Magenta
function convertToMono(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) return new Float32Array(1024);
    
    if (audioBuffer.length === 1) return audioBuffer[0];
    
    const mono = new Float32Array(audioBuffer[0].length);
    for (let i = 0; i < audioBuffer[0].length; i++) {
        mono[i] = (audioBuffer[0][i] + audioBuffer[1][i]) / 2;
    }
    return mono;
}

// Check current beat probability from Magenta
function getCurrentBeatProbability(bufferIndex) {
    if (!magentaActuallyWorking || beatPredictions.length === 0) return 0;
    
    const index = Math.min(bufferIndex % 10, beatPredictions.length - 1);
    return beatPredictions[index] || 0;
}

// --- File upload ---
songUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    audioElement.src = URL.createObjectURL(file);
    resetGame();
    modelStatus.textContent = "Ready to play!";
});

// --- Magenta Button Events ---
loadMagentaBtn.addEventListener("click", loadMagentaModel);

// --- Play button ---
playBtn.addEventListener("click", async () => {
    if (gameActive) return;
    
    resetGame();
    playBtn.textContent = "Loading...";
    playBtn.disabled = true;
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
            console.log("Music ended");
            gameActive = false;
            playBtn.textContent = "▶️ Play Song";
            playBtn.disabled = false;
            if (analyzer) analyzer.stop();
        });

        analyzer = Meyda.createMeydaAnalyzer({
            audioContext,
            source: sourceNode,
            bufferSize: 2048, // Larger buffer for Magenta
            featureExtractors: ["rms", "buffer"],
            callback: async (features) => {
                if (!features || !gameActive) return;
                const rms = features.rms;
                const now = audioContext.currentTime;

                // Store RMS
                rmsHistory.push(rms);
                if (rmsHistory.length > historyLength) rmsHistory.shift();

                let noteSpawned = false;
                let spawnMethod = "rhythm";
                let beatConfidence = 0;

                // REAL MAGENTA PROCESSING
                if (magentaActuallyWorking && features.buffer) {
                    const hasMagentaBeats = await processAudioWithMagenta(features.buffer, now);
                    beatConfidence = getCurrentBeatProbability(bufferIndex);
                    
                    if (hasMagentaBeats && beatConfidence > 0.7 && (now - lastNoteTime > 0.2)) {
                        lastNoteTime = now;
                        const laneIndex = Math.floor(Math.random() * lanes.length);
                        notes.push({ 
                            lane: laneIndex, 
                            y: 0, 
                            hit: false,
                            aiDetected: true, // Mark as AI-detected
                            spawnTime: now
                        });
                        noteSpawned = true;
                        spawnMethod = "magenta";
                    }
                }

                // Fallback: rhythm-based spawning (if Magenta not working)
                if (!noteSpawned && !magentaActuallyWorking) {
                    const inputWindow = rmsHistory.slice(-20);
                    const avgRms = inputWindow.reduce((a, b) => a + b, 0) / inputWindow.length;
                    beatConfidence = Math.min(avgRms * 20, 1);

                    if (beatConfidence > 0.5 && now - lastNoteTime > 0.2) {
                        lastNoteTime = now;
                        const laneIndex = Math.floor(Math.random() * lanes.length);
                        notes.push({ 
                            lane: laneIndex, 
                            y: 0, 
                            hit: false,
                            aiDetected: false,
                            spawnTime: now
                        });
                        noteSpawned = true;
                        spawnMethod = "rhythm";
                    }
                }

                bufferIndex++;

                // AI visualization
                aiHistory.push({
                    confidence: beatConfidence,
                    method: spawnMethod,
                    spawned: noteSpawned ? 1 : 0,
                    magentaActive: magentaActuallyWorking ? 1 : 0
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
        gameActive = false;
    }
});

// --- Key input ---
const keys = {};
window.addEventListener("keydown", (e) => { 
    const key = e.key.toLowerCase();
    keys[key] = true; 
    
    // Update lane key visual
    if (laneKeys[key]) {
        laneKeys[key].classList.add('active');
    }
    
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
    const key = e.key.toLowerCase();
    keys[key] = false; 
    
    // Update lane key visual
    if (laneKeys[key]) {
        laneKeys[key].classList.remove('active');
    }
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
    ctx.fillStyle = magentaActuallyWorking ? "#8f4" : "yellow";
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
    ctx.fillText(`Magenta: ${magentaActuallyWorking ? "ACTIVE" : "INACTIVE"}`, 10, 30);
    ctx.fillText(`Score: ${score}`, 10, 50);
    ctx.fillText(`AI Notes: ${notes.filter(n => n.aiDetected).length}`, 10, 70);

    requestAnimationFrame(gameLoop);
}

// --- Enhanced AI Visualization ---
function drawAIVisualization() {
    aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
    
    aiHistory.forEach((data, i) => {
        // Draw confidence level
        const confidenceHeight = data.confidence * aiCanvas.height;
        
        // Color based on method
        let color;
        if (data.method === "magenta") {
            color = "#48f"; // Blue - Magenta AI
        } else {
            color = "#f80"; // Orange - Rhythm algorithm
        }
        
        aiCtx.fillStyle = color;
        aiCtx.fillRect(i, aiCanvas.height - confidenceHeight, 1, confidenceHeight);

        // Mark when note spawned
        if (data.spawned) {
            aiCtx.fillStyle = color;
            aiCtx.fillRect(i, 0, 1, aiCanvas.height);
        }
    });

    // Draw legends
    aiCtx.fillStyle = "#48f";
    aiCtx.fillText("Magenta AI", 10, 15);
    aiCtx.fillStyle = "#f80";
    aiCtx.fillText("Rhythm Detection", 10, 30);
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
