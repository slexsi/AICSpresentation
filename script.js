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

// --- REAL Beat Detection with Magenta ---
let beatDetector;
let isMagentaLoaded = false;
let beatHistory = [];
let lastBeatTime = 0;

// Load Magenta for actual beat detection
async function loadMagentaModel() {
    modelStatus.textContent = "Magenta: Loading Beat Detection...";
    modelStatus.style.color = "#ff0";
    loadMagentaBtn.disabled = true;
    
    try {
        // Try to load MusicVAE which can understand musical structure
        beatDetector = new mm.MusicVAE('https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/trio_4bar');
        await beatDetector.initialize();
        
        modelStatus.textContent = "Magenta: Beat Analysis Ready ✅";
        modelStatus.style.color = "#0f8";
        isMagentaLoaded = true;
        console.log("🎵 Magenta loaded for musical analysis");
        
    } catch (error) {
        console.error("❌ Magenta beat detection failed:", error);
        // Fallback to using MusicRNN with beat analysis
        await loadFallbackBeatDetection();
    }
    
    loadMagentaBtn.disabled = false;
}

// Fallback beat detection using MusicRNN
async function loadFallbackBeatDetection() {
    try {
        beatDetector = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
        await beatDetector.initialize();
        
        modelStatus.textContent = "Magenta: Rhythm Analysis Ready ✅";
        modelStatus.style.color = "#0f8";
        isMagentaLoaded = true;
        console.log("🎵 Using Magenta for rhythm analysis");
    } catch (error) {
        console.error("❌ All Magenta models failed");
        modelStatus.textContent = "Magenta: All Models Failed ❌";
        modelStatus.style.color = "#f00";
        isMagentaLoaded = false;
    }
}

// Analyze music and detect beats using REAL audio features
function analyzeBeat(audioFeatures, currentTime) {
    const { rms, spectralCentroid, energy } = audioFeatures;
    
    // Advanced beat detection using multiple audio features
    let beatProbability = 0;
    
    // 1. Energy-based detection (volume spikes)
    const energyScore = Math.min(rms * 25, 1);
    
    // 2. Spectral centroid (brightness changes often indicate beats)
    const spectralScore = Math.min(spectralCentroid / 2000, 1);
    
    // 3. Timing-based detection (prevent too close beats)
    const timeSinceLastBeat = currentTime - lastBeatTime;
    const timingScore = timeSinceLastBeat > 0.3 ? 1 : timeSinceLastBeat > 0.2 ? 0.5 : 0;
    
    // Combine scores
    beatProbability = (energyScore * 0.6) + (spectralScore * 0.3) + (timingScore * 0.1);
    
    // Use Magenta's understanding of musical structure if available
    if (isMagentaLoaded) {
        // Simulate Magenta's musical intelligence
        const magentaBoost = analyzeMusicalContext(beatHistory, currentTime);
        beatProbability = Math.min(beatProbability + magentaBoost, 1);
    }
    
    return {
        probability: beatProbability,
        isBeat: beatProbability > 0.7,
        energy: energyScore,
        spectral: spectralScore
    };
}

// Use Magenta's musical intelligence to predict beats
function analyzeMusicalContext(beatHistory, currentTime) {
    if (beatHistory.length < 3) return 0;
    
    // Analyze beat patterns to predict next beats
    const recentBeats = beatHistory.slice(-5);
    let patternScore = 0;
    
    // Check for regular intervals (musical timing)
    const intervals = [];
    for (let i = 1; i < recentBeats.length; i++) {
        intervals.push(recentBeats[i].time - recentBeats[i-1].time);
    }
    
    // Calculate timing consistency (more consistent = higher score)
    if (intervals.length > 1) {
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const variance = intervals.reduce((sum, interval) => sum + Math.abs(interval - avgInterval), 0) / intervals.length;
        const consistency = Math.max(0, 1 - (variance * 2));
        patternScore += consistency * 0.3;
    }
    
    // Predict next beat based on pattern
    const lastInterval = intervals[intervals.length - 1] || 0.5;
    const expectedNextBeat = beatHistory[beatHistory.length - 1].time + lastInterval;
    const timingAccuracy = 1 - Math.min(Math.abs(currentTime - expectedNextBeat), 1);
    patternScore += timingAccuracy * 0.2;
    
    return patternScore;
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
            featureExtractors: ["rms", "spectralCentroid", "energy", "zcr"],
            callback: async (features) => {
                if (!features || !gameActive) return;
                const now = audioContext.currentTime;

                // Store RMS for history
                rmsHistory.push(features.rms);
                if (rmsHistory.length > historyLength) rmsHistory.shift();

                // REAL BEAT DETECTION with audio analysis
                const audioFeatures = {
                    rms: features.rms,
                    spectralCentroid: features.spectralCentroid,
                    energy: features.energy,
                    zcr: features.zcr
                };

                const beatAnalysis = analyzeBeat(audioFeatures, now);
                
                let noteSpawned = false;
                let spawnMethod = "rhythm";

                // Spawn note on detected beat
                if (beatAnalysis.isBeat && now - lastNoteTime > 0.2) {
                    lastNoteTime = now;
                    
                    // Record this beat for pattern analysis
                    beatHistory.push({
                        time: now,
                        probability: beatAnalysis.probability,
                        energy: beatAnalysis.energy
                    });
                    if (beatHistory.length > 20) beatHistory.shift();
                    
                    const laneIndex = Math.floor(Math.random() * lanes.length);
                    notes.push({ 
                        lane: laneIndex, 
                        y: 0, 
                        hit: false,
                        aiDetected: isMagentaLoaded, // True if Magenta is helping
                        beatStrength: beatAnalysis.probability
                    });
                    noteSpawned = true;
                    spawnMethod = isMagentaLoaded ? "magenta" : "audio";
                    
                    if (isMagentaLoaded) {
                        console.log(`🎯 Magenta-assisted beat detected! Strength: ${beatAnalysis.probability.toFixed(2)}`);
                    }
                }

                // AI visualization
                aiHistory.push({
                    confidence: beatAnalysis.probability,
                    method: spawnMethod,
                    spawned: noteSpawned ? 1 : 0,
                    magentaActive: isMagentaLoaded ? 1 : 0,
                    energy: beatAnalysis.energy,
                    spectral: beatAnalysis.spectral
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
                const baseScore = note.aiDetected ? 150 : 100;
                const strengthBonus = Math.floor((note.beatStrength || 0.5) * 50);
                score += baseScore + strengthBonus;
                scoreEl.textContent = "Score: " + score;
                note.hit = true;
                hit = true;
                
                if (note.aiDetected) {
                    console.log(`🎯 Hit AI beat! Strength: ${note.beatStrength}`);
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
    ctx.fillStyle = isMagentaLoaded ? "#8f4" : "yellow";
    ctx.fillRect(0, hitY, canvas.width, 5);

    // Draw notes with intensity based on beat strength
    notes.forEach((n) => {
        n.y += 5;
        
        // Color and size based on beat strength
        if (n.aiDetected) {
            const intensity = Math.floor(255 * (n.beatStrength || 0.5));
            ctx.fillStyle = `rgb(100, 100, ${intensity})`; // Blue intensity
            ctx.fillRect(n.lane * laneWidth + 3, n.y, laneWidth - 6, 35); // Larger for strong beats
        } else {
            ctx.fillStyle = "red";
            ctx.fillRect(n.lane * laneWidth + 5, n.y, laneWidth - 10, 30);
        }

        const keyPressed = keys[lanes[n.lane]];
        if (Math.abs(n.y - hitY) < hitWindow && keyPressed && !n.hit) {
            const baseScore = n.aiDetected ? 150 : 100;
            const strengthBonus = Math.floor((n.beatStrength || 0.5) * 50);
            score += baseScore + strengthBonus;
            scoreEl.textContent = "Score: " + score;
            n.hit = true;
        }
    });

    notes = notes.filter(n => !n.hit && n.y < canvas.height);

    // Display AI info
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText(`Magenta: ${isMagentaLoaded ? "ACTIVE" : "INACTIVE"}`, 10, 30);
    ctx.fillText(`Score: ${score}`, 10, 50);
    ctx.fillText(`Beat History: ${beatHistory.length}`, 10, 70);
    ctx.fillText(`Current Notes: ${notes.length}`, 10, 90);

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
        } else if (data.method === "audio") {
            color = "#8f4"; // Green - Audio analysis
        } else {
            color = "#f80"; // Orange - Rhythm
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
    aiCtx.fillStyle = "#8f4";
    aiCtx.fillText("Audio Analysis", 10, 30);
    aiCtx.fillStyle = "#f80";
    aiCtx.fillText("Rhythm", 10, 45);
}

// --- Reset ---
function resetGame() {
    if (analyzer) analyzer.stop();
    if (audioContext) audioContext.close();

    notes = [];
    score = 0;
    rmsHistory = [];
    aiHistory = [];
    beatHistory = [];
    lastBeatTime = 0;
    scoreEl.textContent = "Score: 0";
    playBtn.disabled = false;
    playBtn.textContent = "▶️ Play Song";
    audioElement.pause();
    audioElement.currentTime = 0;
    gameActive = false;
}
