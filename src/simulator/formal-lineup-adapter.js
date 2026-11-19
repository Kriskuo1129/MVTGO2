import { FORMAL_RALLY_JOBS } from "./formal-rally-player-input.js";

function clonePlayerForLineup(player) {
  return Object.freeze({ id: player.playerId, name: player.name, position: player.position,
    abilities: Object.freeze({ ...player.abilities }), mood: player.mood,
    serveType: player.serveType, avatar: player.avatar ?? null });
}

function cloneFormalPlayer(player) {
  return { ...player, abilities: { ...player.abilities } };
}

export function createFormalLineupInput(teams, { homeTeamName = "系排GO",
  awayTeamName = "測試對手", matchName = "正式模擬比賽" } = {}) {
  return Object.freeze({ matchName, homeTeamName, awayTeamName, courtId: "court-01",
    homePlayers: Object.freeze(teams.HOME.players.map(clonePlayerForLineup)),
    awayPlayers: Object.freeze(teams.AWAY.players.map(clonePlayerForLineup)),
    homeDefaultStartingLineup: Object.freeze({ ...teams.HOME.starters }),
    awayStartingLineup: Object.freeze({ ...teams.AWAY.starters }) });
}

export function applyFormalStartingLineup(teams, startingLineup) {
  if (startingLineup?.team !== "HOME") throw new RangeError("正式先發必須屬於 HOME。 ");
  const assignments = startingLineup.assignments;
  const available = new Set(teams.HOME.players.map((player) => player.playerId));
  const selected = new Set();
  for (const job of FORMAL_RALLY_JOBS) {
    const playerId = assignments?.[job];
    if (!available.has(playerId)) throw new RangeError(`${job} 的先發球員不在正式 HOME 名單。`);
    if (selected.has(playerId)) throw new RangeError("正式 HOME 先發球員不可重複。 ");
    selected.add(playerId);
  }
  return {
    HOME: { players: teams.HOME.players.map(cloneFormalPlayer), starters: { ...assignments } },
    AWAY: { players: teams.AWAY.players.map(cloneFormalPlayer), starters: { ...teams.AWAY.starters } },
  };
}
