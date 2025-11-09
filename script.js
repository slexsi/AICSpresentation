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

// Load AI Model
loadAIBtn.addEventListener('click', async () => {
    aiStatus.textContent = "AI: Loading...";
    aiStatus.style.background = "#ff0";
    aiStatus.style.color = "#111";
    
    try {
        // Load a pre-trained MobileNet model (image classification)
        model = await tf.loadLayersModel(
            'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json'
        );
        
        aiStatus.textContent = "AI: Loaded and Ready! ✅";
        aiStatus.style.background = "#0f8";
        aiStatus.style.color = "#111";
        isModelLoaded = true;
        
        console.log("🤖 AI Model loaded successfully!");
        
    } catch (error) {
        console.error("AI failed to load:", error);
        aiStatus.textContent = "AI: Failed to Load ❌";
        aiStatus.style.background = "#f00";
        isModelLoaded = false;
    }
});

// AI Prediction
guessBtn.addEventListener('click', async () => {
    if (!isModelLoaded) {
        alert("Please load the AI model first!");
        return;
    }
    
    try {
        // Show loading
        predictionsDiv.innerHTML = '<div class="instructions">AI is thinking...</div>';
        
        // Preprocess the drawing for the AI
        const tensor = preprocessDrawing();
        
        // Get predictions from the AI
        const predictions = await model.predict(tensor).data();
        
        // Display results
        displayPredictions(predictions);
        
        // Clean up
        tensor.dispose();
        
    } catch (error) {
        console.error("Prediction failed:", error);
        predictionsDiv.innerHTML = '<div style="color: #f00">Prediction failed. Try again.</div>';
    }
});

function preprocessDrawing() {
    // Create a temporary canvas for preprocessing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // Resize to 224x224 (MobileNet input size)
    tempCanvas.width = 224;
    tempCanvas.height = 224;
    
    // Draw and invert colors (MobileNet expects dark background)
    tempCtx.fillStyle = 'black';
    tempCtx.fillRect(0, 0, 224, 224);
    tempCtx.drawImage(canvas, 0, 0, 224, 224);
    
    // Get image data and convert to tensor
    const imageData = tempCtx.getImageData(0, 0, 224, 224);
    const tensor = tf.browser.fromPixels(imageData)
        .resizeNearestNeighbor([224, 224])
        .toFloat()
        .expandDims(0);
    
    return tensor;
}

function displayPredictions(predictions) {
    // Mock categories (in real implementation, you'd use ImageNet classes)
    const categories = [
        "Cat", "Dog", "House", "Tree", "Car", 
        "Face", "Flower", "Bird", "Butterfly", "Fish",
        "Sun", "Star", "Heart", "Apple", "Ball"
    ];
    
    // Create prediction bars
    predictionsDiv.innerHTML = '';
    
    // Simulate AI thinking with random confidence scores
    const results = categories.map(category => ({
        name: category,
        confidence: Math.random() * 0.8 + 0.2 // Random between 0.2 and 1.0
    })).sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Top 5 predictions
    
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
    currentGuess.textContent = `🤖 I think it's: ${topGuess.name}!`;
    currentGuess.style.color = '#0f8';
}

// Initialize
console.log("🎨 Drawing AI Game Ready!");
