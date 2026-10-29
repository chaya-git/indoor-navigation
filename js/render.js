"use strict";

// =============================================================================
// CANVAS FLOOR MAP RENDERING
// =============================================================================

const SVG_W = 920, SVG_H = 680;
const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function drawDimensionArrow(c, p1, p2, text, offsetDir = { x: 0, y: -15 }) {
  c.save();
  c.setLineDash([4, 4]);
  c.strokeStyle = "#4b5563";
  c.lineWidth = 1.2;

  c.beginPath();
  c.moveTo(p1.x, p1.y);
  c.lineTo(p2.x, p2.y);
  c.stroke();

  c.setLineDash([]);
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const headLen = 6;

  [p1, p2].forEach((pt, idx) => {
    const a = idx === 0 ? angle : angle + Math.PI;
    c.beginPath();
    c.moveTo(pt.x, pt.y);
    c.lineTo(pt.x + headLen * Math.cos(a + 0.4), pt.y + headLen * Math.sin(a + 0.4));
    c.moveTo(pt.x, pt.y);
    c.lineTo(pt.x + headLen * Math.cos(a - 0.4), pt.y + headLen * Math.sin(a - 0.4));
    c.stroke();
  });

  const midX = (p1.x + p2.x) / 2 + offsetDir.x;
  const midY = (p1.y + p2.y) / 2 + offsetDir.y;
  c.fillStyle = "#1f2937";
  c.font = "500 12px -apple-system, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, midX, midY);
  c.restore();
}

function drawDoorArc(c, pivot, radiusPx, startAngle, endAngle) {
  c.save();
  c.strokeStyle = "#1a1a1a";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(pivot.x, pivot.y, radiusPx, startAngle, endAngle);
  c.stroke();

  c.beginPath();
  c.moveTo(pivot.x, pivot.y);
  c.lineTo(pivot.x + radiusPx * Math.cos(endAngle), pivot.y + radiusPx * Math.sin(endAngle));
  c.stroke();
  c.restore();
}

function drawFloorMap() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const scale = Math.min(rect.width / SVG_W, rect.height / SVG_H);
  const dx = (rect.width - SVG_W * scale) / 2;
  const dy = (rect.height - SVG_H * scale) / 2;

  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SVG_W, SVG_H);

  ctx.fillStyle = "#10151b";
  ctx.font = "700 18px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("OFFICE MAP (All dimensions in meters)", SVG_W / 2, 32);

  ctx.save();
  ctx.translate(85, 75);
  ctx.strokeStyle = "#10151b";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -32); ctx.lineTo(0, 32);
  ctx.moveTo(-32, 0); ctx.lineTo(32, 0);
  ctx.stroke();

  ctx.fillStyle = "#10151b";
  ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(-4, -22); ctx.lineTo(4, -22); ctx.fill();
  ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(22, -4); ctx.lineTo(22, 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(-4, 22); ctx.lineTo(4, 22); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(-22, -4); ctx.lineTo(-22, 4); ctx.fill();

  ctx.font = "700 12px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", 0, -42);
  ctx.fillText("S", 0, 42);
  ctx.fillText("E", 44, 0);
  ctx.fillText("W", -44, 0);
  ctx.restore();

  // 1. Cabins
  Object.values(CABINS).forEach(cabin => {
    const pos = m2px(cabin.x, cabin.y);
    const w = cabin.w * PX_PER_METER;
    const h = cabin.h * PX_PER_METER;

    ctx.fillStyle = "#fdf6e7";
    ctx.fillRect(pos.x, pos.y, w, h);

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 4.5;
    ctx.strokeRect(pos.x, pos.y, w, h);

    ctx.fillStyle = "#10151b";
    ctx.font = "700 16px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = cabin.label.split("\n");
    if (lines.length === 2) {
      ctx.fillText(lines[0], pos.x + w / 2, pos.y + h / 2 - 10);
      ctx.fillText(lines[1], pos.x + w / 2, pos.y + h / 2 + 12);
    } else {
      ctx.fillText(cabin.label, pos.x + w / 2, pos.y + h / 2);
    }
  });

  // 2. Corridor walls
  const pEntTop = m2px(0.00, 4.40);
  const pEntBot = m2px(0.00, 6.70);
  const pBotCorner = m2px(3.80, 6.70);
  const pTopCorner = m2px(3.80, 1.23);
  const pCeoDoor = m2px(4.98, 1.23);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(pEntTop.x, pEntTop.y);
  ctx.lineTo(pEntBot.x, pEntBot.y);
  ctx.lineTo(pBotCorner.x, pBotCorner.y);
  ctx.lineTo(pTopCorner.x, pTopCorner.y);
  ctx.lineTo(pCeoDoor.x, pCeoDoor.y);
  ctx.stroke();

  const ceoBotRight = m2px(4.98 + 4.73, 0.40 + 3.60);
  ctx.beginPath();
  ctx.moveTo(ceoBotRight.x, ceoBotRight.y);
  ctx.lineTo(ceoBotRight.x, m2px(0, 3.70).y);
  ctx.stroke();

  // 3. Doors & entrance indicator
  const entDoorPt = m2px(0.00, 5.00);
  drawDoorArc(ctx, entDoorPt, 42, -Math.PI / 2, 0);

  const ceoDoorPt = m2px(4.98, 1.23);
  drawDoorArc(ctx, ceoDoorPt, 38, 0, Math.PI / 2);

  const hrDoorPt = m2px(5.20, 4.30);
  drawDoorArc(ctx, hrDoorPt, 36, 0, Math.PI / 2);

  ctx.fillStyle = "#10151b";
  ctx.font = "700 13px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("MAIN", entDoorPt.x - 36, entDoorPt.y + 12);
  ctx.fillText("ENTRANCE", entDoorPt.x - 36, entDoorPt.y + 28);

  ctx.beginPath();
  ctx.moveTo(entDoorPt.x - 32, entDoorPt.y + 20);
  ctx.lineTo(entDoorPt.x - 8, entDoorPt.y + 20);
  ctx.strokeStyle = "#10151b"; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(entDoorPt.x - 8, entDoorPt.y + 20);
  ctx.lineTo(entDoorPt.x - 16, entDoorPt.y + 15);
  ctx.lineTo(entDoorPt.x - 16, entDoorPt.y + 25);
  ctx.fill();

  // 4. Dimension lines
  drawDimensionArrow(ctx, m2px(4.98, 0.20), m2px(4.98 + 4.73, 0.20), "4.73 m", { x: 0, y: -10 });
  drawDimensionArrow(ctx, m2px(4.98 + 4.73 + 0.25, 0.40), m2px(4.98 + 4.73 + 0.25, 0.40 + 3.60), "3.60 m", { x: 32, y: 0 });
  drawDimensionArrow(ctx, m2px(3.80, 0.95), m2px(4.98, 0.95), "1.18 m", { x: 0, y: -10 });
  drawDimensionArrow(ctx, m2px(4.05, 1.23), m2px(4.05, 6.70), "5.47 m", { x: 30, y: 0 });
  drawDimensionArrow(ctx, m2px(0.00, 6.95), m2px(3.80, 6.95), "3.80 m", { x: 0, y: 14 });
  drawDimensionArrow(ctx, m2px(5.20, 6.95), m2px(5.20 + 3.02, 6.95), "3.02 m", { x: 0, y: 14 });
  drawDimensionArrow(ctx, m2px(5.20 + 3.02 + 0.25, 3.70), m2px(5.20 + 3.02 + 0.25, 3.70 + 3.00), "3.00 m", { x: 30, y: 0 });

  // 5. Summary box
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(490, 560, 390, 95);
  ctx.strokeRect(490, 560, 390, 95);

  ctx.fillStyle = "#111827";
  ctx.font = "700 11.5px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("SUMMARY", 502, 576);

  ctx.font = "400 10.5px -apple-system, sans-serif";
  ctx.fillStyle = "#374151";
  ctx.fillText("• Office Length: 3.80 m + 3.02 m = 6.82 m (approx.)", 502, 592);
  ctx.fillText("• Office Depth (left side): 5.47 m (approx.)", 502, 606);
  ctx.fillText("• CEO Cabin: 4.73 m (W) x 3.60 m (D)", 502, 620);
  ctx.fillText("• HR Cabin: 3.02 m (W) x 3.00 m (D)", 502, 634);
  ctx.fillText("• Passage width to CEO cabin: 1.18 m", 502, 648);

  // 6. Navigation graph & active route (Entrance -> CEO Cabin)
  EDGES.forEach(([a, b]) => {
    const na = nodesById[a], nb = nodesById[b];
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#4f7cff";
    ctx.lineWidth = 3.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
    ctx.restore();
  });

  if (state.path.length >= 2) {
    ctx.strokeStyle = "#1f9d6b";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    for (let i = 0; i < state.path.length - 1; i++) {
      const a = nodesById[state.path[i]], b = nodesById[state.path[i + 1]];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  NODES.forEach(n => {
    const onPath = state.path.includes(n.id);
    const r = n.selectable === false ? 4 : 10;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = onPath ? "#dff6e8" : "#ffffff"; ctx.fill();
    ctx.strokeStyle = "#174ea6"; ctx.lineWidth = n.selectable === false ? 2 : 3.5; ctx.stroke();

    if (n.selectable !== false && n.id !== "main_entrance") {
      ctx.fillStyle = "#0b2e63";
      ctx.font = "700 12px -apple-system, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(n.label, n.x, n.y + 14);
    }
  });

  const posNode = nodesById[state.currentPositionId];
  if (posNode && state.progress < 0 && !state.customCoord) {
    ctx.beginPath(); ctx.arc(posNode.x, posNode.y, 18, 0, Math.PI * 2);
    ctx.strokeStyle = "#e08a2b"; ctx.lineWidth = 3; ctx.stroke();
  }

  let currentCoord = { x: 175, y: 505 };
  if (state.progress >= 0 && state.path.length) {
    currentCoord = positionAlong(state.path, state.progress);
  } else if (state.customCoord) {
    currentCoord = state.customCoord;
  } else if (posNode) {
    currentCoord = { x: posNode.x, y: posNode.y };
  }

  drawUserGyroMarker(ctx, currentCoord.x, currentCoord.y, state.headingDeg);

  ctx.restore();
}

function drawUserGyroMarker(c, x, y, headingDeg) {
  const rad = (headingDeg - 90) * (Math.PI / 180);

  c.save();
  c.translate(x, y);

  const coneRadius = 85;
  const fovHalfAngle = 32 * (Math.PI / 180);
  const grad = c.createRadialGradient(0, 0, 5, 0, 0, coneRadius);
  grad.addColorStop(0, "rgba(79, 124, 255, 0.45)");
  grad.addColorStop(0.7, "rgba(79, 124, 255, 0.18)");
  grad.addColorStop(1, "rgba(79, 124, 255, 0)");

  c.beginPath();
  c.moveTo(0, 0);
  c.arc(0, 0, coneRadius, rad - fovHalfAngle, rad + fovHalfAngle);
  c.closePath();
  c.fillStyle = grad;
  c.fill();

  c.beginPath();
  c.arc(0, 0, 16, 0, Math.PI * 2);
  c.fillStyle = "rgba(224, 138, 43, 0.25)";
  c.fill();

  c.beginPath();
  c.arc(0, 0, 9, 0, Math.PI * 2);
  c.fillStyle = "#e08a2b";
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = "#ffffff";
  c.stroke();

  c.rotate(rad);
  c.beginPath();
  c.moveTo(10, 0);
  c.lineTo(20, -6);
  c.lineTo(26, 0);
  c.lineTo(20, 6);
  c.closePath();
  c.fillStyle = "#1d4fa3";
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = "#ffffff";
  c.stroke();

  c.restore();
}

function render() {
  drawFloorMap();
  updateStatusPanel();
  updateCompassWidget();
}

function updateCompassWidget() {
  const arrow = document.getElementById("compassArrow");
  arrow.style.transform = `rotate(${state.headingDeg}deg)`;
}

function headingAnimationLoop() {
  let diff = (state.targetHeadingDeg - state.headingDeg + 180) % 360 - 180;
  if (Math.abs(diff) > 0.05) {
    state.headingDeg = (state.headingDeg + diff * 0.15 + 360) % 360;
    render();
  }
  requestAnimationFrame(headingAnimationLoop);
}
