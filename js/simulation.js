function createVanIcon() {
  return L.divIcon({
    className: "sim-van-marker",
    html: `<div class="sim-van-marker__body">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 17h1a2 2 0 0 0 4 0h8a2 2 0 0 0 4 0h1V9l-3-6H5L2 9v8h1z"/>
        <circle cx="6.5" cy="17" r="1.5"/><circle cx="17.5" cy="17" r="1.5"/>
      </svg>
    </div>
    <div class="sim-van-marker__pulse"></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function geometryToLatLngs(geometry) {
  return geometry.map(([lng, lat]) => [lat, lng]);
}

const SPEED_PRESETS = [
  { label: "0.5×", ms: 240 },
  { label: "1×",   ms: 120 },
  { label: "2×",   ms: 60 },
  { label: "3×",   ms: 40 },
  { label: "5×",   ms: 24 },
  { label: "10×",  ms: 12 },
];

export function createSimulationController({ map, onStatusChange, onSpeedChange, onProgressChange }) {
  let vanMarker = null;
  let trailLine = null;
  let flatPath = [];
  let checkpoints = [];
  let animFrameId = null;
  let lastStepTime = 0;
  let currentIndex = 0;
  let announcedCheckpointIds = new Set();
  let speedIndex = 1;
  let checkpointMarkers = [];

  function getIntervalMs() {
    return SPEED_PRESETS[speedIndex].ms;
  }

  function ensureMarker() {
    if (!flatPath.length) {
      return;
    }

    if (!vanMarker) {
      vanMarker = L.marker(flatPath[0], {
        icon: createVanIcon(),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      vanMarker.setLatLng(flatPath[0]);
    }
  }

  function ensureTrail() {
    if (trailLine) {
      return; // already exists — don't recreate, just reuse
    }
    trailLine = L.polyline([], {
      color: "hsl(151 55% 35%)",
      weight: 4,
      opacity: 0.6,
      dashArray: "8 6",
      className: "sim-trail-line",
    }).addTo(map);
  }

  function clearCheckpointMarkers() {
    checkpointMarkers.forEach((m) => map.removeLayer(m));
    checkpointMarkers = [];
  }

  function publishStatus(message) {
    onStatusChange?.(message);
  }

  function publishProgress() {
    const total = flatPath.length;
    const pct = total > 0 ? Math.round((currentIndex / (total - 1)) * 100) : 0;
    const checkpointsDone = checkpoints.filter((c) => announcedCheckpointIds.has(c.id)).length;
    onProgressChange?.({
      percent: pct,
      currentIndex,
      totalPoints: total,
      checkpointsDone,
      totalCheckpoints: checkpoints.length,
    });
  }

  function stopAnimation() {
    if (animFrameId) {
      window.cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function showCheckpoint(checkpoint) {
    if (announcedCheckpointIds.has(checkpoint.id)) {
      return;
    }

    announcedCheckpointIds.add(checkpoint.id);
    const isEnd = checkpoint.type === "end";
    const label = isEnd
      ? `🏁 ถึงปลายทางแล้ว! ${checkpoint.label}`
      : `📍 รับคนแล้ว: ${checkpoint.label}`;

    // No Leaflet popup — popups call map.openPopup() which fires DOM events
    // and causes layout thrash → dropped frames → van appears to jump.
    // Instead, flash a circle marker and update the sidebar status text only.
    const cpMarker = L.circleMarker(flatPath[checkpoint.pathIndex], {
      radius: 10,
      color: isEnd ? "hsl(4 76% 56%)" : "hsl(41 96% 55%)",
      fillColor: isEnd ? "hsl(4 76% 56%)" : "hsl(41 96% 55%)",
      fillOpacity: 0.9,
      weight: 2,
      className: "sim-checkpoint-ring",
    }).addTo(map);
    checkpointMarkers.push(cpMarker);

    publishStatus(label);
  }

  function stepForward() {
    if (!flatPath.length) {
      stopAnimation();
      return;
    }

    if (currentIndex >= flatPath.length - 1) {
      stopAnimation();
      publishStatus("✅ วิ่งครบแล้ว!");
      publishProgress();
      return;
    }

    currentIndex += 1;
    const pos = flatPath[currentIndex];
    vanMarker.setLatLng(pos);

    if (trailLine) {
      trailLine.addLatLng(pos);
    }

    checkpoints.forEach((checkpoint) => {
      if (checkpoint.pathIndex === currentIndex) {
        showCheckpoint(checkpoint);
      }
    });

    publishProgress();
  }

  function animationLoop(timestamp) {
    if (!animFrameId) return;

    const intervalMs = getIntervalMs();
    const elapsed = timestamp - lastStepTime;

    if (elapsed >= intervalMs) {
      // How many steps we fell behind (e.g. after a checkpoint frame drop).
      // Cap at 4 so we don't teleport across the map after a long pause.
      const steps = Math.min(Math.floor(elapsed / intervalMs), 4);
      for (let i = 0; i < steps; i += 1) {
        stepForward();
        if (currentIndex >= flatPath.length - 1) {
          return; // stopAnimation() already called inside stepForward
        }
      }
      lastStepTime = timestamp;
    }

    animFrameId = window.requestAnimationFrame(animationLoop);
  }

  function load(routeSegments) {
    stopAnimation();
    currentIndex = 0;
    announcedCheckpointIds = new Set();
    flatPath = [];
    checkpoints = [];
    clearCheckpointMarkers();

    if (trailLine) {
      map.removeLayer(trailLine);
      trailLine = null;
    }

    routeSegments.forEach((segment) => {
      const points = geometryToLatLngs(segment.geometry);
      if (points.length === 0) {
        return;
      }

      if (flatPath.length === 0) {
        flatPath.push(...points);
      } else {
        flatPath.push(...points.slice(1));
      }

      checkpoints.push({
        id: `${segment.fromId}->${segment.toId}`,
        pathIndex: flatPath.length - 1,
        type: segment.targetType,
        label: segment.targetLabel,
      });
    });

    if (vanMarker) {
      map.removeLayer(vanMarker);
      vanMarker = null;
    }

    if (flatPath.length > 0) {
      ensureMarker();
      publishStatus("พร้อมเริ่มได้เลย");
      publishProgress();
    } else {
      publishStatus("ไม่พบเส้นทางสำหรับจำลองรถวิ่ง");
    }
  }

  function start() {
    if (!flatPath.length) {
      publishStatus("กดหาเส้นทางก่อนจึงจะเริ่มได้");
      return;
    }

    if (!vanMarker) {
      ensureMarker();
    }

    ensureTrail();
    if (currentIndex > 0) {
      trailLine.setLatLngs(flatPath.slice(0, currentIndex + 1));
    }

    if (animFrameId) {
      return;
    }

    publishStatus("🚐 รถกำลังวิ่ง...");
    lastStepTime = performance.now();
    animFrameId = window.requestAnimationFrame(animationLoop);
  }

  function pause() {
    if (!animFrameId) {
      return;
    }

    stopAnimation();
    publishStatus("⏸ หยุดชั่วคราว");
  }

  function reset() {
    stopAnimation();
    currentIndex = 0;
    announcedCheckpointIds = new Set();
    clearCheckpointMarkers();

    if (trailLine) {
      trailLine.setLatLngs([]);
    }

    if (flatPath.length > 0) {
      ensureMarker();
      publishStatus("🔄 เริ่มใหม่แล้ว");
      publishProgress();
    } else {
      publishStatus("ยังไม่มีเส้นทางให้เริ่มใหม่");
    }
  }

  function clear() {
    stopAnimation();
    flatPath = [];
    checkpoints = [];
    currentIndex = 0;
    announcedCheckpointIds = new Set();
    clearCheckpointMarkers();

    if (trailLine) {
      map.removeLayer(trailLine);
      trailLine = null;
    }

    if (vanMarker) {
      map.removeLayer(vanMarker);
      vanMarker = null;
    }

    publishStatus("กดหาเส้นทางก่อน แล้วจะเปิดจำลองรถวิ่งได้");
  }

  function isReady() {
    return flatPath.length > 0;
  }

  function isRunning() {
    return animFrameId !== null;
  }

  function setSpeed(index) {
    speedIndex = Math.max(0, Math.min(index, SPEED_PRESETS.length - 1));
    onSpeedChange?.(SPEED_PRESETS[speedIndex]);
  }

  function getSpeed() {
    return { index: speedIndex, preset: SPEED_PRESETS[speedIndex] };
  }

  return {
    clear,
    getSpeed,
    isReady,
    isRunning,
    load,
    pause,
    reset,
    setSpeed,
    SPEED_PRESETS,
    start,
  };
}
