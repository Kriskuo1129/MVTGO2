import { APP_CONFIG } from "./config/app.config.js";
import { beginPregameFlow } from "./match/match-main.js";
import { createTestPregameMatchInput } from "./testing/create-test-pregame-match-input.js";
import { setupServeResultTestControls } from "./testing/serve-result-override.js";
import { createSinglePlayerSimulatorApp } from "./simulator/simulator-main.js";
import { createTeamSimulatorApp } from "./simulator/team-simulator-main.js";
import { createFormalMatchApp } from "./simulator/formal-match-main.js";
import { createFormalLineupInput, applyFormalStartingLineup } from "./simulator/formal-lineup-adapter.js";
import { createLineupUi } from "./match/lineup-ui.js";

document.title = APP_CONFIG.title;

const matchTestButton = document.querySelector("#match-test-button");
const simulatorButton = document.querySelector("#simulator-button");
const teamSimulatorButton = document.querySelector("#team-simulator-button");
const formalMatchButton = document.querySelector("#formal-match-button");
const homeView = document.querySelector("#home-view");
const simulatorView = document.querySelector("#simulator-view");
const teamSimulatorView = document.querySelector("#team-simulator-view");
const formalMatchView = document.querySelector("#formal-match-view");
const lineupView = document.querySelector("#lineup-view");
let activeFormalLineupUi = null;

const formalMatchApp = createFormalMatchApp({
  root: formalMatchView,
  onExit() {
    homeView.hidden = false;
    formalMatchButton.focus({ preventScroll: true });
  },
});

formalMatchButton.addEventListener("click", () => {
  homeView.hidden = true;
  formalMatchApp.hide();
  activeFormalLineupUi?.destroy();
  const teams = formalMatchApp.getConfiguredTeams();
  activeFormalLineupUi = createLineupUi({
    matchInput: createFormalLineupInput(teams),
    onConfirm(startingLineup) {
      formalMatchApp.configureTeams(applyFormalStartingLineup(teams, startingLineup));
      activeFormalLineupUi?.destroy();
      activeFormalLineupUi = null;
      lineupView.hidden = true;
      formalMatchApp.show();
    },
  });
  lineupView.hidden = false;
  activeFormalLineupUi.start();
});

const simulatorApp = createSinglePlayerSimulatorApp({
  root: simulatorView,
  onExit() {
    simulatorApp.hide();
    homeView.hidden = false;
    simulatorButton.focus({ preventScroll: true });
  },
});

simulatorButton.addEventListener("click", () => {
  homeView.hidden = true;
  simulatorApp.show();
});

const teamSimulatorApp = createTeamSimulatorApp({
  root: teamSimulatorView,
  onExit() {
    teamSimulatorApp.hide();
    homeView.hidden = false;
    teamSimulatorButton.focus({ preventScroll: true });
  },
});

teamSimulatorButton.addEventListener("click", () => {
  homeView.hidden = true;
  teamSimulatorApp.show();
});

matchTestButton.addEventListener("click", () => {
  // [MVTGO_TEST_HOOK]
  // 功能：將比賽測試系統準備的正式輸入交給比賽系統主流程。
  // 啟用：玩家點擊首頁「比賽測試系統」時。
  // 範圍：只指定 testMode；先發、Match、球場與未來即時系統均沿用正式流程。
  beginPregameFlow(createTestPregameMatchInput(), {
    testMode: true,
    onCourtReady: ({ match, engine, courtController }) => setupServeResultTestControls({
      match,
      engine,
      courtController,
      root: document.querySelector("#court-view"),
    }),
  });
});
