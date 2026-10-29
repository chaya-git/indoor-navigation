import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DESTINATIONS,
  GRAPH_NODES,
  CORRIDORS,
  ROOMS,
  MAP_BOUNDS,
  QR_CHECKPOINTS,
  nodesById as defaultNodesById,
  adjacency as defaultAdjacency,
  PIXELS_PER_METER,
  calculateDistance
} from './data/buildingMapData.js';
import {
  getAllMaps,
  getMapById,
  createAdjacency,
  createNodesById
} from './data/mapCatalog.js';
import { findAStarPath } from './navigation/aStar.js';
import {
  generateTurnByTurnDirections,
  checkOffRouteDeviation,
  computeLiveManeuverProgress
} from './navigation/routeGuidance.js';
import { speakGuidance, stopSpeaking } from './navigation/voiceGuidance.js';
import { useSensors } from './sensors/useSensors.js';

import MapViewer from './components/MapViewer.jsx';
import NavigationHUD from './components/NavigationHUD.jsx';
import TurnByTurnBanner from './components/TurnByTurnBanner.jsx';
import SensorCalibrationModal from './components/SensorCalibrationModal.jsx';
import QRScannerModal from './components/QRScannerModal.jsx';
import TelemetryDrawer from './components/TelemetryDrawer.jsx';
import ArrivalModal from './components/ArrivalModal.jsx';
import WhatsAppDispatchPortal from './components/WhatsAppDispatchPortal.jsx';
import WhatsAppShareModal from './components/WhatsAppShareModal.jsx';
import RaspberryPiModal from './components/RaspberryPiModal.jsx';
import AddMapModal from './components/AddMapModal.jsx';
import UploadDiagramModal from './components/UploadDiagramModal.jsx';
import MeasurementRouteModal from './components/MeasurementRouteModal.jsx';

/**
 * Interpolates the exact (x, y) coordinate along a 2D map route path
 * corresponding to a given distance traveled in meters (encoder distance).
 */
function getPositionAtDistance(routePoints, distanceMeters, pixelsPerMeter = 20) {
  if (!routePoints || routePoints.length === 0) return null;
  if (routePoints.length === 1 || distanceMeters <= 0) {
    return { x: routePoints[0].x, y: routePoints[0].y };
  }

  const targetPx = distanceMeters * pixelsPerMeter;
  let accumulatedPx = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const p1 = routePoints[i];
    const p2 = routePoints[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLenPx = Math.hypot(dx, dy);

    if (segLenPx === 0) continue;

    if (accumulatedPx + segLenPx >= targetPx) {
      const remainingPx = targetPx - accumulatedPx;
      const t = remainingPx / segLenPx;
      return {
        x: p1.x + t * dx,
        y: p1.y + t * dy
      };
    }
    accumulatedPx += segLenPx;
  }

  // If distance exceeds full route length, return destination point
  const lastPoint = routePoints[routePoints.length - 1];
  return { x: lastPoint.x, y: lastPoint.y };
}

export default function App() {
  // Read URL query parameters for WhatsApp deep-linking
  const queryParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlMap = queryParams.get('map');
  const urlDest = queryParams.get('dest');
  const urlStart = queryParams.get('start');
  const urlView = queryParams.get('view');

  // Multi-Map 3D Catalog State
  const [allMaps, setAllMaps] = useState(() => getAllMaps());
  const [activeMapId, setActiveMapId] = useState(() => {
    return urlMap || localStorage.getItem('navbot_active_map_id') || 'robomantha_3d_building';
  });
  const [isAddMapOpen, setIsAddMapOpen] = useState(false);
  const [isUploadDiagramOpen, setIsUploadDiagramOpen] = useState(false);

  const activeMap = getMapById(activeMapId);

  // Navigation Selection States: default directly to 3D map view
  const [currentView, setCurrentView] = useState(urlView ? urlView : 'map');
  const [selectedStart, setSelectedStart] = useState(urlStart || activeMap.defaultStart || 'gf_entrance');
  const [selectedDest, setSelectedDest] = useState(urlDest || activeMap.defaultDest || 'sf_robomantha_office');
  const [isNavigating, setIsNavigating] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isPiModalOpen, setIsPiModalOpen] = useState(false);
  const [receivedFromWhatsApp, setReceivedFromWhatsApp] = useState(Boolean(urlDest));

  // Route & Turn-by-Turn Guidance States
  const [activeRoute, setActiveRoute] = useState(null);
  const [turnInstructions, setTurnInstructions] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const lastRerouteTimeRef = useRef(0);
  const offRouteCountRef = useRef(0);
  const spokenEventsRef = useRef(new Set());

  // Raspberry Pi Live Step-by-Step Sync State
  const [isLivePiSync, setIsLivePiSync] = useState(() => {
    return localStorage.getItem('navbot_live_pi_sync') !== 'false';
  });
  const [piSyncToast, setPiSyncToast] = useState(null);
  const lastSentStepRef = useRef(-1);

  // Feedback FROM the Raspberry Pi (motor/stepper status, faults, etc.)
  // This is the return path: not just "send commands to the robot" but
  // "hear back from it" so we know if something went wrong on its end.
  const [piFeedback, setPiFeedback] = useState(null);   // last /status snapshot
  const [piFault, setPiFault] = useState(null);          // { message, at } | null
  const lastSeenFaultRef = useRef(null);
  const piStatusPollRef = useRef(null);

  // Step-by-Step Robot Dispatch: software sends one command at a time,
  // monitors encoder data to confirm the robot moved, then sends the next.
  const [piStepByStep, setPiStepByStep] = useState(false);
  const piStepByStepRef = useRef(false);
  piStepByStepRef.current = piStepByStep;
  const piStepQueueRef = useRef([]);       // full list of Pi steps
  const piCurrentIdxRef = useRef(0);       // index of step currently executing
  const piStepPhaseRef = useRef('idle');   // 'idle' | 'sent' | 'moving' | 'done'
  const piEncoderStartRef = useRef(0);     // encoder distance when step started
  const piMovingConfirmedRef = useRef(false); // true once we've seen driving=true
  const sentIdleCountRef = useRef(0);       // number of idle status polls while in 'sent' phase
  const stepSentTimestampRef = useRef(0);   // timestamp (ms) when step command was dispatched

  useEffect(() => {
    localStorage.setItem('navbot_live_pi_sync', isLivePiSync);
  }, [isLivePiSync]);

  // Auto-walk Simulation State
  const [isAutoWalking, setIsAutoWalking] = useState(false);
  const autoWalkIntervalRef = useRef(null);

  // Modals & Drawers States
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isArrivalOpen, setIsArrivalOpen] = useState(false);
  const [isMeasurementModalOpen, setIsMeasurementModalOpen] = useState(false);
  const [arrivedDestName, setArrivedDestName] = useState('');

  // Calculate destination coordinate
  const currentDestList = activeMap?.destinations || DESTINATIONS;
  const destObj = currentDestList.find((d) => d.id === selectedDest) || currentDestList[0];
  const destinationCoord = destObj ? { x: destObj.x, y: destObj.y } : null;

  // Live state refs for instant zero-stale access during step detection events
  const isNavigatingRef = useRef(isNavigating);
  isNavigatingRef.current = isNavigating;
  const isLivePiSyncRef = useRef(isLivePiSync);
  isLivePiSyncRef.current = isLivePiSync;
  const isVoiceMutedRef = useRef(isVoiceMuted);
  isVoiceMutedRef.current = isVoiceMuted;
  // Filled in once handleStopNavigation is defined below, so the fault-polling
  // callback (defined earlier, for a stable useCallback identity) can call it.
  const handleStopNavigationRef = useRef(null);
  const activeRouteRef = useRef(activeRoute);
  activeRouteRef.current = activeRoute;
  const turnInstructionsRef = useRef(turnInstructions);
  turnInstructionsRef.current = turnInstructions;
  const currentStepIndexRef = useRef(currentStepIndex);
  currentStepIndexRef.current = currentStepIndex;
  const selectedDestRef = useRef(selectedDest);
  selectedDestRef.current = selectedDest;
  const selectedStartRef = useRef(selectedStart);
  selectedStartRef.current = selectedStart;
  const destObjRef = useRef(destObj);
  destObjRef.current = destObj;
  const activeMapRef = useRef(activeMap);
  activeMapRef.current = activeMap;
  const resetPositionRef = useRef(null);

  const stepSeqRef = useRef(0);
  const lastTurnManeuverIdxRef = useRef(-1);
  const abortPiDispatchRef = useRef(null);

  // ── Helper: Convert turn-by-turn maneuvers into Pi-compatible route steps ──
  const buildPiRouteSteps = useCallback((turns, destName) => {
    if (!turns || turns.length === 0) return [];
    const steps = [];
    for (let i = 0; i < turns.length; i++) {
      const m = turns[i];
      const rawAction = (m.action || m.type || 'forward').toLowerCase();

      // Map maneuver actions to Pi-compatible action names
      let piAction = 'forward';
      let degrees = null;
      if (rawAction === 'start' || rawAction === 'straight') {
        piAction = 'forward';
      } else if (rawAction === 'turn_left' || rawAction === 'left') {
        piAction = 'turn_left';
        degrees = 90;
      } else if (rawAction === 'turn_right' || rawAction === 'right') {
        piAction = 'turn_right';
        degrees = 90;
      } else if (rawAction === 'slight_left') {
        piAction = 'slight_left';
        degrees = 30;
      } else if (rawAction === 'slight_right') {
        piAction = 'slight_right';
        degrees = 30;
      } else if (rawAction === 'u_turn' || rawAction === 'uturn') {
        piAction = 'u_turn';
        degrees = 180;
      } else if (rawAction === 'arrive' || rawAction === 'arrived') {
        piAction = 'arrive';
      } else if (rawAction === 'backward' || rawAction === 'back') {
        piAction = 'backward';
      } else {
        piAction = 'forward';
      }

      const legDist = m.legDistanceMeters || m.distanceMeters || 0;

      // For turns: first emit the turn command, then a forward for the leg distance
      if (['turn_left', 'turn_right', 'slight_left', 'slight_right', 'u_turn'].includes(piAction)) {
        // Turn step (no distance)
        steps.push({
          seq: steps.length + 1,
          action: piAction,
          distance: 0,
          degrees: degrees,
          instruction: m.instruction || piAction
        });
        // Then drive the corridor distance (if any)
        if (legDist > 0.05) {
          steps.push({
            seq: steps.length + 1,
            action: 'forward',
            distance: parseFloat(legDist.toFixed(2)),
            instruction: `Walk forward ${legDist.toFixed(1)}m`
          });
        }
      } else if (piAction === 'arrive') {
        steps.push({
          seq: steps.length + 1,
          action: 'arrive',
          distance: 0,
          instruction: `Arrived at ${destName || 'destination'}`
        });
      } else {
        // Forward / backward with distance
        if (legDist > 0.05) {
          steps.push({
            seq: steps.length + 1,
            action: piAction,
            distance: parseFloat(legDist.toFixed(2)),
            instruction: m.instruction || `${piAction} ${legDist.toFixed(1)}m`
          });
        }
      }
    }
    return steps;
  }, []);

  // Send arrival notification to Raspberry Pi to halt robot motors
  const sendArrivalToPi = useCallback((destinationLabel) => {
    if (!isLivePiSyncRef.current) return;
    const piIp = localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
    const piPort = localStorage.getItem('navbot_pi_port') || '5000';
    const protocol = localStorage.getItem('navbot_pi_protocol') || 'http';

    const payload = {
      command: `arrived at ${destinationLabel || 'destination'}`,
      direction: 'arrive',
      meters: 0.0
    };

    fetch('/api/send-to-pi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pi_ip: piIp,
        pi_port: piPort,
        protocol,
        transcript: payload
      })
    }).catch(() => {});
  }, []);

  // ── Send one Pi step and start monitoring ──
  const sendOnePiStep = useCallback(async (stepObj) => {
    const piIp = localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
    const piPort = localStorage.getItem('navbot_pi_port') || '5000';
    const protocol = localStorage.getItem('navbot_pi_protocol') || 'http';

    const payload = {
      direction: stepObj.action,
      meters: stepObj.distance || 0,
      command: stepObj.instruction || stepObj.action,
      current_step_number: stepObj.seq,
    };
    if (stepObj.degrees != null) {
      payload.degrees = stepObj.degrees;
    }

    console.log(`[NAV] Sending step ${stepObj.seq}: ${stepObj.action} ${stepObj.distance || ''}m`, stepObj);

    try {
      const res = await fetch('/api/send-to-pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pi_ip: piIp, pi_port: piPort, protocol, transcript: payload })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 || (data && (data.error === 'Already driving' || (data.message && data.message.includes('Already driving'))))) {
        console.warn('[NAV] Pi is still driving (409 Conflict). Will wait for current step to finish.');
        return 'busy';
      }
      if (data && (data.status === 'started' || data.status === 'arrived' || data.status === 'stopped' || data.success)) {
        return 'ok';
      }
      console.warn('[NAV] Pi rejected step:', data);
      return 'failed';
    } catch (err) {
      console.error('[NAV] Pi send error:', err);
      return 'failed';
    }
  }, []);

  // Poll the Raspberry Pi's /status once. Handles:
  // 1. Fault detection (always)
  // 2. Step-by-step orchestration: verify robot movement via encoder,
  //    detect step completion, then dispatch the next command.
  const pollPiStatusOnce = useCallback(async () => {
    if (!isLivePiSyncRef.current) return;
    const piIp = localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
    const piPort = localStorage.getItem('navbot_pi_port') || '5000';
    const protocol = localStorage.getItem('navbot_pi_protocol') || 'http';

    try {
      const res = await fetch(
        `/api/pi-status?pi_ip=${encodeURIComponent(piIp)}&pi_port=${encodeURIComponent(piPort)}&protocol=${encodeURIComponent(protocol)}`
      );
      const data = await res.json().catch(() => null);
      if (!data || data.error) return;

      setPiFeedback(data);

      // ── Update Dashboard Map Position live from Hardware Encoder Data ──
      const encoderDist = data.distance_travelled_m || data.distance_walked_m || 0;
      if (encoderDist > 0 && isNavigatingRef.current) {
        const route = activeRouteRef.current;
        const ppm = activeMapRef.current?.pixelsPerMeter || PIXELS_PER_METER;
        if (route && route.length >= 2 && resetPositionRef.current) {
          const projectedPos = getPositionAtDistance(route, encoderDist, ppm);
          if (projectedPos) {
            resetPositionRef.current(projectedPos.x, projectedPos.y);
          }
        }
      }

      // ── Fault handling ──
      if (data.fault_active && data.last_error && data.last_error !== lastSeenFaultRef.current) {
        lastSeenFaultRef.current = data.last_error;
        setPiFault({ message: data.last_error, at: data.last_fault_at });
        speakGuidance(`Robot reported a problem. ${data.last_error}`, isVoiceMutedRef.current);
        handleStopNavigationRef.current && handleStopNavigationRef.current();
      } else if (!data.fault_active) {
        lastSeenFaultRef.current = null;
      }

      // ── Step-by-step orchestration ──
      if (!piStepByStepRef.current || !isNavigatingRef.current) return;

      const queue = piStepQueueRef.current;
      const idx = piCurrentIdxRef.current;
      const phase = piStepPhaseRef.current;
      const isDriving = data.driving || data.is_driving || false;
      const piState = data.state || 'IDLE';
      // encoderDist is already extracted above
      const stepTravelled = data.step_travelled_m || 0;
      const stepTarget = data.step_target_m || 0;
      const currentAction = data.current_action || '';

      if (idx >= queue.length) return; // all done

      const currentStep = queue[idx];

      // Phase: 'sent' — we sent the command, waiting for robot to start moving
      if (phase === 'sent') {
        if (isDriving) {
          // Robot started moving! Encoder is counting.
          piStepPhaseRef.current = 'moving';
          piMovingConfirmedRef.current = true;
          sentIdleCountRef.current = 0;
          console.log(`[NAV] ✓ Step ${currentStep.seq} moving (encoder active)`);

          setPiSyncToast({
            stepNumber: idx + 1,
            totalSteps: queue.length,
            action: currentAction || currentStep.action,
            instruction: `Robot moving: ${currentStep.instruction}`,
            distance: stepTarget || currentStep.distance,
            remainingM: 0,
            isForward: true
          });
        } else {
          sentIdleCountRef.current = (sentIdleCountRef.current || 0) + 1;
          const timeSinceSent = Date.now() - (stepSentTimestampRef.current || 0);
          // Transition to done ONLY if we confirmed it was moving and now stopped, OR >1.5s passed while idle
          if (piMovingConfirmedRef.current || timeSinceSent > 1500) {
            console.log(`[NAV] ✓ Step ${currentStep.seq} completed (state: ${piState}, timeSinceSent: ${timeSinceSent}ms)`);
            piStepPhaseRef.current = 'done';
          }
        }
        return;
      }

      // Phase: 'moving' — robot is executing, monitor encoder
      if (phase === 'moving') {
        // Update toast with live encoder progress
        setPiSyncToast({
          stepNumber: idx + 1,
          totalSteps: queue.length,
          action: currentAction || currentStep.action,
          instruction: stepTarget > 0
            ? `Encoder: ${stepTravelled.toFixed(2)}m / ${stepTarget.toFixed(2)}m`
            : `Robot: ${currentStep.instruction}`,
          distance: stepTarget || currentStep.distance,
          remainingM: 0,
          isForward: true
        });

        if (!isDriving) {
          // Robot stopped — step is complete
          piStepPhaseRef.current = 'done';
          console.log(`[NAV] ✓ Step ${currentStep.seq} completed (encoder: ${stepTravelled.toFixed(3)}m, target: ${stepTarget.toFixed(3)}m)`);
        }
        return;
      }

      // Phase: 'done' — step confirmed complete, send next
      if (phase === 'done') {
        // If robot is still physically driving, don't dispatch next step yet
        if (isDriving) return;

        const nextIdx = idx + 1;

        // Advance the turn-by-turn UI
        const turns = turnInstructionsRef.current;
        if (turns && turns.length > 0) {
          const approxManeuverIdx = Math.min(
            Math.floor(nextIdx * turns.length / Math.max(1, queue.length)),
            turns.length - 1
          );
          if (approxManeuverIdx > currentStepIndexRef.current) {
            setCurrentStepIndex(approxManeuverIdx);
          }
        }

        // Check if route is complete
        if (nextIdx >= queue.length) {
          const destName = destObjRef.current?.name || 'destination';
          console.log(`[NAV] ★ All ${queue.length} steps complete! Encoder total: ${encoderDist.toFixed(2)}m`);
          speakGuidance(
            `Robot has arrived at ${destName}. Encoder distance: ${encoderDist.toFixed(1)} meters.`,
            isVoiceMutedRef.current
          );

          setPiStepByStep(false);
          piStepByStepRef.current = false;
          piStepPhaseRef.current = 'idle';

          setPiSyncToast({
            stepNumber: queue.length,
            totalSteps: queue.length,
            action: 'arrived',
            instruction: `✅ Arrived! Encoder: ${encoderDist.toFixed(2)}m total`,
            distance: encoderDist,
            remainingM: 0,
            isForward: true
          });

          setArrivedDestName(destName);
          setIsArrivalOpen(true);
          // Don't call handleStopNavigation — arrival modal handles it
          return;
        }

        // Send the NEXT step
        piCurrentIdxRef.current = nextIdx;
        piStepPhaseRef.current = 'sent';
        piMovingConfirmedRef.current = false;
        sentIdleCountRef.current = 0;
        stepSentTimestampRef.current = Date.now();
        piEncoderStartRef.current = encoderDist;

        const nextStep = queue[nextIdx];
        setPiSyncToast({
          stepNumber: nextIdx + 1,
          totalSteps: queue.length,
          action: 'sending',
          instruction: `Sending: ${nextStep.instruction}`,
          distance: nextStep.distance || 0,
          remainingM: 0,
          isForward: true
        });

        const resStatus = await sendOnePiStep(nextStep);
        if (resStatus === 'busy') {
          // Pi is still driving — revert index and keep waiting
          piCurrentIdxRef.current = idx;
          piStepPhaseRef.current = 'moving';
          return;
        }
        if (resStatus !== 'ok') {
          speakGuidance('Robot rejected the command. Navigation stopped.', isVoiceMutedRef.current);
          handleStopNavigationRef.current && handleStopNavigationRef.current();
        }
      }
    } catch {
      // Pi unreachable mid-navigation - don't spam the UI, just skip this tick.
    }
  }, [sendOnePiStep]);

  // Acknowledge a reported fault: tells the Pi to clear it, then dismisses
  // the banner here so the person can try starting navigation again.
  const handleAcknowledgePiFault = useCallback(() => {
    const piIp = localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
    const piPort = localStorage.getItem('navbot_pi_port') || '5000';
    const protocol = localStorage.getItem('navbot_pi_protocol') || 'http';

    fetch('/api/send-to-pi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pi_ip: piIp,
        pi_port: piPort,
        protocol,
        pi_path: '/clear_fault',
        transcript: {}
      })
    }).catch(() => {});

    lastSeenFaultRef.current = null;
    setPiFault(null);
  }, []);

  // Continuous real-time step telemetry dispatch: fires on every single physical footstep.
  // When piRouteDispatched is true, the robot is already executing the full route
  // autonomously — we skip sending per-footstep commands and just update the local UI.
  const handleStepDetected = useCallback((stepInfo) => {
    stepSeqRef.current += 1;
    const currentSeq = stepSeqRef.current;

    // If step-by-step dispatch is active, the software is orchestrating
    // commands — do NOT send per-footstep commands on top of that.
    if (piStepByStepRef.current) {
      return;
    }

    // Only dispatch if user has Live Pi Sync enabled
    if (!isLivePiSyncRef.current) return;

    const turns = turnInstructionsRef.current;
    const isNav = isNavigatingRef.current;
    const map = activeMapRef.current;
    const ppm = map?.pixelsPerMeter || PIXELS_PER_METER;
    const currentPos = stepInfo.newPos || { x: 0, y: 0 };
    const destName = destObjRef.current?.name || 'Destination';

    if (isNav && turns && turns.length > 0) {
      const progress = computeLiveManeuverProgress(
        currentPos,
        turns,
        currentStepIndexRef.current,
        ppm
      );

      const matchedIdx = progress.matchedManeuverIndex !== undefined
        ? progress.matchedManeuverIndex
        : currentStepIndexRef.current;

      const currentStep = turns[matchedIdx] || turns[0];
      const remainingTotal = progress.totalRemainingMeters || 0;
      const remainingLeg = progress.distanceToTurnMeters || 0;

      // Determine the exact physical action for the robot on THIS footstep:
      const rawManeuverAct = (currentStep.action || currentStep.type || 'forward').toLowerCase();
      const isTurnManeuver = rawManeuverAct.includes('turn') || rawManeuverAct.includes('left') || rawManeuverAct.includes('right') || rawManeuverAct.includes('u_turn');

      let act = 'forward';
      let stepInstruction = `${currentStep.instruction || 'Walk forward'} (${Math.max(0, remainingLeg).toFixed(1)}m in leg)`;

      if (progress.isArrival) {
        act = 'arrive';
        stepInstruction = `Arrived at ${destName}`;
      } else if (!stepInfo.isForward) {
        act = 'backward';
        stepInstruction = `Step backward (${Math.max(0, remainingLeg).toFixed(1)}m in leg)`;
      } else if (isTurnManeuver && lastTurnManeuverIdxRef.current !== matchedIdx) {
        // Execute the 90° turn ONCE when first entering this maneuver leg at the turn point
        lastTurnManeuverIdxRef.current = matchedIdx;
        if (rawManeuverAct.includes('u_turn') || rawManeuverAct.includes('uturn')) act = 'u_turn';
        else if (rawManeuverAct.includes('slight_left')) act = 'slight_left';
        else if (rawManeuverAct.includes('slight_right')) act = 'slight_right';
        else if (rawManeuverAct.includes('left')) act = 'turn_left';
        else if (rawManeuverAct.includes('right')) act = 'turn_right';
        else act = 'forward';
        stepInstruction = currentStep.instruction || act;
      } else {
        // All subsequent physical footsteps along this corridor/stairs are forward steps
        act = 'forward';
        stepInstruction = `${currentStep.instruction || 'Continue straight'} (${Math.max(0, remainingLeg).toFixed(1)}m in leg)`;
      }

      const legDist = typeof stepInfo.stepLengthMeters === 'number' ? stepInfo.stepLengthMeters : 0.70;
      const heading = typeof stepInfo.headingDeg === 'number' ? stepInfo.headingDeg : 0.0;
      const metersVal = parseFloat(legDist.toFixed(1));

      let cmdLine = `walk straight for ${metersVal}m`;
      if (act === 'turn_left') cmdLine = `turn left after ${metersVal}m`;
      else if (act === 'turn_right') cmdLine = `turn right after ${metersVal}m`;
      else if (act === 'slight_left') cmdLine = `slight left after ${metersVal}m`;
      else if (act === 'slight_right') cmdLine = `slight right after ${metersVal}m`;
      else if (act === 'u_turn') cmdLine = `make a U-turn after ${metersVal}m`;
      else if (act === 'backward') cmdLine = `step backward for ${metersVal}m`;
      else if (act === 'arrive') cmdLine = `arrived at ${destName}`;
      else if (act === 'stop') cmdLine = 'stop';

      // Send ONLY the concise one-line command as requested
      const payload = {
        command: cmdLine,
        direction: act,
        meters: parseFloat(legDist.toFixed(2))
      };

      setPiSyncToast({
        stepNumber: currentSeq,
        totalSteps: turns.length,
        action: act,
        instruction: stepInstruction,
        distance: legDist,
        remainingM: remainingTotal,
        isForward: stepInfo.isForward
      });

      setTimeout(() => {
        setPiSyncToast((prev) => (prev?.stepNumber === currentSeq ? null : prev));
      }, 3000);

      const piIp = localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
      const piPort = localStorage.getItem('navbot_pi_port') || '5000';
      const protocol = localStorage.getItem('navbot_pi_protocol') || 'http';

      if (abortPiDispatchRef.current) {
        abortPiDispatchRef.current.abort();
      }
      const ctrl = new AbortController();
      abortPiDispatchRef.current = ctrl;

      fetch('/api/send-to-pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pi_ip: piIp,
          pi_port: piPort,
          protocol,
          transcript: payload
        }),
        signal: ctrl.signal
      }).catch((err) => {
        if (err.name !== 'AbortError') {
          console.debug('Pi step dispatch notice:', err.message);
        }
      });
    }
  }, []);

  // Sensor Hook - with activeMap, activeRoute, and real-time onStepDetected callback
  const initialMapNode = activeMap?.nodes?.[0] || { x: 175, y: 505 };
  const {
    sensorState,
    startTracking,
    stopTracking,
    resetPosition,
    updateCalibration,
    calibrateHeadingToTarget,
    zeroHeading,
    directionMode,
    setDirectionMode,
    simulateStep,
    stepForward,
    stepBackward,
    stepStop,
    deviateOffRoute
  } = useSensors({
    initialPos: { x: initialMapNode.x, y: initialMapNode.y },
    activeRoute: isNavigating ? activeRoute : null,
    activeMap,
    onStepDetected: handleStepDetected
  });

  resetPositionRef.current = resetPosition;

  // Compute A* Path using Active 3D Map topology graph
  const computeRoute = useCallback((startPos, targetDestId) => {
    const target = (activeMap?.destinations || DESTINATIONS).find((d) => d.id === targetDestId);
    if (!target) return null;

    const graphData = {
      nodes: activeMap?.nodes || GRAPH_NODES,
      nodesById: activeMap?.nodes ? createNodesById(activeMap.nodes) : defaultNodesById,
      adjacency: activeMap?.edges ? createAdjacency(activeMap.nodes, activeMap.edges) : defaultAdjacency,
      pixelsPerMeter: activeMap?.pixelsPerMeter || PIXELS_PER_METER
    };

    // Helper to find nearest node in active map graph
    const findNearest = (px, py) => {
      let best = graphData.nodes[0];
      let bestD = Infinity;
      for (const n of graphData.nodes) {
        const d = Math.hypot(n.x - px, n.y - py);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    const startNode = findNearest(startPos.x, startPos.y);
    const endNode = graphData.nodes.find((n) => n.id === target.nodeId || n.id === target.id) || findNearest(target.x, target.y);

    const path = findAStarPath(startNode.id, endNode.id, graphData);
    if (path && path.length > 0) {
      const rawPath = [
        { x: startPos.x, y: startPos.y, name: 'Current Location' },
        ...path,
        { x: target.x, y: target.y, name: target.name }
      ];

      // Deduplicate consecutive points that are within 8px
      const fullPath = [];
      for (const pt of rawPath) {
        if (fullPath.length === 0) {
          fullPath.push(pt);
        } else {
          const last = fullPath[fullPath.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) > 8) {
            fullPath.push(pt);
          }
        }
      }

      const turns = generateTurnByTurnDirections(fullPath, graphData.pixelsPerMeter);
      return { path: fullPath, turns };
    }
    return null;
  }, [activeMap]);

  // Handle Switch Map
  const handleSelectMap = (newMapId) => {
    setActiveMapId(newMapId);
    localStorage.setItem('navbot_active_map_id', newMapId);
    const newMap = getMapById(newMapId);

    handleStopNavigation();

    // Preserve corresponding destination if switching between 3-floor building and inside office
    let newDest = newMap.defaultDest || newMap.destinations?.[0]?.id || 'sf_office_ceo';
    if (newMapId === 'office_blueprint_3d') {
      if (selectedDest === 'sf_office_ceo') newDest = 'ceo_cabin';
      else if (selectedDest === 'sf_office_hr') newDest = 'hr_cabin';
      else if (selectedDest === 'sf_robomantha_door' || selectedDest === 'sf_office_reception') newDest = 'main_entrance';
    } else if (newMapId === 'robomantha_3d_building') {
      if (selectedDest === 'ceo_cabin') newDest = 'sf_office_ceo';
      else if (selectedDest === 'hr_cabin') newDest = 'sf_office_hr';
      else if (selectedDest === 'main_entrance') newDest = 'sf_robomantha_door';
    }

    setSelectedStart(newMap.defaultStart || newMap.nodes?.[0]?.id || 'main_entrance');
    setSelectedDest(newDest);

    const firstNode = newMap.nodes?.find((n) => n.id === newMap.defaultStart) || newMap.nodes?.[0] || { x: 175, y: 505 };
    resetPosition(firstNode.x, firstNode.y);
  };

  // Handle Start Navigation
  // When Pi sync is enabled, this immediately dispatches the FULL route to the Pi
  // so the robot starts moving right away using encoder feedback — no waiting for
  // individual phone footsteps. The phone polls /status to track progress.
  const handleStartNavigation = () => {
    let startPos = sensorState.userPos;

    if (selectedStart && selectedStart !== 'current_location') {
      const mapNodes = activeMap?.nodes || GRAPH_NODES;
      const startNode = mapNodes.find((n) => n.id === selectedStart || n.id === parseInt(selectedStart, 10)) || mapNodes[0];
      if (startNode) {
        resetPosition(startNode.x, startNode.y);
        startPos = { x: startNode.x, y: startNode.y };
      }
    }

    const routeResult = computeRoute(startPos, selectedDest);
    if (routeResult) {
      setActiveRoute(routeResult.path);
      setTurnInstructions(routeResult.turns);
      setCurrentStepIndex(0);
      stepSeqRef.current = 0;
      lastSentStepRef.current = -1;
      lastTurnManeuverIdxRef.current = -1;
      spokenEventsRef.current.clear();
      setIsArrivalOpen(false);
      setIsNavigating(true);
      startTracking();

      // Auto-align compass/gyro heading with first route corridor (Google Maps style)
      if (routeResult.path && routeResult.path.length >= 2) {
        const p0 = routeResult.path[0];
        const p1 = routeResult.path[1];
        const segBearing = (Math.atan2(p1.x - p0.x, -(p1.y - p0.y)) * (180 / Math.PI) + 360) % 360;
        calibrateHeadingToTarget(segBearing);
      }

      const initialManeuver = routeResult.turns[0];
      if (initialManeuver) {
        speakGuidance(`Starting navigation to ${destObj?.name || 'destination'}. ${initialManeuver.instruction}`, isVoiceMuted);
      }

      // ── STEP-BY-STEP ROBOT DISPATCH ──
      // Software sends one command at a time to the Pi. After each command,
      // we poll /status to verify the robot is moving (encoder data), wait
      // for it to finish (driving → false), confirm encoder distance, then
      // immediately send the next command. This loops until the goal.
      if (isLivePiSync) {
        const destName = destObj?.name || 'destination';
        const piSteps = buildPiRouteSteps(routeResult.turns, destName);

        if (piSteps.length > 0) {
          console.log(`[NAV] Starting step-by-step dispatch: ${piSteps.length} steps`, piSteps);

          // Store the full queue and kick off step 0
          piStepQueueRef.current = piSteps;
          piCurrentIdxRef.current = 0;
          piStepPhaseRef.current = 'sent';
          piMovingConfirmedRef.current = false;
          sentIdleCountRef.current = 0;
          stepSentTimestampRef.current = Date.now();
          piEncoderStartRef.current = 0;

          setPiStepByStep(true);
          piStepByStepRef.current = true;

          setPiSyncToast({
            stepNumber: 1,
            totalSteps: piSteps.length,
            action: 'sending',
            instruction: `Sending: ${piSteps[0].instruction}`,
            distance: piSteps[0].distance || 0,
            remainingM: 0,
            isForward: true
          });

          // Send the first step — the poll loop handles the rest
          sendOnePiStep(piSteps[0]).then((ok) => {
            if (ok) {
              speakGuidance(`Commanding robot step 1 of ${piSteps.length}. ${piSteps[0].instruction}`, isVoiceMuted);
            } else {
              speakGuidance('Could not send command to robot.', isVoiceMuted);
              setPiStepByStep(false);
              piStepByStepRef.current = false;
              piStepPhaseRef.current = 'idle';
              setPiSyncToast(null);
            }
          });
        }
      }
    }
  };

  // Launch a custom route generated from measurements
  const handleApplyMeasurementRoute = (routeResult) => {
    if (!routeResult || !routeResult.path || routeResult.path.length < 2) return;
    setActiveRoute(routeResult.path);
    setTurnInstructions(routeResult.turns);
    setCurrentStepIndex(0);
    stepSeqRef.current = 0;
    lastSentStepRef.current = -1;
    lastTurnManeuverIdxRef.current = -1;
    spokenEventsRef.current.clear();
    setIsArrivalOpen(false);
    setIsNavigating(true);
    startTracking();

    const p0 = routeResult.path[0];
    const p1 = routeResult.path[1];
    const segBearing = (Math.atan2(p1.x - p0.x, -(p1.y - p0.y)) * (180 / Math.PI) + 360) % 360;
    calibrateHeadingToTarget(segBearing);

    const initialManeuver = routeResult.turns[0];
    if (initialManeuver) {
      speakGuidance(`Starting measured route. ${initialManeuver.instruction}`, isVoiceMuted);
    }

    if (isLivePiSync) {
      const destName = routeResult.destinationCoord?.name || 'Measured Destination';
      const piSteps = buildPiRouteSteps(routeResult.turns, destName);
      if (piSteps.length > 0) {
        piStepQueueRef.current = piSteps;
        piCurrentIdxRef.current = 0;
        piStepPhaseRef.current = 'sent';
        piMovingConfirmedRef.current = false;
        sentIdleCountRef.current = 0;
        stepSentTimestampRef.current = Date.now();
        piEncoderStartRef.current = 0;
        setPiStepByStep(true);
        piStepByStepRef.current = true;
        setPiSyncToast({
          stepNumber: 1,
          totalSteps: piSteps.length,
          action: 'sending',
          instruction: `Sending: ${piSteps[0].instruction}`,
          distance: piSteps[0].distance || 0,
          remainingM: 0,
          isForward: true
        });
        sendOnePiStep(piSteps[0]);
      }
    }
  };

  // Instant 1-tap Gyro & Compass Alignment with current corridor segment
  const handleAlignGyro = () => {
    if (!activeRoute || activeRoute.length < 2) return;
    const cur = sensorState.userPos;
    let bestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < activeRoute.length - 1; i++) {
      const a = activeRoute[i];
      const b = activeRoute[i + 1];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const d = Math.hypot(midX - cur.x, midY - cur.y);
      if (d < minDist) {
        minDist = d;
        bestIdx = i;
      }
    }

    const pA = activeRoute[bestIdx];
    const pB = activeRoute[bestIdx + 1];
    const segBearing = (Math.atan2(pB.x - pA.x, -(pB.y - pA.y)) * (180 / Math.PI) + 360) % 360;
    calibrateHeadingToTarget(segBearing);
    speakGuidance('Gyroscope aligned with corridor', isVoiceMuted);
  };

  // Handle direct map tap to calibrate position or set destination (Google Maps style)
  const handleMapTap = (coord) => {
    resetPosition(coord.x, coord.y);
    if (isNavigating) {
      speakGuidance('Location relocated on map', isVoiceMuted);
      const reRoute = computeRoute(coord, selectedDest);
      if (reRoute) {
        setActiveRoute(reRoute.path);
        setTurnInstructions(reRoute.turns);
        setCurrentStepIndex(0);
        spokenEventsRef.current.clear();
      }
    } else {
      speakGuidance('Position set on map', isVoiceMuted);
    }
  };

  // Handle "Locate Me" button click
  const handleLocateMe = () => {
    startTracking();
    const cur = sensorState.userPos;
    const mapNodes = activeMap?.nodes || GRAPH_NODES;
    let best = mapNodes[0];
    let bestD = Infinity;
    for (const n of mapNodes) {
      const d = Math.hypot(n.x - cur.x, n.y - cur.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    speakGuidance(`Location centered near ${best.label || 'indoor corridor'}`, isVoiceMuted);
  };

  // Handle Stop Navigation
  const handleStopNavigation = () => {
    setIsNavigating(false);
    setActiveRoute(null);
    setTurnInstructions([]);
    setCurrentStepIndex(0);
    stepSeqRef.current = 0;
    lastSentStepRef.current = -1;
    lastTurnManeuverIdxRef.current = -1;
    if (abortPiDispatchRef.current) {
      abortPiDispatchRef.current.abort();
    }
    // Reset step-by-step dispatch state
    setPiStepByStep(false);
    piStepByStepRef.current = false;
    piStepPhaseRef.current = 'idle';
    piStepQueueRef.current = [];
    piCurrentIdxRef.current = 0;
    setPiSyncToast(null);
    stopAutoWalk();
    stopSpeaking();

    // Send instant STOP command to Raspberry Pi
    const piIp = localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
    const piPort = localStorage.getItem('navbot_pi_port') || '5000';
    const protocol = localStorage.getItem('navbot_pi_protocol') || 'http';
    fetch('/api/send-to-pi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pi_ip: piIp,
        pi_port: piPort,
        protocol,
        transcript: {
          command: 'stop',
          direction: 'stop',
          meters: 0.0
        }
      })
    }).catch(() => {});
  };
  handleStopNavigationRef.current = handleStopNavigation;

  // Handle Reset to Start
  const handleResetNavigation = () => {
    handleStopNavigation();
    const mapNodes = activeMap?.nodes || GRAPH_NODES;
    if (selectedStart && selectedStart !== 'current_location') {
      const startNode = mapNodes.find((n) => n.id === selectedStart || n.id === parseInt(selectedStart, 10)) || mapNodes[0];
      resetPosition(startNode.x, startNode.y);
    } else {
      resetPosition(mapNodes[0].x, mapNodes[0].y);
    }
  };

  // Toggle Auto-walk Simulation
  const toggleAutoWalk = () => {
    if (isAutoWalking) {
      stopAutoWalk();
    } else {
      startAutoWalk();
    }
  };

  const startAutoWalk = () => {
    if (!activeRoute || activeRoute.length < 2) {
      handleStartNavigation();
    }
    setIsAutoWalking(true);
  };

  const stopAutoWalk = () => {
    setIsAutoWalking(false);
    if (autoWalkIntervalRef.current) {
      clearInterval(autoWalkIntervalRef.current);
      autoWalkIntervalRef.current = null;
    }
  };

  // Auto-walk step progression loop
  useEffect(() => {
    if (!isAutoWalking || !activeRoute || activeRoute.length === 0) {
      if (autoWalkIntervalRef.current) clearInterval(autoWalkIntervalRef.current);
      return;
    }

    let currentWaypointIdx = 1;
    const stepInterval = setInterval(() => {
      if (currentWaypointIdx >= activeRoute.length) {
        stopAutoWalk();
        return;
      }

      const targetPt = activeRoute[currentWaypointIdx];
      const currentPos = sensorState.userPos;
      const dx = targetPt.x - currentPos.x;
      const dy = targetPt.y - currentPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const stepPixels = 18; // ~0.7m per step in map scale
      if (dist <= stepPixels) {
        resetPosition(targetPt.x, targetPt.y);
        currentWaypointIdx += 1;
      } else {
        const nx = currentPos.x + (dx / dist) * stepPixels;
        const ny = currentPos.y + (dy / dist) * stepPixels;
        simulateStep(nx, ny);
      }
    }, 750);

    autoWalkIntervalRef.current = stepInterval;
    return () => clearInterval(stepInterval);
  }, [isAutoWalking, activeRoute, sensorState.userPos, resetPosition, simulateStep]);

  // Track position against turn instructions & arrival detection
  useEffect(() => {
    if (!isNavigating || !activeRoute || activeRoute.length === 0) return;

    const currentPos = sensorState.userPos || { x: 0, y: 0 };
    const dest = (activeMap?.destinations || DESTINATIONS).find((d) => d.id === selectedDest);

    // 1. Calculate live progress safely
    const progress = computeLiveManeuverProgress(
      currentPos,
      turnInstructions,
      currentStepIndex,
      activeMap?.pixelsPerMeter || PIXELS_PER_METER
    );

    // 2. Check Arrival
    if (dest) {
      const distToDest = calculateDistance(currentPos, { x: dest.x, y: dest.y });
      if (distToDest <= 28 || progress.isArrival) {
        setArrivedDestName(dest.name);
        setIsArrivalOpen(true);
        sendArrivalToPi(dest.name);
        handleStopNavigation();   // stops navigation (and cancels any speech), so speak afterwards
        speakGuidance(`Destination reached. You have arrived at ${dest.name}.`, isVoiceMuted);
        return;
      }
    }

    // 3. Bidirectional Turn Progress & Advance Warnings (supports forward & backward movement)
    if (progress.matchedManeuverIndex !== undefined && progress.matchedManeuverIndex !== currentStepIndex) {
      if (progress.matchedManeuverIndex < currentStepIndex) {
        // User backtracked past a junction: clear spoken flags for downstream turns so they repeat on return
        for (let idx = progress.matchedManeuverIndex; idx <= currentStepIndex; idx++) {
          spokenEventsRef.current.delete(`adv_${idx}`);
          spokenEventsRef.current.delete(`at_${idx}`);
        }
      }
      setCurrentStepIndex(progress.matchedManeuverIndex);
    }

    const activeIdx = progress.matchedManeuverIndex !== undefined ? progress.matchedManeuverIndex : currentStepIndex;
    if (turnInstructions && turnInstructions.length > 0 && activeIdx < turnInstructions.length) {
      const currentStep = turnInstructions[activeIdx];
      const advanceKey = `adv_${activeIdx}`;
      const atTurnKey = `at_${activeIdx}`;

      // Advance warning at 3m - 4.5m before junction (only when progressing forward)
      if (progress.isNearTurn && !spokenEventsRef.current.has(advanceKey) && sensorState.movementState !== 'backward') {
        spokenEventsRef.current.add(advanceKey);
        const mText = Math.max(2, Math.round(progress.distanceToTurnMeters));
        speakGuidance(`In ${mText} meters, ${currentStep.instruction}`, isVoiceMuted);
      }

      // At junction execution (<= 1.2m)
      if (progress.isAtTurn && !spokenEventsRef.current.has(atTurnKey) && sensorState.movementState !== 'backward') {
        spokenEventsRef.current.add(atTurnKey);
        if (currentStep.action !== 'arrive') {
          speakGuidance(`${currentStep.instruction} now`, isVoiceMuted);
        }
      }
    }

    // 4. Dynamic Off-Route Deviation Detection & Recalculation (debounced with 3.5s cooldown)
    const now = Date.now();
    const ppm = activeMap?.pixelsPerMeter || PIXELS_PER_METER;
    const thresholdMeters = sensorState.calibrationParams?.offRouteThresholdMeters || 3.0;
    const thresholdPx = thresholdMeters * ppm;

    if (now - lastRerouteTimeRef.current > 3500) {
      const isDeviated = checkOffRouteDeviation(currentPos, activeRoute, thresholdPx);
      if (isDeviated) {
        offRouteCountRef.current = (offRouteCountRef.current || 0) + 1;
        // Require 2 consecutive checks to avoid transient jitter
        if (offRouteCountRef.current >= 2) {
          lastRerouteTimeRef.current = now;
          offRouteCountRef.current = 0;
          console.warn(`[NAV] Off-route deviation > ${thresholdMeters}m! Recalculating route...`);
          const reRoute = computeRoute(currentPos, selectedDest);
          if (reRoute) {
            setActiveRoute(reRoute.path);
            setTurnInstructions(reRoute.turns);
            setCurrentStepIndex(0);
            spokenEventsRef.current.clear();
            speakGuidance('Off route. Recalculating route to destination.', isVoiceMuted);
          }
        }
      } else {
        offRouteCountRef.current = 0;
      }
    }
  }, [sensorState.userPos, isNavigating, activeRoute, turnInstructions, currentStepIndex, selectedDest, isVoiceMuted, computeRoute, activeMap, sendArrivalToPi]);

  // Poll the Raspberry Pi for feedback while a navigation session is active.
  // When step-by-step dispatch is running, poll fast (350ms) so each step
  // transition is detected quickly. Otherwise poll at 1200ms for faults only.
  useEffect(() => {
    if (isNavigating && isLivePiSync) {
      pollPiStatusOnce(); // immediate check, don't wait for the first tick
      const pollInterval = piStepByStep ? 350 : 1200;
      piStatusPollRef.current = setInterval(pollPiStatusOnce, pollInterval);
    } else {
      if (piStatusPollRef.current) {
        clearInterval(piStatusPollRef.current);
        piStatusPollRef.current = null;
      }
      lastSeenFaultRef.current = null;
    }
    return () => {
      if (piStatusPollRef.current) {
        clearInterval(piStatusPollRef.current);
        piStatusPollRef.current = null;
      }
    };
  }, [isNavigating, isLivePiSync, piStepByStep, pollPiStatusOnce]);



  // QR Checkpoint scanned handler
  const handleCheckpointScanned = (checkpoint) => {
    resetPosition(checkpoint.x, checkpoint.y);
    speakGuidance(`Position calibrated to ${checkpoint.name}`, isVoiceMuted);

    if (isNavigating && selectedDest) {
      const reRoute = computeRoute({ x: checkpoint.x, y: checkpoint.y }, selectedDest);
      if (reRoute) {
        setActiveRoute(reRoute.path);
        setTurnInstructions(reRoute.turns);
        setCurrentStepIndex(0);
      }
    }
  };

  const liveProgress = computeLiveManeuverProgress(
    sensorState.userPos,
    turnInstructions,
    currentStepIndex,
    activeMap?.pixelsPerMeter || PIXELS_PER_METER
  );

  return (
    <div className="gmaps-app-shell">
      {/* View Switcher Bar (hidden during active navigation) */}
      {!isNavigating && (
        <div className="portal-map-switcher">
          <button
            type="button"
            className={`switcher-btn ${currentView === 'portal' ? 'active' : ''}`}
            onClick={() => {
              handleStopNavigation();
              setCurrentView('portal');
            }}
          >
            📱 WhatsApp Portal
          </button>
          <button
            type="button"
            className={`switcher-btn ${currentView === 'map' ? 'active' : ''}`}
            onClick={() => setCurrentView('map')}
          >
            🌐 3D Indoor Map
          </button>
        </div>
      )}

      {/* Building Level / Interior Mode Switcher (hidden during active navigation) */}
      {currentView === 'map' && !isNavigating && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(15, 23, 42, 0.94)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 40
        }}>
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            View:
          </span>
          <button
            type="button"
            onClick={() => handleSelectMap('robomantha_3d_building')}
            style={{
              background: activeMapId === 'robomantha_3d_building' ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: activeMapId === 'robomantha_3d_building' ? '1.5px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: activeMapId === 'robomantha_3d_building' ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none'
            }}
          >
            <span>🏢</span> Full Building (3 Floors)
          </button>
          <button
            type="button"
            onClick={() => handleSelectMap('office_blueprint_3d')}
            style={{
              background: activeMapId === 'office_blueprint_3d' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: activeMapId === 'office_blueprint_3d' ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: activeMapId === 'office_blueprint_3d' ? '0 2px 8px rgba(99, 102, 241, 0.4)' : 'none'
            }}
          >
            <span>📍</span> Inside Office (2nd Floor)
          </button>
        </div>
      )}

      {currentView === 'portal' ? (
        /* WhatsApp Dispatch Portal */
        <main className="gmaps-main-viewport">
          <WhatsAppDispatchPortal
            activeMap={activeMap}
            allMaps={allMaps}
            onSelectMap={handleSelectMap}
            selectedDest={selectedDest}
            onSelectDest={setSelectedDest}
            selectedStart={selectedStart}
            onSelectStart={setSelectedStart}
            onLaunchNavigation={() => {
              setCurrentView('map');
              setTimeout(() => handleStartNavigation(), 200);
            }}
            onSwitchToMap={() => setCurrentView('map')}
            onOpenPi={() => setIsPiModalOpen(true)}
            onOpenUploadDiagram={() => setIsUploadDiagramOpen(true)}
          />
        </main>
      ) : (
        /* Fullscreen Interactive 3D & 2D Indoor Navigation Map */
        <>
          {/* Turn-by-Turn Instruction Banner */}
          {isNavigating && (
            <TurnByTurnBanner
              turnInstructions={turnInstructions}
              currentStepIndex={currentStepIndex}
              userPos={sensorState.userPos}
              isVoiceMuted={isVoiceMuted}
              onToggleVoice={() => setIsVoiceMuted((v) => !v)}
              destinationName={destObj?.name || 'Destination'}
            />
          )}

          {/* Map Viewport (3D & 2D with toggle) */}
          <main className="gmaps-main-viewport">
            <MapViewer
              activeMap={activeMap}
              currentCoord={sensorState.userPos}
              headingDeg={sensorState.heading}
              activeRoute={activeRoute}
              destinationId={selectedDest}
              destination={destinationCoord}
              selectedStart={selectedStart}
              onSelectStart={setSelectedStart}
              onSelectDest={(newDestId) => {
                setSelectedDest(newDestId);
                if (isNavigating) {
                  const reRoute = computeRoute(sensorState.userPos, newDestId);
                  if (reRoute) {
                    setActiveRoute(reRoute.path);
                    setTurnInstructions(reRoute.turns);
                    setCurrentStepIndex(0);
                  }
                }
              }}
              onMapTap={handleMapTap}
              onLocateMe={handleLocateMe}
              isNavigating={isNavigating}
            />
          </main>

          {/* Navigation Control HUD */}
          <NavigationHUD
            activeMap={activeMap}
            allMaps={allMaps}
            onSelectMap={handleSelectMap}
            onOpenAddMap={() => setIsAddMapOpen(true)}
            onOpenUploadDiagram={() => setIsUploadDiagramOpen(true)}
            destinations={activeMap?.destinations || DESTINATIONS}
            selectedDest={selectedDest}
            onSelectDest={setSelectedDest}
            selectedStart={selectedStart}
            onSelectStart={setSelectedStart}
            isNavigating={isNavigating}
            walkingSpeedMps={sensorState.speedMps}
            cadence={sensorState.cadence}
            remainingDistanceMeters={liveProgress.totalRemainingMeters}
            distanceWalkedMeters={sensorState.distanceWalkedMeters}
            motionMag={sensorState.accelMag}
            stepCount={sensorState.stepCount}
            movementState={sensorState.movementState}
            onStartNavigation={handleStartNavigation}
            onStopNavigation={handleStopNavigation}
            onResetNavigation={handleResetNavigation}
            isAutoWalking={isAutoWalking}
            onToggleAutoWalk={toggleAutoWalk}
            isTrackingSensors={sensorState.isTracking}
            onStartSensors={startTracking}
            onOpenCalibration={() => setIsCalibrationOpen(true)}
            onOpenMeasurementRoute={() => setIsMeasurementModalOpen(true)}
            onOpenQR={() => setIsQROpen(true)}
            onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
            onOpenPi={() => setIsPiModalOpen(true)}
            isLivePiSync={isLivePiSync}
            onToggleLivePiSync={() => setIsLivePiSync((v) => !v)}
            onAlignGyro={handleAlignGyro}
            directionMode={directionMode}
            onSetDirectionMode={setDirectionMode}
            onStepForward={stepForward}
            onStepBackward={stepBackward}
            onStepStop={stepStop}
            onDeviateOffRoute={deviateOffRoute}
            currentStepIndex={currentStepIndex}
            totalSteps={turnInstructions.length}
          />

          {/* Telemetry Drawer */}
          <TelemetryDrawer
            isOpen={isTelemetryOpen}
            onToggle={() => setIsTelemetryOpen((v) => !v)}
            sensorState={sensorState}
            onManualStep={() => simulateStep()}
            onStepForward={stepForward}
            onStepBackward={stepBackward}
            onStepStop={stepStop}
            onDeviateOffRoute={deviateOffRoute}
            onAlignGyro={handleAlignGyro}
          />
        </>
      )}

      {/* Add / Manage 3D Map Modal */}
      <AddMapModal
        isOpen={isAddMapOpen}
        onClose={() => setIsAddMapOpen(false)}
        onMapAdded={(newMapId) => {
          setAllMaps(getAllMaps());
          handleSelectMap(newMapId);
        }}
      />

      {/* Upload 3D Diagram Modal */}
      <UploadDiagramModal
        isOpen={isUploadDiagramOpen}
        onClose={() => setIsUploadDiagramOpen(false)}
        onMapCreated={(newMapId) => {
          setAllMaps(getAllMaps());
          handleSelectMap(newMapId);
        }}
      />

      {/* Sensor Calibration Modal */}
      <SensorCalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        calibrationParams={sensorState.calibrationParams}
        onUpdateCalibration={updateCalibration}
        liveAccel={sensorState.accelMag}
        liveHeading={sensorState.heading}
        worldAccel={sensorState.worldAccel}
        movementState={sensorState.movementState}
      />

      {/* QR Checkpoint Scanner Modal */}
      <QRScannerModal
        isOpen={isQROpen}
        onClose={() => setIsQROpen(false)}
        onCheckpointScanned={handleCheckpointScanned}
      />

      {/* Arrival Modal */}
      <ArrivalModal
        isOpen={isArrivalOpen}
        destinationName={arrivedDestName || destObj?.name || 'Destination'}
        stepCount={sensorState.stepCount}
        distanceMeters={sensorState.distanceWalkedMeters}
        onClose={() => setIsArrivalOpen(false)}
        onNewRoute={() => {
          setIsArrivalOpen(false);
          setSelectedDest('');
        }}
      />

      {/* Measurement Route Creator Modal */}
      <MeasurementRouteModal
        isOpen={isMeasurementModalOpen}
        onClose={() => setIsMeasurementModalOpen(false)}
        startPos={sensorState.userPos}
        currentHeading={sensorState.heading}
        activeMap={activeMap}
        onApplyRoute={handleApplyMeasurementRoute}
      />

      {/* WhatsApp Share Modal */}
      <WhatsAppShareModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        activeMap={activeMap}
        destinationName={destObj?.name || 'Destination'}
        selectedDest={selectedDest}
        selectedStart={selectedStart}
      />

      {/* Raspberry Pi Dispatch Modal */}
      <RaspberryPiModal
        isOpen={isPiModalOpen}
        onClose={() => setIsPiModalOpen(false)}
        destinationName={destObj?.name || 'Destination'}
        selectedDest={selectedDest}
        selectedStart={selectedStart}
        turnInstructions={turnInstructions}
        activeRoute={activeRoute}
        currentStepIndex={currentStepIndex}
        isLivePiSync={isLivePiSync}
        onToggleLivePiSync={() => setIsLivePiSync((v) => !v)}
      />

      {/* Robot Fault Feedback Banner - shown when the Raspberry Pi reports
          that something went wrong (stepper/motor fault, controller error,
          or a manually simulated test fault). */}
      {piFault && (
        <div className="pi-fault-banner" role="alert">
          <span className="pi-fault-icon">⚠️</span>
          <div className="pi-fault-content">
            <span className="pi-fault-title">Robot reported a problem</span>
            <span className="pi-fault-desc">{piFault.message}</span>
            {piFault.at && <span className="pi-fault-time">at {piFault.at}</span>}
          </div>
          <button
            type="button"
            className="pi-fault-dismiss-btn"
            onClick={handleAcknowledgePiFault}
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* Real-time Pi Step Sync Toast */}
      {piSyncToast && (
        <div className={`pi-step-toast${piStepByStep ? ' pi-toast-route-mode' : ''}`}>
          <span className="pi-toast-icon">{piStepByStep ? '🚀' : '🤖'}</span>
          <div className="pi-toast-content">
            <span className="pi-toast-title">
              {piStepByStep
                ? `Step ${piSyncToast.stepNumber} / ${piSyncToast.totalSteps}`
                : `Sent Step ${piSyncToast.stepNumber} of ${piSyncToast.totalSteps} to Robot`
              }
            </span>
            <span className="pi-toast-desc">
              {piSyncToast.instruction}{piSyncToast.distance > 0 ? ` (${piSyncToast.distance.toFixed(1)}m)` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
