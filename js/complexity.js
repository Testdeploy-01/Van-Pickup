function renderDijkstraTheory() {
  return `
    <div class="theory-section">
      <h3 class="theory-title">ขั้นตอนวิธี Dijkstra's Algorithm</h3>

      <div class="theory-block">
        <h4 class="theory-subtitle">ความหมาย</h4>
        <p>เป็นขั้นตอนวิธีสำหรับหา <strong>เส้นทางที่สั้นที่สุด (Shortest Path)</strong> จาก Node ต้นทางไปยัง Node ปลายทางทุกตัวในกราฟ โดยยังอยู่ในกลุ่ม Greedy Algorithm</p>
      </div>

      <div class="theory-block">
        <h4 class="theory-subtitle">เงื่อนไขของกราฟที่ใช้ได้</h4>
        <ul class="theory-conditions">
          <li>ต้องเป็น <strong>กราฟมีทิศทาง</strong> (Directed Graph)</li>
          <li>ต้องเป็น <strong>กราฟมีน้ำหนัก</strong> (Weighted Graph)</li>
          <li>น้ำหนักต้องเป็น <strong>ค่าบวกเท่านั้น</strong> (ไม่รองรับ Negative Weight)</li>
        </ul>
      </div>

      <div class="theory-block">
        <h4 class="theory-subtitle">Pseudocode</h4>
        <pre class="theory-pseudocode"><code>function Dijkstra(Graph, source):
  create vertex set Q
  for each vertex v in Graph:
      dist[v] = INFINITY           // ระยะห่างเริ่มต้น = อนันต์
      prev[v] = UNDEFINED          // ไม่มี Node ก่อนหน้า
      add v to Q
  dist[source] = 0                 // ระยะจาก source ถึงตัวเอง = 0

  while Q is not empty:
      u = vertex in Q with min dist[u]   // เลือก Node ที่ใกล้สุด
      remove u from Q
      for each neighbor v of u:          // ตรวจเพื่อนบ้านทุกตัว
          alt = dist[u] + length(u, v)
          if alt &lt; dist[v]:              // ถ้าเส้นทางใหม่สั้นกว่า
              dist[v] = alt              // อัปเดตระยะทาง
              prev[v] = u               // อัปเดต Node ก่อนหน้า
  return dist[], prev[]</code></pre>
      </div>

      <div class="theory-block">
        <h4 class="theory-subtitle">ตัวอย่างการทำงาน (กราฟ s, a, b, c, d)</h4>
        <p class="theory-graph-desc">กราฟ Input: s→b(7), s→a(2), a→b(3), b→a(2), b→c(1), a→d(5), b→d(4), c→d(5), d←c(8)</p>
        <table class="complexity-table theory-example-table">
          <thead>
            <tr>
              <th>รอบ</th>
              <th>Node ที่ Visited</th>
              <th>dist[s]</th>
              <th>dist[a]</th>
              <th>dist[b]</th>
              <th>dist[c]</th>
              <th>dist[d]</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>เริ่ม</td><td>s</td><td>0</td><td>∞</td><td>∞</td><td>∞</td><td>∞</td></tr>
            <tr><td>1</td><td>s</td><td>0</td><td>2</td><td>7</td><td>∞</td><td>∞</td></tr>
            <tr><td>2</td><td>a</td><td>0</td><td>2</td><td>5</td><td>∞</td><td>7</td></tr>
            <tr><td>3</td><td>b</td><td>0</td><td>2</td><td>5</td><td>6</td><td>7</td></tr>
            <tr><td>4</td><td>c</td><td>0</td><td>2</td><td>5</td><td>6</td><td>7</td></tr>
            <tr><td>5</td><td>d</td><td>0</td><td>2</td><td>5</td><td>6</td><td>7</td></tr>
          </tbody>
        </table>
        <div class="formula-box">
          <code>เส้นทางที่สั้นที่สุดจาก s:</code>
          <code>s → a = 2</code>
          <code>s → a → b = 5</code>
          <code>s → a → b → c = 6</code>
          <code>s → a → d = 7</code>
        </div>
      </div>
    </div>
  `;
}

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
    ${renderDijkstraTheory()}

    <hr class="theory-divider">

    <h3 class="theory-title">ผลการวิเคราะห์ในแอปนี้</h3>
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
