import { getCourtConfig } from "../court/court-config.js";
import { createStartingLineup, validateDefaultStartingLineup } from "../lineup/starting-lineup.js";
import { createPlayer } from "../models/player.js";

function assertText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName}不可為空。`);
  }
  return value.trim();
}

function createValidatedPlayers(players, teamId) {
  if (!Array.isArray(players)) {
    throw new TypeError(`${teamId} 可出賽球員名單必須是陣列。`);
  }
  const validatedPlayers = players.map((player, index) => {
    try {
      return createPlayer(player);
    } catch (error) {
      throw new TypeError(`${teamId} 球員第 ${index + 1} 筆資料無效：${error.message}`);
    }
  });
  return Object.freeze(validatedPlayers);
}

function assertUniquePlayerIds(homePlayers, awayPlayers) {
  const allPlayerIds = [...homePlayers, ...awayPlayers].map((player) => player.id);
  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    throw new Error("HOME／AWAY 球員 ID 不可重複。");
  }
}

export function createPregameMatchInput({
  matchName,
  homeTeamName,
  awayTeamName,
  courtId,
  homePlayers,
  awayPlayers,
  homeDefaultStartingLineup = null,
  awayStartingLineup,
}) {
  const normalizedMatchName = assertText(matchName, "比賽名稱");
  const normalizedHomeTeamName = assertText(homeTeamName, "HOME 球隊名稱");
  const normalizedAwayTeamName = assertText(awayTeamName, "AWAY 球隊名稱");
  getCourtConfig(courtId);

  const validatedHomePlayers = createValidatedPlayers(homePlayers, "HOME");
  const validatedAwayPlayers = createValidatedPlayers(awayPlayers, "AWAY");
  if (validatedHomePlayers.length < 6) {
    throw new Error("HOME 至少需要六名可出賽球員。");
  }
  if (validatedAwayPlayers.length !== 6) {
    throw new Error("AWAY 正式比賽資料必須提供六名球員。");
  }
  assertUniquePlayerIds(validatedHomePlayers, validatedAwayPlayers);

  const validatedHomeDefault = homeDefaultStartingLineup === null
    ? null
    : Object.freeze(validateDefaultStartingLineup(
      homeDefaultStartingLineup,
      validatedHomePlayers,
    ));
  const validatedAwayStartingLineup = createStartingLineup(
    awayStartingLineup,
    validatedAwayPlayers,
    "AWAY",
  );

  return Object.freeze({
    matchName: normalizedMatchName,
    homeTeamName: normalizedHomeTeamName,
    awayTeamName: normalizedAwayTeamName,
    courtId,
    homePlayers: validatedHomePlayers,
    awayPlayers: validatedAwayPlayers,
    homeDefaultStartingLineup: validatedHomeDefault,
    awayStartingLineup: validatedAwayStartingLineup,
  });
}
