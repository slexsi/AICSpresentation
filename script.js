const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let drawing = false;

// Drawing setup
canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('mouseout', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('mousemove', draw);

function draw(e) {
  if (!drawing) return;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'black';
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
}

// Clear canvas
document.getElementById('clearBtn').onclick = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('prediction').innerText = "Prediction: ";
};

// Load Teachable Machine model
let model;
async function loadModel() {
  model = await tf.loadLayersModel('https://teachablemachine.withgoogle.com/models/y0ecP7XnZ/model.json');
  document.getElementById('prediction').innerText = "Model Loaded! Draw something.";
}
loadModel();

// Predict drawing
document.getElementById('predictBtn').onclick = async () => {
  if (!model) return alert("Model not loaded yet!");
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tensor = tf.browser.fromPixels(imageData)
                 .resizeNearestNeighbor([224,224])
                 .toFloat()
                 .div(255.0)
                 .expandDims();
  
  const prediction = model.predict(tensor);
  const classes = ["😃 Smile", "😢 Sad Face", "❤️ Heart", "⭐ Star"]; // Update with your classes
  const predIndex = prediction.argMax(1).dataSync()[0];
  document.getElementById('prediction').innerText = `Prediction: ${classes[predIndex]}`;
};
