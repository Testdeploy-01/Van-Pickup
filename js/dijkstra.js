/* ============================================
   Dijkstra's Algorithm
   ตาม Pseudocode ของอาจารย์ 100%
   (Greedy: เลือก vertex ที่มี dist น้อยที่สุดเสมอ)
   ============================================

   Pseudocode:
   ─────────────────────────────────────────────
   1  function Dijkstra(Graph, source):
   2    create vertex set Q
   3    for each vertex v in Graph:
   4      dist[v] ← INFINITY
   5      prev[v] ← UNDEFINED
   6      add v to Q
   7    dist[source] ← 0
   8    while Q is not empty:
   9      u ← vertex in Q with min dist[u]
   10     remove u from Q
   11     for each neighbor v of u (where v is still in Q):
   12       alt ← dist[u] + length(u, v)
   13       if alt < dist[v]:
   14         dist[v] ← alt
   15         prev[v] ← u
   16   return dist[], prev[]
   ─────────────────────────────────────────────
*/

export function runDijkstra(graph, sourceId) {                // Line 1: function Dijkstra(Graph, source)

  const Q = new Set();                                        // Line 2: create vertex set Q
  const dist = {};
  const prev = {};

  graph.nodeMap.forEach((_node, nodeId) => {                  // Line 3: for each vertex v in Graph
    dist[nodeId] = Number.POSITIVE_INFINITY;                  // Line 4: dist[v] ← INFINITY
    prev[nodeId] = null;                                      // Line 5: prev[v] ← UNDEFINED
    Q.add(nodeId);                                            // Line 6: add v to Q
  });

  dist[sourceId] = 0;                                        // Line 7: dist[source] ← 0

  while (Q.size > 0) {                                       // Line 8: while Q is not empty

    // Line 9: u ← vertex in Q with min dist[u]
    // (Greedy choice: เลือก node ที่ระยะทางน้อยที่สุดเสมอ)
    let u = null;
    let minDist = Number.POSITIVE_INFINITY;
    for (const v of Q) {
      if (dist[v] < minDist) {
        minDist = dist[v];
        u = v;
      }
    }

    if (u === null) break;                                    // ไม่มี node ที่เข้าถึงได้แล้ว

    Q.delete(u);                                              // Line 10: remove u from Q

    const neighbors = graph.adjacency.get(u) ?? [];
    for (const neighbor of neighbors) {                       // Line 11: for each neighbor v of u
      if (!Q.has(neighbor.toId)) continue;                    //          where v is still in Q

      const alt = dist[u] + neighbor.weight;                  // Line 12: alt ← dist[u] + length(u, v)

      if (alt < dist[neighbor.toId]) {                        // Line 13: if alt < dist[v]
        dist[neighbor.toId] = alt;                            // Line 14: dist[v] ← alt
        prev[neighbor.toId] = u;                              // Line 15: prev[v] ← u
      }
    }
  }

  return {                                                    // Line 16: return dist[], prev[]
    dist,
    prev,
  };
}
