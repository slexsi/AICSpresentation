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
let musicRNN;
let isMagentaLoaded = false;
let magentaActuallyWorking = false;
let noteSequence = [];

// Load Magenta's pre-trained MusicRNN model (CORRECT FUNCTION)
async function loadMagentaModel() {
    modelStatus.textContent = "Magenta: Loading...";
    modelStatus.style.color = "#ff0";
    loadMagentaBtn.disabled = true;
    
    try {
        // CORRECT: Use MusicRNN instead of OnsetsAndFrames
        musicRNN = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
        await musicRNN.initialize();
        
        // Test if it actually works
        const seed = {
            notes: [
                { pitch: 60, quantizedStartStep: 0, quantizedEndStep: 1 },
            ],
            totalQuantizedSteps: 4,
            quantizationInfo: { stepsPerQuarter: 4 }
        };
        
        const generated = await musicRNN.continueSequence(seed, 4, 0.5);
        
        if (generated && generated.notes) {
            modelStatus.textContent = "Magenta: ACTIVE ✅";
            modelStatus.style.color = "#0f8";
            isMagentaLoaded = true;
            magentaActuallyWorking = true;
            console.log("🎵 Magenta MusicRNN ACTIVE - Ready to generate notes!");
        } else {
            throw new Error("Model loaded but not generating");
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

// Generate musical patterns using REAL Magenta AI
async function generateNotesWithMagenta(musicIntensity = 0.5) {
    if (!magentaActuallyWorking) return [];
    
    try {
        // Create seed based on music intensity
        const basePitch = 60 + Math.floor(musicIntensity * 12);
        const seed = {
            notes: [
                { 
                    pitch: basePitch, 
                    quantizedStartStep: 0, 
                    quantizedEndStep: 2 
                },
                { 
                    pitch: basePitch + 2, 
                    quantizedStartStep: 2, 
                    quantizedEndStep: 4 
                },
            ],
            totalQuantizedSteps: 8,
            quantizationInfo: { stepsPerQuarter: 4 }
        };
        
        // Use temperature based on music intensity (more creative for intense parts)
        const temperature = 0.5 + (musicIntensity * 0.5);
        
        // REAL AI GENERATION - This uses the pre-trained MusicRNN
        const generatedSequence = await musicRNN.continueSequence(seed, 8, temperature);
        
        // Convert Magenta's musical notes to game notes
        const gameNotes = generatedSequence.notes.map((note, index) => {
            // Map pitches to lanes (musical intelligence!)
            const lane = (note.pitch - 60) % lanes.length;
            const spawnTime = note.quantizedStartStep * 0.5; // Convert to seconds
            
            return {
                lane: Math.max(0, Math.min(lanes.length - 1, lane)),
                spawnTime: spawnTime,
                duration: (note.quantizedEndStep - note.quantizedStartStep) * 0.5,
                pitch: note.pitch,
                aiGenerated: true
            };
        });
        
        console.log("🎵 Magenta generated", gameNotes.length, "musical notes");
        return gameNotes;
        
    } catch (error) {
        console.error("Magenta generation failed:", error);
        return [];
    }
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
        let nextMagentaGeneration = 0;
        let currentNoteSequence = [];

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
            bufferSize: 1024,
            featureExtractors: ["rms"],
            callback: async (features) => {
                if (!features || !gameActive) return;
                const rms = features.rms;
                const now = audioContext.currentTime;

                // Store RMS
                rmsHistory.push(rms);
                if (rmsHistory.length > historyLength) rmsHistory.shift();

                const recentRms = rmsHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
                let noteSpawned = false;
                let spawnMethod = "rhythm";
                let aiConfidence = 0;

                // REAL MAGENTA AI GENERATION
                if (magentaActuallyWorking && now >= nextMagentaGeneration) {
                    // Generate new note sequence with Magenta AI
                    currentNoteSequence = await generateNotesWithMagenta(recentRms);
                    nextMagentaGeneration = now + 3.0; // Generate every 3 seconds
                    console.log("🔄 Magenta generating new pattern...");
                }

                // Use Magenta-generated notes first
                if (magentaActuallyWorking && currentNoteSequence.length > 0) {
                    const nextNote = currentNoteSequence[0];
                    if (now - lastNoteTime >= nextNote.spawnTime) {
                        notes.push({
                            lane: nextNote.lane,
                            y: 0,
                            hit: false,
                            aiDetected: true,
                            pitch: nextNote.pitch
                        });
                        currentNoteSequence.shift();
                        lastNoteTime = now;
                        noteSpawned = true;
                        spawnMethod = "magenta";
                        aiConfidence = 0.9;
                    }
                }

                // Fallback: rhythm-based spawning
                if (!noteSpawned) {
                    const beatProb = Math.min(recentRms * 15, 1);
                    aiConfidence = beatProb;

                    if (beatProb > 0.4 && now - lastNoteTime > 0.3) {
                        const laneIndex = Math.floor(Math.random() * lanes.length);
                        notes.push({
                            lane: laneIndex,
                            y: 0,
                            hit: false,
                            aiDetected: false
                        });
                        lastNoteTime = now;
                        noteSpawned = true;
                        spawnMethod = "rhythm";
                    }
                }

                // AI visualization
                aiHistory.push({
                    confidence: aiConfidence,
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
                // Bonus points for AI-generated notes
                score += note.aiDetected ? 150 : 100;
                scoreEl.textContent = "Score: " + score;
                note.hit = true;
                hit = true;
                
                if (note.aiDetected) {
                    console.log("🎯 Hit AI-generated note!");
                }
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

    // Draw notes (blue for AI-generated, red for rhythm-based)
    notes.forEach((n) => {
        n.y += 5;
        ctx.fillStyle = n.aiDetected ? "#48f" : "red";
        ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);

        // Show pitch for AI notes (visual indicator)
        if (n.aiDetected && n.pitch) {
            ctx.fillStyle = "white";
            ctx.font = "10px Arial";
            ctx.fillText(n.pitch - 60, n.lane * laneWidth + 15, n.y + 15);
        }

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
    noteSequence = [];
    scoreEl.textContent = "Score: 0";
    playBtn.disabled = false;
    playBtn.textContent = "▶️ Play Song";
    audioElement.pause();
    audioElement.currentTime = 0;
    gameActive = false;
}
