const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const enableWebcamButton = document.getElementById('webcamButton');
const cameraToggleButton = document.getElementById('cameraToggleButton');
const personCountEl = document.getElementById('personCount');

let currentFacingMode = 'user'; // 'user' (front) or 'environment' (rear)
let activeStream = null;

// Track peak persons in current 30s window
let maxPersons = 0;
let windowStart = Date.now();
const WINDOW_MS = 30 * 1000;

// Check if webcam access is supported.
function getUserMediaSupported() {
  return !!(navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia);
}

// If webcam supported, add event listener to button for when user
// wants to activate it to call enableCam function which we will 
// define in the next step.
if (getUserMediaSupported()) {
  enableWebcamButton.addEventListener('click', enableCam);
  cameraToggleButton.addEventListener('click', toggleCameraFacingMode);
} else {
  console.warn('getUserMedia() is not supported by your browser');
}

function stopActiveStream() {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
    video.srcObject = null;
  }
}

// Try to start webcam with the selected facing mode. If facingMode isn't
// supported, fall back to default constraints and let the device pick.
function startStreamWithFacingMode(facingMode) {
  const constraints = {
    video: { facingMode: { ideal: facingMode } }
  };

  return navigator.mediaDevices.getUserMedia(constraints)
    .catch(err => {
      // Fallback: try without facingMode constraint
      console.warn('facingMode constraint failed, falling back:', err);
      return navigator.mediaDevices.getUserMedia({ video: true });
    })
    .then(stream => {
      activeStream = stream;
      video.srcObject = stream;
      return stream;
    });
}

// Toggle the facing mode and restart stream if active
function toggleCameraFacingMode() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

  // If not active yet, just change preference for when enabling webcam
  if (!activeStream) return;

  // Restart stream with new facing mode
  stopActiveStream();
  startStreamWithFacingMode(currentFacingMode).then(() => {
    // If video already loaded, restart detection
    if (video.readyState >= 2) {
      // remove any previous listener to avoid duplicates
      video.removeEventListener('loadeddata', predictWebcam);
      video.addEventListener('loadeddata', predictWebcam);
    }
  }).catch(err => console.error('Could not switch camera:', err));
}

// Placeholder function for next step. Paste over this in the next step.
// Enable the live webcam view and start classification.
function enableCam(event) {
  // Only continue if the COCO-SSD has finished loading.
  if (!model) {
    return;
  }
  
  // Hide the button once clicked.
  event.target.classList.add('removed');  
  
  // Start stream with current facing mode
  startStreamWithFacingMode(currentFacingMode).then(stream => {
    video.addEventListener('loadeddata', predictWebcam);
  }).catch(err => {
    console.error('Error starting webcam:', err);
  });
}
// Store the resulting model in the global scope of our app.
var model = undefined;

// Before we can use COCO-SSD class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment 
// to get everything needed to run.
// Note: cocoSsd is an external object loaded from our index.html
// script tag import so ignore any warning in Glitch.
cocoSsd.load().then(function (loadedModel) {
  model = loadedModel;
  // Show demo section now model is ready to use.
  demosSection.classList.remove('invisible');
});
var children = [];

function predictWebcam() {
  // Now let's start classifying a frame in the stream.
  model.detect(video).then(function (predictions) {
    // Update person count and collect per-person confidences
    let personCount = 0;

    // Remove any highlighting we did previous frame.
    for (let i = 0; i < children.length; i++) {
      liveView.removeChild(children[i]);
    }
    children.splice(0);
    
    // Now lets loop through predictions and draw them to the live view if
    // they have a high confidence score.
    for (let n = 0; n < predictions.length; n++) {
      const pred = predictions[n];

      // Count persons (use a low threshold for counting so we don't miss)
      if (pred.class === 'person' && pred.score > 0.1) {
        personCount++;
      }

      // If we are over 50% sure we are sure we classified it right, draw it!
      if (pred.score > 0.50) {
        const p = document.createElement('p');
        p.innerText = pred.class  + ' - with ' 
            + Math.round(parseFloat(pred.score) * 100) 
            + '% confidence.';
        p.style = 'margin-left: ' + pred.bbox[0] + 'px; margin-top: '
            + (pred.bbox[1] - 10 ) + 'px; width: ' 
            + (pred.bbox[2] - 10 ) + 'px; top: 0; left: 0;';

        const highlighter = document.createElement('div');
        highlighter.setAttribute('class', 'highlighter');
        highlighter.style = 'left: ' + pred.bbox[0] + 'px; top: '
            + pred.bbox[1] + 'px; width: ' 
            + pred.bbox[2] + 'px; height: '
            + pred.bbox[3] + 'px;';

        liveView.appendChild(highlighter);
        liveView.appendChild(p);
        children.push(highlighter);
        children.push(p);
      }
    }

    // Update the person count element text
    if (personCountEl) {
      personCountEl.innerText = 'Persons: ' + personCount;
    }

    // Update max persons for this 30s window
    const now = Date.now();
    if (now - windowStart > WINDOW_MS) {
      // reset window
      windowStart = now;
      maxPersons = personCount;
    } else {
      if (personCount > maxPersons) maxPersons = personCount;
    }

    if (personMaxEl) {
      personMaxEl.innerText = 'Max (30s): ' + maxPersons;
    }
    
    // Call this function again to keep predicting when the browser is ready.
    window.requestAnimationFrame(predictWebcam);
  });
}