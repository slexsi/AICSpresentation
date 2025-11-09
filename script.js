// Drawing Canvas
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const guessBtn = document.getElementById('guessBtn');
const loadAIBtn = document.getElementById('loadAI');
const aiStatus = document.getElementById('aiStatus');
const predictionsDiv = document.getElementById('predictions');
const currentGuess = document.getElementById('currentGuess');

// Drawing state
let isDrawing = false;
let model;
let isModelLoaded = false;

// QuickDraw categories (the actual classes the model was trained on)
const quickDrawClasses = [
    'apple', 'banana', 'baseball', 'basketball', 'bear', 'bed', 'bee', 'bicycle',
    'bird', 'book', 'bowtie', 'bracelet', 'brain', 'bread', 'bridge', 'broccoli',
    'cake', 'car', 'cat', 'chair', 'cloud', 'computer', 'cookie', 'crown', 'cup',
    'diamond', 'dog', 'donut', 'dragon', 'ear', 'eye', 'face', 'fish', 'flower',
    'foot', 'guitar', 'hamburger', 'hand', 'hat', 'heart', 'house', 'key', 'ladder',
    'lightning', 'moon', 'mountain', 'mouth', 'nose', 'octagon', 'pants', 'pencil',
    'pizza', 'planet', 'smiley face', 'spider', 'square', 'star', 'sun', 'tree',
    'triangle', 'truck', 'umbrella', 'wheel'
];

// Set up drawing canvas
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.lineWidth = 8;
ctx.lineCap = 'round';
ctx.strokeStyle = 'black';

// Drawing functions
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Touch support for mobile
canvas.addEventListener('touchstart', startDrawing);
canvas.addEventListener('touchmove', draw);
canvas.addEventListener('touchend', stopDrawing);

function startDrawing(e) {
    isDrawing = true;
    draw(e);
}

function draw(e) {
    if (!isDrawing) return;
    
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

// Clear canvas
clearBtn.addEventListener('click', () => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    predictionsDiv.innerHTML = '<div class="instructions">Draw something and click "AI Guess"!</div>';
    currentGuess.textContent = '';
});

// Load QuickDraw AI Model
loadAIBtn.addEventListener('click', async () => {
    aiStatus.textContent = "AI: Loading QuickDraw Model...";
    aiStatus.style.background = "#ff0";
    aiStatus.style.color = "#111";
    loadAIBtn.disabled = true;
    
    try {
        // Load QuickDraw model (trained on 50 million drawings!)
        model = await tf.loadLayersModel(
            'https://storage.googleapis.com/tfjs-models/tfjs/quickdraw/model.json'
        );
        
        aiStatus.textContent = "AI: QuickDraw Model Ready! ✅";
        aiStatus.style.background = "#0f8";
        aiStatus.style.color = "#111";
        isModelLoaded = true;
        
        console.log("🎨 QuickDraw AI loaded! Trained on 50 million drawings!");
        
        // Show some suggested drawings
        showDrawingSuggestions();
        
    } catch (error) {
        console.error("QuickDraw failed to load:", error);
        aiStatus.textContent = "AI: Failed to Load ❌";
        aiStatus.style.background = "#f00";
        isModelLoaded = false;
    }
    
    loadAIBtn.disabled = false;
});

function showDrawingSuggestions() {
    const suggestions = ['cat', 'house', 'tree', 'smiley face', 'star', 'heart'];
    const randomSuggestions = suggestions.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    predictionsDiv.innerHTML = `
        <div class="instructions">
            <strong>Try drawing:</strong> ${randomSuggestions.join(', ')}
        </div>
    `;
}

// AI Prediction
guessBtn.addEventListener('click', async () => {
    if (!isModelLoaded) {
        alert("Please load the AI model first!");
        return;
    }
    
    // Check if user actually drew something
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawing = Array.from(imageData.data).some(alpha => alpha !== 255);
    
    if (!hasDrawing) {
        alert("Please draw something first!");
        return;
    }
    
    try {
        // Show loading
        predictionsDiv.innerHTML = '<div class="instructions">AI is analyzing your drawing...</div>';
        currentGuess.textContent = '🤔 Thinking...';
        
        // Preprocess the drawing for QuickDraw model
        const tensor = preprocessForQuickDraw();
        
        // Get predictions from the AI (REAL inference)
        const predictions = await model.predict(tensor).data();
        
        // Display results
        displayQuickDrawPredictions(predictions);
        
        // Clean up
        tensor.dispose();
        
    } catch (error) {
        console.error("Prediction failed:", error);
        predictionsDiv.innerHTML = '<div style="color: #f00">Prediction failed. Try a different drawing.</div>';
        currentGuess.textContent = '';
    }
});

function preprocessForQuickDraw() {
    // Create a temporary canvas for preprocessing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // QuickDraw expects 28x28 grayscale images
    tempCanvas.width = 28;
    tempCanvas.height = 28;
    
    // Draw and convert to grayscale
    tempCtx.drawImage(canvas, 0, 0, 28, 28);
    
    // Get image data and convert to tensor
    const imageData = tempCtx.getImageData(0, 0, 28, 28);
    const data = imageData.data;
    
    // Convert to grayscale and normalize
    const grayscaleData = [];
    for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale and invert (QuickDraw expects white on black)
        const gray = 255 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        grayscaleData.push(gray / 255.0); // Normalize to 0-1
    }
    
    // Create tensor with correct shape for QuickDraw
    const tensor = tf.tensor2d(grayscaleData, [28, 28], 'float32')
        .expandDims(-1)  // Add channel dimension -> [28, 28, 1]
        .expandDims(0);  // Add batch dimension -> [1, 28, 28, 1]
    
    return tensor;
}

function displayQuickDrawPredictions(predictions) {
    // Map predictions to class names
    const results = quickDrawClasses.map((className, index) => ({
        name: className,
        confidence: predictions[index]
    }))
    .filter(result => result.confidence > 0.01) // Only show confident predictions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5); // Top 5 predictions
    
    if (results.length === 0) {
        predictionsDiv.innerHTML = '<div class="instructions">AI is not sure what this is. Try a clearer drawing!</div>';
        currentGuess.textContent = '❓ Not sure...';
        return;
    }
    
    // Create prediction bars
    predictionsDiv.innerHTML = '<div class="instructions"><strong>AI Predictions:</strong></div>';
    
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
    
    // Show top guess with emoji
    const topGuess = results[0];
    const emoji = getEmojiForCategory(topGuess.name);
    currentGuess.textContent = `${emoji} I'm ${(topGuess.confidence * 100).toFixed(0)}% sure it's a ${topGuess.name}!`;
    currentGuess.style.color = topGuess.confidence > 0.7 ? '#0f8' : '#ff0';
}

function getEmojiForCategory(category) {
    const emojiMap = {
        'cat': '🐱', 'dog': '🐶', 'house': '🏠', 'tree': '🌳', 
        'smiley face': '😊', 'heart': '❤️', 'star': '⭐', 'sun': '☀️',
        'flower': '🌼', 'fish': '🐟', 'car': '🚗', 'apple': '🍎',
        'banana': '🍌', 'pizza': '🍕', 'cake': '🍰', 'book': '📚',
        'computer': '💻', 'guitar': '🎸', 'hat': '🎩', 'key': '🔑'
    };
    
    return emojiMap[category] || '🤖';
}

// Initialize with drawing instructions
console.log("🎨 QuickDraw AI Game Ready!");
predictionsDiv.innerHTML = `
    <div class="instructions">
        <strong>How to use:</strong><br>
        1. Click "Load AI Model"<br>
        2. Draw something simple<br>
        3. Click "AI Guess"<br>
        4. See what the AI thinks!
    </div>
`;
