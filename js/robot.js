"use strict";

// =============================================================================
// RASPBERRY PI / ROBOT HAND-OFF
// -----------------------------------------------------------------------------
// Builds a plain-JSON transcript of the planned route (Entrance -> CEO Cabin)
// that a Raspberry Pi-driven robot can consume to physically follow the same
// path. It can be sent live over HTTP to a receiver running on the Pi, or
// downloaded as a file if the Pi isn't reachable from this browser session.
// See RASPBERRY_PI_INTEGRATION_PROMPT.md for the spec/prompt describing the
// receiver + follower script that should run on the Pi.
// =============================================================================

function buildRouteTranscript() {
  const path = aStar(ROUTE_START_ID, ROUTE_DESTINATION_ID);
  const directions = generateDirections(path);
  const totalM = pathLength(path) / PX_PER_METER;

  return {
    schema_version: "1.0",
    route_id: "entrance_to_ceo_cabin",
    generated_at: new Date().toISOString(),
    units: "meters",
    start: { node_id: ROUTE_START_ID, label: nodesById[ROUTE_START_ID].label },
    destination: { node_id: ROUTE_DESTINATION_ID, label: nodesById[ROUTE_DESTINATION_ID].label },
    total_distance_m: Number(totalM.toFixed(2)),
    step_length_m: STEP_LENGTH_METERS,
    steps: directions.map((step, idx) => ({
      seq: idx + 1,
      action: step.action,                     // forward | slight_left | slight_right | turn_left | turn_right | u_turn | arrive
      instruction: step.instruction,            // human-readable, for logging/TTS on the robot too
      heading_deg: Number(step.headingDeg.toFixed(1)), // absolute bearing on the map, 0 = East, 90 = South (screen coords)
      leg_distance_m: Number(step.legDistanceM.toFixed(2)),
      cumulative_distance_m: Number(step.cumulativeDistanceM.toFixed(2)),
      to_node_id: step.toNodeId,
      to_node_label: step.toNodeLabel,
    })),
  };
}

function downloadRouteTranscript() {
  const transcript = buildRouteTranscript();
  const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `navbot-route-${transcript.route_id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function sendRouteTranscriptToPi(piUrl) {
  const statusEl = document.getElementById("robotStatus");
  const transcript = buildRouteTranscript();

  if (!piUrl) {
    statusEl.textContent = "Enter the Raspberry Pi receiver URL first.";
    return;
  }

  statusEl.textContent = "Sending route to robot…";
  try {
    const res = await fetch(piUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transcript),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    statusEl.textContent = `✅ Sent — robot receiver responded ${res.status}.`;
    showToast("📡 Route sent to Raspberry Pi");
  } catch (err) {
    console.error("Pi send error:", err);
    statusEl.textContent =
      "⚠️ Could not reach the Pi from this browser (often CORS or it's on a different network). " +
      "Use 'Download JSON' and transfer it to the Pi instead.";
  }
}
