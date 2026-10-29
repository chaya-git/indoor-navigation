# Prompt: Build the Raspberry Pi route receiver + follower

Use this prompt with an AI coding assistant (or as a build spec for yourself)
to create the Raspberry Pi side that receives a route transcript from NAV-BOT
and drives the robot along it.

---

## Prompt to give the AI assistant

```
Build a Python 3 service that runs on a Raspberry Pi and controls a
differential-drive robot (two motors via GPIO/motor driver) so it can follow
a pre-planned indoor route.

CONTEXT
NAV-BOT is a browser app that plans a walking route through an office
(currently: Main Entrance -> CEO Cabin) and can POST a JSON "route
transcript" to this Pi. The Pi must receive it, store it, and physically
drive the robot through each step.

TRANSCRIPT JSON SHAPE (sent as the POST body, Content-Type: application/json)
{
  "schema_version": "1.0",
  "route_id": "entrance_to_ceo_cabin",
  "generated_at": "2026-09-03T10:00:00.000Z",
  "units": "meters",
  "start": { "node_id": "main_entrance", "label": "MAIN ENTRANCE" },
  "destination": { "node_id": "ceo_cabin", "label": "CEO CABIN" },
  "total_distance_m": 9.4,
  "step_length_m": 0.7,
  "steps": [
    {
      "seq": 1,
      "action": "forward",              // forward | slight_left | slight_right | turn_left | turn_right | u_turn | arrive
      "instruction": "Head forward for 3.8 m",
      "heading_deg": 0.0,               // absolute bearing on the source map (0-360)
      "leg_distance_m": 3.8,
      "cumulative_distance_m": 3.8,
      "to_node_id": "corner_bottom",
      "to_node_label": "corridor"
    }
    // ...more steps, last one always has "action": "arrive"
  ]
}

REQUIREMENTS

1. HTTP receiver
   - Run a small HTTP server (Flask or FastAPI) listening on 0.0.0.0:5000.
   - POST /navigate accepts the JSON transcript above, validates it has
     "steps" and "destination", saves it to disk (e.g. /home/pi/routes/
     latest.json) with a timestamp, and returns 200 with a short JSON ack
     ({"received": true, "step_count": N}).
   - Enable permissive CORS on this route only (Access-Control-Allow-Origin: *)
     so a browser on the same LAN can POST directly without a proxy.
   - GET /status returns the robot's current step index, whether it's
     currently driving, and the last error (if any), as JSON.
   - POST /stop immediately halts the motors and cancels the current run.

2. Route follower (state machine)
   - On receiving a new transcript, start executing steps in order unless the
     robot is already mid-route (in which case queue it or reject with 409 —
     your choice, just document it).
   - For each step:
       - "forward" / arriving at a node: drive straight for leg_distance_m
         at a configured speed (m/s), then stop.
       - "slight_left" / "slight_right" / "turn_left" / "turn_right" /
         "u_turn": rotate in place toward heading_deg using the robot's own
         current heading estimate (from an IMU/compass if available, else
         open-loop timed turn calibrated for the chassis), then proceed to
         drive that step's leg_distance_m.
       - "arrive": stop all motors, and log/announce arrival.
   - Convert meters to motor run-time or encoder ticks using a calibrated
     constant for this chassis (expose it as a config value, e.g.
     METERS_PER_SECOND and TICKS_PER_METER).
   - After each completed step, log it (seq, action, timestamp) so /status
     can report progress, and so a run can be resumed/debugged.

3. Safety
   - A physical or GPIO-wired emergency stop must immediately cut motor
     power regardless of what the state machine is doing.
   - If no new heartbeat/keepalive is received from a supervising process
     for N seconds while driving, stop the motors (fail-safe default).
   - Clamp any received distances/headings to sane bounds before driving
     (e.g. reject a single leg > 50 m or a malformed heading) — treat the
     transcript as untrusted input from the network.

4. Config
   - All hardware pins, wheel calibration constants, and default speed live
     in a single config.py or config.yaml, not hard-coded inline.

5. Deliverables
   - main.py (HTTP server + route runner wiring)
   - motor_driver.py (low-level GPIO motor control: drive(distance_m),
     rotate(delta_deg), stop())
   - route_runner.py (the step state machine described above)
   - config.py
   - README.md explaining how to run it (systemd service optional) and how
     to test /navigate with curl using a sample transcript.

Use standard Python (RPi.GPIO or gpiozero for motor control, Flask for the
HTTP layer) unless I specify different hardware. Ask me for my motor
driver board / pin layout if you need it before writing motor_driver.py.
```

---

## Notes for using this with NAV-BOT

- In the NAV-BOT app, open **📡 Send to Robot**, enter the Pi's `/navigate`
  URL (e.g. `http://192.168.1.50:5000/navigate`), and press **Send Now**.
- If the browser can't reach the Pi directly (different network, no CORS,
  HTTPS page trying to call plain HTTP), use **Download JSON** instead and
  copy the file to the Pi (`scp`, USB, etc.) for the receiver to read from
  disk.
- `heading_deg` is the bearing on NAV-BOT's own map coordinate system, not a
  compass bearing — treat it as *relative direction to turn toward* rather
  than an absolute compass heading unless the robot's start orientation is
  calibrated to match the map's "head forward" direction at the entrance.
