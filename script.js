let model, maxPredictions;

// Drawing setup
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
let drawing = false;

canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('mousemove', draw);

function draw(e) {
  if (!drawing) return;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'black';
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
}

document.getElementById('clearBtn').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Load the Teachable Machine model
async function init() {
  const modelURL = './model/model.json';
  const metadataURL = './model/metadata.json';
  model = await tmImage.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();

  // Start prediction loop
  window.requestAnimationFrame(loop);
}

async function loop() {
  await predict();
  window.requestAnimationFrame(loop);
}

async function predict() {
  const prediction = await model.predict(canvas);
  let highest = prediction[0];
  prediction.forEach(p => {
    if (p.probability > highest.probability) highest = p;
  });
  document.getElementById('prediction').innerText = `Prediction: ${highest.className}`;
}

// Start everything
init();
