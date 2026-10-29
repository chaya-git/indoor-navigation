"use strict";

// =============================================================================
// APP STATE & LOCATION-BASED NAVIGATION
// =============================================================================

const state = {
  currentPositionId: ROUTE_START_ID,
  destinationId: ROUTE_DESTINATION_ID,
  customCoord: null,
  path: [],
  directions: [],
  progress: -1,
  navigating: false,
  arrived: false,
  distanceCoveredPx: 0,
  autoWalk: false,

  sensorsActive: false,
  headingDeg: 0,
  targetHeadingDeg: 0,
  stepCount: 0,
  stepDistanceM: 0,
  lastSpokenIndex: -1,
  gpsActive: false,
};

function getCurrentCoord() {
  if (state.progress >= 0 && state.path.length) {
    return positionAlong(state.path, state.progress);
  }
  if (state.customCoord) {
    return state.customCoord;
  }
  const posNode = nodesById[state.currentPositionId];
  if (posNode) {
    return { x: posNode.x, y: posNode.y };
  }
  return { x: 175, y: 505 };
}

function onPhysicalStepDetected() {
  state.stepCount++;
  state.stepDistanceM += STEP_LENGTH_METERS;

  const stepText = document.getElementById("stepText");
  const stepBadge = document.getElementById("stepBadge");
  const diagDist = document.getElementById("diagDist");
  if (stepText) stepText.textContent = `Steps: ${state.stepCount}`;
  if (stepBadge) stepBadge.classList.add("active");
  if (diagDist) diagDist.textContent = `${state.stepDistanceM.toFixed(1)} m`;

  if (navigator.vibrate) navigator.vibrate(45);

  if (state.navigating && state.path.length >= 2) {
    const totalPx = pathLength(state.path);
    state.distanceCoveredPx += STEP_LENGTH_PX;
    state.progress = Math.min(1, state.distanceCoveredPx / totalPx);

    if (state.progress >= 0.999) {
      state.progress = 1;
      state.navigating = false;
      state.arrived = true;
      state.currentPositionId = state.destinationId;
      state.customCoord = null;
      if (state.autoWalk) toggleAutoWalk();
      render();
      speak(`You have arrived at ${nodesById[state.destinationId].label}`, { force: true });
      showArrivalModal();
    } else {
      render();
      checkVoicePrompt();
    }
  } else {
    // Free-Walk: advance marker in the direction the phone is pointing
    const curr = getCurrentCoord();
    const rad = (state.headingDeg - 90) * (Math.PI / 180);
    const newX = Math.max(60, Math.min(SVG_W - 60, curr.x + Math.cos(rad) * STEP_LENGTH_PX));
    const newY = Math.max(60, Math.min(SVG_H - 60, curr.y + Math.sin(rad) * STEP_LENGTH_PX));
    state.customCoord = { x: newX, y: newY };
    
    // Automatically update nearest node & dynamically re-route if navigating
    const nearest = findNearestNode(newX, newY);
    state.currentPositionId = nearest.id;
    render();
  }
}

// =============================================================================
// AUTO-WALK CONTROLLER
// =============================================================================

const AUTO_WALK_SPEED_MPS = 0.8;
const AUTO_WALK_INTERVAL_MS = Math.round((STEP_LENGTH_METERS / AUTO_WALK_SPEED_MPS) * 1000);

let autoWalkInterval = null;
function toggleAutoWalk() {
  state.autoWalk = !state.autoWalk;
  const btn = document.getElementById("autoWalkMainBtn");

  if (state.autoWalk) {
    btn.classList.add("active");
    btn.textContent = "⏸ Stop Walk";
    if (!state.navigating) startNavigation();
    autoWalkInterval = setInterval(() => {
      if (state.navigating) onPhysicalStepDetected();
    }, AUTO_WALK_INTERVAL_MS);
    showToast("⚡ Auto-Walk started: simulating movement along route");
  } else {
    btn.classList.remove("active");
    btn.textContent = "⚡ Auto-Walk";
    clearInterval(autoWalkInterval);
    autoWalkInterval = null;
    showToast("Auto-Walk stopped");
  }
}

window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(headingAnimationLoop);

// =============================================================================
// DYNAMIC ROUTE PLANNING BASED ON DETECTED LOCATION
// =============================================================================

function planRouteFromCurrentPosition() {
  const curr = getCurrentCoord();
  const nearest = findNearestNode(curr.x, curr.y);
  state.currentPositionId = nearest.id;

  if (nearest.id === state.destinationId) {
    showToast(`You are already at ${nodesById[state.destinationId].label}`);
    return;
  }

  const path = aStar(state.currentPositionId, state.destinationId);
  if (!path.length) {
    showToast("No route found from this location.");
    return;
  }

  state.path = path;
  state.directions = generateDirections(path);
  state.navigating = true;
  state.arrived = false;
  state.progress = 0;
  state.distanceCoveredPx = 0;
  state.lastSpokenIndex = -1;

  render();
}

// =============================================================================
// TAP ANYWHERE ON MAP TO SET LOCATION & RE-ROUTE
// =============================================================================

function handleMapTap(evt) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / SVG_W, rect.height / SVG_H);
  const dx = (rect.width - SVG_W * scale) / 2;
  const dy = (rect.height - SVG_H * scale) / 2;

  const clientX = evt.clientX || (evt.touches && evt.touches[0].clientX);
  const clientY = evt.clientY || (evt.touches && evt.touches[0].clientY);

  const canvasX = (clientX - rect.left - dx) / scale;
  const canvasY = (clientY - rect.top - dy) / scale;

  if (canvasX >= 0 && canvasX <= SVG_W && canvasY >= 0 && canvasY <= SVG_H) {
    const nearest = findNearestNode(canvasX, canvasY);
    state.currentPositionId = nearest.id;
    state.customCoord = { x: canvasX, y: canvasY };

    // Plan and show navigation directly from this location!
    planRouteFromCurrentPosition();

    showToast(`📍 Location: ${nearest.label || "Corridor"} — Route updated!`);
  }
}

canvas.addEventListener("click", handleMapTap);
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) handleMapTap(e);
}, { passive: true });

// =============================================================================
// GEOLOCATION / GPS POSITIONING (DETECT MY LOCATION)
// =============================================================================

let gpsAnchor = null;

function detectMyLocation() {
  if (!("geolocation" in navigator)) {
    showToast("Geolocation not supported by this browser. Tap the map to place yourself.");
    return;
  }

  showToast("🔍 Detecting your live location...");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.gpsActive = true;
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      if (!gpsAnchor) gpsAnchor = { lat, lon };

      const dLatMeters = (lat - gpsAnchor.lat) * 111320;
      const dLonMeters = (lon - gpsAnchor.lon) * (111320 * Math.cos(lat * Math.PI / 180));

      const curr = getCurrentCoord();
      const newX = Math.max(60, Math.min(SVG_W - 60, curr.x + dLonMeters * PX_PER_METER));
      const newY = Math.max(60, Math.min(SVG_H - 60, curr.y - dLatMeters * PX_PER_METER));

      state.customCoord = { x: newX, y: newY };
      const nearest = findNearestNode(newX, newY);
      state.currentPositionId = nearest.id;

      // Plan navigation route from this detected location!
      planRouteFromCurrentPosition();

      showToast(`📍 Location detected (±${Math.round(accuracy)}m) — Route planned!`);
    },
    (err) => {
      console.warn("GPS Notice:", err.message);
      showToast("Could not get GPS fix. Tap anywhere on map to set your location.");
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// Continuous GPS telemetry logging (Indoors, GPS suffers multipath jitter; we do NOT jump position on GPS noise)
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      state.gpsActive = true;
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      const gpsEl = document.getElementById("diagGPS");
      if (gpsEl) gpsEl.textContent = `±${Math.round(accuracy)}m (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    },
    (err) => {
      const gpsEl = document.getElementById("diagGPS");
      if (gpsEl) gpsEl.textContent = "Weak / Indoor";
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
  );
}

// =============================================================================
// UI WIRING & NAVIGATION CONTROLS
// =============================================================================

const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const scanBtn = document.getElementById("scanBtn");
const floatingWalkBtn = document.getElementById("floatingWalkBtn");
const enableSensorsBtn = document.getElementById("enableSensorsBtn");
const autoWalkMainBtn = document.getElementById("autoWalkMainBtn");
const shareRobotBtn = document.getElementById("shareRobotBtn");
const positionLabel = document.getElementById("positionLabel");
const destinationSelect = document.getElementById("destinationSelect");
const statusLine = document.getElementById("statusLine");
const routeLine = document.getElementById("routeLine");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");
const locateMeBtn = document.getElementById("locateMeBtn");

function destinationOptions() {
  return NODES.filter(n => n.selectable !== false && n.id !== state.currentPositionId);
}

function populateDestinationSelect() {
  if (!destinationSelect) return;
  const opts = destinationOptions();
  if (!opts.some(n => n.id === state.destinationId)) {
    state.destinationId = opts[0]?.id || "ceo_cabin";
  }
  destinationSelect.innerHTML = "";
  opts.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n.id;
    opt.textContent = n.label;
    if (n.id === state.destinationId) opt.selected = true;
    destinationSelect.appendChild(opt);
  });
}

if (destinationSelect) {
  destinationSelect.addEventListener("change", () => {
    state.destinationId = destinationSelect.value;
    state.arrived = false;
    planRouteFromCurrentPosition();
    showToast(`🎯 Destination set to ${nodesById[state.destinationId].label}`);
  });
}

function updateStatusPanel() {
  positionLabel.textContent = nodesById[state.currentPositionId]?.label || "Custom Position";

  const coveredM = state.path.length
    ? distanceCoveredAlong(state.path, Math.max(0, state.progress)) / PX_PER_METER
    : 0;
  const current = state.directions.length ? currentStepFor(state.directions, coveredM) : null;

  statusLine.className = "status-line " + (state.arrived ? "status-arrived" : state.navigating ? "status-nav" : "status-idle");
  if (state.arrived) {
    statusLine.textContent = `✅ Arrived at ${nodesById[state.destinationId].label}`;
  } else if (state.navigating && current) {
    const remaining = Math.max(0, current.cumulativeDistanceM - coveredM);
    statusLine.textContent = current.isArrival
      ? `🤖 Arriving at ${nodesById[state.destinationId].label}…`
      : `📍 In ${remaining.toFixed(1)} m: ${current.instruction.replace(/, then continue.*$/, "")}`;
  } else {
    statusLine.textContent = "Tap '📍 Locate Me', tap map, or press 'Navigate' to begin.";
  }

  const totalM = state.path.length ? pathLength(state.path) / PX_PER_METER : 0;
  routeLine.textContent = "ROUTE: " + (state.path.length
    ? `${state.path.map(id => nodesById[id].label || id).join("  →  ")}   (${totalM.toFixed(1)} m)`
    : "no route planned yet");

  startBtn.disabled = state.navigating;
  resetBtn.disabled = state.path.length === 0;
  scanBtn.disabled = state.navigating;

  renderDirections(state.directions, coveredM);
}

function renderDirections(steps, coveredM) {
  const list = document.getElementById("directionsList");
  const totalEl = document.getElementById("directionsTotal");
  list.innerHTML = "";

  if (!steps.length) {
    totalEl.textContent = "";
    const li = document.createElement("div");
    li.className = "directions-empty";
    li.textContent = "Choose destination and tap Navigate or map to plan route.";
    list.appendChild(li);
    return;
  }

  const total = steps[steps.length - 1].cumulativeDistanceM;
  totalEl.textContent = `${total.toFixed(1)} m total`;

  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    const isDone = coveredM >= step.cumulativeDistanceM - 0.05;
    const isActive = !isDone && coveredM >= step.startDistanceM - 0.05;
    if (isDone) li.classList.add("done");
    if (isActive) li.classList.add("active");

    const icon = document.createElement("span");
    icon.className = "step-icon";
    icon.textContent = step.isArrival ? "🏁" : String(idx + 1);

    const body = document.createElement("div");
    body.className = "step-body";

    const instr = document.createElement("div");
    instr.className = "step-instruction";
    instr.textContent = step.instruction;

    const meta = document.createElement("div");
    meta.className = "step-meta";
    if (step.isArrival) {
      meta.textContent = "Destination";
    } else if (isActive) {
      const remaining = Math.max(0, step.cumulativeDistanceM - coveredM);
      meta.textContent = `${remaining.toFixed(1)} m remaining → ${step.toNodeLabel}`;
    } else {
      meta.textContent = `${step.legDistanceM.toFixed(1)} m → ${step.toNodeLabel}`;
    }

    body.appendChild(instr);
    body.appendChild(meta);
    li.appendChild(icon);
    li.appendChild(body);
    list.appendChild(li);
  });
}

function startNavigation() {
  planRouteFromCurrentPosition();
  showToast("🚶 Navigation started! Follow the route.");
  speak(`Starting navigation to ${nodesById[state.destinationId].label}. Follow the route.`, { force: true });
}

function resetNavigation() {
  state.navigating = false;
  state.arrived = false;
  state.path = [];
  state.directions = [];
  state.progress = -1;
  state.distanceCoveredPx = 0;
  state.lastSpokenIndex = -1;
  state.customCoord = null;
  state.stepCount = 0;
  state.stepDistanceM = 0;
  if (typeof resetStepDetector === "function") resetStepDetector();
  const stepText = document.getElementById("stepText");
  if (stepText) stepText.textContent = "Steps: 0";
  const diagDist = document.getElementById("diagDist");
  if (diagDist) diagDist.textContent = "0.0 m";
  if (state.autoWalk) toggleAutoWalk();
  render();
}

startBtn.addEventListener("click", startNavigation);
resetBtn.addEventListener("click", resetNavigation);
enableSensorsBtn.addEventListener("click", enablePhoneSensors);
floatingWalkBtn.addEventListener("click", onPhysicalStepDetected);
autoWalkMainBtn.addEventListener("click", toggleAutoWalk);
if (locateMeBtn) locateMeBtn.addEventListener("click", detectMyLocation);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    onPhysicalStepDetected();
  }
});

voiceToggleBtn.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  voiceToggleBtn.textContent = voiceEnabled ? "🔊 Voice: ON" : "🔇 Voice: OFF";
  if (!voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
});

document.getElementById("compassWidget").addEventListener("click", () => {
  state.targetHeadingDeg = 0;
  state.headingDeg = 0;
  showToast("Compass reset to 0° (North/Up)");
});

document.getElementById("recenterBtn").addEventListener("click", () => {
  render();
  showToast("Map centered");
});

// =============================================================================
// ARRIVAL MODAL
// =============================================================================

const arrivalOverlay = document.getElementById("arrivalOverlay");
const arrivalMessage = document.getElementById("arrivalMessage");
document.getElementById("arrivalOkBtn").addEventListener("click", () => {
  arrivalOverlay.classList.remove("open");
  populateDestinationSelect();
});

function showArrivalModal() {
  const label = nodesById[state.destinationId].label;
  arrivalMessage.textContent = `🔊 "You have arrived at ${label}."`;
  arrivalOverlay.classList.add("open");
}

// =============================================================================
// SCANNER MODAL & CHECKPOINTS
// =============================================================================

const scannerOverlay = document.getElementById("scannerOverlay");
const videoEl = document.getElementById("video");
const cameraNote = document.getElementById("cameraNote");
const simulateList = document.getElementById("simulateList");
let qrScanner = null;

function buildSimulateList() {
  simulateList.innerHTML = "";
  NODES.filter(n => n.selectable !== false).forEach(n => {
    const item = document.createElement("button");
    item.className = "simulate-item";
    item.innerHTML = `<span class="label">${n.label}</span><span class="code">${QR_PREFIX}${n.id}</span>`;
    item.addEventListener("click", () => confirmScan(n.id));
    simulateList.appendChild(item);
  });
}
buildSimulateList();

function handleDecodedText(raw) {
  if (!raw || !raw.startsWith(QR_PREFIX)) {
    cameraNote.textContent = "Not a navigation checkpoint code.";
    cameraNote.classList.add("error");
    return;
  }
  const nodeId = raw.slice(QR_PREFIX.length).trim();
  if (!nodesById[nodeId]) {
    cameraNote.textContent = `Unknown checkpoint id: "${nodeId}".`;
    cameraNote.classList.add("error");
    return;
  }
  confirmScan(nodeId);
}

async function openScanner() {
  scannerOverlay.classList.add("open");
  cameraNote.textContent = "Requesting camera…";
  cameraNote.classList.remove("error");

  if (!window.isSecureContext) {
    cameraNote.textContent = "Camera requires HTTPS. Use simulated checkpoint buttons below.";
    cameraNote.classList.add("error");
    return;
  }
  if (typeof QrScanner === "undefined" || !navigator.mediaDevices) {
    cameraNote.textContent = "Camera library unavailable. Use simulated checkpoints below.";
    cameraNote.classList.add("error");
    return;
  }

  try {
    const hasCamera = await QrScanner.hasCamera();
    if (!hasCamera) {
      cameraNote.textContent = "No camera detected. Use simulated checkpoints below.";
      cameraNote.classList.add("error");
      return;
    }
    qrScanner = new QrScanner(
      videoEl,
      result => handleDecodedText(typeof result === "string" ? result : result.data),
      { highlightScanRegion: false, highlightCodeOutline: false, preferredCamera: "environment" }
    );
    await qrScanner.start();
    cameraNote.textContent = "Point camera at checkpoint QR code.";
  } catch (err) {
    cameraNote.textContent = "Camera access denied. Use simulated checkpoints below.";
    cameraNote.classList.add("error");
  }
}

function closeScanner() {
  if (qrScanner) {
    qrScanner.stop();
    qrScanner.destroy();
    qrScanner = null;
  }
  scannerOverlay.classList.remove("open");
}

function confirmScan(nodeId) {
  closeScanner();
  state.currentPositionId = nodeId;
  state.customCoord = null;
  planRouteFromCurrentPosition();
  showToast(`📍 Position set: ${nodesById[nodeId].label}`);
  speak(`Position calibrated to ${nodesById[nodeId].label}`, { force: true });
}

scanBtn.addEventListener("click", openScanner);
document.getElementById("closeScannerBtn").addEventListener("click", closeScanner);

// =============================================================================
// ROBOT / RASPBERRY PI SHARE MODAL
// =============================================================================

const robotOverlay = document.getElementById("robotOverlay");
const robotUrlInput = document.getElementById("robotUrlInput");
const robotStatus = document.getElementById("robotStatus");

shareRobotBtn.addEventListener("click", () => {
  robotStatus.textContent = "";
  robotOverlay.classList.add("open");
});
document.getElementById("closeRobotBtn").addEventListener("click", () => {
  robotOverlay.classList.remove("open");
});
document.getElementById("sendRobotBtn").addEventListener("click", () => {
  sendRouteTranscriptToPi(robotUrlInput.value.trim());
});
document.getElementById("downloadRobotBtn").addEventListener("click", () => {
  downloadRouteTranscript();
  robotStatus.textContent = "✅ Transcript downloaded — copy it to the Raspberry Pi.";
});

// =============================================================================
// TOAST
// =============================================================================

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// =============================================================================
// INIT
// =============================================================================

populateDestinationSelect();
resizeCanvas();
