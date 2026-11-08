import { sampleSimulatorBall } from "./ball.js";
import { isReceiveExperimentRunning } from "./attack-assignment.js";
import { SPIKE_COURT_V1, isSpikeGroundIn } from "./spike-court.js";

export function isSpikeExperimentRunning(status) {
  return isReceiveExperimentRunning(status) || ["SPIKE_IN_FLIGHT", "SPIKE_LANDING"].includes(status);
}

const evaluate = (p, x) => p.reduceRight((value, coefficient) => value * x + coefficient, 0);
function roots(p, low, high) {
  p = [...p]; while (p.length > 1 && Math.abs(p.at(-1)) < 1e-12) p.pop();
  if (p.length === 1) return [];
  if (p.length === 2) { const x = -p[0] / p[1]; return x >= low - 1e-10 && x <= high + 1e-10 ? [Math.max(low, Math.min(high, x))] : []; }
  const critical = roots(p.slice(1).map((c, i) => c * (i + 1)), low, high);
  const cuts = [low, ...critical, high].sort((a, b) => a - b), result = [];
  for (const x of cuts) if (Math.abs(evaluate(p, x)) < 1e-6) result.push(x);
  for (let i = 1; i < cuts.length; i++) {
    let a = cuts[i - 1], b = cuts[i], fa = evaluate(p, a);
    if (fa * evaluate(p, b) >= 0) continue;
    for (let step = 0; step < 60; step++) {
      const mid = (a + b) / 2, fm = evaluate(p, mid);
      if (fa * fm <= 0) b = mid; else { a = mid; fa = fm; }
    }
    result.push((a + b) / 2);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}
function addSquare(result, p) {
  p.forEach((a, i) => p.forEach((b, j) => { result[i + j] = (result[i + j] ?? 0) + a * b; }));
}
function heightPolynomial(ball) { return [ball.start.height, ball.target.height - ball.start.height + 4 * ball.arcHeight, -4 * ball.arcHeight]; }

// 同一個 Ball 軌跡的連續掃掠球體 vs 有限球網矩形；分段多項式求第一個交點。
// 不只看步進端點，也不以擴張方框代替球體，避免高速漏判與網頂角落誤判。
export function sweepSpikeNet(ball, from, to, radius, court = SPIKE_COURT_V1) {
  const dx = ball.target.x - ball.start.x;
  if (dx >= 0) return null;
  const r = radius + court.netTolerance;
  const low = Math.max(from, (court.netX + r - ball.start.x) / dx);
  const high = Math.min(to, (court.netX - r - ball.start.x) / dx);
  if (low > high) return null;
  const h = heightPolynomial(ball), y = [ball.start.y, ball.target.y - ball.start.y];
  const cuts = [low, high];
  for (const limit of [court.bounds.minY, court.bounds.maxY]) cuts.push(...roots([y[0] - limit, y[1]], low, high));
  for (const limit of [0, court.netHeight]) cuts.push(...roots([h[0] - limit, h[1], h[2]], low, high));
  cuts.sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i], mid = (a + b) / 2, distance = [-r * r];
    addSquare(distance, [ball.start.x - court.netX, dx]);
    const ym = evaluate(y, mid), hm = evaluate(h, mid);
    if (ym < court.bounds.minY) addSquare(distance, [y[0] - court.bounds.minY, y[1]]);
    else if (ym > court.bounds.maxY) addSquare(distance, [y[0] - court.bounds.maxY, y[1]]);
    if (hm < 0) addSquare(distance, h);
    else if (hm > court.netHeight) addSquare(distance, [h[0] - court.netHeight, h[1], h[2]]);
    if (evaluate(distance, a) <= 1e-6) return a;
    const hit = roots(distance, a, b)[0];
    if (hit !== undefined) return hit;
  }
  return null;
}

export function detectSpikeTermination(ball, from, to, radius, court = SPIKE_COURT_V1) {
  const net = sweepSpikeNet(ball, from, to, radius, court);
  // 目標是地面點，但 Ball 的高度是球心高度。先接觸地面的球心高度為 radius。
  const h = heightPolynomial(ball);
  const floorRoots = roots([h[0] - radius, h[1], h[2]], from, to)
    .filter((u) => h[1] + 2 * h[2] * u <= 1e-7 && u > 1e-10);
  const ground = floorRoots[0];
  if (net !== null && (ground === undefined || net <= ground + 1e-10)) {
    return { type: "SPIKE_NET", progress: net, position: sampleSimulatorBall(ball, net * ball.duration) };
  }
  if (ground !== undefined) {
    const position = sampleSimulatorBall(ball, ground * ball.duration);
    const planeProgress = (court.netX - ball.start.x) / (ball.target.x - ball.start.x);
    const crossedPlane = ball.start.x >= court.netX && ball.target.x < court.netX && ground >= planeProgress;
    return { type: crossedPlane && isSpikeGroundIn(position, radius, court) ? "SPIKE_LANDED" : "SPIKE_OUT", progress: ground, position };
  }
  return null;
}
