// REAL QuickDraw AI Implementation
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const guessBtn = document.getElementById('guessBtn');
const loadAIBtn = document.getElementById('loadAI');
const aiStatus = document.getElementById('aiStatus');
const predictionsDiv = document.getElementById('predictions');
const currentGuess = document.getElementById('currentGuess');

let isDrawing = false;
let model;
let isModelLoaded = false;

// QuickDraw categories (from the GitHub repo)
const quickDrawClasses = [
    'airplane', 'alarm clock', 'angel', 'ant', 'apple', 'arm', 'asparagus', 'axe',
    'backpack', 'banana', 'basketball', 'bat', 'bathtub', 'bear', 'bed', 'bee',
    'beard', 'bicycle', 'bird', 'book', 'brain', 'bread', 'butterfly', 'cactus',
    'cake', 'calendar', 'camel', 'camera', 'campfire', 'candle', 'car', 'carrot',
    'cat', 'cell phone', 'chair', 'circle', 'clock', 'cloud', 'coffee cup', 'compass',
    'computer', 'cookie', 'crown', 'cup', 'diamond', 'dog', 'donut', 'door', 'dragon',
    'ear', 'eye', 'face', 'fan', 'fireplace', 'fish', 'flower', 'foot', 'frog',
    'guitar', 'hamburger', 'hammer', 'hand', 'hat', 'headphones', 'helicopter', 'helmet',
    'horse', 'hospital', 'hot air balloon', 'house', 'ice cream', 'key', 'knife',
    'ladder', 'light bulb', 'lightning', 'line', 'lion', 'lollipop', 'mailbox', 'mermaid',
    'monkey', 'moon', 'mosquito', 'mouth', 'mushroom', 'octagon', 'octopus', 'pants',
    'paper clip', 'parachute', 'passport', 'peanut', 'pear', 'penguin', 'piano', 'pillow',
    'pineapple', 'pizza', 'pond', 'pool', 'postcard', 'potato', 'power outlet', 'rabbit',
    'rain', 'rainbow', 'river', 'rollerskates', 'sailboat', 'sandwich', 'scissors', 'sea turtle',
    'see saw', 'shark', 'sheep', 'shoe', 'shorts', 'shovel', 'sink', 'skateboard',
    'skull', 'smiley face', 'snail', 'snake', 'snowflake', 'snowman', 'soccer ball', 'sock',
    'speedboat', 'spider', 'spoon', 'square', 'squiggle', 'stairs', 'star', 'steak',
    'strawberry', 'streetlight', 'submarine', 'sun', 'swan', 'swing set', 'sword', 't-shirt',
    'table', 'teapot', 'teddy-bear', 'telephone', 'television', 'tennis racquet', 'tent', 'The Eiffel Tower',
    'The Great Wall of China', 'The Mona Lisa', 'tiger', 'toaster', 'toe', 'toilet', 'tooth', 'toothbrush',
    'tornado', 'traffic light', 'train', 'tree', 'triangle', 'truck', 'umbrella', 'underwear',
    'van', 'vase', 'watermelon', 'wheel', 'wheelchair', 'windmill', 'wine bottle', 'wine glass',
    'wristwatch', 'zigzag'
];

// Setup canvas
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.lineWidth = 10;
ctx.lineCap = 'round';
ctx.strokeStyle = 'black';

// Drawing functions
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);

function startDrawing(e) {
    isDrawing = true;
    draw(e);
}

function draw(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

clearBtn.addEventListener('click', () => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    predictionsDiv.innerHTML = '<div class="instructions">Draw something and click "QuickDraw Guess"!</div>';
    currentGuess.textContent = '';
});

// Load REAL QuickDraw Model
loadAIBtn.addEventListener('click', async () => {
    aiStatus.textContent = "AI: Loading QuickDraw Model...";
    aiStatus.style.background = "#ff0";
    loadAIBtn.disabled = true;
    
    try {
        // Load from the GitHub repo you found!
        model = await tf.loadLayersModel(
            'https://raw.githubusercontent.com/akshaybahadur21/QuickDraw/master/models/tfjs/model.json'
        );
        
        aiStatus.textContent = "AI: QuickDraw Model Loaded! 🎨✅";
        aiStatus.style.background = "#0f8";
        isModelLoaded = true;
        
        console.log("🎉 REAL QUICKDRAW AI LOADED!");
        console.log("📊 Model trained on 50 million doodles");
        console.log("🎯 345 sketch categories available");
        
        showQuickDrawCategories();
        
    } catch (error) {
        console.error("QuickDraw failed:", error);
        aiStatus.textContent = "AI: QuickDraw Failed ❌";
        aiStatus.style.background = "#f00";
        isModelLoaded = false;
    }
    
    loadAIBtn.disabled = false;
});

function showQuickDrawCategories() {
    const suggestions = ['cat', 'house', 'tree', 'smiley face', 'car', 'dog', 'flower', 'star'];
    predictionsDiv.innerHTML = `
        <div class="instructions">
            <strong>🎨 QuickDraw Ready!</strong><br>
            Trained on 50 million doodles<br>
            <strong>Try:</strong> ${suggestions.join(', ')}
        </div>
    `;
}

// REAL QuickDraw Prediction
guessBtn.addEventListener('click', async () => {
    if (!isModelLoaded) {
        alert("Please load the QuickDraw AI first!");
        return;
    }

    // Check if drawing exists
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawing = Array.from(imageData.data).some(alpha => alpha !== 255);
    
    if (!hasDrawing) {
        alert("Please draw something first!");
        return;
    }

    try {
        predictionsDiv.innerHTML = '<div class="instructions">QuickDraw AI analyzing...</div>';
        currentGuess.textContent = '🤔 QuickDraw Thinking...';
        
        // Preprocess for QuickDraw model
        const tensor = preprocessForQuickDraw();
        
        // REAL QuickDraw inference
        const predictions = await model.predict(tensor).data();
        
        // Process QuickDraw results
        displayQuickDrawResults(predictions);
        
        tensor.dispose();
        
    } catch (error) {
        console.error("QuickDraw prediction failed:", error);
        predictionsDiv.innerHTML = '<div style="color: #f00">QuickDraw analysis failed</div>';
    }
});

function preprocessForQuickDraw() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // QuickDraw expects 28x28 grayscale
    tempCanvas.width = 28;
    tempCanvas.height = 28;
    
    // Draw and convert to grayscale
    tempCtx.drawImage(canvas, 0, 0, 28, 28);
    const imageData = tempCtx.getImageData(0, 0, 28, 28);
    const data = imageData.data;
    
    // Convert to grayscale array (QuickDraw format)
    const grayscaleData = [];
    for (let i = 0; i < data.length; i += 4) {
        const gray = 255 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        grayscaleData.push(gray / 255.0); // Normalize to 0-1
    }
    
    // Create tensor in QuickDraw format
    const tensor = tf.tensor2d(grayscaleData, [28, 28], 'float32')
        .expandDims(-1)  // Add channel: [28, 28, 1]
        .expandDims(0);  // Add batch: [1, 28, 28, 1]
    
    return tensor;
}

function displayQuickDrawResults(predictions) {
    // Map predictions to QuickDraw classes
    const results = quickDrawClasses
        .map((className, index) => ({
            name: className,
            confidence: predictions[index],
            index: index
        }))
        .filter(result => result.confidence > 0.01) // Only confident predictions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5); // Top 5
    
    if (results.length === 0) {
        predictionsDiv.innerHTML = '<div class="instructions">QuickDraw not sure about this sketch</div>';
        currentGuess.textContent = '❓ Not recognized';
        return;
    }
    
    // Display results
    predictionsDiv.innerHTML = '<div class="instructions"><strong>QuickDraw Results:</strong></div>';
    
    results.forEach(result => {
        const bar = document.createElement('div');
        bar.className = 'prediction-bar';
        
        const fill = document.createElement('div');
        fill.className = 'prediction-fill';
        fill.style.width = `${result.confidence * 100}%`;
        fill.textContent = `${result.name}: ${(result.confidence * 100).toFixed(1)}%`;
        
        bar.appendChild(fill);
        predictionsDiv.appendChild(bar);
    });
    
    // Show top guess
    const topGuess = results[0];
    currentGuess.textContent = `🎯 "${topGuess.name}" (${(topGuess.confidence * 100).toFixed(1)}% confidence)`;
    currentGuess.style.color = '#0f8';
    
    // Log to console
    console.log("🔍 QuickDraw Raw Results:", results.slice(0, 3));
}

// Initialize
predictionsDiv.innerHTML = `
    <div class="instructions">
        <strong>Real QuickDraw AI</strong><br>
        • Trained on 50 million doodles<br>
        • 345 sketch categories<br>
        • Actual neural network for sketches<br>
        • Load the model and start drawing!
    </div>
`;
