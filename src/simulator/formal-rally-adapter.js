import { ContinuousRallySimulator } from "./continuous-rally-simulator.js";
import { validateFormalRallySetup, validateFormalRallyTeams } from "./formal-rally-player-input.js";

export class FormalRallyAdapter {
  constructor({ teams, rotations = { HOME: "R1", AWAY: "R1" }, servingTeam = "HOME", seed = 1,
    parameters, fixedStep, formationLibrary, tactics = { HOME: null, AWAY: null } } = {}) {
    this.playerInput = validateFormalRallyTeams(teams);
    this.setup = validateFormalRallySetup({ rotations, servingTeam, seed });
    const options = { teams: this.playerInput.teams, rotations: this.setup.rotations,
      servingTeam: this.setup.servingTeam, seed: this.setup.seed, serveMode: "FORMAL" };
    options.tactics = Object.freeze({ HOME: tactics?.HOME ?? null, AWAY: tactics?.AWAY ?? null });
    if (parameters !== undefined) options.parameters = parameters;
    if (fixedStep !== undefined) options.fixedStep = fixedStep;
    if (formationLibrary !== undefined) options.formationLibrary = formationLibrary;
    this.simulator = new ContinuousRallySimulator(options);
  }

  start({ target = null } = {}) {
    this.simulator.launch(target);
    return this.getSnapshot();
  }

  advance(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("推進時間必須是非負有限秒數。");
    }
    return this.simulator.updateFrame(deltaSeconds);
  }

  getSnapshot() { return this.simulator.getSnapshot(); }
  getResult() { return this.simulator.rallyResult; }
  getEvents() { return Object.freeze([...this.simulator.events]); }
}

export function createFormalRallyAdapter(options) {
  return new FormalRallyAdapter(options);
}
