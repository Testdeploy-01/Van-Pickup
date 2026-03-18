export function populateDestinationOptions(selectElement, terminals) {
  const fragment = document.createDocumentFragment();

  terminals.forEach((terminal) => {
    const option = document.createElement("option");
    option.value = terminal.id;
    option.textContent = `${terminal.province} - ${terminal.name}`;
    fragment.appendChild(option);
  });

  selectElement.appendChild(fragment);
}

export function findTerminalById(terminals, terminalId) {
  return terminals.find((terminal) => terminal.id === terminalId) ?? null;
}

export function createDestinationFromTerminal(terminal) {
  return {
    id: "end",
    type: "end",
    source: "dropdown",
    terminalId: terminal.id,
    label: terminal.name,
    lat: terminal.lat,
    lng: terminal.lng,
  };
}

export function createDestinationFromMap(latlng) {
  return {
    id: "end",
    type: "end",
    source: "map",
    terminalId: null,
    label: `ปลายทางกำหนดเอง (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`,
    lat: latlng.lat,
    lng: latlng.lng,
  };
}

export function syncDestinationSelect(selectElement, destination, terminals) {
  if (!destination || destination.source !== "dropdown") {
    selectElement.value = "";
    return;
  }

  const terminal = findTerminalById(terminals, destination.terminalId);
  selectElement.value = terminal ? terminal.id : "";
}

export function formatDestinationSummary(destination) {
  if (!destination) {
    return "ยังไม่ได้เลือกปลายทาง";
  }

  const sourceLabel = destination.source === "map" ? "ปลายทางจากแผนที่" : "ปลายทางจากรายการ บขส.";
  return `${sourceLabel}: ${destination.label}`;
}
