import { getPickupPaletteEntry } from "./map-colors.js";

function createPickupId() {
  return `pickup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatPickupLabel(index) {
  return `Pickup ${index}`;
}

function createPickupIcon(index) {
  const palette = getPickupPaletteEntry(index - 1);

  return L.divIcon({
    className: "map-pin map-pin-pickup",
    html: `<span class="map-pin__dot" style="--pin-color: ${palette.color}; --pin-color-strong: ${palette.strong}; --pin-ink: ${palette.ink};">${index}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function createPickupManager({ map, onChange }) {
  const markers = new Map();
  let pickups = [];

  function emitChange() {
    onChange(
      pickups.map((pickup) => ({
        ...pickup,
      })),
    );
  }

  function syncMarkerLabels() {
    pickups.forEach((pickup, index) => {
      pickup.label = formatPickupLabel(index + 1);
      pickup.colorIndex = index + 1;
      const marker = markers.get(pickup.id);
      if (marker) {
        marker.setIcon(createPickupIcon(index + 1));
        marker.bindTooltip(pickup.label, {
          direction: "top",
          offset: [0, -14],
        });
      }
    });
  }

  function removeMarker(pickupId) {
    const marker = markers.get(pickupId);
    if (marker) {
      map.removeLayer(marker);
      markers.delete(pickupId);
    }
  }

  function addMarker(pickup) {
    const marker = L.marker([pickup.lat, pickup.lng], {
      draggable: true,
      icon: createPickupIcon(pickups.findIndex((entry) => entry.id === pickup.id) + 1),
    });

    marker.bindTooltip(pickup.label, {
      direction: "top",
      offset: [0, -14],
    });

    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      pickups = pickups.filter((item) => item.id !== pickup.id);
      removeMarker(pickup.id);
      syncMarkerLabels();
      emitChange();
    });

    marker.on("dragend", (event) => {
      const { lat, lng } = event.target.getLatLng();
      pickups = pickups.map((item) =>
        item.id === pickup.id
          ? {
              ...item,
              rawLat: lat,
              rawLng: lng,
              lat,
              lng,
              nearestName: "",
              nearestNodeIds: [],
              snapKey: null,
            }
          : item,
      );
      syncMarkerLabels();
      emitChange();
    });

    marker.addTo(map);
    markers.set(pickup.id, marker);
  }

  function replaceAll(nextPickups, { silent = false } = {}) {
    markers.forEach((marker) => {
      map.removeLayer(marker);
    });
    markers.clear();

    pickups = nextPickups.map((pickup, index) => ({
      ...pickup,
      id: pickup.id ?? createPickupId(),
      type: "pickup",
      label: formatPickupLabel(index + 1),
    }));

    pickups.forEach((pickup) => addMarker(pickup));
    syncMarkerLabels();

    if (!silent) {
      emitChange();
    }
  }

  function reorderMarkers(orderedIds) {
    // orderedIds: pickup IDs in the route visit order (from greedy result).
    // null = reset to original insertion order.
    const orderMap = new Map();
    if (orderedIds) {
      orderedIds.forEach((id, index) => orderMap.set(id, index + 1));
    }

    pickups.forEach((pickup, insertionIndex) => {
      const displayIndex = orderedIds ? (orderMap.get(pickup.id) ?? insertionIndex + 1) : insertionIndex + 1;
      const marker = markers.get(pickup.id);
      if (marker) {
        marker.setIcon(createPickupIcon(displayIndex));
      }
    });
  }

  function addPickup(latlng) {
    const pickup =
      "id" in latlng
        ? {
            ...latlng,
            id: latlng.id ?? createPickupId(),
            type: "pickup",
            label: latlng.label ?? formatPickupLabel(pickups.length + 1),
          }
        : {
            id: createPickupId(),
            type: "pickup",
            lat: latlng.lat,
            lng: latlng.lng,
            label: formatPickupLabel(pickups.length + 1),
          };

    pickups = [...pickups, pickup];
    addMarker(pickup);
    syncMarkerLabels();
    emitChange();
  }

  function updatePickup(pickupId, nextPickup, { silent = false } = {}) {
    const pickupIndex = pickups.findIndex((pickup) => pickup.id === pickupId);
    if (pickupIndex === -1) {
      return false;
    }

    const currentPickup = pickups[pickupIndex];
    const updatedPickup = {
      ...currentPickup,
      ...nextPickup,
      id: currentPickup.id,
      label: currentPickup.label,
      type: "pickup",
    };

    pickups = pickups.map((pickup, index) => (index === pickupIndex ? updatedPickup : pickup));

    const marker = markers.get(pickupId);
    if (marker) {
      marker.setLatLng([updatedPickup.lat, updatedPickup.lng]);
      marker.bindTooltip(updatedPickup.label, {
        direction: "top",
        offset: [0, -14],
      });
    }

    syncMarkerLabels();

    if (!silent) {
      emitChange();
    }

    return true;
  }

  function clearAll() {
    replaceAll([]);
  }

  function getPickups() {
    return pickups.map((pickup) => ({
      ...pickup,
    }));
  }

  return {
    addPickup,
    clearAll,
    getPickups,
    replaceAll,
    reorderMarkers,
    updatePickup,
  };
}
