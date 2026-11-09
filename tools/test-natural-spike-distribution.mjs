await import("./test-attack-resolution.mjs");
/* Phase 2D-E1 的舊品質統計已由 Phase 2D-F 威力／穩定統計取代。

const qualities = ["NORMAL", "GOOD", "BAD"];
const start = Object.freeze({ x: 1213.25, y: 450, height: 240 });
const radius = 32.5;
const report = {};

for (const quality of qualities) {
  const points = [], speedCounts = Object.fromEntries(Object.values(SPIKE_SPEED_LEVELS).map((level) => [level, 0]));
  let net = 0, inside = 0, outside = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const qualitySalt = quality === "GOOD" ? 0x6d2b79f5 : quality === "BAD" ? 0x9e3779b9 : 0x85ebca6b;
    const random = createSeededRandom((Math.imul(seed + 1, 2654435761) ^ qualitySalt) >>> 0);
    const speedLevel = resolveSpikeSpeedLevel(quality, random);
    speedCounts[speedLevel]++;
    const launch = createNaturalSpikeLaunch({ start, quality, speedLevel, random });
    const trajectory = createNaturalPredictionBall(start, launch.velocity, radius);
    const point = trajectory.target;
    const netHit = sweepSpikeNet(trajectory, 0, 1, radius, SPIKE_COURT_V1) !== null;
    if (netHit) net++;
    else if (isSpikeGroundIn(point, radius, SPIKE_COURT_V1)) inside++;
    else outside++;
    points.push(point);
  }
  const values = (key) => points.map((point) => point[key]);
  const mean = (items) => items.reduce((sum, value) => sum + value, 0) / items.length;
  report[quality] = {
    samples: points.length,
    xRange: [Math.min(...values("x")), Math.max(...values("x"))],
    yRange: [Math.min(...values("y")), Math.max(...values("y"))],
    mean: { x: mean(values("x")), y: mean(values("y")) },
    rates: { net: net / 10, in: inside / 10, out: outside / 10 },
    speedCounts,
  };
  assert.ok(report[quality].xRange[1] - report[quality].xRange[0] > 100);
  assert.ok(report[quality].yRange[1] - report[quality].yRange[0] > 60);
  assert.equal(net + inside + outside, 1000);
}

console.log(JSON.stringify(report, null, 2));
assert.ok(report.GOOD.mean.x > report.NORMAL.mean.x, "GOOD 應較偏中前場（更靠近球網、X 較大）");
assert.ok(report.BAD.rates.net > report.NORMAL.rates.net, "BAD 應較容易掛網，但不強制掛網");
assert.ok(report.BAD.rates.net < 100);
assert.notEqual(createAutoAttackSeed(), createAutoAttackSeed());

// 梯形邊界：中央界內；同一 Y 在斜邊外必須界外，球體略壓線仍可算界內。
assert.equal(isSpikeGroundIn({ x: 800, y: 500 }, radius), true);
assert.equal(isSpikeGroundIn({ x: 500, y: 500 }, radius), false);
assert.equal(isSpikeGroundIn({ x: 560, y: 500 }, radius), true);
assert.equal(isSpikeGroundIn({ x: 800, y: 220 }, radius), false);

console.log("PASS: 3×1000 parameter/ballistic samples; AUTO seeds differ; same-quality spread; calibrated trapezoid boundary; quality tendencies; no forced final landing.");
*/
