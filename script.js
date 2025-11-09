const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

const lanes = ["a", "s", "k", "l"];
const laneWidth = canvas.width / lanes.length;
const hitY = canvas.height - 60;
const hitWindow = 40;
let notes = [];
let score = 0;

// Buttons
const playBtn = document.createElement("button");
playBtn.textContent = "▶️ Play Song";
document.body.insertBefore(playBtn, canvas.nextSibling);
const songUpload = document.getElementById("songUpload");

// Audio
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous";

let audioContext, sourceNode, analyzer;
let rmsHistory = [];
const historyLength = 1024 * 30;

// --- Adaptive difficulty model ---
const difficultyModel = tf.sequential();
difficultyModel.add(tf.layers.dense({ inputShape: [4], units: 8, activation: 'relu' }));
difficultyModel.add(tf.layers.dense({ units: 1, activation: 'linear' })); // only note speed now
difficultyModel.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

// Initial training data
const trainInputs = tf.tensor2d([
  [0.9,1,0.2,10],
  [0.5,5,0.5,2],
  [0.2,10,0.8,0]
]);
const trainOutputs = tf.tensor2d([
  [8],
  [5],
  [2]
]);
difficultyModel.fit(trainInputs, trainOutputs, { epochs: 50 });

// --- Player stats ---
let playerStats = { hits:0, misses:0, totalReaction:0, combo:0 };

// --- File upload ---
songUpload.addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    audioElement.src = URL.createObjectURL(file);
    resetGame();
});

// --- Play button ---
playBtn.addEventListener("click", async ()=>{
    resetGame();
    playBtn.textContent = "Loading...";

    try{
        audioContext = new (window.AudioContext||window.webkitAudioContext)();
        await audioContext.resume();

        sourceNode = audioContext.createMediaElementSource(audioElement);
        sourceNode.connect(audioContext.destination);

        let lastNoteTime = 0;

        analyzer = Meyda.createMeydaAnalyzer({
            audioContext,
            source: sourceNode,
            bufferSize:1024,
            featureExtractors:["rms"],
            callback: (features)=>{
                if(!features) return;
                const rms = features.rms;
                const now = audioContext.currentTime;

                rmsHistory.push(rms);
                if(rmsHistory.length>historyLength) rmsHistory.shift();

                // --- Spawn notes based on RMS threshold ---
                const beatProb = rmsHistory.slice(-20).reduce((a,b)=>a+b,0)/20;
                if(beatProb>0.4 && now-lastNoteTime>0.25){
                    lastNoteTime = now;

                    // --- Adaptive note speed ---
                    const perfVector = [
                        playerStats.hits / Math.max(1, playerStats.hits+playerStats.misses),
                        playerStats.misses,
                        playerStats.totalReaction / Math.max(1,playerStats.hits),
                        playerStats.combo
                    ];
                    const speed = Math.max(2, difficultyModel.predict(tf.tensor2d([perfVector])).dataSync()[0]);

                    const laneIndex = Math.floor(Math.random()*lanes.length);
                    notes.push({lane:laneIndex, y:0, hit:false, speed});
                }
            }
        });

        analyzer.start();
        await audioElement.play();
        playBtn.textContent = "Playing...";
        gameLoop();
    }catch(err){
        console.error(err);
        playBtn.textContent="▶️ Try Again";
    }
});

// --- Key input ---
const keys = {};
window.addEventListener("keydown",(e)=>{keys[e.key.toLowerCase()]=true;});
window.addEventListener("keyup",(e)=>{keys[e.key.toLowerCase()]=false;});

// --- Online learning ---
function trainDifficulty(){
    const perfVector = [
        playerStats.hits / Math.max(1,playerStats.hits+playerStats.misses),
        playerStats.misses,
        playerStats.totalReaction / Math.max(1,playerStats.hits),
        playerStats.combo
    ];

    let target = difficultyModel.predict(tf.tensor2d([perfVector])).dataSync();
    if(playerStats.hits>playerStats.misses){
        target[0]+=0.05;
    }else{
        target[0]-=0.05;
    }

    target[0] = Math.max(2, Math.min(10, target[0]));

    const xs = tf.tensor2d([perfVector]);
    const ys = tf.tensor2d([target]);
    difficultyModel.fit(xs,ys,{epochs:1,batchSize:1}).then(()=>{xs.dispose();ys.dispose();});
}

// --- Main game loop ---
function gameLoop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Draw lanes
    lanes.forEach((key,i)=>{
        ctx.fillStyle = keys[key]? "#0f0":"#333";
        ctx.fillRect(i*laneWidth,0,laneWidth-2,canvas.height);
    });

    // Draw hit line
    ctx.fillStyle = "yellow";
    ctx.fillRect(0,hitY,canvas.width,5);

    // Draw notes
    notes.forEach(n=>{
        n.y += n.speed || 5;
        ctx.fillStyle="red";
        ctx.fillRect(n.lane*laneWidth+5,n.y,laneWidth-10,30);

        const keyPressed = keys[lanes[n.lane]];
        if(Math.abs(n.y-hitY)<hitWindow && keyPressed && !n.hit){
            score+=100;
            scoreEl.textContent = "Score: "+score;
            n.hit = true;

            playerStats.hits++;
            playerStats.combo++;
            playerStats.totalReaction += Math.abs(n.y-hitY)/60;

            trainDifficulty();
        }
    });

    // Missed notes
    notes.forEach(n=>{
        if(!n.hit && n.y>hitY+hitWindow){
            playerStats.misses++;
            playerStats.combo=0;
            n.hit=true;

            trainDifficulty();
        }
    });

    notes = notes.filter(n=>n.y<canvas.height && !n.hit);

    requestAnimationFrame(gameLoop);
}

// --- Reset ---
function resetGame(){
    if(analyzer) analyzer.stop();
    if(audioContext) audioContext.close();

    notes=[];
    score=0;
    rmsHistory=[];
    scoreEl.textContent="Score: 0";
    playerStats={hits:0,misses:0,totalReaction:0,combo:0};
    playBtn.disabled=false;
    playBtn.textContent="▶️ Play Song";
    audioElement.pause();
    audioElement.currentTime=0;
}
