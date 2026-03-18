import { renderComplexity } from "./complexity.js";
import {
  createDestinationFromMap,
  findTerminalById,
  formatDestinationSummary,
  populateDestinationOptions,
  syncDestinationSelect,
} from "./destination.js";
import { SOUTHERN_BKS } from "./data/bks.js";
import { formatGeolocationError, requestCurrentPosition } from "./gps.js";
import { computeGreedyRoute } from "./greedy.js";
import { getSegmentPaletteEntry } from "./map-colors.js";
import {
  buildDurationGraph,
  collectPrefetchedRouteSegments,
  hydrateTableData,
  resolveNearestPoint,
} from "./osrm.js";
import { createPickupManager } from "./pickup.js";
import { createSimulationController } from "./simulation.js";

const DEFAULT_CENTER = [8.3, 99.45];
const DEFAULT_ZOOM = 7;
const STORAGE_KEY = "van-pickup-planner:inputs";

function createPinIcon(type, label) {
  const isHero = type === "start" || type === "end";

  if (isHero) {
    const svg = type === "start"
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14 2.83 2.83m4.48 4.48 2.83 2.83"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-9 9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h3m10-11v10a1 1 0 0 1-1 1h-3m-4 0v-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6"/></svg>';

    return L.divIcon({
      className: `map-pin-hero map-pin-hero--${type}`,
      html: `<div class="map-pin-hero__ring"></div><div class="map-pin-hero__body">${svg}</div><span class="map-pin-hero__label">${type === "start" ? "เริ่มต้น" : "ปลายทาง"}</span>`,
      iconSize: [52, 62],
      iconAnchor: [26, 52],
    });
  }

  return L.divIcon({
    className: `map-pin map-pin-${type}`,
    html: `<span class="map-pin__dot">${label}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function formatDistance(distanceM) {
  return `${(distanceM / 1000).toFixed(2)} กม.`;
}

function formatDuration(durationSec) {
  const totalMinutes = Math.max(Math.round(durationSec / 60), 1);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} นาที`;
  }

  if (minutes === 0) {
    return `${hours} ชม.`;
  }

  return `${hours} ชม. ${minutes} นาที`;
}

function getDom() {
  return {
    cancelMapModeButton: document.querySelector("#cancelMapModeButton"),
    calculateButton: document.querySelector("#calculateButton"),
    clearPickupsButton: document.querySelector("#clearPickupsButton"),
    clearRouteButton: document.querySelector("#clearRouteButton"),
    closeDetailSheetButton: document.querySelector("#closeDetailSheetButton"),
    complexityContainer: document.querySelector("#complexityContainer"),
    complexityDetailPanel: document.querySelector("#complexityDetailPanel"),
    complexityPreviewText: document.querySelector("#complexityPreviewText"),
    detailSheet: document.querySelector("#detailSheet"),
    detailSheetBackdrop: document.querySelector("#detailSheetBackdrop"),
    detailSheetEyebrow: document.querySelector("#detailSheetEyebrow"),
    detailSheetTitle: document.querySelector("#detailSheetTitle"),
    destinationSelect: document.querySelector("#destinationSelect"),
    destinationSummary: document.querySelector("#destinationSummary"),
    destinationStepBody: document.querySelector("#destinationStepBody"),
    destinationStepCard: document.querySelector("#destinationStepCard"),
    destinationStepMeta: document.querySelector("#destinationStepMeta"),
    destinationStepSummaryButton: document.querySelector("#destinationStepSummaryButton"),
    gpsChip: document.querySelector("#gpsChip"),
    manualStartButton: document.querySelector("#manualStartButton"),
    mapModeIndicator: document.querySelector("#mapModeIndicator"),
    mapModeMetric: document.querySelector("#mapModeMetric"),
    pickDestinationButton: document.querySelector("#pickDestinationButton"),
    pickupCountMetric: document.querySelector("#pickupCountMetric"),
    pickupList: document.querySelector("#pickupList"),
    pickupModeButton: document.querySelector("#pickupModeButton"),
    pickupStepBody: document.querySelector("#pickupStepBody"),
    pickupStepCard: document.querySelector("#pickupStepCard"),
    pickupStepMeta: document.querySelector("#pickupStepMeta"),
    pickupStepSummaryButton: document.querySelector("#pickupStepSummaryButton"),
    pickupWarning: document.querySelector("#pickupWarning"),
    progressText: document.querySelector("#progressText"),
    resultDetailPanel: document.querySelector("#resultDetailPanel"),
    resultPreviewText: document.querySelector("#resultPreviewText"),
    routeStateChip: document.querySelector("#routeStateChip"),
    selectionHint: document.querySelector("#selectionHint"),
    simCheckpointLabel: document.querySelector("#simCheckpointLabel"),
    simProgressFill: document.querySelector("#simProgressFill"),
    simProgressLabel: document.querySelector("#simProgressLabel"),
    simSpeedButtons: document.querySelector("#simSpeedButtons"),
    simStateChip: document.querySelector("#simStateChip"),
    simulationPauseButton: document.querySelector("#simulationPauseButton"),
    simulationResetButton: document.querySelector("#simulationResetButton"),
    simulationStartButton: document.querySelector("#simulationStartButton"),
    simulationStatus: document.querySelector("#simulationStatus"),
    startStepBody: document.querySelector("#startStepBody"),
    startStepCard: document.querySelector("#startStepCard"),
    startStepMeta: document.querySelector("#startStepMeta"),
    startStepSummaryButton: document.querySelector("#startStepSummaryButton"),
    startSourceMetric: document.querySelector("#startSourceMetric"),
    startStatus: document.querySelector("#startStatus"),
    statusBanner: document.querySelector("#statusBanner"),
    summaryDistance: document.querySelector("#summaryDistance"),
    summaryDuration: document.querySelector("#summaryDuration"),
    summaryLegs: document.querySelector("#summaryLegs"),
    summaryOrder: document.querySelector("#summaryOrder"),
    useGpsButton: document.querySelector("#useGpsButton"),
    loadingOverlay: document.querySelector("#loadingOverlay"),
    loadingOverlayLabel: document.querySelector("#loadingOverlayLabel"),
  };
}

function updateResultPreview(dom) {
  if (dom.resultPreviewText) {
    dom.resultPreviewText.textContent = `${dom.summaryLegs.textContent} • ${dom.summaryDistance.textContent} • ${dom.summaryDuration.textContent}`;
  }
}

function updateComplexityPreview(dom, hasComputed) {
  if (dom.complexityPreviewText) {
    dom.complexityPreviewText.textContent = hasComputed
      ? "แตะเพื่อดูรายละเอียดการคำนวณ"
      : "จะแสดงหลังกดหาเส้นทาง";
  }
}

function openDetailSheet(dom, type) {
  const isResult = type === "result";
  dom.detailSheetEyebrow.textContent = isResult ? "ผลลัพธ์" : "สถิติ";
  dom.detailSheetTitle.textContent = isResult ? "สรุปเส้นทาง" : "รายละเอียดการคำนวณ";
  dom.resultDetailPanel.classList.toggle("hidden", !isResult);
  dom.complexityDetailPanel.classList.toggle("hidden", isResult);
  dom.detailSheet.classList.remove("hidden");
}

function closeDetailSheet(dom) {
  dom.detailSheet.classList.add("hidden");
}

function getStartSourceLabel(start) {
  return start?.source === "gps"
    ? "GPS"
    : start?.source === "restored"
      ? "ล่าสุด"
      : start
        ? "แผนที่"
        : "ยังไม่ได้ตั้ง";
}

function getStartStepSummary(start) {
  if (!start) {
    return "ยังไม่ได้ตั้งจุดออกรถ";
  }

  const shortLabel = start.nearestName || start.label;
  return `${getStartSourceLabel(start)} • ${shortLabel}`;
}

function getDestinationStepSummary(destination) {
  return destination ? destination.label : "ยังไม่ได้เลือกปลายทาง";
}

function getPickupStepSummary(pickups) {
  return pickups.length === 0 ? "ยังไม่มีจุดรับ" : `${pickups.length} จุดรับ`;
}

function inferPreferredControlStep(state) {
  if (!state.start) {
    return "start";
  }

  if (!state.destination) {
    return "destination";
  }

  return "pickup";
}

function renderControlSteps(state, dom) {
  const activeStep = state.activeControlStep ?? inferPreferredControlStep(state);
  const steps = [
    {
      key: "start",
      button: dom.startStepSummaryButton,
      body: dom.startStepBody,
      card: dom.startStepCard,
      complete: Boolean(state.start),
    },
    {
      key: "destination",
      button: dom.destinationStepSummaryButton,
      body: dom.destinationStepBody,
      card: dom.destinationStepCard,
      complete: Boolean(state.destination),
    },
    {
      key: "pickup",
      button: dom.pickupStepSummaryButton,
      body: dom.pickupStepBody,
      card: dom.pickupStepCard,
      complete: Boolean(state.start && state.destination),
    },
  ];

  steps.forEach(({ key, button, body, card, complete }) => {
    const isActive = key === activeStep;
    card.classList.toggle("is-active", isActive);
    card.classList.toggle("is-complete", complete);
    card.classList.toggle("is-pending", !complete && !isActive);
    button.setAttribute("aria-expanded", String(isActive));
    body.classList.toggle("hidden", !isActive);
  });
}

function setActiveControlStep(state, dom, step) {
  state.activeControlStep = step ?? inferPreferredControlStep(state);
  renderControlSteps(state, dom);
}

function createMap() {
  const map = L.map("map", {
    zoomControl: true,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  return map;
}

function createState(map) {
  return {
    activeMapMode: null,
    activeControlStep: null,
    destination: null,
    destinationMarker: null,
    isCalculating: false,
    isResolvingPoint: false,
    isRestoring: false,
    map,
    nearestCache: new Map(),
    pickupManager: null,
    routeCache: new Map(),
    routeLayer: L.featureGroup().addTo(map),
    routeResult: null,
    routeTaskCache: new Map(),
    simulation: null,
    start: null,
    startMarker: null,
    tableCache: new Map(),
  };
}

function updateMapMode(state, dom, nextMode) {
  state.activeMapMode = nextMode;
  document.body.classList.remove(
    "map-mode-selecting",
    "map-mode-manual-start",
    "map-mode-manual-destination",
    "map-mode-pickup"
  );

  const labelByMode = {
    null: "ดูแผนที่",
    "manual-start": "เลือกจุดออกรถ",
    "manual-destination": "เลือกปลายทาง",
    pickup: "ปักจุดรับคน",
  };
  const hintByMode = {
    "manual-start": "จิ้มบนแผนที่ ตรงไหนที่รถจอดอยู่",
    "manual-destination": "จิ้มบนแผนที่ ตรงที่จะไปส่งคน",
    pickup: "จิ้มบนแผนที่ ตรงที่จะไปรับคน",
  };

  const readable = labelByMode[nextMode] ?? "ดูแผนที่";
  dom.mapModeIndicator.textContent = readable;
  dom.mapModeMetric.textContent = readable;

  dom.manualStartButton.classList.toggle("active", nextMode === "manual-start");
  dom.pickDestinationButton.classList.toggle("active", nextMode === "manual-destination");
  dom.pickupModeButton.classList.toggle("active", nextMode === "pickup");

  if (nextMode) {
    document.body.classList.add("map-mode-selecting", `map-mode-${nextMode}`);
    dom.selectionHint.textContent = hintByMode[nextMode] ?? "จิ้มบนแผนที่เพื่อเลือกจุด";
    dom.selectionHint.classList.remove("hidden");
    dom.cancelMapModeButton.classList.remove("hidden");
  } else {
    dom.selectionHint.classList.add("hidden");
    dom.cancelMapModeButton.classList.add("hidden");
  }

  window.setTimeout(() => state.map.invalidateSize(), 0);
}

function fitMapToCurrentState(state) {
  const coordinates = [];

  if (state.start) {
    coordinates.push([state.start.lat, state.start.lng]);
  }

  if (state.destination) {
    coordinates.push([state.destination.lat, state.destination.lng]);
  }

  state.pickupManager?.getPickups().forEach((pickup) => {
    coordinates.push([pickup.lat, pickup.lng]);
  });

  if (coordinates.length === 0) {
    return;
  }

  if (coordinates.length === 1) {
    state.map.flyTo(coordinates[0], 13, {
      duration: 0.9,
    });
    return;
  }

  state.map.fitBounds(coordinates, {
    maxZoom: 13,
    padding: [36, 36],
  });
}

function persistInputs(state) {
  const payload = {
    destination: state.destination,
    pickups: state.pickupManager?.getPickups() ?? [],
    start: state.start,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function renderStart(state, dom) {
  if (!state.start) {
    dom.startStatus.textContent = "ยังไม่ได้ตั้งจุดออกรถ";
    dom.startSourceMetric.textContent = "รอกำหนด";
    dom.startStepMeta.textContent = getStartStepSummary(null);
    return;
  }

  const sourceLabel =
    state.start.source === "gps"
      ? "GPS ปัจจุบัน"
      : state.start.source === "restored"
        ? "ตำแหน่งล่าสุด"
        : "เลือกจากแผนที่";

  const nearestLabel = state.start.nearestName ? ` | ถนน: ${state.start.nearestName}` : "";
  dom.startStatus.textContent = `${sourceLabel}: ${state.start.label}${nearestLabel}`;
  dom.startSourceMetric.textContent = sourceLabel;
  dom.startStepMeta.textContent = getStartStepSummary(state.start);
}

function renderDestination(dom, destination) {
  dom.destinationSummary.textContent = formatDestinationSummary(destination);
  dom.destinationStepMeta.textContent = getDestinationStepSummary(destination);
}

function renderPickups(state, dom) {
  const pickups = state.pickupManager.getPickups();
  dom.pickupList.innerHTML = "";

  if (pickups.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "pickup-item pickup-item-empty";
    emptyItem.textContent = "ยังไม่มีจุดรับคน";
    dom.pickupList.appendChild(emptyItem);
  } else {
    pickups.forEach((pickup, index) => {
      const item = document.createElement("li");
      item.className = "pickup-item";

      const title = document.createElement("strong");
      title.className = "pickup-item__title";
      title.textContent = pickup.label;

      const coordinates = document.createElement("span");
      coordinates.className = "pickup-item__meta";
      coordinates.textContent = `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`;

      const nearest = document.createElement("span");
      nearest.className = "pickup-item__meta";
      nearest.textContent = pickup.nearestName ? `ถนน: ${pickup.nearestName}` : "รอหาถนนใกล้สุด";

      item.append(title, coordinates, nearest);
      dom.pickupList.appendChild(item);
    });
  }

  dom.pickupCountMetric.textContent = `${pickups.length} จุด`;
  dom.pickupStepMeta.textContent = getPickupStepSummary(pickups);

  if (pickups.length > 10) {
    dom.pickupWarning.textContent = "มากกว่า 10 จุด อาจใช้เวลานานขึ้น";
    dom.pickupWarning.className = "status-chip warn";
  } else {
    dom.pickupWarning.textContent = pickups.length === 0 ? "พร้อม" : `มี ${pickups.length} จุดรับ`;
    dom.pickupWarning.className = "status-chip neutral";
  }
}

function renderSummary(routeResult, dom) {
  if (!routeResult) {
    dom.summaryLegs.textContent = "0 เที่ยว";
    dom.summaryDistance.textContent = "0 กม.";
    dom.summaryDuration.textContent = "0 นาที";
    dom.summaryOrder.textContent = "ยังไม่มีเส้นทาง";
    updateResultPreview(dom);
    return;
  }

  dom.summaryLegs.textContent = `${routeResult.routeSegments.length} เที่ยว`;
  dom.summaryDistance.textContent = formatDistance(routeResult.totalDistanceM);
  dom.summaryDuration.textContent = formatDuration(routeResult.totalDurationSec);
  dom.summaryOrder.textContent = routeResult.routeNodeLabels.join(" -> ");
  updateResultPreview(dom);
}

function updateSimulationButtons(state, dom) {
  const ready = state.simulation.isReady();
  const running = state.simulation.isRunning();

  dom.simulationStartButton.disabled = !ready || running;
  dom.simulationPauseButton.disabled = !running;
  dom.simulationResetButton.disabled = !ready;

  if (running) {
    dom.simStateChip.textContent = "กำลังวิ่ง";
    dom.simStateChip.className = "status-chip warn";
  } else if (ready) {
    dom.simStateChip.textContent = "พร้อม";
    dom.simStateChip.className = "status-chip";
  } else {
    dom.simStateChip.textContent = "รอหาเส้นทาง";
    dom.simStateChip.className = "status-chip neutral";
  }
}

function highlightSpeedButton(dom, activeIndex) {
  const buttons = dom.simSpeedButtons.querySelectorAll(".sim-speed__btn");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("is-active", i === activeIndex);
  });
}

function buildSpeedButtons(dom, state) {
  dom.simSpeedButtons.innerHTML = "";
  state.simulation.SPEED_PRESETS.forEach((preset, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sim-speed__btn";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      state.simulation.setSpeed(index);
    });
    dom.simSpeedButtons.appendChild(btn);
  });
  highlightSpeedButton(dom, state.simulation.getSpeed().index);
}

function updateComputeAvailability(state, dom) {
  dom.calculateButton.disabled =
    state.isCalculating || state.isResolvingPoint || !(state.start && state.destination);
}

function invalidateRoute(state, dom, message = "มีการเปลี่ยนแปลง กดหาเส้นทางใหม่อีกครั้ง") {
  state.routeLayer.clearLayers();
  state.routeResult = null;
  state.simulation.clear();
  state.pickupManager?.reorderMarkers(null);
  renderSummary(null, dom);
  dom.progressText.textContent = "ยังไม่เริ่ม";
  dom.routeStateChip.textContent = "ยังไม่มีเส้นทาง";
  dom.routeStateChip.className = "status-chip neutral";
  dom.statusBanner.textContent = message;
  dom.simProgressFill.style.width = "0%";
  dom.simProgressLabel.textContent = "0%";
  dom.simCheckpointLabel.textContent = "0 / 0 จุด";
  dom.complexityContainer.innerHTML =
    '<p class="helper-text">จะแสดงหลังกดหาเส้นทาง</p>';
  updateComplexityPreview(dom, false);
  updateSimulationButtons(state, dom);
  setActiveControlStep(state, dom, inferPreferredControlStep(state));
}

function setStart(state, dom, startNode, { silentPersist = false } = {}) {
  state.start = {
    id: "start",
    type: "start",
    ...startNode,
  };

  const latlng = [state.start.lat, state.start.lng];
  if (!state.startMarker) {
    state.startMarker = L.marker(latlng, {
      icon: createPinIcon("start", "S"),
    }).addTo(state.map);
  } else {
    state.startMarker.setLatLng(latlng);
  }

  state.startMarker.bindTooltip("จุดเริ่มต้น", {
    direction: "top",
    offset: [0, -14],
  });

  renderStart(state, dom);
  if (!silentPersist) {
    persistInputs(state);
  }
  updateComputeAvailability(state, dom);
  setActiveControlStep(state, dom, inferPreferredControlStep(state));
}

function setDestination(state, dom, destinationNode, { silentPersist = false } = {}) {
  state.destination = {
    id: "end",
    type: "end",
    ...destinationNode,
  };

  const latlng = [state.destination.lat, state.destination.lng];
  if (!state.destinationMarker) {
    state.destinationMarker = L.marker(latlng, {
      icon: createPinIcon("end", "E"),
    }).addTo(state.map);
  } else {
    state.destinationMarker.setLatLng(latlng);
  }

  state.destinationMarker.bindTooltip("ปลายทาง", {
    direction: "top",
    offset: [0, -14],
  });

  renderDestination(dom, state.destination);
  syncDestinationSelect(dom.destinationSelect, state.destination, SOUTHERN_BKS);
  if (!silentPersist) {
    persistInputs(state);
  }
  updateComputeAvailability(state, dom);
  setActiveControlStep(state, dom, inferPreferredControlStep(state));
}

function drawRoute(state, routeResult) {
  state.routeLayer.clearLayers();

  routeResult.routeSegments.forEach((segment, index) => {
    if (!Array.isArray(segment.geometry) || segment.geometry.length === 0) {
      return;
    }

    const palette = getSegmentPaletteEntry(segment, index);
    const latLngs = segment.geometry.map(([lng, lat]) => [lat, lng]);
    const polyline = L.polyline(latLngs, {
      color: palette.color,
      opacity: 0.92,
      weight: 6,
    });

    polyline.bindPopup(
      `<strong>${segment.targetLabel}</strong><br/>${formatDistance(segment.distanceM)} / ${formatDuration(segment.durationSec)}`,
    );
    polyline.addTo(state.routeLayer);
  });

  const bounds = state.routeLayer.getBounds();
  if (bounds.isValid()) {
    state.map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 13,
    });
  }
}

function createResolvedNode(rawPoint, resolvedRoadPoint, metadata) {
  return {
    id: metadata.id,
    label: metadata.label,
    lat: resolvedRoadPoint.lat,
    lng: resolvedRoadPoint.lng,
    nearestName: resolvedRoadPoint.nearestName,
    nearestNodeIds: resolvedRoadPoint.nearestNodes,
    rawLat: rawPoint.lat,
    rawLng: rawPoint.lng,
    snapKey: resolvedRoadPoint.snapKey,
    source: metadata.source,
    terminalId: metadata.terminalId ?? null,
    type: metadata.type,
  };
}

function createRawNode(rawPoint, metadata) {
  return {
    id: metadata.id,
    label: metadata.label,
    lat: rawPoint.lat,
    lng: rawPoint.lng,
    nearestName: "",
    nearestNodeIds: [],
    rawLat: rawPoint.lat,
    rawLng: rawPoint.lng,
    snapKey: null,
    source: metadata.source,
    terminalId: metadata.terminalId ?? null,
    type: metadata.type,
  };
}

function createUnsnappedPickupNode(latlng, pickupIndex) {
  return createRawNode(latlng, {
    id: `pickup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: `Pickup ${pickupIndex}`,
    source: "map",
    type: "pickup",
  });
}

function hasSameRawCoordinates(node, rawPoint) {
  return Boolean(node) && (node.rawLat ?? node.lat) === rawPoint.lat && (node.rawLng ?? node.lng) === rawPoint.lng;
}

function resolveNodeInBackground(state, dom, node, metadata) {
  const rawPoint = {
    lat: node.rawLat ?? node.lat,
    lng: node.rawLng ?? node.lng,
  };

  void resolveNearestPoint(rawPoint, state.nearestCache)
    .then((resolvedRoadPoint) => {
      const currentNode = metadata.getCurrentNode();
      if (!hasSameRawCoordinates(currentNode, rawPoint)) {
        return;
      }

      metadata.applyResolvedNode(
        createResolvedNode(rawPoint, resolvedRoadPoint, {
          id: currentNode.id,
          label: currentNode.label,
          source: currentNode.source,
          terminalId: currentNode.terminalId ?? null,
          type: metadata.type,
        }),
      );
    })
    .catch(() => {
      const currentNode = metadata.getCurrentNode();
      if (!hasSameRawCoordinates(currentNode, rawPoint)) {
        return;
      }

      dom.statusBanner.textContent = metadata.rawFallbackMessage(currentNode);
    });
}

function resolveStartInBackground(state, dom, startNode) {
  resolveNodeInBackground(state, dom, startNode, {
    type: "start",
    getCurrentNode: () => state.start,
    applyResolvedNode: (resolvedNode) => {
      setStart(state, dom, resolvedNode);
    },
    rawFallbackMessage: (currentNode) => `${currentNode.label} ใช้พิกัดชั่วคราว รอหาถนนใกล้สุด`,
  });
}

function resolveDestinationInBackground(state, dom, destinationNode) {
  resolveNodeInBackground(state, dom, destinationNode, {
    type: "end",
    getCurrentNode: () => state.destination,
    applyResolvedNode: (resolvedNode) => {
      setDestination(state, dom, resolvedNode);
    },
    rawFallbackMessage: (currentNode) => `${currentNode.label} ใช้พิกัดชั่วคราว รอหาถนนใกล้สุด`,
  });
}

function resolvePickupInBackground(state, dom, pickup) {
  const rawPoint = {
    lat: pickup.rawLat ?? pickup.lat,
    lng: pickup.rawLng ?? pickup.lng,
  };

  void resolveNearestPoint(rawPoint, state.nearestCache)
    .then((resolvedRoadPoint) => {
      const currentPickup = state.pickupManager
        .getPickups()
        .find((entry) => entry.id === pickup.id);

      if (!currentPickup) {
        return;
      }

      const currentRawLat = currentPickup.rawLat ?? currentPickup.lat;
      const currentRawLng = currentPickup.rawLng ?? currentPickup.lng;
      if (currentRawLat !== rawPoint.lat || currentRawLng !== rawPoint.lng) {
        return;
      }

      state.pickupManager.updatePickup(
        pickup.id,
        createResolvedNode(rawPoint, resolvedRoadPoint, {
          id: pickup.id,
          label: pickup.label,
          source: pickup.source,
          type: "pickup",
        }),
      );
    })
    .catch(() => {
      const currentPickup = state.pickupManager
        .getPickups()
        .find((entry) => entry.id === pickup.id);

      if (!currentPickup) {
        return;
      }

      dom.statusBanner.textContent = `${pickup.label} ใช้พิกัดชั่วคราว ระบบจะหาถนนใกล้สุดตอนคำนวณ`;
    });
}

async function resolveRoadNode(state, dom, rawPoint, metadata, { allowRawFallback = false } = {}) {
  dom.statusBanner.textContent = metadata.statusText;

  try {
    const resolvedRoadPoint = await resolveNearestPoint(rawPoint, state.nearestCache);
    return createResolvedNode(rawPoint, resolvedRoadPoint, metadata);
  } catch (error) {
    if (!allowRawFallback) {
      throw error;
    }

    dom.statusBanner.textContent = `${metadata.label} ใช้พิกัดชั่วคราว ระบบจะหาถนนใกล้สุดภายหลัง`;
    return createRawNode(rawPoint, metadata);
  }
}

async function ensureResolvedNode(state, dom, node, metadata) {
  if (node.snapKey) {
    return node;
  }

  const rawPoint = {
    lat: node.rawLat ?? node.lat,
    lng: node.rawLng ?? node.lng,
  };

  try {
    return await resolveRoadNode(state, dom, rawPoint, {
      id: node.id,
      label: node.label,
      source: node.source,
      statusText: metadata.statusText,
      terminalId: node.terminalId ?? null,
      type: metadata.type,
    });
  } catch (_error) {
    return createRawNode(rawPoint, {
      id: node.id,
      label: node.label,
      source: node.source,
      terminalId: node.terminalId ?? null,
      type: metadata.type,
    });
  }
}

async function runPointResolution(state, dom, callback) {
  if (state.isResolvingPoint) {
    return;
  }

  state.isResolvingPoint = true;
  updateComputeAvailability(state, dom);

  try {
    await callback();
  } catch (error) {
    dom.statusBanner.textContent = error.message;
    dom.routeStateChip.textContent = "หาถนนไม่สำเร็จ";
    dom.routeStateChip.className = "status-chip danger";
  } finally {
    state.isResolvingPoint = false;

    if (!state.routeResult) {
      dom.routeStateChip.textContent = "ยังไม่มีเส้นทาง";
      dom.routeStateChip.className = "status-chip neutral";
    }

    updateComputeAvailability(state, dom);
  }
}

function restoreInputs(state, dom) {
  state.isRestoring = true;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.isRestoring = false;
      return;
    }

    const payload = JSON.parse(raw);

    if (payload.start) {
      setStart(
        state,
        dom,
        {
          ...payload.start,
          id: "start",
          type: "start",
        },
        {
          silentPersist: true,
        },
      );
    }

    if (payload.destination) {
      setDestination(
        state,
        dom,
        {
          ...payload.destination,
          id: "end",
          type: "end",
        },
        {
          silentPersist: true,
        },
      );
    }

    if (Array.isArray(payload.pickups)) {
      state.pickupManager.replaceAll(payload.pickups, {
        silent: true,
      });
      renderPickups(state, dom);
    }
  } catch (_error) {
    window.localStorage.removeItem(STORAGE_KEY);
  } finally {
    state.isRestoring = false;
  }
}

async function ensureResolvedInputs(state, dom) {
  const resolvedStart = await ensureResolvedNode(state, dom, state.start, {
    type: "start",
    statusText: "กำลังหาถนนใกล้สุดจุดออกรถ",
  });
  if (resolvedStart !== state.start) {
    setStart(state, dom, resolvedStart, {
      silentPersist: true,
    });
  }

  const resolvedDestination = await ensureResolvedNode(state, dom, state.destination, {
    type: "end",
    statusText: "กำลังหาถนนใกล้สุดปลายทาง",
  });
  if (resolvedDestination !== state.destination) {
    setDestination(state, dom, resolvedDestination, {
      silentPersist: true,
    });
  }

  const pickups = state.pickupManager.getPickups();
  const resolvedPickups = [];

  for (const pickup of pickups) {
    resolvedPickups.push(
      await ensureResolvedNode(state, dom, pickup, {
        type: "pickup",
        statusText: `กำลังหาถนนใกล้สุด ${pickup.label}`,
      }),
    );
  }

  const hasUpdatedPickups = resolvedPickups.some((pickup, index) => pickup !== pickups[index]);
  if (hasUpdatedPickups) {
    state.pickupManager.replaceAll(resolvedPickups, {
      silent: true,
    });
    renderPickups(state, dom);
  }

  persistInputs(state);
  return {
    destination: resolvedDestination,
    pickups: resolvedPickups,
    start: resolvedStart,
  };
}

async function calculateRoute(state, dom) {
  if (!state.start || !state.destination) {
    dom.statusBanner.textContent = "ต้องตั้งจุดออกรถและปลายทางก่อน";
    return;
  }

  state.isCalculating = true;
  updateComputeAvailability(state, dom);
  dom.routeStateChip.textContent = "กำลังหาเส้นทาง";
  dom.routeStateChip.className = "status-chip warn";
  dom.statusBanner.textContent = "กำลังโหลดข้อมูลระยะทางถนนจริง...";
  dom.loadingOverlayLabel.textContent = "กำลังโหลดข้อมูลเส้นทาง...";
  dom.loadingOverlay.classList.remove("hidden");
  dom.progressText.textContent = "โหลดข้อมูล 0/1";

  try {
    const { start, destination, pickups } = await ensureResolvedInputs(state, dom);
    const anchors = [start, ...pickups, destination];
    const tableData = await hydrateTableData(anchors, state.tableCache, state.routeCache, state.routeTaskCache, {
      onProgress: ({ done, total, cached, currentPair, phase }) => {
        if (cached) {
          dom.progressText.textContent = "โหลดแล้ว";
          return;
        }

        if (phase === "table-fallback") {
          dom.progressText.textContent = `โหลดระยะทาง ${done}/${total}`;
          return;
        }

        dom.progressText.textContent = `โหลดข้อมูล ${done}/${total}`;
      },
    });

    const graph = buildDurationGraph(anchors, tableData);
    dom.statusBanner.textContent = "กำลังหาเส้นทางที่เร็วที่สุด...";
    dom.loadingOverlayLabel.textContent = "กำลังคำนวณเส้นทางที่เหมาะสมที่สุด...";

    const routePlan = computeGreedyRoute(
      graph,
      start.id,
      pickups.map((pickup) => pickup.id),
      destination.id,
    );

    dom.statusBanner.textContent = "กำลังโหลดเส้นทางถนนจริง...";
    dom.loadingOverlayLabel.textContent = "กำลังโหลดเส้นทางตามถนนจริง...";
    const routeSegments = await collectPrefetchedRouteSegments(
      routePlan.routeNodeIds,
      graph,
      state.routeCache,
      state.routeTaskCache,
      {
        onProgress: ({ done, total, currentPair }) => {
          dom.progressText.textContent = `โหลดเส้นทาง ${done}/${total}`;
        },
      },
    );

    const routeResult = {
      ...routePlan,
      failedPrefetchCount: 0,
      graphEdgeCount: graph.edgeMap.size,
      graphNodeCount: graph.nodeMap.size,
      matrixSource: tableData.source,
      prefetchedRouteCount: routeSegments.length,
      routeNodeLabels: routePlan.routeNodeIds.map((nodeId) => graph.nodeMap.get(nodeId)?.label ?? nodeId),
      routeSegments,
      totalDistanceM: routeSegments.reduce((sum, segment) => sum + segment.distanceM, 0),
      totalDurationSec: routeSegments.reduce((sum, segment) => sum + segment.durationSec, 0),
    };

    state.routeResult = routeResult;

    // Re-number pickup markers on the map to reflect the actual visit order.
    const orderedPickupIds = routePlan.routeNodeIds.filter((id) => id !== "start" && id !== "end");
    state.pickupManager.reorderMarkers(orderedPickupIds);

    drawRoute(state, routeResult);
    renderSummary(routeResult, dom);
    dom.complexityContainer.innerHTML = renderComplexity(
      graph.nodeMap.size,
      graph.edgeMap.size,
      pickups.length,
      routeResult.dijkstraRuns,
      routeResult.prefetchedRouteCount,
      routeSegments.length,
    );
    updateComplexityPreview(dom, true);
    dom.statusBanner.textContent =
      pickups.length === 0
        ? `ไม่มีจุดรับ หาเส้นทางตรง 1 เที่ยว`
        : `หาเส้นทางสำเร็จ! รับคน ${routeSegments.length} เที่ยว`;
    dom.routeStateChip.textContent = "เสร็จแล้ว!";
    dom.routeStateChip.className = "status-chip";

    if (routeResult.matrixSource === "route-fallback") {
      dom.statusBanner.textContent += " | ใช้วิธีสำรองเพราะโหลดข้อมูลช้า";
    }
    state.simulation.load(routeResult.routeSegments);
    updateSimulationButtons(state, dom);
  } catch (error) {
    dom.routeStateChip.textContent = "หาเส้นทางไม่ได้";
    dom.routeStateChip.className = "status-chip danger";
    dom.statusBanner.textContent = error.message;
  } finally {
    dom.loadingOverlay.classList.add("hidden");
    state.isCalculating = false;
    updateComputeAvailability(state, dom);
  }
}

function attachEventHandlers(state, dom) {
  dom.startStepSummaryButton.addEventListener("click", () => {
    setActiveControlStep(state, dom, "start");
  });

  dom.destinationStepSummaryButton.addEventListener("click", () => {
    setActiveControlStep(state, dom, "destination");
  });

  dom.pickupStepSummaryButton.addEventListener("click", () => {
    setActiveControlStep(state, dom, "pickup");
  });

  dom.closeDetailSheetButton.addEventListener("click", () => {
    closeDetailSheet(dom);
  });

  dom.detailSheetBackdrop.addEventListener("click", () => {
    closeDetailSheet(dom);
  });

  dom.useGpsButton.addEventListener("click", async () => {
    dom.gpsChip.textContent = "กำลังหาตำแหน่ง...";
    dom.gpsChip.className = "status-chip warn";

    await runPointResolution(state, dom, async () => {
      const location = await requestCurrentPosition();
      const resolvedStart = await resolveRoadNode(state, dom, location, {
        id: "start",
        label: `GPS (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`,
        source: "gps",
        statusText: "กำลังหาถนนใกล้ GPS",
        type: "start",
      }, {
        allowRawFallback: true,
      });

      setStart(state, dom, resolvedStart);
      dom.gpsChip.textContent = "GPS พร้อม";
      dom.gpsChip.className = "status-chip";
      updateMapMode(state, dom, null);
      fitMapToCurrentState(state);
      invalidateRoute(state, dom);
    });
  });

  dom.manualStartButton.addEventListener("click", () => {
    updateMapMode(state, dom, state.activeMapMode === "manual-start" ? null : "manual-start");
  });

  dom.pickDestinationButton.addEventListener("click", () => {
    updateMapMode(
      state,
      dom,
      state.activeMapMode === "manual-destination" ? null : "manual-destination",
    );
  });

  dom.pickupModeButton.addEventListener("click", () => {
    updateMapMode(state, dom, state.activeMapMode === "pickup" ? null : "pickup");
  });

  dom.cancelMapModeButton.addEventListener("click", () => {
    updateMapMode(state, dom, null);
  });

  dom.clearPickupsButton.addEventListener("click", () => {
    state.pickupManager.clearAll();
  });

  dom.destinationSelect.addEventListener("change", async (event) => {
    const terminal = findTerminalById(SOUTHERN_BKS, event.target.value);
    if (!terminal) {
      return;
    }

    const rawDestination = createRawNode(terminal, {
      id: "end",
      label: terminal.name,
      source: "dropdown",
      terminalId: terminal.id,
      type: "end",
    });

    setDestination(state, dom, rawDestination);
    state.map.flyTo([rawDestination.lat, rawDestination.lng], 11, {
      duration: 1.1,
    });
    updateMapMode(state, dom, null);
    invalidateRoute(state, dom, "เลือกปลายทางแล้ว กำลังหาถนนใกล้สุด");
    resolveDestinationInBackground(state, dom, rawDestination);
  });

  dom.calculateButton.addEventListener("click", () => {
    calculateRoute(state, dom);
  });

  dom.clearRouteButton.addEventListener("click", () => {
    invalidateRoute(state, dom, "ล้างเส้นทางแล้ว");
  });

  dom.simulationStartButton.addEventListener("click", () => {
    state.simulation.start();
    updateSimulationButtons(state, dom);
  });

  dom.simulationPauseButton.addEventListener("click", () => {
    state.simulation.pause();
    updateSimulationButtons(state, dom);
  });

  dom.simulationResetButton.addEventListener("click", () => {
    state.simulation.reset();
    updateSimulationButtons(state, dom);
  });

  state.map.on("click", async (event) => {
    if (state.activeMapMode === "manual-start") {
      const rawStart = createRawNode(event.latlng, {
        id: "start",
        label: `จุดออกรถ (${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)})`,
        source: "manual",
        type: "start",
      });

      setStart(state, dom, rawStart);
      updateMapMode(state, dom, null);
      invalidateRoute(state, dom, "เลือกจุดออกรถแล้ว กำลังหาถนนใกล้สุด");
      resolveStartInBackground(state, dom, rawStart);
      return;
    }

    if (state.activeMapMode === "manual-destination") {
      const destinationPoint = createDestinationFromMap(event.latlng);
      const rawDestination = createRawNode(event.latlng, {
        id: "end",
        label: destinationPoint.label,
        source: "map",
        type: "end",
      });

      setDestination(state, dom, rawDestination);
      updateMapMode(state, dom, null);
      invalidateRoute(state, dom, "เลือกปลายทางแล้ว กำลังหาถนนใกล้สุด");
      resolveDestinationInBackground(state, dom, rawDestination);
      return;
    }

    if (state.activeMapMode === "pickup") {
      const pickupIndex = state.pickupManager.getPickups().length + 1;
      const optimisticPickup = createUnsnappedPickupNode(event.latlng, pickupIndex);

      state.pickupManager.addPickup(optimisticPickup);
      dom.statusBanner.textContent = `เพิ่มจุดรับที่ ${pickupIndex} แล้ว กำลังหาถนนใกล้สุด`;
      resolvePickupInBackground(state, dom, optimisticPickup);
    }
  });
}

function init() {
  const dom = getDom();
  const map = createMap();
  const state = createState(map);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetailSheet(dom);
    }
  });

  window.requestAnimationFrame(() => {
    map.invalidateSize();
  });

  // Leaflet CSS loads from CDN — ensure map is sized correctly after
  // all external resources (CSS, fonts) have fully loaded.
  window.addEventListener("load", () => {
    map.invalidateSize();
  });

  state.simulation = createSimulationController({
    map,
    onStatusChange: (message) => {
      dom.simulationStatus.textContent = message;
      updateSimulationButtons(state, dom);
    },
    onSpeedChange: (preset) => {
      highlightSpeedButton(dom, state.simulation.getSpeed().index);
    },
    onProgressChange: ({ percent, checkpointsDone, totalCheckpoints }) => {
      dom.simProgressFill.style.width = `${percent}%`;
      dom.simProgressLabel.textContent = `${percent}%`;
      dom.simCheckpointLabel.textContent = `${checkpointsDone} / ${totalCheckpoints} จุด`;
    },
  });

  buildSpeedButtons(dom, state);

  state.pickupManager = createPickupManager({
    map,
    onChange: () => {
      renderPickups(state, dom);
      setActiveControlStep(state, dom, inferPreferredControlStep(state));

      if (!state.isRestoring) {
        persistInputs(state);
        invalidateRoute(state, dom);
      }
    },
  });

  populateDestinationOptions(dom.destinationSelect, SOUTHERN_BKS);
  restoreInputs(state, dom);
  renderStart(state, dom);
  renderDestination(dom, state.destination);
  renderPickups(state, dom);
  renderSummary(null, dom);
  updateComplexityPreview(dom, false);
  dom.gpsChip.textContent = "ยังไม่ได้เปิด GPS";
  dom.gpsChip.className = "status-chip neutral";
  setActiveControlStep(state, dom, inferPreferredControlStep(state));
  updateMapMode(state, dom, null);
  updateComputeAvailability(state, dom);
  updateSimulationButtons(state, dom);
  fitMapToCurrentState(state);
  attachEventHandlers(state, dom);
}

document.addEventListener("DOMContentLoaded", init);
