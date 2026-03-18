export function renderComplexity(nodeCount, edgeCount, pickupCount, dijkstraRuns, prefetchedRoutes, selectedRoutes) {
  const v = Math.max(nodeCount, 1);
  const e = Math.max(edgeCount, 0);
  const k = Math.max(pickupCount, 0);
  const runs = Math.max(dijkstraRuns, 1);
  const prefetched = Math.max(prefetchedRoutes, 0);
  const selected = Math.max(selectedRoutes, 0);
  const logTerm = Number(Math.log2(v)).toFixed(2);

  const tableRows = [
    {
      line: "1",
      statement: "OSRM Table API",
      frequency: "1",
      cost: "all nodes",
      contribution: "duration + distance matrix",
    },
    {
      line: "2-3",
      statement: "initialize dist / prev",
      frequency: "V",
      cost: "1",
      contribution: "V",
    },
    {
      line: "4",
      statement: "extract-min / relax edges",
      frequency: "E",
      cost: "logV",
      contribution: "E logV",
    },
    {
      line: "5",
      statement: "Route API pre-fetch every ordered pair",
      frequency: "V(V-1)",
      cost: "Promise.all",
      contribution: `${prefetched} prefetched routes`,
    },
    {
      line: "6",
      statement: "Greedy choose next pickup",
      frequency: "k + 1",
      cost: "Dijkstra",
      contribution: "(k + 1) * O((V + E) logV)",
    },
    {
      line: "7",
      statement: "reuse pre-fetched geometry",
      frequency: "k + 1",
      cost: "lookup",
      contribution: `${selected} selected routes`,
    },
  ];

  const rowsHtml = tableRows
    .map(
      (row) => `
        <tr>
          <td>${row.line}</td>
          <td>${row.statement}</td>
          <td>${row.frequency}</td>
          <td>${row.cost}</td>
          <td>${row.contribution}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <p class="helper-text">
      กราฟปัจจุบันมี V = ${v} nodes, E = ${e} directed edges, pickup = ${k} จุด,
      Dijkstra ถูกเรียก ${runs} ครั้ง, pre-fetch Route ${prefetched} ครั้ง และใช้ geometry จริง ${selected} ช่วง (log2V = ${logTerm})
    </p>
    <table class="complexity-table">
      <thead>
        <tr>
          <th>Line</th>
          <th>Operation</th>
          <th>Frequency</th>
          <th>Cost</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="formula-box">
      <code>Table API = 1 call for duration + distance matrix</code>
      <code>Dijkstra 1 ครั้ง = O((V + E) log V)</code>
      <code>Greedy รวม = O((k + 1) * (V + E) log V)</code>
      <code>Route API pre-fetch = V(V - 1) ordered pairs in parallel</code>
      <code>After Greedy = 0 extra API calls, reuse pre-fetched geometry only</code>
    </div>
  `;
}
