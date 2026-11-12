import { ContinuousRallySimulator, RALLY_TEAMS } from "./continuous-rally-simulator.js";

export const CONTINUOUS_RALLY_INTERMISSION = 0.8;

export class ContinuousRallySession {
  constructor({ simulator = new ContinuousRallySimulator(), baseSeed = 1,
    intermissionDuration = CONTINUOUS_RALLY_INTERMISSION } = {}) {
    this.simulator = simulator;
    this.baseSeed = baseSeed >>> 0;
    this.intermissionDuration = intermissionDuration;
    this.active = false;
    this.resetSessionState();
  }

  resetSessionState() {
    this.scores = { HOME: 0, AWAY: 0 };
    this.rallyNumber = 0;
    this.servingTeam = RALLY_TEAMS.HOME;
    this.settledRallyNumber = null;
    this.intermissionRemaining = 0;
    this.results = [];
    this.serveOptions = {};
  }

  seedForRally(number) {
    return (this.baseSeed + Math.imul(number - 1, 0x9e3779b9)) >>> 0;
  }

  start({ firstServingTeam = RALLY_TEAMS.HOME, serveType = null,
    serveAbility = null, serverPlayerId = null } = {}) {
    if (!Object.values(RALLY_TEAMS).includes(firstServingTeam)) throw new RangeError("首球發球方必須為 HOME 或 AWAY。");
    this.resetSessionState();
    this.active = true;
    this.servingTeam = firstServingTeam;
    this.serveOptions = { serveType, serveAbility, serverPlayerId };
    this.startNextRally();
    return this.getSnapshot();
  }

  stop() { this.active = false; return this.getSnapshot(); }
  resume() { this.active = true; return this.getSnapshot(); }
  restart(options = {}) { return this.start(options); }

  startNextRally() {
    this.rallyNumber += 1;
    this.settledRallyNumber = null;
    this.intermissionRemaining = 0;
    this.simulator.seed = this.seedForRally(this.rallyNumber);
    this.simulator.configureServe({ servingTeam: this.servingTeam,
      serverPlayerId: this.serveOptions.serverPlayerId,
      ability: this.serveOptions.serveAbility, serveType: this.serveOptions.serveType });
    this.simulator.launch(null);
  }

  settleEndedRally() {
    if (this.simulator.status !== "ENDED" || this.settledRallyNumber === this.rallyNumber) return false;
    const result = this.simulator.rallyResult;
    if (!Object.values(RALLY_TEAMS).includes(result?.scoringTeam)) throw new Error("Rally 結束但缺少合法得分方。");
    this.scores[result.scoringTeam] += 1;
    this.servingTeam = result.scoringTeam;
    this.settledRallyNumber = this.rallyNumber;
    this.intermissionRemaining = this.intermissionDuration;
    this.results.push(Object.freeze({ rallyNumber: this.rallyNumber,
      seed: this.seedForRally(this.rallyNumber), servingTeam: this.simulator.serveResolution?.team
        ?? this.simulator.serveConfiguration.servingTeam,
      scoringTeam: result.scoringTeam, reason: result.reason }));
    return true;
  }

  updateFrame(deltaSeconds) {
    if (!this.active) return this.getSnapshot();
    if (this.simulator.status !== "ENDED") this.simulator.updateFrame(deltaSeconds);
    if (this.simulator.status === "ENDED") {
      this.settleEndedRally();
      this.intermissionRemaining = Math.max(0, this.intermissionRemaining - deltaSeconds);
      if (this.intermissionRemaining <= 0 && this.active) this.startNextRally();
    }
    return this.getSnapshot();
  }

  getSnapshot() {
    const snapshot = this.simulator.getSnapshot();
    const betweenRallies = this.active && this.settledRallyNumber === this.rallyNumber
      && this.intermissionRemaining > 0;
    return Object.freeze({ ...snapshot, status: betweenRallies ? "FINISHING" : snapshot.status,
      session: Object.freeze({ active: this.active, rallyNumber: this.rallyNumber,
        servingTeam: this.servingTeam, scores: Object.freeze({ ...this.scores }),
        settled: this.settledRallyNumber === this.rallyNumber,
        intermissionRemaining: this.intermissionRemaining,
        results: Object.freeze([...this.results]) }) });
  }
}
