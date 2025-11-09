const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let drawing = false;

// Set up drawing
canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseout', () => drawing = false);
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
};

// Load pretrained model
let model;
async function loadModel() {
  // You can replace this with your own trained Teachable Machine model URL
  model = await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mnist/model.json');
}
loadModel();

// Predict drawing
document.getElementById('predictBtn').onclick = async () => {
  if (!model) return alert("Model not loaded yet!");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tensor = tf.browser.fromPixels(imageData, 1)
                 .resizeNearestNeighbor([28,28])
                 .toFloat()
                 .div(255.0)
                 .reshape([1,28,28,1]);
  const prediction = model.predict(tensor);
  const pred = prediction.argMax(1).dataSync()[0];
  document.getElementById('prediction').innerText = `Prediction: ${pred}`;
};
