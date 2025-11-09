// --- Canvas & Game Setup ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;

let notes = [];
let baseSpeed = 200; // px/s
let aiSpeedMultiplier = 1;
let score = 0;

// --- Audio & Analysis ---
const audio = new Audio('song.mp3');
audio.crossOrigin = "anonymous";

const audioContext = new AudioContext();
const source = audioContext.createMediaElementSource(audio);
const analyser = audioContext.createAnalyser();
source.connect(analyser);
analyser.connect(audioContext.destination);
analyser.fftSize = 2048;
const dataArray = new Uint8Array(analyser.frequencyBinCount);

// --- Load AI Model ---
let model;
async function loadAI() {
    model = await tf.loadLayersModel('model.json');
}

// --- Generate Notes for Demo ---
function spawnNote() {
    const lane = Math.floor(Math.random() * lanes.length);
    notes.push({
        x: lane * laneWidth + laneWidth / 4,
        y: -20,
        width: laneWidth / 2,
        height: 20,
        key: lanes[lane],
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    });
}

// --- Beat Feature Extraction ---
function getBeatFeature() {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    return [sum / dataArray.length / 255]; // normalized
}

// --- Update AI Speed ---
function updateAISpeed() {
    if (!model) return;
    const feature = getBeatFeature();
    const input = tf.tensor2d([feature], [1, feature.length]);
    const output = model.predict(input);
    aiSpeedMultiplier = Math.max(0.5, output.dataSync()[0]); // clamp minimum speed
    tf.dispose([input, output]);
}

// --- Game Loop ---
let lastTime = 0;
function gameLoop(time) {
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateAISpeed();

    // Update notes
    for (let i = notes.length - 1; i >= 0; i--) {
        let note = notes[i];
        note.y += baseSpeed * aiSpeedMultiplier * deltaTime;
        ctx.fillStyle = note.color;
        ctx.fillRect(note.x, note.y, note.width, note.height);

        // Remove notes past hit line
        if (note.y > canvas.height) notes.splice(i, 1);
    }

    requestAnimationFrame(gameLoop);
}

// --- Key Press Handling ---
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        if (note.key === key && Math.abs(note.y - hitY) < 40) {
            score += 100;
            scoreEl.innerText = `Score: ${score}`;
            notes.splice(i, 1);
            break;
        }
    }
});

// --- Game Start ---
async function startGame() {
    await loadAI();
    audio.play();

    // Spawn notes periodically
    setInterval(spawnNote, 800);

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}
