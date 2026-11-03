import { APP_CONFIG } from "./config/app.config.js";
import { renderCourtView } from "./court/court-view.js";
import { createTestMatchData } from "./data/test-players.js";
import { getAbilityTierClass, getPlayerMoodName } from "./display/player-display.js";
import { createMatch, createMatchId } from "./match/create-match.js";
import {
  createLineup,
  createStartingLineup,
  getSelectedPlayerIds,
  isLineupComplete,
  isPlayerOutOfPosition,
  LINEUP_DISPLAY_ORDER,
  LINEUP_POSITIONS,
  setLineupPlayer,
  sortPlayersForLineupPosition,
} from "./lineup/starting-lineup.js";

const views = {
  home: document.querySelector("#home-view"),
  lineup: document.querySelector("#lineup-view"),
  court: document.querySelector("#court-view"),
};
const elements = {
  testPlayerButton: document.querySelector("#test-player-button"),
  lineupTitle: document.querySelector("#lineup-title"),
  opponentTeamName: document.querySelector("#opponent-team-name"),
  lineupSlots: document.querySelector("#lineup-slots"),
  confirmLineupButton: document.querySelector("#confirm-lineup-button"),
  courtView: document.querySelector("#court-view"),
  playerDialog: document.querySelector("#player-selector-dialog"),
  playerDialogTitle: document.querySelector("#player-dialog-title"),
  playerDialogDescription: document.querySelector("#player-dialog-description"),
  playerOptions: document.querySelector("#player-options"),
  closePlayerDialog: document.querySelector("#close-player-dialog"),
  cancelPlayerDialog: document.querySelector("#cancel-player-dialog"),
  clearSlotButton: document.querySelector("#clear-slot-button"),
};

let matchData = null;
let homeLineup = createLineup();
let pregameStartingLineups = null;
let activeLineupPosition = null;
let currentMatch = null;
let courtController = null;

document.title = APP_CONFIG.title;

function showView(viewName) {
  Object.entries(views).forEach(([name, view]) => {
    view.hidden = name !== viewName;
  });
}

function getPlayerById(playerId) {
  return matchData.homePlayers.find((player) => player.id === playerId) ?? null;
}

function createAvatar(player, className = "player-avatar") {
  const avatar = document.createElement("span");
  avatar.className = className;
  if (player?.avatar) {
    const image = document.createElement("img");
    image.src = player.avatar;
    image.alt = `${player.name}頭像`;
    avatar.append(image);
  } else if (player) {
    avatar.textContent = player.name.slice(-2);
    avatar.setAttribute("aria-label", `${player.name}預設頭像`);
  } else {
    avatar.textContent = "選擇";
  }
  return avatar;
}

function renderLineupSlots() {
  const slots = LINEUP_DISPLAY_ORDER.map((lineupPosition) => {
    const player = getPlayerById(homeLineup[lineupPosition]);
    const slot = document.createElement("article");
    slot.className = "lineup-slot";
    slot.dataset.position = lineupPosition;

    const title = document.createElement("h3");
    title.className = "lineup-slot__position";
    title.textContent = lineupPosition;

    const button = document.createElement("button");
    button.className = "lineup-slot__button";
    button.type = "button";
    button.dataset.position = lineupPosition;
    button.setAttribute("aria-label", `${lineupPosition}：${player ? player.name : "選擇球員"}`);
    button.append(createAvatar(player, "lineup-slot__avatar"));

    slot.append(title, button);

    if (player) {
      const name = document.createElement("p");
      name.className = "lineup-slot__name";
      name.textContent = `${player.name} · ${player.position}`;
      slot.append(name);
    }

    if (player && isPlayerOutOfPosition(player, lineupPosition)) {
      slot.classList.add("lineup-slot--mismatch");
      const warning = document.createElement("p");
      warning.className = "lineup-slot__warning";
      warning.textContent = "有錯位、能力值會下降";
      slot.append(warning);
    }
    return slot;
  });
  elements.lineupSlots.replaceChildren(...slots);
}

function createAbilityItem(label, value) {
  const item = document.createElement("span");
  item.className = "player-option__ability";
  const labelElement = document.createElement("small");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.classList.add("ability-value", getAbilityTierClass(value));
  valueElement.textContent = String(value);
  item.append(labelElement, valueElement);
  return item;
}

function renderPlayerOptions() {
  const selectedPlayerIds = getSelectedPlayerIds(homeLineup);
  const currentPlayerId = homeLineup[activeLineupPosition];
  const orderedPlayers = sortPlayersForLineupPosition(
    matchData.homePlayers,
    activeLineupPosition,
  );
  const options = orderedPlayers.map((player) => {
    const usedElsewhere = selectedPlayerIds.has(player.id) && player.id !== currentPlayerId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player-option";
    button.dataset.playerId = player.id;
    button.disabled = usedElsewhere;
    if (player.id === currentPlayerId) button.classList.add("player-option--selected");

    const identity = document.createElement("span");
    identity.className = "player-option__identity";
    identity.append(createAvatar(player, "player-avatar"));
    const identityText = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = player.name;
    const meta = document.createElement("small");
    meta.textContent = `擅長 ${player.position} · 情緒 ${getPlayerMoodName(player.mood)}`;
    identityText.append(name, meta);
    identity.append(identityText);

    const abilities = document.createElement("span");
    abilities.className = "player-option__abilities";
    abilities.append(
      createAbilityItem("攻擊", player.abilities.attack),
      createAbilityItem("攔網", player.abilities.block),
      createAbilityItem("舉球", player.abilities.set),
      createAbilityItem("接球", player.abilities.receive),
      createAbilityItem("發球", player.abilities.serve),
    );
    button.append(identity, abilities);

    if (usedElsewhere) {
      const occupied = document.createElement("span");
      occupied.className = "player-option__occupied";
      occupied.textContent = "已安排";
      button.append(occupied);
    } else if (isPlayerOutOfPosition(player, activeLineupPosition)) {
      const mismatch = document.createElement("span");
      mismatch.className = "player-option__mismatch";
      mismatch.textContent = "選入後將錯位";
      button.append(mismatch);
    }
    return button;
  });
  elements.playerOptions.replaceChildren(...options);
}

function openPlayerDialog(lineupPosition) {
  activeLineupPosition = lineupPosition;
  elements.playerDialogTitle.textContent = `選擇 ${lineupPosition} 球員`;
  elements.playerDialogDescription.textContent = `球員可自由安排；擅長職位不同時會顯示錯位警告。`;
  elements.clearSlotButton.disabled = !homeLineup[lineupPosition];
  renderPlayerOptions();
  elements.playerDialog.showModal();
}

function renderLineupState() {
  renderLineupSlots();
  const complete = isLineupComplete(homeLineup);
  elements.confirmLineupButton.disabled = !complete;
}

function beginPregameFlow() {
  courtController?.destroy();
  courtController = null;
  matchData = createTestMatchData();
  homeLineup = createLineup();
  pregameStartingLineups = {
    home: null,
    away: createStartingLineup(
      Object.fromEntries(
        LINEUP_POSITIONS.map((position, index) => [position, matchData.awayPlayers[index].id]),
      ),
      matchData.awayPlayers,
      "AWAY",
    ),
  };
  currentMatch = null;
  elements.lineupTitle.textContent = matchData.matchName;
  elements.opponentTeamName.textContent = matchData.awayTeamName;
  renderLineupState();
  showView("lineup");
  elements.lineupTitle.focus({ preventScroll: true });
}

elements.testPlayerButton.addEventListener("click", beginPregameFlow);
elements.lineupSlots.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-position]");
  if (button) openPlayerDialog(button.dataset.position);
});
elements.playerOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-player-id]");
  if (!button || button.disabled) return;
  homeLineup = setLineupPlayer(homeLineup, activeLineupPosition, button.dataset.playerId);
  elements.playerDialog.close();
  renderLineupState();
});
elements.clearSlotButton.addEventListener("click", () => {
  homeLineup = setLineupPlayer(homeLineup, activeLineupPosition, null);
  elements.playerDialog.close();
  renderLineupState();
});
elements.closePlayerDialog.addEventListener("click", () => elements.playerDialog.close());
elements.cancelPlayerDialog.addEventListener("click", () => elements.playerDialog.close());
elements.confirmLineupButton.addEventListener("click", () => {
  try {
    pregameStartingLineups.home = createStartingLineup(homeLineup, matchData.homePlayers);
    currentMatch = createMatch({
      id: createMatchId(),
      name: matchData.matchName,
      homeTeamName: matchData.homeTeamName,
      awayTeamName: matchData.awayTeamName,
      courtId: matchData.courtId,
      homePlayers: matchData.homePlayers,
      awayPlayers: matchData.awayPlayers,
      homeStartingLineup: pregameStartingLineups.home,
      awayStartingLineup: pregameStartingLineups.away,
    });
    const developmentMode = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).has("dev");
    courtController = renderCourtView(currentMatch, elements.courtView, { developmentMode });
    showView("court");
    document.querySelector("#court-match-name").focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
  }
});
