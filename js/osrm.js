const NEAREST_BASE_URL = "https://router.project-osrm.org/nearest/v1/driving";
const TABLE_BASE_URL = "https://router.project-osrm.org/table/v1/driving";
const ROUTE_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const REQUEST_TIMEOUT_MS = 15000;
const NEAREST_RETRY_COUNT = 1;
const TABLE_RETRY_COUNT = 1;
const ROUTE_RETRY_COUNT = 1;
const ROUTE_PREFETCH_CONCURRENCY = 6;

function rawPointKey(point) {
  return `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
}

function nodeRoutingKey(node) {
  if (node.snapKey) {
    return node.snapKey;
  }

  return `${node.lng.toFixed(6)},${node.lat.toFixed(6)}`;
}

function routePairKey(fromNode, toNode) {
  return `${nodeRoutingKey(fromNode)}->${nodeRoutingKey(toNode)}`;
}

function tableKey(anchorNodes) {
  return anchorNodes.map((node) => node.snapKey ?? `${node.lng.toFixed(6)},${node.lat.toFixed(6)}`).join("|");
}

function coordinateList(nodes) {
  return nodes.map((node) => `${node.lng},${node.lat}`).join(";");
}

function createTimeoutController() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return {
    controller,
    clear() {
      window.clearTimeout(timeoutId);
    },
  };
}

async function requestJson(url) {
  const { controller, clear } = createTimeoutController();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OSRM HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clear();
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function normalizeError(error) {
  if (!error) {
    return "unknown error";
  }

  return error.name === "AbortError" ? "OSRM timeout" : error.message;
}

function normalizeMatrix(matrix, expectedSize, matrixName) {
  if (!Array.isArray(matrix) || matrix.length !== expectedSize) {
    throw new Error(`OSRM returned an invalid ${matrixName} matrix`);
  }

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== expectedSize) {
      throw new Error(`OSRM returned an invalid ${matrixName} row at index ${rowIndex}`);
    }

    return row.map((value, columnIndex) => {
      if (rowIndex === columnIndex) {
        return 0;
      }

      return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
    });
  });
}

async function runWithConcurrency(items, worker, concurrencyLimit) {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.min(concurrencyLimit, items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

async function fetchNearestPayload(url, retryCount) {
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;

      if (attempt < retryCount) {
        await sleep(300 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

async function fetchRouteGeometry(fromNode, toNode) {
  const url = `${ROUTE_BASE_URL}/${fromNode.lng},${fromNode.lat};${toNode.lng},${toNode.lat}?overview=full&geometries=geojson`;
  let lastError = null;

  for (let attempt = 0; attempt <= ROUTE_RETRY_COUNT; attempt += 1) {
    try {
      const payload = await requestJson(url);
      const route = payload.routes?.[0];

      if (!route) {
        throw new Error("OSRM returned no route geometry");
      }

      return {
        distanceM: route.distance ?? 0,
        durationSec: route.duration ?? 0,
        geometry: route.geometry?.coordinates ?? [],
      };
    } catch (error) {
      lastError = error;

      if (attempt < ROUTE_RETRY_COUNT) {
        await sleep(300 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function createRouteTask(fromNode, toNode, routeCache, routeTaskCache) {
  const key = routePairKey(fromNode, toNode);

  if (routeCache.has(key)) {
    return Promise.resolve(routeCache.get(key));
  }

  if (routeTaskCache.has(key)) {
    return routeTaskCache.get(key);
  }

  const task = fetchRouteGeometry(fromNode, toNode)
    .then((route) => {
      routeCache.set(key, route);
      return route;
    })
    .catch((error) => {
      routeTaskCache.delete(key);
      throw new Error(`Route API failed: ${fromNode.label} -> ${toNode.label} (${normalizeError(error)})`);
    });

  routeTaskCache.set(key, task);
  return task;
}

function buildRoutePairs(anchorNodes) {
  const pairs = [];

  anchorNodes.forEach((fromNode) => {
    anchorNodes.forEach((toNode) => {
      if (fromNode.id === toNode.id) {
        return;
      }

      pairs.push({
        fromNode,
        key: routePairKey(fromNode, toNode),
        toNode,
      });
    });
  });

  return pairs;
}

async function buildTableDataFromRoutes(anchorNodes, routeCache, routeTaskCache, { onProgress } = {}) {
  const pairs = buildRoutePairs(anchorNodes);
  const total = pairs.length;
  const distanceMatrix = Array.from({ length: anchorNodes.length }, (_, rowIndex) =>
    Array.from({ length: anchorNodes.length }, (_, columnIndex) =>
      rowIndex === columnIndex ? 0 : Number.POSITIVE_INFINITY,
    ),
  );
  const durationMatrix = Array.from({ length: anchorNodes.length }, (_, rowIndex) =>
    Array.from({ length: anchorNodes.length }, (_, columnIndex) =>
      rowIndex === columnIndex ? 0 : Number.POSITIVE_INFINITY,
    ),
  );
  const indexByNodeId = new Map(anchorNodes.map((node, index) => [node.id, index]));

  if (total === 0) {
    return {
      distanceMatrix,
      durationMatrix,
      source: "route-fallback",
    };
  }

  let done = 0;
  await runWithConcurrency(pairs, async ({ fromNode, toNode }) => {
    const route = await createRouteTask(fromNode, toNode, routeCache, routeTaskCache);
    const fromIndex = indexByNodeId.get(fromNode.id);
    const toIndex = indexByNodeId.get(toNode.id);

    durationMatrix[fromIndex][toIndex] = route.durationSec;
    distanceMatrix[fromIndex][toIndex] = route.distanceM;
    done += 1;

    onProgress?.({
      cached: false,
      currentPair: `${fromNode.label} -> ${toNode.label}`,
      done,
      phase: "table-fallback",
      total,
    });
  }, ROUTE_PREFETCH_CONCURRENCY);

  return {
    distanceMatrix,
    durationMatrix,
    source: "route-fallback",
  };
}

export async function resolveNearestPoint(rawPoint, nearestCache) {
  const key = rawPointKey(rawPoint);
  if (nearestCache.has(key)) {
    const cached = nearestCache.get(key);
    return {
      ...cached,
      nearestNodes: [...cached.nearestNodes],
    };
  }

  const url = `${NEAREST_BASE_URL}/${rawPoint.lng},${rawPoint.lat}?number=1`;

  try {
    const payload = await fetchNearestPayload(url, NEAREST_RETRY_COUNT);
    const waypoint = payload.waypoints?.[0];

    if (!waypoint) {
      throw new Error("OSRM returned no nearest waypoint");
    }

    const resolved = {
      lat: waypoint.location[1],
      lng: waypoint.location[0],
      nearestNodes: waypoint.nodes ?? [],
      nearestName: waypoint.name ?? "",
      snapKey: `${waypoint.location[0].toFixed(6)},${waypoint.location[1].toFixed(6)}`,
    };

    nearestCache.set(key, resolved);
    return {
      ...resolved,
      nearestNodes: [...resolved.nearestNodes],
    };
  } catch (error) {
    throw new Error(`Could not resolve nearest road point (${normalizeError(error)})`);
  }
}

export async function hydrateTableData(anchorNodes, tableCache, routeCache, routeTaskCache, { onProgress } = {}) {
  const key = tableKey(anchorNodes);

  if (tableCache.has(key)) {
    onProgress?.({
      cached: true,
      done: 1,
      phase: "table",
      total: 1,
    });
    return tableCache.get(key);
  }

  onProgress?.({
    cached: false,
    done: 0,
    phase: "table",
    total: 1,
  });

  let lastError = null;

  for (let attempt = 0; attempt <= TABLE_RETRY_COUNT; attempt += 1) {
    try {
      const url = `${TABLE_BASE_URL}/${coordinateList(anchorNodes)}?annotations=duration,distance`;
      const payload = await requestJson(url);
      const tableData = {
        distanceMatrix: normalizeMatrix(payload.distances, anchorNodes.length, "distance"),
        durationMatrix: normalizeMatrix(payload.durations, anchorNodes.length, "duration"),
        source: "table",
      };

      tableCache.set(key, tableData);
      onProgress?.({
        cached: false,
        done: 1,
        phase: "table",
        total: 1,
      });
      return tableData;
    } catch (error) {
      lastError = error;

      if (attempt < TABLE_RETRY_COUNT) {
        await sleep(450 * (attempt + 1));
      }
    }
  }

  onProgress?.({
    cached: false,
    detail: normalizeError(lastError),
    done: 0,
    phase: "table-fallback",
    total: anchorNodes.length * Math.max(anchorNodes.length - 1, 0),
  });

  try {
    const tableData = await buildTableDataFromRoutes(anchorNodes, routeCache, routeTaskCache, {
      onProgress,
    });
    tableCache.set(key, tableData);
    return tableData;
  } catch (error) {
    throw new Error(
      `Table API failed (${normalizeError(lastError)}) and route-matrix fallback failed (${normalizeError(error)})`,
    );
  }
}

export function buildDurationGraph(anchorNodes, tableData) {
  const adjacency = new Map();
  const edgeMap = new Map();
  const nodeMap = new Map();

  anchorNodes.forEach((anchorNode, fromIndex) => {
    nodeMap.set(anchorNode.id, {
      ...anchorNode,
      matrixIndex: fromIndex,
    });

    const neighbors = [];

    anchorNodes.forEach((targetNode, toIndex) => {
      if (fromIndex === toIndex) {
        return;
      }

      const durationSec = tableData.durationMatrix[fromIndex]?.[toIndex];
      const distanceM = tableData.distanceMatrix[fromIndex]?.[toIndex];
      if (!Number.isFinite(durationSec)) {
        return;
      }

      const edge = {
        distanceM: Number.isFinite(distanceM) ? distanceM : 0,
        durationSec,
        fromId: anchorNode.id,
        toId: targetNode.id,
      };

      edgeMap.set(`${anchorNode.id}->${targetNode.id}`, edge);
      neighbors.push({
        toId: targetNode.id,
        weight: durationSec,
      });
    });

    adjacency.set(anchorNode.id, neighbors);
  });

  return {
    adjacency,
    edgeMap,
    nodeMap,
    tableData,
  };
}

export function prefetchRouteGeometries(anchorNodes, routeCache, routeTaskCache, { onProgress } = {}) {
  const pairs = buildRoutePairs(anchorNodes);
  const total = pairs.length;

  if (total === 0) {
    onProgress?.({
      cached: true,
      done: 0,
      total: 0,
    });
    return Promise.resolve({
      failedPairs: 0,
      prefetchedPairs: 0,
      totalPairs: 0,
    });
  }

  let done = 0;
  let failed = 0;

  return runWithConcurrency(
    pairs,
    async ({ fromNode, key, toNode }) => {
      const cached = routeCache.has(key);

      try {
        await createRouteTask(fromNode, toNode, routeCache, routeTaskCache);
        done += 1;

        onProgress?.({
          cached,
          currentPair: `${fromNode.label} -> ${toNode.label}`,
          done,
          failed,
          total,
        });
      } catch (_error) {
        failed += 1;
        done += 1;

        onProgress?.({
          cached: false,
          currentPair: `${fromNode.label} -> ${toNode.label}`,
          done,
          failed,
          total,
        });
      }
    },
    ROUTE_PREFETCH_CONCURRENCY,
  ).then(() => ({
    failedPairs: failed,
    prefetchedPairs: total - failed,
    totalPairs: total,
  }));
}

export async function collectPrefetchedRouteSegments(
  routeNodeIds,
  graph,
  routeCache,
  routeTaskCache,
  { onProgress } = {},
) {
  const pairs = [];

  for (let index = 0; index < routeNodeIds.length - 1; index += 1) {
    const fromId = routeNodeIds[index];
    const toId = routeNodeIds[index + 1];
    const fromNode = graph.nodeMap.get(fromId);
    const toNode = graph.nodeMap.get(toId);

    if (!fromNode || !toNode) {
      throw new Error(`Missing node metadata for route segment ${fromId} -> ${toId}`);
    }

    pairs.push({
      fromId,
      fromNode,
      key: routePairKey(fromNode, toNode),
      toId,
      toNode,
    });
  }

  const total = pairs.length;
  if (total === 0) {
    onProgress?.({
      done: 0,
      total: 0,
    });
    return [];
  }

  let done = 0;
  const segments = [];

  for (const pair of pairs) {
    let route =
      routeCache.get(pair.key) ??
      (routeTaskCache.has(pair.key) ? await routeTaskCache.get(pair.key).catch(() => null) : null);

    if (!route) {
      route = await createRouteTask(pair.fromNode, pair.toNode, routeCache, routeTaskCache).catch((error) => {
        throw new Error(`Could not load selected geometry ${pair.fromNode.label} -> ${pair.toNode.label} (${normalizeError(error)})`);
      });
    }

    done += 1;
    onProgress?.({
      currentPair: `${pair.fromNode.label} -> ${pair.toNode.label}`,
      done,
      total,
    });

    segments.push({
      distanceM: route.distanceM,
      durationSec: route.durationSec,
      fromId: pair.fromId,
      geometry: route.geometry,
      pathNodeIds: [pair.fromId, pair.toId],
      targetColorIndex: pair.toNode.colorIndex ?? null,
      targetLabel: pair.toNode.label,
      targetType: pair.toNode.type,
      toId: pair.toId,
    });
  }

  return segments;
}
