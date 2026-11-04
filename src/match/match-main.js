import { renderCourtView } from "../court/court-view.js";
import { createMatch, createMatchId } from "./create-match.js";
import { createLineupUi } from "./lineup-ui.js";
import { MatchEngine } from "./match-engine.js";

const views = {
  home: document.querySelector("#home-view"),
  lineup: document.querySelector("#lineup-view"),
  court: document.querySelector("#court-view"),
};

let activeLineupUi = null;
let courtController = null;
let currentMatch = null;
let currentEngine = null;
let courtReadyIntegration = null;

function showView(viewName) {
  Object.entries(views).forEach(([name, view]) => {
    view.hidden = name !== viewName;
  });
}

function enterCourt(matchInput, homeStartingLineup, testMode, onCourtReady) {
  currentMatch = createMatch({
    id: createMatchId(),
    name: matchInput.matchName,
    homeTeamName: matchInput.homeTeamName,
    awayTeamName: matchInput.awayTeamName,
    courtId: matchInput.courtId,
    homePlayers: matchInput.homePlayers,
    awayPlayers: matchInput.awayPlayers,
    homeStartingLineup,
    awayStartingLineup: matchInput.awayStartingLineup,
    testMode,
  });
  const developmentMode = new URLSearchParams(window.location.search).has("dev");
  courtController = renderCourtView(currentMatch, views.court, { developmentMode });
  currentEngine = new MatchEngine({ match: currentMatch });
  activeLineupUi?.destroy();
  activeLineupUi = null;
  showView("court");
  document.querySelector("#court-match-name").focus({ preventScroll: true });
  courtReadyIntegration = onCourtReady?.(Object.freeze({
    match: currentMatch,
    engine: currentEngine,
    courtController,
  })) ?? null;
}

export function beginPregameFlow(matchInput, { testMode = false, onCourtReady = null } = {}) {
  activeLineupUi?.destroy();
  courtController?.destroy();
  courtReadyIntegration?.destroy?.();
  activeLineupUi = null;
  courtController = null;
  currentMatch = null;
  currentEngine = null;
  courtReadyIntegration = null;

  activeLineupUi = createLineupUi({
    matchInput,
    testMode: testMode === true,
    onConfirm: (homeStartingLineup) => {
      enterCourt(matchInput, homeStartingLineup, testMode === true, onCourtReady);
    },
  });
  showView("lineup");
  activeLineupUi.start();
}

export function getCurrentMatch() {
  return currentMatch;
}

export function getCurrentMatchEngine() {
  return currentEngine;
}
