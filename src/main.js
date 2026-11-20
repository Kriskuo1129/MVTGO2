import { APP_CONFIG } from "./config/app.config.js";
import { createFormalMatchApp } from "./simulator/formal-match-main.js";
import { createFormalLineupInput, applyFormalStartingLineup } from "./simulator/formal-lineup-adapter.js";
import { createFormalMatchRosterSource } from "./simulator/formal-match-test-data.js";
import { createLineupUi } from "./match/lineup-ui.js";

document.title = APP_CONFIG.title;

const matchTestButton = document.querySelector("#match-test-button");
const homeView = document.querySelector("#home-view");
const formalMatchView = document.querySelector("#formal-match-view");
const lineupView = document.querySelector("#lineup-view");
let activeFormalLineupUi = null;
const formalRosterSource = createFormalMatchRosterSource();

const formalMatchApp = createFormalMatchApp({
  root: formalMatchView,
  onExit() {
    homeView.hidden = false;
    matchTestButton.focus({ preventScroll: true });
  },
});

matchTestButton.addEventListener("click", () => {
  homeView.hidden = true;
  formalMatchApp.hide();
  activeFormalLineupUi?.destroy();
  const roster = formalRosterSource.next();
  const teams = roster.teams;
  console.info(`[FormalMatch] rosterSeed=${roster.seed}`);
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

// 開發者定義編輯入口；不顯示於玩家首頁，也不載入舊 Debug 工作台直到明確指定。
if (new URLSearchParams(window.location.search).get("dev") === "editors") {
  import("./simulator/team-simulator-main.js").then(({ createTeamSimulatorApp }) => {
    const editorHost = document.querySelector("#team-simulator-view");
    const editorApp = createTeamSimulatorApp({
      root: editorHost,
      onExit() {
        editorApp.hide();
        homeView.hidden = false;
      },
    });
    homeView.hidden = true;
    editorApp.show();
  });
}
