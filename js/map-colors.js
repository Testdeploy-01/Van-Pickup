const PICKUP_PALETTE = [
  { color: "hsl(215 89% 53%)", strong: "hsl(205 91% 58%)", ink: "hsl(0 0% 100%)" },
  { color: "hsl(32 93% 47%)", strong: "hsl(41 96% 55%)", ink: "hsl(218 19% 16%)" },
  { color: "hsl(151 55% 35%)", strong: "hsl(171 58% 38%)", ink: "hsl(0 0% 100%)" },
  { color: "hsl(4 76% 56%)", strong: "hsl(356 77% 52%)", ink: "hsl(0 0% 100%)" },
  { color: "hsl(266 56% 54%)", strong: "hsl(254 68% 62%)", ink: "hsl(0 0% 100%)" },
  { color: "hsl(192 78% 41%)", strong: "hsl(183 69% 42%)", ink: "hsl(0 0% 100%)" },
  { color: "hsl(338 78% 54%)", strong: "hsl(352 84% 62%)", ink: "hsl(0 0% 100%)" },
  { color: "hsl(84 58% 40%)", strong: "hsl(95 53% 46%)", ink: "hsl(0 0% 100%)" },
];

const END_SEGMENT_COLORS = {
  color: "hsl(4 76% 56%)",
  strong: "hsl(356 77% 52%)",
  ink: "hsl(0 0% 100%)",
};

function normalizePaletteIndex(index) {
  return ((index % PICKUP_PALETTE.length) + PICKUP_PALETTE.length) % PICKUP_PALETTE.length;
}

export function getPickupPaletteEntry(index) {
  return PICKUP_PALETTE[normalizePaletteIndex(index)];
}

export function getSegmentPaletteEntry(segment, segmentIndex = 0) {
  if (segment.targetType === "pickup") {
    const pickupIndex = Number.isFinite(segment.targetColorIndex)
      ? Math.max(segment.targetColorIndex - 1, 0)
      : segmentIndex;
    return getPickupPaletteEntry(pickupIndex);
  }

  if (segment.targetType === "end") {
    return END_SEGMENT_COLORS;
  }

  return getPickupPaletteEntry(segmentIndex);
}
