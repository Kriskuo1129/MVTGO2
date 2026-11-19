const ability = (attack, block, set, receive, serve) => Object.freeze({
  attack, block, set, receive, serve,
});

function player(playerId, name, position, abilities, mood, serveType) {
  return Object.freeze({ playerId, name, position, abilities, mood, serveType, avatar: null });
}

const HOME_PLAYERS = Object.freeze([
  player("HOME-S-1", "林語晴", "S", ability(62, 48, 94, 76, 72), 4, "跳飄"),
  player("HOME-OH1-1", "陳思妤", "OH", ability(92, 76, 58, 86, 88), 5, "跳發"),
  player("HOME-MB1-1", "王若庭", "MB", ability(84, 93, 50, 61, 65), 4, "跳飄"),
  player("HOME-OP-1", "張庭瑄", "OP", ability(96, 79, 47, 58, 91), 3, "跳發"),
  player("HOME-OH2-1", "李佳穎", "OH", ability(78, 68, 55, 91, 76), 4, "跳飄"),
  player("HOME-MB2-1", "黃筱雯", "MB", ability(73, 86, 46, 66, 57), 3, "一般"),
  player("HOME-S-2", "周以安", "S", ability(48, 42, 78, 65, 60), 3, "一般"),
  player("HOME-OH-3", "楊芷涵", "OH", ability(86, 66, 52, 74, 81), 4, "跳發"),
  player("HOME-MB-3", "許文馨", "MB", ability(67, 82, 44, 55, 49), 2, "一般"),
  player("HOME-OP-2", "蔡雨潔", "OP", ability(81, 63, 45, 52, 84), 3, "跳發"),
  player("HOME-OH-4", "鄭雅筑", "OH", ability(69, 59, 49, 79, 68), 3, "跳飄"),
  player("HOME-MB-4", "吳品萱", "MB", ability(55, 71, 41, 46, 44), 2, "一般"),
]);

const AWAY_PLAYERS = Object.freeze([
  player("AWAY-S-1", "AWAY S", "S", ability(57, 45, 88, 72, 70), 3, "跳飄"),
  player("AWAY-OH1-1", "AWAY OH1", "OH", ability(89, 71, 53, 84, 86), 4, "跳發"),
  player("AWAY-MB1-1", "AWAY MB1", "MB", ability(79, 90, 43, 59, 55), 4, "一般"),
  player("AWAY-OP-1", "AWAY OP", "OP", ability(91, 75, 46, 54, 92), 3, "跳發"),
  player("AWAY-OH2-1", "AWAY OH2", "OH", ability(75, 64, 51, 87, 73), 3, "跳飄"),
  player("AWAY-MB2-1", "AWAY MB2", "MB", ability(64, 84, 42, 62, 48), 3, "一般"),
]);

const HOME_STARTERS = Object.freeze({ S: "HOME-S-1", OH1: "HOME-OH1-1",
  MB1: "HOME-MB1-1", OP: "HOME-OP-1", OH2: "HOME-OH2-1", MB2: "HOME-MB2-1" });
const AWAY_STARTERS = Object.freeze({ S: "AWAY-S-1", OH1: "AWAY-OH1-1",
  MB1: "AWAY-MB1-1", OP: "AWAY-OP-1", OH2: "AWAY-OH2-1", MB2: "AWAY-MB2-1" });

export const FORMAL_MATCH_DEMO_SEED = 20261119;

export function createFormalMatchTestTeams() {
  return {
    HOME: { players: HOME_PLAYERS.map((entry) => ({ ...entry, abilities: { ...entry.abilities } })),
      starters: { ...HOME_STARTERS } },
    AWAY: { players: AWAY_PLAYERS.map((entry) => ({ ...entry, abilities: { ...entry.abilities } })),
      starters: { ...AWAY_STARTERS } },
  };
}
