import { FormalMatchSession, FORMAL_MATCH_STATES } from "./formal-match-session.js";
import { FormalMatchRenderer } from "./formal-match-renderer.js";
import { createFormalMatchTestTeams } from "./formal-match-test-data.js";
import { createMatchSeedSource } from "./match-seed.js";
import { resolveTacticCard } from "./formal-tactics.js";
import { FORMAL_MATCH_VISUALS } from "./config/formal-match-renderer-config.js";
import { createPlayerAvatarElement } from "../display/player-avatar.js";

const JOBS = Object.freeze(["S", "OH1", "MB1", "OP", "OH2", "MB2"]);

export function resolveFormalTeamNames(teams) {
  return Object.freeze(Object.fromEntries(["HOME", "AWAY"].map((team) => [team,
    teams?.[team]?.name ?? teams?.[team]?.teamName ?? team])));
}

function cloneTeams(teams) {
  return Object.fromEntries(["HOME", "AWAY"].map((team) => [team, {
    players: teams[team].players.map((player) => ({ ...player, abilities: { ...player.abilities } })),
    starters: { ...teams[team].starters },
  }]));
}

function statusLabel(status) {
  return ({ NOT_STARTED: "尚未開始", RALLY_RUNNING: "Rally 進行中", RALLY_ENDED: "Rally 結束",
    BETWEEN_SETS: "局間", PAUSED: "已暫停", MATCH_ENDED: "比賽結束", ABORTED: "異常中止" })[status] ?? status;
}

function rallyMessage(snapshot) {
  const result = snapshot.rallyResult;
  if (result) return `${result.scoringTeam} 得分｜${result.reason}`;
  const event = snapshot.rally?.events?.at(-1);
  if (!event) return "等待比賽開始。";
  return `${event.team ? `${event.team}｜` : ""}${event.type}`;
}

export function createFormalMatchApp({ root, onExit, teams = createFormalMatchTestTeams(),
  seed = null, seedFactory } = {}) {
  if (!root || typeof onExit !== "function") throw new TypeError("正式比賽頁需要 root 與 onExit。 ");
  const renderer = new FormalMatchRenderer({ root });
  const teamNames = resolveFormalTeamNames(teams);
  const controls = {
    start: root.querySelector("#formal-match-start"), next: root.querySelector("#formal-match-next"),
    auto: root.querySelector("#formal-match-auto"), restart: root.querySelector("#formal-match-restart"),
    back: root.querySelector("#formal-match-back"), pause: root.querySelector("#formal-match-pause"),
    job: root.querySelector("#formal-match-sub-job"), player: root.querySelector("#formal-match-sub-player"),
    substitute: root.querySelector("#formal-match-substitute"), tactics: root.querySelector("#formal-match-tactics"),
    substituteAvatar: root.querySelector("#formal-match-sub-avatar"),
  };
  const fields = Object.fromEntries(["team-home", "team-away", "sets-score", "score-home", "score-away",
    "message", "morale", "sub-count", "diagnostics", "result"]
    .map((name) => [name, root.querySelector(`#formal-match-${name}`)]));
  let match = null;
  let frameId = null;
  let autoTimer = null;
  let lastTimestamp = null;
  let autoplay = false;
  let visible = false;
  let configuredTeams = cloneTeams(teams);
  const seedSource = createMatchSeedSource({ fixedSeed: seed,
    ...(seedFactory ? { randomSeed: seedFactory } : {}) });
  const listeners = new AbortController();

  function stopFrame() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    lastTimestamp = null;
  }

  function stopAutoTimer() {
    if (autoTimer !== null) clearTimeout(autoTimer);
    autoTimer = null;
  }

  function renderTactics(snapshot) {
    controls.tactics.replaceChildren();
    for (const cardId of snapshot.tactics.hands.HOME ?? []) {
      const card = resolveTacticCard(cardId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button formal-match-tactic";
      button.dataset.cardId = cardId;
      button.textContent = card.name;
      button.title = card.kind === "MORALE" ? `立即增加士氣 ${card.moraleDelta}`
        : card.kind === "ABILITY" ? "下一球提升接發能力" : "下一球影響攻擊選擇";
      button.disabled = !snapshot.operations.canActivateTactic;
      controls.tactics.append(button);
    }
    if (!controls.tactics.childElementCount) controls.tactics.textContent = "本局手牌已用完";
  }

  function renderSubstitution(snapshot) {
    const roster = snapshot.roster;
    const selectedJob = JOBS.includes(controls.job.value) ? controls.job.value : "S";
    controls.job.value = selectedJob;
    const activeIds = new Set(Object.values(roster.active.HOME));
    const currentValue = controls.player.value;
    controls.player.replaceChildren();
    for (const player of roster.homePlayers) {
      if (activeIds.has(player.playerId)) continue;
      const option = document.createElement("option");
      option.value = player.playerId;
      option.textContent = `${player.name}（${player.position}）`;
      controls.player.append(option);
    }
    if ([...controls.player.options].some((option) => option.value === currentValue)) controls.player.value = currentValue;
    const selectedPlayer = roster.homePlayers.find((player) => player.playerId === controls.player.value);
    controls.substituteAvatar.replaceChildren(createPlayerAvatarElement(selectedPlayer,
      "formal-match-sub-avatar__image"));
    controls.substitute.disabled = !snapshot.operations.canSubstitute || !controls.player.value;
    fields["sub-count"].textContent = `${snapshot.roster.substitutionCount.HOME}／6`;
  }

  function renderMatch() {
    if (!match) return;
    const snapshot = match.getSnapshot();
    fields["team-home"].textContent = teamNames.HOME;
    fields["team-away"].textContent = teamNames.AWAY;
    fields["sets-score"].textContent = `${snapshot.setsWon.HOME}:${snapshot.setsWon.AWAY}`;
    fields["score-home"].textContent = String(snapshot.setScores.HOME);
    fields["score-away"].textContent = String(snapshot.setScores.AWAY);
    fields.message.textContent = `${statusLabel(snapshot.status)}｜${rallyMessage(snapshot)}`;
    fields.morale.textContent = `HOME ${snapshot.morale.HOME}｜AWAY ${snapshot.morale.AWAY}`;
    fields.diagnostics.textContent = JSON.stringify({ seed: snapshot.seed,
      rallySeed: snapshot.currentRallySeed, rotations: snapshot.rotations,
      status: snapshot.status, operations: snapshot.operations,
      rallyPhase: snapshot.rally?.rallyPhase, receiveQuality: snapshot.rally?.receiveQuality?.quality ?? null,
      setQuality: snapshot.rally?.setQuality?.quality ?? null,
      attackQuality: snapshot.rally?.attackQuality ?? null }, null, 2);
    if (snapshot.rally) renderer.render(snapshot.rally, snapshot.rallyNumber);
    controls.start.hidden = snapshot.status !== FORMAL_MATCH_STATES.NOT_STARTED;
    controls.next.disabled = ![FORMAL_MATCH_STATES.RALLY_ENDED, FORMAL_MATCH_STATES.BETWEEN_SETS]
      .includes(snapshot.status);
    controls.next.hidden = snapshot.status === FORMAL_MATCH_STATES.MATCH_ENDED;
    controls.auto.disabled = [FORMAL_MATCH_STATES.NOT_STARTED, FORMAL_MATCH_STATES.MATCH_ENDED,
      FORMAL_MATCH_STATES.ABORTED, FORMAL_MATCH_STATES.PAUSED].includes(snapshot.status);
    controls.auto.textContent = autoplay ? "停止自動播放" : "自動播放";
    controls.pause.disabled = !(snapshot.operations.canPause || snapshot.operations.canResume);
    controls.pause.textContent = snapshot.operations.canResume ? "恢復" : "暫停";
    renderSubstitution(snapshot);
    renderTactics(snapshot);
    if (snapshot.matchResult) {
      fields.result.hidden = false;
      fields.result.textContent = `勝方 ${snapshot.matchResult.winner}｜局數 ${snapshot.matchResult.setsWon.HOME}：${snapshot.matchResult.setsWon.AWAY}｜${snapshot.matchResult.sets.map((set) => `${set.score.HOME}:${set.score.AWAY}`).join("、")}｜共 ${snapshot.matchResult.rallyCount} 球`;
    } else if (snapshot.fault) {
      fields.result.hidden = false;
      fields.result.textContent = `比賽中止：${snapshot.fault.code}｜${snapshot.fault.message}`;
    } else fields.result.hidden = true;
  }

  function scheduleAuto() {
    stopAutoTimer();
    if (!autoplay || !match) return;
    const status = match.getSnapshot().status;
    if (![FORMAL_MATCH_STATES.RALLY_ENDED, FORMAL_MATCH_STATES.BETWEEN_SETS].includes(status)) return;
    autoTimer = setTimeout(() => { autoTimer = null; startNextRally(); }, FORMAL_MATCH_VISUALS.rallyResultHoldMs);
  }

  function tick(timestamp) {
    frameId = null;
    if (!visible || !match || match.getSnapshot().status !== FORMAL_MATCH_STATES.RALLY_RUNNING) return;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const delta = Math.min(0.1, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    match.advance(delta);
    renderMatch();
    if (match.getSnapshot().status === FORMAL_MATCH_STATES.RALLY_RUNNING) {
      frameId = requestAnimationFrame(tick);
    } else scheduleAuto();
  }

  function runCurrentRally() {
    stopFrame();
    lastTimestamp = null;
    frameId = requestAnimationFrame(tick);
  }

  function startMatch() {
    stopFrame(); stopAutoTimer();
    if (!match || match.getSnapshot().status !== FORMAL_MATCH_STATES.NOT_STARTED) {
      match = createSession();
    }
    match.start();
    renderer.resetRally(match.getSnapshot().rallyNumber);
    renderMatch();
    runCurrentRally();
  }

  function restartMatch() {
    stopFrame(); stopAutoTimer();
    autoplay = false;
    match = createSession();
    match.start();
    renderMatch();
    runCurrentRally();
  }

  function createSession() {
    const matchSeed = seedSource.next();
    console.info(`[FormalMatch] seed=${matchSeed}`);
    return new FormalMatchSession({ teams: cloneTeams(configuredTeams), seed: matchSeed });
  }

  function startNextRally() {
    if (!match) return;
    const status = match.getSnapshot().status;
    if (![FORMAL_MATCH_STATES.RALLY_ENDED, FORMAL_MATCH_STATES.BETWEEN_SETS].includes(status)) return;
    match.advance(0);
    renderer.resetRally(match.getSnapshot().rallyNumber);
    renderMatch();
    runCurrentRally();
  }

  function reportError(error) {
    renderMatch();
    fields.message.textContent = error instanceof Error ? error.message : String(error);
  }

  controls.start.addEventListener("click", startMatch, { signal: listeners.signal });
  controls.next.addEventListener("click", startNextRally, { signal: listeners.signal });
  controls.restart.addEventListener("click", restartMatch, { signal: listeners.signal });
  controls.auto.addEventListener("click", () => {
    autoplay = !autoplay;
    if (!autoplay) stopAutoTimer(); else scheduleAuto();
    renderMatch();
  }, { signal: listeners.signal });
  controls.pause.addEventListener("click", () => {
    try {
      const snapshot = match?.getSnapshot();
      if (!snapshot) return;
      if (snapshot.status === FORMAL_MATCH_STATES.PAUSED) match.resume();
      else { autoplay = false; stopAutoTimer(); match.pause("HOME"); }
      renderMatch();
    } catch (error) { reportError(error); }
  }, { signal: listeners.signal });
  controls.substitute.addEventListener("click", () => {
    try { match.substitute({ team: "HOME", job: controls.job.value,
      playerInId: controls.player.value }); renderMatch(); } catch (error) { reportError(error); }
  }, { signal: listeners.signal });
  controls.player.addEventListener("change", renderMatch, { signal: listeners.signal });
  controls.tactics.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-id]");
    if (!button) return;
    try { match.activateTactic({ team: "HOME", cardId: button.dataset.cardId }); renderMatch(); }
    catch (error) { reportError(error); }
  }, { signal: listeners.signal });
  controls.back.addEventListener("click", () => { hide(); onExit(); }, { signal: listeners.signal });

  function show() {
    visible = true;
    root.hidden = false;
    if (!match) {
      match = createSession();
      renderMatch();
    }
    if (match.getSnapshot().status === FORMAL_MATCH_STATES.RALLY_RUNNING) runCurrentRally();
    root.querySelector("#formal-match-title")?.focus({ preventScroll: true });
  }

  function hide() {
    visible = false;
    autoplay = false;
    stopFrame(); stopAutoTimer();
    root.hidden = true;
  }

  function destroy() { hide(); listeners.abort(); renderer.destroy(); }
  function configureTeams(nextTeams) {
    configuredTeams = cloneTeams(nextTeams);
    match = null;
    renderer.clear();
  }
  return Object.freeze({ show, hide, destroy, restart: startMatch, configureTeams,
    getConfiguredTeams: () => cloneTeams(configuredTeams), getSession: () => match });
}
