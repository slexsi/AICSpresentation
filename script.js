let model, webcam, maxPredictions;

async function init() {
  // Load the Teachable Machine model
  const modelURL = './model/model.json';
  const metadataURL = './model/metadata.json';
  model = await tmImage.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();

  // Setup webcam
  const flip = true;
  webcam = new tmImage.Webcam(400, 300, flip);
  await webcam.setup();
  await webcam.play();
  document.getElementById('webcam').appendChild(webcam.canvas);

  // Start prediction loop
  window.requestAnimationFrame(loop);
}

async function loop() {
  webcam.update();
  await predict();
  window.requestAnimationFrame(loop);
}

async function predict() {
  const prediction = await model.predict(webcam.canvas);
  let highest = prediction[0];
  prediction.forEach(p => {
    if (p.probability > highest.probability) highest = p;
  });
  document.getElementById('prediction').innerText = `Prediction: ${highest.className}`;
}

// Start everything
init();
