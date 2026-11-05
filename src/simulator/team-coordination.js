import { predictReachableContact } from "./player-agent.js";

export const PLAYER_POSITIONS = Object.freeze({
  S: "S",
  OH1: "OH1",
  OH2: "OH2",
  MB1: "MB1",
  MB2: "MB2",
  OP: "OP",
  L: "L",
});

export const SET_CANDIDATE_PRIORITY = Object.freeze([
  PLAYER_POSITIONS.S,
  PLAYER_POSITIONS.L,
  "OTHER",
]);

export function getSetCandidatePriority(position) {
  const index = SET_CANDIDATE_PRIORITY.indexOf(position);
  return index === -1 ? SET_CANDIDATE_PRIORITY.indexOf("OTHER") : index;
}

function compareCandidates(left, right) {
  if (left.prediction.reachable !== right.prediction.reachable) {
    return left.prediction.reachable ? -1 : 1;
  }
  if (left.prediction.reachable) {
    return left.prediction.interceptTime - right.prediction.interceptTime
      || left.prediction.travelDistance - right.prediction.travelDistance;
  }
  return left.prediction.deficit - right.prediction.deficit
    || left.prediction.interceptTime - right.prediction.interceptTime;
}

export function assignPrimaryReceiver({
  ball,
  players,
  contactRange,
  contactAnchorDistance,
  maximumContactHeight,
  sampleStep,
  isCandidateEligible = () => true,
}) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new RangeError("接球責任分配至少需要一名球員。");
  }
  const candidates = players.filter(isCandidateEligible).map((player) => ({
    player,
    prediction: predictReachableContact({
      ball,
      player,
      contactRange,
      contactAnchorDistance,
      maximumContactHeight,
      sampleStep,
    }),
  }));
  if (candidates.length === 0) return null;
  candidates.sort(compareCandidates);
  const selected = candidates[0];
  return Object.freeze({
    playerId: selected.player.id,
    prediction: selected.prediction,
    reachable: selected.prediction.reachable,
  });
}
