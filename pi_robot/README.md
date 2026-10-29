# NAV-BOT — Raspberry Pi Differential-Drive Robot Navigation Service

An autonomous indoor guide robot controller that runs on a Raspberry Pi. It receives planned JSON route transcripts from the **NAV-BOT** web application via HTTP REST API and physically drives a 2-motor differential-drive robot through the building.

---

## 📐 Hardware Wiring Diagram (Raspberry Pi & Motor Driver)

Typical wiring for standard dual H-Bridge drivers (**L298N**, **TB6612FNG**, **L9110S**):

| Motor Driver Pin | Raspberry Pi GPIO (BCM) | Physical Pin # | Description |
|---|---|---|---|
| **IN1** | GPIO 17 | Pin 11 | Left Motor Direction 1 |
| **IN2** | GPIO 27 | Pin 13 | Left Motor Direction 2 |
| **ENA** (PWM) | GPIO 22 | Pin 15 | Left Motor Speed (PWM) |
| **IN3** | GPIO 23 | Pin 16 | Right Motor Direction 1 |
| **IN4** | GPIO 24 | Pin 18 | Right Motor Direction 2 |
| **ENB** (PWM) | GPIO 25 | Pin 22 | Right Motor Speed (PWM) |
| **E-STOP** | GPIO 4 | Pin 7 | Push Button to GND (Emergency Stop) |
| **GND** | GND | Pin 6 / 9 / 14 | Common Ground with Battery & Pi |

> **Important**: Connect the Motor Driver GND and Raspberry Pi GND together. Power the motors with an external battery pack (e.g., 7.4V - 12V Li-ion).

---

## 🚀 Quick Setup & Installation

### 1. Install Dependencies on Raspberry Pi
```bash
sudo apt update
sudo apt install -y python3-pip python3-rpi.gpio
pip3 install flask
```

### 2. Clone or Copy Files to Raspberry Pi
Copy these files into `/home/pi/navbot/`:
- `config.py`
- `motor_driver.py`
- `route_runner.py`
- `main.py`

### 3. Run the Service
```bash
python3 main.py
```
The service will start listening on `0.0.0.0:5000`.

---

## 🧪 Testing Endpoints via `curl`

### 1. Send Route to Robot (`POST /navigate`)
```bash
curl -X POST http://<RASPBERRY_PI_IP>:5000/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "1.0",
    "route_id": "entrance_to_ceo_cabin",
    "generated_at": "2026-09-03T10:00:00.000Z",
    "units": "meters",
    "start": { "node_id": "main_entrance", "label": "MAIN ENTRANCE" },
    "destination": { "node_id": "ceo_cabin", "label": "CEO CABIN" },
    "total_distance_m": 10.45,
    "step_length_m": 0.7,
    "steps": [
      {
        "seq": 1,
        "action": "forward",
        "instruction": "Head forward for 3.8 m",
        "heading_deg": 90.0,
        "leg_distance_m": 3.8,
        "cumulative_distance_m": 3.8,
        "to_node_id": "corner_bottom",
        "to_node_label": "corridor corner"
      },
      {
        "seq": 2,
        "action": "turn_left",
        "instruction": "Turn left, then continue for 5.47 m",
        "heading_deg": 0.0,
        "leg_distance_m": 5.47,
        "cumulative_distance_m": 9.27,
        "to_node_id": "corner_top",
        "to_node_label": "upper corridor"
      },
      {
        "seq": 3,
        "action": "turn_right",
        "instruction": "Turn right, then continue for 1.18 m",
        "heading_deg": 90.0,
        "leg_distance_m": 1.18,
        "cumulative_distance_m": 10.45,
        "to_node_id": "ceo_cabin",
        "to_node_label": "CEO Cabin"
      },
      {
        "seq": 4,
        "action": "arrive",
        "instruction": "Arrive at CEO CABIN",
        "heading_deg": 90.0,
        "leg_distance_m": 0.0,
        "cumulative_distance_m": 10.45,
        "to_node_id": "ceo_cabin",
        "to_node_label": "CEO CABIN"
      }
    ]
  }'
```

**Expected Response (200 OK)**:
```json
{
  "message": "Route 'entrance_to_ceo_cabin' started.",
  "received": true,
  "route_id": "entrance_to_ceo_cabin",
  "step_count": 4,
  "total_distance_m": 10.45
}
```

---

### 2. Check Driving Status (`GET /status`)
```bash
curl http://<RASPBERRY_PI_IP>:5000/status
```

**Response**:
```json
{
  "current_heading_deg": 0.0,
  "current_step": {
    "action": "forward",
    "instruction": "Head forward for 3.8 m",
    "leg_distance_m": 3.8,
    "seq": 1
  },
  "current_step_index": 1,
  "elapsed_time_sec": 4.2,
  "is_driving": true,
  "last_error": null,
  "progress_percent": 25.0,
  "route_id": "entrance_to_ceo_cabin",
  "state": "RUNNING",
  "total_steps": 4
}
```

---

### 3. Emergency Stop / Cancel (`POST /stop`)
```bash
curl -X POST http://<RASPBERRY_PI_IP>:5000/stop
```

**Response**:
```json
{
  "message": "Motors halted and active route cancelled.",
  "stopped": true
}
```

---

## ⚙️ Calibration (Tuning for your chassis in `config.py`)

1. **Linear Speed**: Measure how far the robot travels in 3 seconds at cruise speed:
   $$\text{METERS\_PER\_SECOND} = \frac{\text{Distance in meters}}{\text{Time in seconds}}$$
   Update `METERS_PER_SECOND` in `config.py` (default: `0.35`).

2. **Rotation Speed**: Measure how many seconds it takes to complete a $360^\circ$ turn in place:
   $$\text{DEGREES\_PER\_SECOND} = \frac{360^\circ}{\text{Time in seconds}}$$
   Update `DEGREES_PER_SECOND` in `config.py` (default: `100.0`).

---

## 🛠️ Auto-Start on Raspberry Pi Boot (Systemd Service)

Create a systemd unit file `/etc/systemd/system/navrobot.service`:
```ini
[Unit]
Description=NAV-BOT Autonomous Guide Robot Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/navbot
ExecStart=/usr/bin/python3 /home/pi/navbot/main.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable navrobot
sudo systemctl start navrobot
sudo systemctl status navrobot
```
