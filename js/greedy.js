import { runDijkstra } from "./dijkstra.js";

function reconstructPath(sourceId, targetId, prev) {
  const path = [];
  let currentId = targetId;

  while (currentId) {
    path.unshift(currentId);
    if (currentId === sourceId) {
      break;
    }
    currentId = prev[currentId];
  }

  if (path[0] !== sourceId) {
    throw new Error("Cannot reconstruct shortest path");
  }

  return path;
}

function sumPathMetrics(graph, pathNodeIds) {
  let totalDistanceM = 0;
  let totalDurationSec = 0;

  for (let index = 0; index < pathNodeIds.length - 1; index += 1) {
    const fromId = pathNodeIds[index];
    const toId = pathNodeIds[index + 1];
    const edge = graph.edgeMap.get(`${fromId}->${toId}`);

    if (!edge) {
      throw new Error(`Missing graph edge for path ${fromId} -> ${toId}`);
    }

    totalDistanceM += edge.distanceM;
    totalDurationSec += edge.durationSec;
  }

  return {
    distanceM: totalDistanceM,
    durationSec: totalDurationSec,
  };
}

export function computeGreedyRoute(graph, startId, pickupIds, endId) {
  const remainingPickups = [...pickupIds];
  const routeNodeIds = [startId];
  const plannedLegs = [];
  let currentId = startId;
  let estimatedDistanceM = 0;
  let estimatedDurationSec = 0;
  let dijkstraRuns = 0;

  while (remainingPickups.length > 0) {
    const { dist, prev } = runDijkstra(graph, currentId);
    dijkstraRuns += 1;

    remainingPickups.sort((leftId, rightId) => {
      const leftDistance = dist[leftId];
      const rightDistance = dist[rightId];

      if (leftDistance === rightDistance) {
        return pickupIds.indexOf(leftId) - pickupIds.indexOf(rightId);
      }

      return leftDistance - rightDistance;
    });

    const nextPickupId = remainingPickups.shift();
    if (!Number.isFinite(dist[nextPickupId])) {
      throw new Error("No path from current node to one of the remaining pickups");
    }

    const pathNodeIds = reconstructPath(currentId, nextPickupId, prev);
    const metrics = sumPathMetrics(graph, pathNodeIds);

    plannedLegs.push({
      distanceM: metrics.distanceM,
      durationSec: metrics.durationSec,
      fromId: currentId,
      pathNodeIds,
      targetLabel: graph.nodeMap.get(nextPickupId)?.label ?? nextPickupId,
      targetType: "pickup",
      toId: nextPickupId,
    });

    routeNodeIds.push(nextPickupId);
    estimatedDistanceM += metrics.distanceM;
    estimatedDurationSec += metrics.durationSec;
    currentId = nextPickupId;
  }

  const { dist: finalDist, prev: finalPrev } = runDijkstra(graph, currentId);
  dijkstraRuns += 1;

  if (!Number.isFinite(finalDist[endId])) {
    throw new Error("No path from the last node to the destination");
  }

  const finalPathNodeIds = reconstructPath(currentId, endId, finalPrev);
  const finalMetrics = sumPathMetrics(graph, finalPathNodeIds);

  plannedLegs.push({
    distanceM: finalMetrics.distanceM,
    durationSec: finalMetrics.durationSec,
    fromId: currentId,
    pathNodeIds: finalPathNodeIds,
    targetLabel: graph.nodeMap.get(endId)?.label ?? endId,
    targetType: "end",
    toId: endId,
  });

  routeNodeIds.push(endId);
  estimatedDistanceM += finalMetrics.distanceM;
  estimatedDurationSec += finalMetrics.durationSec;

  return {
    dijkstraRuns,
    estimatedDistanceM,
    estimatedDurationSec,
    plannedLegs,
    routeNodeIds,
  };
}
