const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const enableWebcamButton = document.getElementById('webcamButton');
const cameraToggleButton = document.getElementById('cameraToggleButton');
const cameraSelect = document.getElementById('cameraSelect');

let currentFacingMode = 'user'; // 'user' (front) or 'environment' (rear)
let activeStream = null;
let availableCameras = [];

// Check if webcam access is supported.
function getUserMediaSupported() {
  return !!(navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia);
}

// Populate the camera selection dropdown
async function loadCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    availableCameras = videoDevices;
    
    // Clear existing options (keep the default "Select Camera..." option)
    cameraSelect.innerHTML = '<option value="">Select Camera...</option>';
    
    // Add camera options
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      // Use label if available, otherwise create a generic name
      option.textContent = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    
    console.log('Found cameras:', videoDevices.length);
  } catch (err) {
    console.error('Error getting camera list:', err);
  }
}

// If webcam supported, add event listener to button for when user
// wants to activate it to call enableCam function which we will 
// define in the next step.
if (getUserMediaSupported()) {
  enableWebcamButton.addEventListener('click', enableCam);
  cameraToggleButton.addEventListener('click', toggleCamera);
  cameraSelect.addEventListener('change', onCameraSelect);
  
  // Load camera list on page load
  loadCameraList();
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
  
  // Start with the current facing mode
  startCamera();
}

function startCamera() {
  // Stop any existing stream
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
  }

  let constraints;
  
  // Use specific device ID if selected from dropdown
  const selectedDeviceId = cameraSelect.value;
  if (selectedDeviceId) {
    constraints = {
      video: {
        deviceId: { exact: selectedDeviceId }
      }
    };
  } else {
    // Fallback to facingMode for mobile cameras
    constraints = {
      video: {
        facingMode: currentFacingMode
      }
    };
  }

  // Activate the webcam stream.
  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      activeStream = stream;
      video.srcObject = stream;
      video.addEventListener('loadeddata', predictWebcam);
    })
    .catch(function(err) {
      // Fallback: try without specific constraints
      console.warn('Camera with constraints failed, trying fallback:', err);
      const fallbackConstraints = { video: true };
      
      navigator.mediaDevices.getUserMedia(fallbackConstraints)
        .then(function(stream) {
          activeStream = stream;
          video.srcObject = stream;
          video.addEventListener('loadeddata', predictWebcam);
        })
        .catch(function(fallbackErr) {
          console.error('Camera access failed completely:', fallbackErr);
        });
    });
}

function onCameraSelect() {
  // Only restart camera if it's already active
  if (activeStream) {
    startCamera();
  }
}

function toggleCamera() {
  // Toggle between front and rear camera
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  
  // Only restart if camera is already active
  if (activeStream) {
    startCamera();
  }
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
    // Remove any highlighting we did previous frame.
    for (let i = 0; i < children.length; i++) {
      liveView.removeChild(children[i]);
    }
    children.splice(0);
    
    // Now lets loop through predictions and draw them to the live view if
    // they have a high confidence score.
    for (let n = 0; n < predictions.length; n++) {
      // If we are over 66% sure we are sure we classified it right, draw it!
      if (predictions[n].score > 0.66) {
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
    
    // Call this function again to keep predicting when the browser is ready.
    window.requestAnimationFrame(predictWebcam);
  });
}