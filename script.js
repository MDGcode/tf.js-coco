const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const enableWebcamButton = document.getElementById('webcamButton');
const personCountEl = document.getElementById('personCount');
const cameraSelect = document.getElementById('cameraSelect');
const cameraLabel = document.getElementById('cameraLabel');
const personThreshold = document.getElementById('personThreshold');
const thresholdLabel = document.getElementById('thresholdLabel');
const roomIdInput = document.getElementById('roomIdInput');

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
} else {
  console.warn('getUserMedia() is not supported by your browser');
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
  
  // Start stream using currently selected camera (if any).
  const selectedDeviceId = (cameraSelect && cameraSelect.value) ? cameraSelect.value : undefined;
  startStream(selectedDeviceId);
}

// Store the resulting model in the global scope of our app.
var model = undefined;
var currentStream = null; // holds the active MediaStream

// default threshold (0-100 range UI -> 0.0-1.0)
let personScoreThreshold = 0.40;

// Start camera stream for given deviceId (or default if undefined)
async function startStream(deviceId) {
  try {
    // Stop existing stream tracks if any
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }

    const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;
    // Use once:true so we don't attach multiple listeners when switching cameras
    video.addEventListener('loadeddata', predictWebcam, { once: true });
  } catch (err) {
    console.error('Error starting camera stream:', err);
  }
}

// Populate camera select dropdown with available video input devices.
async function populateCameraList() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    // Try to get permission first so device labels are available
    let tempStream = null;
    try {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
      // Permission denied or no camera; continue to enumerate anyway
      console.warn('Could not get temporary stream to fetch device labels.', e);
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (cameraSelect) {
      cameraSelect.innerHTML = '';
      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Camera ${index + 1}`;
        cameraSelect.appendChild(option);
      });

      if (videoDevices.length > 0) {
        cameraSelect.style.display = '';
      }
    }
    if (cameraLabel && videoDevices.length > 0) {
      cameraLabel.style.display = '';
    }

    // Show threshold controls when demo is ready
    if (personThreshold && thresholdLabel) {
      personThreshold.style.display = '';
      thresholdLabel.style.display = '';
      // Ensure select reflects default threshold (40%)
      personThreshold.value = String(Math.round(personScoreThreshold * 100));
    }
    // Show room id input
    if (roomIdInput) {
      roomIdInput.style.display = '';
      const roomLabel = document.getElementById('roomLabel');
      if (roomLabel) roomLabel.style.display = '';
    }

    // Stop temporary stream used for permissions
    if (tempStream) {
      tempStream.getTracks().forEach(t => t.stop());
    }
  } catch (e) {
    console.error('Error enumerating devices:', e);
  }
}

// Update threshold from UI (select change)
if (personThreshold) {
  personThreshold.addEventListener('change', function() {
    const v = parseInt(personThreshold.value, 10);
    if (!isNaN(v)) personScoreThreshold = v / 100;
  });
}

// If user changes selected camera while webcam is active, restart stream
if (cameraSelect) {
  cameraSelect.addEventListener('change', function() {
    if (enableWebcamButton.classList.contains('removed')) {
      startStream(cameraSelect.value);
    }
  });
}

var children = [];
var lastPersonCount = 0;
var maxPersonCount = 0; // Track max persons in 5s interval

function predictWebcam() {
  // Now let's start classifying a frame in the stream.
  model.detect(video).then(function (predictions) {
    // Update person count
    let personCount = 0;

    // Remove any highlighting we did previous frame.
    for (let i = 0; i < children.length; i++) {
      liveView.removeChild(children[i]);
    }
    children.splice(0);
    
    // Now lets loop through predictions and draw them to the live view if
    // they have a high confidence score.
    for (let n = 0; n < predictions.length; n++) {
      // Count persons
      if (predictions[n].class === 'person' && predictions[n].score > personScoreThreshold) {
        personCount++;
      }

      // If we are over 66% sure we are sure we classified it right, draw it!
      if (predictions[n].score > personScoreThreshold) {
        const p = document.createElement('p');
        p.innerText = predictions[n].class  + ' - with ' 
            + Math.round(parseFloat(predictions[n].score) * 100) 
            + '% confidence.';
        p.style = 'margin-left: ' + predictions[n].bbox[0] + 'px; margin-top: '
            + (predictions[n].bbox[1] - 10 ) + 'px; width: ' 
            + (predictions[n].bbox[2] - 10 ) + 'px; top: 0; left: 0;';

        const highlighter = document.createElement('div');
        highlighter.setAttribute('class', 'highlighter');
        highlighter.style = 'left: ' + predictions[n].bbox[0] + 'px; top: '
            + predictions[n].bbox[1] + 'px; width: ' 
            + predictions[n].bbox[2] + 'px; height: '
            + predictions[n].bbox[3] + 'px;';

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
    // Store last person count for API
    lastPersonCount = personCount;
    if (personCount > maxPersonCount) {
      maxPersonCount = personCount;
    }
    // Call this function again to keep predicting when the browser is ready.
    window.requestAnimationFrame(predictWebcam);
  });
}

// Send max person count to backend every 5 seconds
function sendPersonCount() {
  // determine room id from UI (default 1)
  let roomId = '1';
  if (roomIdInput && roomIdInput.value) {
    const parsed = parseInt(roomIdInput.value, 10);
    if (!isNaN(parsed) && parsed > 0) roomId = String(parsed);
  }

  fetch(`https://room-person-counter-backend.vercel.app/api/rooms/${encodeURIComponent(roomId)}`, {
     method: 'PUT',
     headers: {
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({ numberOfPersons: maxPersonCount })
   })
  .then(res => res.json())
  .then(data => {
    console.log('Sent max person count:', maxPersonCount, data);
    maxPersonCount = 0; // Reset after sending
  })
  .catch(err => {
    console.error('Error sending person count:', err);
    maxPersonCount = 0; // Reset even on error
  });
}

setInterval(sendPersonCount, 5000);

// Before we can use COCO-SSD class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment 
// to get everything needed to run.
// Note: cocoSsd is an external object loaded from our index.html
// script tag import so ignore any warning in Glitch.
cocoSsd.load().then(function (loadedModel) {
  model = loadedModel;
  // Show demo section now model is ready to use.
  demosSection.classList.remove('invisible');
  // Populate the camera list so user can choose device like webcamtests
  populateCameraList();
});