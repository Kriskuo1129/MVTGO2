import { FORMAL_RALLY_JOBS, validateFormalPlayerRecord,
  validateFormalRallyTeams } from "./formal-rally-player-input.js";

const TEAMS = Object.freeze(["HOME", "AWAY"]);

function normalizeLegacyTeams(input) {
  if (!Array.isArray(input?.HOME) || !Array.isArray(input?.AWAY)) return null;
  validateFormalRallyTeams(input);
  return Object.fromEntries(TEAMS.map((team) => [team, {
    legacy: true,
    players: input[team],
    starters: Object.freeze(Object.fromEntries(input[team].map((player) => [player.job, player.playerId]))),
  }]));
}

function validateTeamDefinition(team, definition, allIds) {
  if (!definition || !Array.isArray(definition.players) || !definition.starters) {
    throw new TypeError(`${team} 正式名單需要 players 與 starters。`);
  }
  const minimum = team === "HOME" ? 7 : 6;
  const maximum = team === "HOME" ? 30 : 6;
  if (definition.players.length < minimum || definition.players.length > maximum) {
    throw new RangeError(`${team} 可出賽球員數必須是 ${minimum}～${maximum}。`);
  }
  const players = definition.players.map((entry, index) => validateFormalPlayerRecord(entry,
    { team, index, allIds, requireJob: false }));
  const byId = new Map(players.map((player) => [player.playerId, player]));
  const starters = {};
  for (const job of FORMAL_RALLY_JOBS) {
    const id = definition.starters[job];
    if (!byId.has(id)) throw new RangeError(`${team}.${job} 先發球員不存在：${id}`);
    if (Object.values(starters).includes(id)) throw new RangeError(`${team} 先發球員不可重複：${id}`);
    starters[job] = id;
  }
  return Object.freeze({ legacy: false, players: Object.freeze(players),
    starters: Object.freeze(starters) });
}

export class FormalMatchRoster {
  constructor(input) {
    const legacy = normalizeLegacyTeams(input);
    if (legacy) {
      this.definitions = Object.freeze(Object.fromEntries(TEAMS.map((team) => [team,
        Object.freeze({ legacy: true,
          players: Object.freeze(legacy[team].players.map((player) => Object.freeze({ ...player }))),
          starters: legacy[team].starters })])));
    } else {
      const ids = new Set();
      this.definitions = Object.freeze(Object.fromEntries(TEAMS.map((team) => [team,
        validateTeamDefinition(team, input?.[team], ids)])));
    }
    this.resetSet();
  }

  resetSet() {
    this.active = Object.fromEntries(TEAMS.map((team) => [team,
      { ...this.definitions[team].starters }]));
    this.substitutionCount = { HOME: 0, AWAY: 0 };
    this.pairs = new Map();
    this.reversePairs = new Map();
    this.returnedStarters = new Set();
  }

  player(team, playerId) {
    return this.definitions[team]?.players.find((entry) => entry.playerId === playerId) ?? null;
  }

  substitute({ team, job, playerInId }) {
    if (team !== "HOME") throw new Error("AWAY 為固定六人，不允許換人。");
    if (!FORMAL_RALLY_JOBS.includes(job)) throw new RangeError("換人 Job 不合法。 ");
    if (this.substitutionCount.HOME >= 6) throw new Error("本局 HOME 已達六次換人上限。");
    const incoming = this.player(team, playerInId);
    if (!incoming) throw new RangeError(`找不到替補球員：${playerInId}`);
    if (Object.values(this.active.HOME).includes(playerInId)) throw new Error("球員已在場上。");
    const outgoingId = this.active.HOME[job];
    const starterId = this.definitions.HOME.starters[job];
    if (outgoingId === starterId) {
      const paired = this.pairs.get(starterId);
      if (paired && paired !== playerInId) throw new Error("先發球員只能使用原換人配對。");
      if (this.reversePairs.has(playerInId) && this.reversePairs.get(playerInId) !== starterId) {
        throw new Error("替補球員已與其他先發配對。");
      }
      if (this.returnedStarters.has(starterId)) throw new Error("先發球員回場後不得再次被換下。");
      this.pairs.set(starterId, playerInId);
      this.reversePairs.set(playerInId, starterId);
    } else {
      const pairedStarter = this.reversePairs.get(outgoingId);
      if (pairedStarter !== playerInId || playerInId !== starterId) {
        throw new Error("替補退場時只能由原配對先發球員回場。");
      }
      if (this.returnedStarters.has(starterId)) throw new Error("先發球員每局只能回場一次。");
      this.returnedStarters.add(starterId);
    }
    this.active.HOME[job] = playerInId;
    this.substitutionCount.HOME += 1;
    return Object.freeze({ team, job, playerOutId: outgoingId, playerInId,
      count: this.substitutionCount.HOME });
  }

  getActiveTeams({ morale = { HOME: 30, AWAY: 30 } } = {}) {
    return Object.freeze(Object.fromEntries(TEAMS.map((team) => [team,
      Object.freeze(FORMAL_RALLY_JOBS.map((job) => {
        const player = this.player(team, this.active[team][job]);
        return Object.freeze({ ...player, job, morale: morale[team], simulationOverrides: null });
      }))])));
  }

  getSnapshot() {
    return Object.freeze({ active: Object.freeze(Object.fromEntries(TEAMS.map((team) =>
      [team, Object.freeze({ ...this.active[team] })]))),
    starters: Object.freeze(Object.fromEntries(TEAMS.map((team) =>
      [team, this.definitions[team].starters]))),
    substitutionCount: Object.freeze({ ...this.substitutionCount }),
    homePlayers: this.definitions.HOME.players,
    awayPlayers: this.definitions.AWAY.players });
  }
}

export function createFormalMatchRoster(input) { return new FormalMatchRoster(input); }
