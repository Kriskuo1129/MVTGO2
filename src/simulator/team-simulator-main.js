import {
  TEAM_SIMULATOR_PARAMETERS,
} from "./team-simulator.js";
import { TeamSimulatorRenderer } from "./team-simulator-renderer.js";
import { ContinuousRallySimulator } from "./continuous-rally-simulator.js";
import { RECEIVE_SPEED_OPTIONS } from "./receive-animation.js";
import { PassTargetZoneEditor } from "./pass-target-zone-editor.js";
import { AttackPositionEditor } from "./attack-position-editor.js";
import { ATTACK_ROTATIONS } from "./attack-positions.js";
import { resolveLeftLongConfiguration } from "./attack-assignment.js";
import { SpikeReceiveSimulator, D2_ATTACK_MOTION_V1, NATURAL_SPIKE_EXPERIMENT_DEFAULTS, SPIKE_FLIGHT_MODES } from "./spike-simulator.js";
import { isSpikeExperimentRunning as isReceiveExperimentRunning } from "./spike-flight.js";
import { SPIKE_COURT_V1, SPIKE_TEST_DEFAULTS, validateSpikeTarget, validateSpikeParameters } from "./spike-court.js";
import { THIRD_PASS_TEST_DEFAULTS, validateThirdPassParameters } from "./third-pass.js";
import { validateAttackMotionParameters } from "./attack-motion.js";
import { SINGLE_DEFENSE_DEFAULTS, validateSingleDefenseConfiguration } from "./single-defense.js";
import { ATTACK_SEED_MODES } from "./attack-quality.js";
import { getHighestUnlockedSpikeSpeed } from "./attack-resolution.js";
import { ContinuousFormationEditor } from "./continuous-formation-editor.js";
import { ContinuousRallySession } from "./continuous-rally-session.js";
import { getAppearancePlayerIds, loadContinuousFormation,
  saveContinuousFormation } from "./continuous-rally-formation.js";
import { formatRallyEventLog, RallyEventLogStore } from "./rally-event-log.js";

const PARAMETER_FIELDS = Object.freeze({
  avatarSize: "team-simulator-avatar-size",
  playerSpeed: "team-simulator-player-speed",
  contactRange: "team-simulator-contact-range",
  flightDuration: "team-simulator-flight-duration",
});

const DEFAULT_SKIN_COLOR = "#E5B18B";
const SUPPORTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const SUPPORTED_PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

function createDefaultAppearance() {
  return { photoUrl: "", skinColor: DEFAULT_SKIN_COLOR, zoom: 1, offsetX: 0, offsetY: 0 };
}

function getPhotoExtension(fileName) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function isHeicPhoto(file) {
  const extension = getPhotoExtension(file.name);
  const mimeType = (file.type || "").toLowerCase();
  return mimeType === "image/heic" || mimeType === "image/heif"
    || extension === "heic" || extension === "heif";
}

function validatePhotoFormat(file) {
  const extension = getPhotoExtension(file.name);
  if (!SUPPORTED_PHOTO_TYPES.has((file.type || "").toLowerCase())
    && !SUPPORTED_PHOTO_EXTENSIONS.has(extension)) {
    throw new TypeError("僅支援 JPG、PNG、WebP，以及瀏覽器可解碼的 HEIC／HEIF。");
  }
}

async function verifyBrowserCanDecodePhoto(photoUrl) {
  const image = new Image();
  if (typeof image.decode === "function") {
    image.src = photoUrl;
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
      image.src = photoUrl;
    });
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new TypeError("圖片沒有可顯示的尺寸。");
  }
}

function createCollapsibleSection(className, summaryText) {
  const details = document.createElement("details");
  details.className = className;
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  details.append(summary);
  return details;
}

function organizeTeamSimulatorLayout(root) {
  const toolbar = root.querySelector(".team-simulator-toolbar");
  const clickControls = root.querySelector("#team-simulator-click-controls");
  const viewport = root.querySelector("#team-simulator-viewport");
  const output = root.querySelector(".simulator-output");
  const rallyControls = root.querySelector(".continuous-rally-score");
  const rallyLog = root.querySelector("#rally-event-log-panel");
  const parameters = createCollapsibleSection("team-simulator-panel team-simulator-parameters-panel", "實驗參數：進攻、扣球與單人防守");
  const debug = createCollapsibleSection("team-simulator-panel team-simulator-debug-panel", "詳細 Debug");
  const debugContent = document.createElement("div");
  debugContent.className = "team-simulator-debug-scroll";
  const editors = document.createElement("div");
  editors.className = "team-simulator-advanced-editors";
  const clickModeLabel = root.querySelector("#spike-click-mode").closest("label");
  const leftLong = root.querySelector(".left-long-experiment");
  const zoneEditor = root.querySelector("#pass-target-zone-editor");
  const attackEditor = root.querySelector("#attack-position-editor");
  const formationEditor = root.querySelector("#continuous-formation-editor");
  const debugNodes = [
    root.querySelector("#team-simulator-debug"),
    root.querySelector("#left-long-debug"),
    root.querySelector("#spike-debug"),
  ];

  clickControls.prepend(clickModeLabel);
  output.classList.add("team-simulator-live-status");
  output.removeAttribute("aria-live");
  parameters.append(leftLong);
  debugNodes.forEach((node) => debugContent.append(node));
  debug.append(debugContent);
  editors.append(zoneEditor, attackEditor, formationEditor);
  toolbar.after(rallyControls, clickControls, viewport, output, rallyLog, parameters, debug, editors);
}

export function createTeamSimulatorApp({ root, onExit }) {
  organizeTeamSimulatorLayout(root);
  const simulator = new SpikeReceiveSimulator();
  let continuousFormation = loadContinuousFormation();
  const continuousSimulator = new ContinuousRallySimulator({ initialFormation: continuousFormation });
  const continuousSession = new ContinuousRallySession({ simulator: continuousSimulator, baseSeed: 20261112 });
  const continuousRallyEnabled = root.querySelector("#continuous-rally-enabled");
  const continuousServingTeam = root.querySelector("#continuous-serving-team");
  const continuousServeType = root.querySelector("#continuous-serve-type");
  const continuousServeAbility = root.querySelector("#continuous-serve-ability");
  const continuousRallySeed = root.querySelector("#continuous-rally-seed");
  const attackEnabled = root.querySelector("#left-long-enabled");
  const attackRotation = root.querySelector("#left-long-rotation");
  const attackPlayer = root.querySelector("#left-long-player");
  const attackSource = root.querySelector("#left-long-source");
  const attackMessage = root.querySelector("#left-long-message");
  const spikeEnabled = root.querySelector("#spike-enabled");
  const spikeFlightMode = root.querySelector("#spike-flight-mode");
  const spikeAttackAbility = root.querySelector("#spike-attack-ability");
  const spikeAttackConsistency = root.querySelector("#spike-attack-consistency");
  const spikeUnlockedSpeed = root.querySelector("#spike-unlocked-speed");
  const spikeSeedMode = root.querySelector("#spike-seed-mode");
  const spikeRandomSeed = root.querySelector("#spike-random-seed");
  const spikeClickMode = root.querySelector("#spike-click-mode");
  const spikeClear = root.querySelector("#spike-target-clear");
  const spikeTargetX = root.querySelector("#spike-target-x");
  const spikeTargetY = root.querySelector("#spike-target-y");
  const spikeNetCollisionEnabled = root.querySelector("#spike-net-collision-enabled");
  const clickHint = root.querySelector("#team-simulator-click-hint");
  const defenseEnabled = root.querySelector("#single-defense-enabled");
  const defenseX = root.querySelector("#single-defense-x");
  const defenseY = root.querySelector("#single-defense-y");
  const defenseSpeed = root.querySelector("#single-defense-speed");
  defenseEnabled.checked = SINGLE_DEFENSE_DEFAULTS.enabled;
  defenseX.value = String(SINGLE_DEFENSE_DEFAULTS.initialX);
  defenseY.value = String(SINGLE_DEFENSE_DEFAULTS.initialY);
  defenseSpeed.value = String(SINGLE_DEFENSE_DEFAULTS.moveSpeed);
  let selectedSpikeTarget = null;
  spikeFlightMode.value = NATURAL_SPIKE_EXPERIMENT_DEFAULTS.mode;
  spikeAttackAbility.value = String(NATURAL_SPIKE_EXPERIMENT_DEFAULTS.attack);
  spikeAttackConsistency.value = String(NATURAL_SPIKE_EXPERIMENT_DEFAULTS.attackConsistency);
  spikeSeedMode.value = NATURAL_SPIKE_EXPERIMENT_DEFAULTS.seedMode;
  spikeRandomSeed.value = String(NATURAL_SPIKE_EXPERIMENT_DEFAULTS.randomSeed);
  const refreshUnlockedSpeed = () => {
    const attack = Number(spikeAttackAbility.value);
    spikeUnlockedSpeed.textContent = Number.isInteger(attack) && attack >= 1 && attack <= 99
      ? `最高解鎖球速：${getHighestUnlockedSpikeSpeed(attack)}` : "最高解鎖球速：—";
  };
  refreshUnlockedSpeed();
  const spikeFields = { flightDuration: root.querySelector("#spike-duration"),
    arcHeight: root.querySelector("#spike-arc"), netHeight: root.querySelector("#spike-net-height") };
  Object.entries(spikeFields).forEach(([key, input]) => { input.value = String(SPIKE_TEST_DEFAULTS[key]); });
  spikeNetCollisionEnabled.checked = SPIKE_TEST_DEFAULTS.netCollisionEnabled;
  const spikeBounds = SPIKE_COURT_V1.bounds;
  root.querySelector("#spike-court-description").textContent = `有效場界已依 court-01.png 的 2280×900 圖片像素校準為梯形（包圍盒 X ${spikeBounds.minX}～${spikeBounds.maxX}、Y ${spikeBounds.minY}～${spikeBounds.maxY}）；對方半場以球網 X=${SPIKE_COURT_V1.netX} 截斷，執行時只使用座標幾何，不讀取圖片顏色。`;
  spikeTargetX.max = String(SPIKE_COURT_V1.netX);
  spikeTargetY.max = String(SPIKE_COURT_V1.world.height);
  const thirdPassFields = {
    flightDuration: root.querySelector("#third-pass-duration"),
    arcHeight: root.querySelector("#third-pass-arc"),
    contactHeight: root.querySelector("#third-pass-contact-height"),
  };
  Object.entries(thirdPassFields).forEach(([key, input]) => { input.value = String(THIRD_PASS_TEST_DEFAULTS[key]); });
  const motionFields = {
    maximumHeight: root.querySelector("#attack-motion-height"),
    jumpDuration: root.querySelector("#attack-motion-duration"),
    takeoffDuration: root.querySelector("#attack-motion-takeoff"),
    drawDuration: root.querySelector("#attack-motion-draw"),
    swingDuration: root.querySelector("#attack-motion-swing"),
  };
  const motionDirection = root.querySelector("#attack-motion-direction");
  Object.entries(motionFields).forEach(([key, input]) => { input.value = String(D2_ATTACK_MOTION_V1[key]); });
  motionDirection.value = D2_ATTACK_MOTION_V1.direction;
  ATTACK_ROTATIONS.forEach((rotation) => attackRotation.add(new Option(rotation, rotation)));
  const fields = Object.fromEntries(
    Object.entries(PARAMETER_FIELDS).map(([key, id]) => [key, root.querySelector(`#${id}`)]),
  );
  const resetButton = root.querySelector("#team-simulator-reset");
  const backButton = root.querySelector("#team-simulator-back");
  const cameraMode = root.querySelector("#team-simulator-camera-mode");
  const settingsButton = root.querySelector("#team-simulator-settings");
  const settingsDialog = root.querySelector("#team-simulator-settings-dialog");
  const settingsClose = root.querySelector("#team-simulator-settings-close");
  const settingsCancel = root.querySelector("#team-simulator-settings-cancel");
  const settingsApply = root.querySelector("#team-simulator-settings-apply");
  const settingsError = root.querySelector("#team-simulator-settings-error");
  const sessionStart = root.querySelector("#continuous-session-start");
  const sessionStop = root.querySelector("#continuous-session-stop");
  const sessionRestart = root.querySelector("#continuous-session-restart");
  const rallyLogOutput = root.querySelector("#rally-event-log");
  const rallyLogCopy = root.querySelector("#rally-event-log-copy");
  const rallyLogClear = root.querySelector("#rally-event-log-clear");
  const rallyLogAutoscroll = root.querySelector("#rally-event-log-autoscroll");
  const rallyLogMessage = root.querySelector("#rally-event-log-message");
  const rallyLogStore = new RallyEventLogStore();
  const zoneEditButton = root.querySelector("#pass-target-zone-edit");
  const attackEditButton = root.querySelector("#attack-position-edit");
  const attackCloseButton = root.querySelector("#attack-position-close");
  const formationEditButton = root.querySelector("#continuous-formation-edit");
  const formationCloseButton = root.querySelector("#continuous-formation-close");
  const zoneCloseButton = root.querySelector("#pass-target-zone-close");
  const zoneCopyButton = root.querySelector("#pass-target-zone-copy");
  const zoneApplyButton = root.querySelector("#pass-target-zone-apply");
  const appearancePlayer = root.querySelector("#team-player-appearance-player");
  const appearanceFile = root.querySelector("#team-player-appearance-file");
  const appearanceSkin = root.querySelector("#team-player-appearance-skin");
  const appearanceZoom = root.querySelector("#team-player-appearance-zoom");
  const appearanceX = root.querySelector("#team-player-appearance-x");
  const appearanceY = root.querySelector("#team-player-appearance-y");
  const appearanceRemove = root.querySelector("#team-player-appearance-remove");
  const appearancePreview = root.querySelector("#team-player-appearance-preview");
  const appearancePreviewFallback = root.querySelector("#team-player-appearance-fallback");
  const appearancePreviewImage = root.querySelector("#team-player-appearance-image");
  const appearances = new Map();
  let photoLoadSequence = 0;
  appearancePreviewImage.addEventListener("error", () => {
    appearancePreviewImage.hidden = true;
    appearancePreviewFallback.hidden = false;
  });
  RECEIVE_SPEED_OPTIONS.forEach(({ label, flightDuration }) => {
    fields.flightDuration.add(new Option(`${label}（${flightDuration.toFixed(1)} 秒）`, String(flightDuration)));
  });

  function readParameters() {
    return Object.fromEntries(
      Object.entries(fields).map(([key, input]) => [key, Number(input.value)]),
    );
  }

  function writeParameters(parameters) {
    Object.entries(fields).forEach(([key, input]) => {
      input.value = String(parameters[key]);
    });
  }

  const renderer = new TeamSimulatorRenderer({
    root,
    onSnapshot(snapshot) {
      if (!snapshot?.events) return;
      const entries = rallyLogStore.consume(snapshot);
      rallyLogOutput.textContent = entries.length ? formatRallyEventLog(entries) : "尚無 Rally 事件。";
      if (rallyLogAutoscroll.checked) rallyLogOutput.scrollTop = rallyLogOutput.scrollHeight;
    },
    onTargetSelected(target) {
      try {
        if (continuousRallyEnabled.checked) {
          renderer.stop();
          continuousSession.stop();
          continuousSimulator.configure(readParameters());
          continuousSimulator.configureServe({ servingTeam: continuousServingTeam.value,
            ability: Number(continuousServeAbility.value), serveType: continuousServeType.value });
          continuousSimulator.launch(target);
          attackMessage.textContent = "雙方連續攻防模式：同一顆球將持續至 Rally 終止。";
          renderer.play(continuousSimulator);
          return;
        }
        if (simulator.lockedSpikeTarget && isReceiveExperimentRunning(simulator.status)) {
          throw new Error("本 Rally 進行中，扣球落點已鎖定；請等待完成或重設。");
        }
        if (spikeClickMode.value === "SPIKE_TARGET") {
          if (!spikeEnabled.checked) throw new Error("請啟用 D2 設定扣球落點，或切回「設定發球落點」。");
          selectedSpikeTarget = validateSpikeTarget(target);
          refreshSpikeTarget();
          attackMessage.textContent = "扣球目標已設定。請切換「設定發球落點」後點球場啟動 Rally。";
          return;
        }
        const attackConfiguration = readAttackConfiguration();
        const legacySpike = spikeFlightMode.value === SPIKE_FLIGHT_MODES.LEGACY_TARGET;
        if (attackConfiguration && spikeEnabled.checked && legacySpike && !selectedSpikeTarget) throw new Error("UNCONFIGURED：舊版除錯模式尚未設定扣球落點。");
        if (attackConfiguration && spikeEnabled.checked && legacySpike) {
          const typed = validateSpikeTarget({ x: spikeTargetX.value.trim() === "" ? NaN : Number(spikeTargetX.value),
            y: spikeTargetY.value.trim() === "" ? NaN : Number(spikeTargetY.value) });
          if (typed.x !== selectedSpikeTarget.x || typed.y !== selectedSpikeTarget.y) throw new Error("扣球落點欄位尚未完成有效設定，請確認 X／Y。");
        }
        const spikeConfiguration = attackConfiguration && spikeEnabled.checked ? {
          mode: spikeFlightMode.value,
          attack: Number(spikeAttackAbility.value),
          attackConsistency: Number(spikeAttackConsistency.value),
          seedMode: spikeSeedMode.value,
          randomSeed: Number(spikeRandomSeed.value),
          target: legacySpike ? validateSpikeTarget(selectedSpikeTarget) : null,
          parameters: validateSpikeParameters({
            ...Object.fromEntries(Object.entries(spikeFields).map(([key, input]) => [key, input.value.trim() === "" ? NaN : Number(input.value)])),
            netCollisionEnabled: spikeNetCollisionEnabled.checked,
          }) } : null;
        const defenseConfiguration = validateSingleDefenseConfiguration({ enabled: defenseEnabled.checked,
          initialX: Number(defenseX.value), initialY: Number(defenseY.value), moveSpeed: Number(defenseSpeed.value) });
        if (defenseConfiguration.enabled && !spikeConfiguration) throw new Error("單人後排防守需同時啟用 LEFT_LONG 與 D2。");
        const thirdParameters = attackConfiguration
          ? validateThirdPassParameters(Object.fromEntries(Object.entries(thirdPassFields).map(([key, input]) => [key, input.value.trim() === "" ? NaN : Number(input.value)]))) : null;
        const motionParameters = attackConfiguration ? validateAttackMotionParameters({
          ...Object.fromEntries(Object.entries(motionFields).map(([key, input]) => [key, input.value.trim() === "" ? NaN : Number(input.value)])),
          direction: motionDirection.value,
        }) : null;
        if (thirdParameters && thirdParameters.arcHeight < thirdParameters.contactHeight + motionParameters.maximumHeight) {
          throw new RangeError("第三段弧度需至少等於接觸高度加上最高跳躍高度，請調整測試參數。");
        }
        if (spikeConfiguration && motionParameters.direction !== "LEFT") throw new Error("D2 僅支援向左扣球；向右動畫鏡像請關閉 D2。");
        renderer.stop();
        if (isReceiveExperimentRunning(simulator.getSnapshot().status)) simulator.reset();
        simulator.configure(readParameters());
        simulator.configureAttackAssignment(attackConfiguration);
        if (thirdParameters) simulator.configureThirdPass(thirdParameters);
        if (motionParameters) simulator.configureAttackMotion(motionParameters);
        simulator.configureSpikeExperiment(spikeConfiguration);
        simulator.configureSingleDefense(defenseConfiguration);
        simulator.launch(target);
        attackMessage.textContent = "";
        renderer.play(simulator);
      } catch (error) {
        attackMessage.textContent = error.message;
        root.querySelector("#team-simulator-status").textContent = `參數錯誤：${error.message}`;
      }
    },
  });
  let resumeAfterZoneEditing = false;
  const zoneEditor = new PassTargetZoneEditor({
    root,
    renderer,
    onApply(zones) {
      simulator.configurePassTargetZones(zones);
      const snapshot = simulator.getSnapshot();
      if (snapshot.status === "PASS_IN_FLIGHT") resumeAfterZoneEditing = true;
      renderer.renderWhenReady(snapshot);
    },
  });
  const attackEditor = new AttackPositionEditor({ root, renderer, onPreviewChange: () => refreshAttackConfiguration() });
  const formationEditor = new ContinuousFormationEditor({
    root,
    renderer,
    formation: continuousFormation,
    onChange(formation) {
      continuousFormation = saveContinuousFormation(formation);
      continuousSimulator.configureFormation(continuousFormation);
      renderer.renderWhenReady(continuousSimulator.getSnapshot());
    },
  });
  let resumeAfterAttackEditing = false;

  function refreshSpikeTarget() {
    const legacy = spikeFlightMode.value === SPIKE_FLIGHT_MODES.LEGACY_TARGET;
    spikeRandomSeed.disabled = spikeSeedMode.value === ATTACK_SEED_MODES.AUTO;
    if (!legacy) spikeClickMode.value = "SERVE";
    spikeClickMode.disabled = !legacy;
    spikeTargetX.disabled = !legacy;
    spikeTargetY.disabled = !legacy;
    spikeClear.disabled = !legacy;
    if (!spikeEnabled.checked) spikeClickMode.value = "SERVE";
    clickHint.textContent = spikeClickMode.value === "SPIKE_TARGET"
      ? "扣球落點模式：點擊左半場只更新 D2 目標，不會啟動 Rally。"
      : "發球落點模式：點擊球場後會鎖定設定並啟動 Rally。";
    spikeTargetX.value = selectedSpikeTarget ? String(selectedSpikeTarget.x) : "";
    spikeTargetY.value = selectedSpikeTarget ? String(selectedSpikeTarget.y) : "";
    renderer.setSpikePreview(legacy && spikeEnabled.checked && (attackEnabled.checked || spikeClickMode.value === "SPIKE_TARGET")
      ? { target: selectedSpikeTarget, court: SPIKE_COURT_V1 } : null);
  }
  const handleSpikeCoordinates = () => {
    try {
      if (isReceiveExperimentRunning(simulator.status)) throw new Error("發球後扣球目標已鎖定。");
      if (!spikeTargetX.value.trim() || !spikeTargetY.value.trim()) throw new Error("扣球落點 X／Y 都需要輸入數值。");
      selectedSpikeTarget = validateSpikeTarget({ x: Number(spikeTargetX.value), y: Number(spikeTargetY.value) });
      refreshSpikeTarget(); attackMessage.textContent = "扣球落點已更新。";
    } catch (error) { attackMessage.textContent = error.message; }
  };
  const clearSpikeTarget = () => {
    if (isReceiveExperimentRunning(simulator.status)) return;
    selectedSpikeTarget = null; refreshSpikeTarget();
  };

  const players = simulator.getSnapshot().players;
  players.forEach((player) => {
    const option = new Option(`${player.position}（${player.id}）${player.position === "S" ? "：本階段不支援" : ""}`, player.id);
    option.disabled = player.position === "S";
    attackPlayer.add(option);
  });
  attackPlayer.value = players.find((player) => player.position !== "S").id;

  function readAttackConfiguration() {
    if (!attackEnabled.checked) return null;
    return resolveLeftLongConfiguration(attackEditor.preview, attackRotation.value,
      attackPlayer.value, simulator.getSnapshot().players, simulator.secondTouchPlayerId);
  }

  function refreshAttackConfiguration() {
    try {
      const configuration = readAttackConfiguration();
      const source = configuration?.source;
      attackSource.textContent = source
        ? `來源：C1 已套用預覽／${source.rotation}／${source.playerSlot}／LEFT_LONG｜READY (${configuration.readyPosition.x}, ${configuration.readyPosition.y}) → ATTACK (${configuration.attackPosition.x}, ${configuration.attackPosition.y})`
        : "跑位實驗未啟用；一般六人接發球模式。";
      attackMessage.textContent = "";
      renderer.setAttackPreview(configuration);
      refreshSpikeTarget();
    } catch (error) {
      attackSource.textContent = `來源：C1 已套用預覽／${attackRotation.value}／${attackPlayer.selectedOptions[0]?.textContent ?? "未選球員"}／LEFT_LONG｜UNCONFIGURED`;
      attackMessage.textContent = error.message;
      renderer.setAttackPreview(null);
      refreshSpikeTarget();
    }
  }
  players.forEach((player) => {
    const appearance = createDefaultAppearance();
    appearances.set(player.id, appearance);
    getAppearancePlayerIds(player.position).forEach((id) => renderer.setPlayerAppearance(id, appearance));
    appearancePlayer.add(new Option(`${player.position}（${player.rotationPosition}）`, player.id));
  });

  function getSelectedPlayer() {
    return players.find((player) => player.id === appearancePlayer.value) ?? players[0];
  }

  function renderAppearanceEditor() {
    const player = getSelectedPlayer();
    const appearance = appearances.get(player.id);
    appearanceSkin.value = appearance.skinColor;
    appearanceZoom.value = String(appearance.zoom);
    appearanceX.value = String(appearance.offsetX);
    appearanceY.value = String(appearance.offsetY);
    appearanceFile.value = "";
    appearancePreviewFallback.textContent = player.position;
    appearancePreviewFallback.hidden = Boolean(appearance.photoUrl);
    if (appearance.photoUrl) {
      if (appearancePreviewImage.getAttribute("src") !== appearance.photoUrl) {
        appearancePreviewImage.src = appearance.photoUrl;
      }
    } else {
      appearancePreviewImage.removeAttribute("src");
    }
    appearancePreviewImage.hidden = !appearance.photoUrl;
    appearancePreview.style.backgroundColor = appearance.skinColor;
    appearancePreviewImage.style.setProperty("--photo-zoom", String(appearance.zoom));
    appearancePreviewImage.style.setProperty("--photo-x", `${appearance.offsetX}%`);
    appearancePreviewImage.style.setProperty("--photo-y", `${appearance.offsetY}%`);
    appearanceRemove.disabled = !appearance.photoUrl;
  }

  function updatePlayerAppearance(playerId, changes) {
    const appearance = { ...appearances.get(playerId), ...changes };
    appearances.set(playerId, appearance);
    const player = players.find((entry) => entry.id === playerId);
    getAppearancePlayerIds(player.position).forEach((id) => renderer.setPlayerAppearance(id, appearance));
    if (getSelectedPlayer().id === playerId) renderAppearanceEditor();
  }

  function updateSelectedAppearance(changes) {
    updatePlayerAppearance(getSelectedPlayer().id, changes);
  }

  async function handleAppearanceFile() {
    const [file] = appearanceFile.files;
    if (!file) return;
    const playerId = getSelectedPlayer().id;
    const loadSequence = ++photoLoadSequence;
    let candidateUrl = "";
    appearanceFile.disabled = true;
    settingsError.textContent = "正在檢查照片格式…";
    try {
      validatePhotoFormat(file);
      candidateUrl = URL.createObjectURL(file);
      await verifyBrowserCanDecodePhoto(candidateUrl);
      if (loadSequence !== photoLoadSequence) return;
      const previousUrl = appearances.get(playerId).photoUrl;
      updatePlayerAppearance(playerId, {
        photoUrl: candidateUrl,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      });
      candidateUrl = "";
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      settingsError.textContent = isHeicPhoto(file)
        ? "此瀏覽器可解碼目前的 HEIC／HEIF 照片。"
        : "照片已載入。";
    } catch (error) {
      const formatName = isHeicPhoto(file) ? "HEIC／HEIF" : "此圖片";
      settingsError.textContent = `${formatName}無法載入：${error.message || "瀏覽器無法解碼。"}`;
      appearanceFile.value = "";
    } finally {
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
      if (loadSequence === photoLoadSequence) appearanceFile.disabled = false;
    }
  }

  const handleAppearanceAdjustment = () => updateSelectedAppearance({
    skinColor: appearanceSkin.value,
    zoom: Number(appearanceZoom.value),
    offsetX: Number(appearanceX.value),
    offsetY: Number(appearanceY.value),
  });

  const handleRemovePhoto = () => {
    photoLoadSequence += 1;
    appearanceFile.disabled = false;
    const player = getSelectedPlayer();
    const previousUrl = appearances.get(player.id).photoUrl;
    updateSelectedAppearance({ photoUrl: "", zoom: 1, offsetX: 0, offsetY: 0 });
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    settingsError.textContent = "照片已移除。";
  };

  const handleReset = () => {
    if (attackEditor.active) closeAttackEditor();
    if (zoneEditor.active) closeZoneEditor();
    if (formationEditor.active) closeFormationEditor();
    renderer.stop();
    writeParameters(TEAM_SIMULATOR_PARAMETERS);
    simulator.configure(TEAM_SIMULATOR_PARAMETERS);
    continuousSimulator.configure(TEAM_SIMULATOR_PARAMETERS);
    simulator.configureThirdPass(THIRD_PASS_TEST_DEFAULTS);
    Object.entries(thirdPassFields).forEach(([key, input]) => { input.value = String(THIRD_PASS_TEST_DEFAULTS[key]); });
    simulator.configureAttackMotion(D2_ATTACK_MOTION_V1);
    Object.entries(motionFields).forEach(([key, input]) => { input.value = String(D2_ATTACK_MOTION_V1[key]); });
    motionDirection.value = D2_ATTACK_MOTION_V1.direction;
    Object.entries(spikeFields).forEach(([key, input]) => { input.value = String(SPIKE_TEST_DEFAULTS[key]); });
    spikeNetCollisionEnabled.checked = SPIKE_TEST_DEFAULTS.netCollisionEnabled;
    defenseEnabled.checked = SINGLE_DEFENSE_DEFAULTS.enabled;
    defenseX.value = String(SINGLE_DEFENSE_DEFAULTS.initialX);
    defenseY.value = String(SINGLE_DEFENSE_DEFAULTS.initialY);
    defenseSpeed.value = String(SINGLE_DEFENSE_DEFAULTS.moveSpeed);
    simulator.configureSingleDefense(SINGLE_DEFENSE_DEFAULTS);
    refreshSpikeTarget();
    const snapshot = continuousRallyEnabled.checked
      ? continuousSimulator.getSnapshot() : simulator.getSnapshot();
    renderer.resetCamera(snapshot);
    renderer.render(snapshot);
  };
  const handleCameraMode = () => renderer.setCameraMode(cameraMode.value);
  const openZoneEditor = () => {
    if (attackEditor.active) closeAttackEditor();
    if (formationEditor.active) closeFormationEditor();
    resumeAfterZoneEditing = isReceiveExperimentRunning(simulator.getSnapshot().status);
    renderer.stop();
    renderer.setInteractionEnabled(false);
    zoneEditor.setActive(true);
    zoneEditButton.setAttribute("aria-pressed", "true");
    zoneCloseButton.focus({ preventScroll: true });
  };
  const closeZoneEditor = () => {
    zoneEditor.setActive(false);
    renderer.setInteractionEnabled(true);
    zoneEditButton.setAttribute("aria-pressed", "false");
    const snapshot = simulator.getSnapshot();
    if (resumeAfterZoneEditing && isReceiveExperimentRunning(snapshot.status)) {
      renderer.play(simulator);
    } else {
      renderer.renderWhenReady(snapshot);
    }
    resumeAfterZoneEditing = false;
    if (!root.hidden) zoneEditButton.focus({ preventScroll: true });
  };
  const openAttackEditor = () => {
    if (attackEditor.active) return;
    if (zoneEditor.active) closeZoneEditor();
    if (formationEditor.active) closeFormationEditor();
    resumeAfterAttackEditing = isReceiveExperimentRunning(simulator.getSnapshot().status);
    renderer.stop();
    renderer.setInteractionEnabled(false);
    attackEditor.setActive(true);
    attackEditButton.setAttribute("aria-pressed", "true");
    attackCloseButton.focus({ preventScroll: true });
  };
  const closeAttackEditor = () => {
    attackEditor.setActive(false);
    renderer.setInteractionEnabled(true);
    attackEditButton.setAttribute("aria-pressed", "false");
    const snapshot = simulator.getSnapshot();
    if (resumeAfterAttackEditing && isReceiveExperimentRunning(snapshot.status)) renderer.play(simulator);
    else renderer.renderWhenReady(snapshot);
    resumeAfterAttackEditing = false;
    if (!root.hidden) attackEditButton.focus({ preventScroll: true });
  };
  const openFormationEditor = () => {
    if (formationEditor.active) return;
    if (zoneEditor.active) closeZoneEditor();
    if (attackEditor.active) closeAttackEditor();
    renderer.stop();
    continuousRallyEnabled.checked = true;
    continuousSimulator.configureFormation(continuousFormation);
    renderer.setInteractionEnabled(false);
    formationEditor.setActive(true);
    formationEditButton.setAttribute("aria-pressed", "true");
    renderer.resetCamera(continuousSimulator.getSnapshot());
    renderer.renderWhenReady(continuousSimulator.getSnapshot());
    formationCloseButton.focus({ preventScroll: true });
  };
  const closeFormationEditor = () => {
    formationEditor.setActive(false);
    renderer.setInteractionEnabled(true);
    formationEditButton.setAttribute("aria-pressed", "false");
    renderer.renderWhenReady(continuousSimulator.getSnapshot());
    if (!root.hidden) formationEditButton.focus({ preventScroll: true });
  };
  const handleContinuousModeChange = () => {
    renderer.stop();
    if (!continuousRallyEnabled.checked && formationEditor.active) closeFormationEditor();
    const snapshot = continuousRallyEnabled.checked
      ? continuousSimulator.getSnapshot() : simulator.getSnapshot();
    renderer.resetCamera(snapshot);
    renderer.renderWhenReady(snapshot);
  };
  const startContinuousSession = () => {
    renderer.stop();
    continuousRallyEnabled.checked = true;
    continuousSession.baseSeed = Number(continuousRallySeed.value) >>> 0;
    rallyLogStore.beginSession();
    continuousSimulator.configure(readParameters());
    continuousSimulator.configureFormation(continuousFormation);
    continuousSession.start({ firstServingTeam: continuousServingTeam.value,
      serveType: continuousServeType.value, serveAbility: Number(continuousServeAbility.value) });
    attackMessage.textContent = "連續 Rally 測試進行中；每球完整收尾後自動計分並由得分方發下一球。";
    sessionStop.textContent = "暫停";
    renderer.play(continuousSession);
  };
  const toggleContinuousSessionPause = () => {
    if (continuousSession.active) {
      continuousSession.stop();
      renderer.stop();
      renderer.renderWhenReady(continuousSession.getSnapshot());
      sessionStop.textContent = "繼續";
      attackMessage.textContent = "連續 Rally 已暫停，比分、事件與最後畫面保留。";
    } else if (continuousSession.rallyNumber > 0) {
      continuousSession.resume();
      sessionStop.textContent = "暫停";
      attackMessage.textContent = "連續 Rally 已繼續。";
      renderer.play(continuousSession);
    }
  };
  const restartContinuousSession = () => startContinuousSession();
  const clearRallyLog = () => {
    rallyLogStore.clear();
    rallyLogOutput.textContent = "尚無 Rally 事件。";
    rallyLogMessage.textContent = "LOG 已清除。";
  };
  const copyRallyLog = async () => {
    try {
      const text = formatRallyEventLog(rallyLogStore.entries);
      if (!text) throw new Error("目前沒有可複製的事件。");
      await navigator.clipboard.writeText(text);
      rallyLogMessage.textContent = "完整 LOG 已複製。";
    } catch (error) {
      rallyLogMessage.textContent = `複製失敗：${error.message}`;
    }
  };
  const handleCopyZones = async () => {
    try {
      await zoneEditor.copyCoordinates();
    } catch (error) {
      zoneEditor.message.textContent = `複製失敗：${error.message}`;
    }
  };
  const handleApplyZones = () => {
    try {
      zoneEditor.applyPreview();
    } catch (error) {
      zoneEditor.message.textContent = `套用失敗：${error.message}`;
    }
  };
  const closeSettings = () => settingsDialog.close();
  const handleOpenSettings = () => {
    if (attackEditor.active) closeAttackEditor();
    if (formationEditor.active) closeFormationEditor();
    settingsError.textContent = "";
    settingsDialog.showModal();
    requestAnimationFrame(() => fields.avatarSize.focus({ preventScroll: true }));
  };
  const handleApplySettings = () => {
    try {
      simulator.configure(readParameters());
      renderer.stop();
      renderer.resetCamera(simulator.getSnapshot());
      renderer.renderWhenReady(simulator.getSnapshot());
      settingsError.textContent = "";
      settingsDialog.close();
    } catch (error) {
      settingsError.textContent = `設定未套用：${error.message}`;
    }
  };
  const handleSettingsClosed = () => {
    if (!root.hidden) settingsButton.focus({ preventScroll: true });
  };
  const handleBack = () => {
    renderer.stop();
    onExit();
  };
  resetButton.addEventListener("click", handleReset);
  backButton.addEventListener("click", handleBack);
  cameraMode.addEventListener("change", handleCameraMode);
  zoneEditButton.addEventListener("click", openZoneEditor);
  attackEditButton.addEventListener("click", openAttackEditor);
  attackCloseButton.addEventListener("click", closeAttackEditor);
  formationEditButton.addEventListener("click", openFormationEditor);
  formationCloseButton.addEventListener("click", closeFormationEditor);
  continuousRallyEnabled.addEventListener("change", handleContinuousModeChange);
  sessionStart.addEventListener("click", startContinuousSession);
  sessionStop.addEventListener("click", toggleContinuousSessionPause);
  sessionRestart.addEventListener("click", restartContinuousSession);
  rallyLogCopy.addEventListener("click", copyRallyLog);
  rallyLogClear.addEventListener("click", clearRallyLog);
  [attackEnabled, attackRotation, attackPlayer].forEach((control) => control.addEventListener("change", refreshAttackConfiguration));
  spikeEnabled.addEventListener("change", refreshSpikeTarget);
  spikeFlightMode.addEventListener("change", refreshSpikeTarget);
  spikeAttackAbility.addEventListener("input", refreshUnlockedSpeed);
  spikeSeedMode.addEventListener("change", refreshSpikeTarget);
  spikeClickMode.addEventListener("change", refreshSpikeTarget);
  spikeClear.addEventListener("click", clearSpikeTarget);
  [spikeTargetX, spikeTargetY].forEach((input) => input.addEventListener("input", handleSpikeCoordinates));
  zoneCloseButton.addEventListener("click", closeZoneEditor);
  zoneCopyButton.addEventListener("click", handleCopyZones);
  zoneApplyButton.addEventListener("click", handleApplyZones);
  settingsButton.addEventListener("click", handleOpenSettings);
  settingsClose.addEventListener("click", closeSettings);
  settingsCancel.addEventListener("click", closeSettings);
  settingsApply.addEventListener("click", handleApplySettings);
  settingsDialog.addEventListener("close", handleSettingsClosed);
  appearancePlayer.addEventListener("change", renderAppearanceEditor);
  appearanceFile.addEventListener("change", handleAppearanceFile);
  [appearanceSkin, appearanceZoom, appearanceX, appearanceY].forEach((control) => {
    control.addEventListener("input", handleAppearanceAdjustment);
  });
  appearanceRemove.addEventListener("click", handleRemovePhoto);
  writeParameters(TEAM_SIMULATOR_PARAMETERS);
  renderAppearanceEditor();
  refreshAttackConfiguration();

  return Object.freeze({
    show() {
      root.hidden = false;
      root.querySelector("#team-simulator-title").focus({ preventScroll: true });
      renderer.renderWhenReady(continuousRallyEnabled.checked
        ? continuousSimulator.getSnapshot() : simulator.getSnapshot());
    },
    hide() {
      renderer.stop();
      if (attackEditor.active) {
        attackEditor.setActive(false);
        renderer.setInteractionEnabled(true);
        attackEditButton.setAttribute("aria-pressed", "false");
        resumeAfterAttackEditing = false;
      }
      if (zoneEditor.active) {
        zoneEditor.setActive(false);
        renderer.setInteractionEnabled(true);
        resumeAfterZoneEditing = false;
      }
      if (formationEditor.active) closeFormationEditor();
      if (settingsDialog.open) settingsDialog.close();
      root.hidden = true;
    },
    destroy() {
      photoLoadSequence += 1;
      zoneEditor.destroy();
      attackEditor.destroy();
      formationEditor.destroy();
      renderer.destroy();
      resetButton.removeEventListener("click", handleReset);
      backButton.removeEventListener("click", handleBack);
      cameraMode.removeEventListener("change", handleCameraMode);
      zoneEditButton.removeEventListener("click", openZoneEditor);
      attackEditButton.removeEventListener("click", openAttackEditor);
      attackCloseButton.removeEventListener("click", closeAttackEditor);
      formationEditButton.removeEventListener("click", openFormationEditor);
      formationCloseButton.removeEventListener("click", closeFormationEditor);
      continuousRallyEnabled.removeEventListener("change", handleContinuousModeChange);
      sessionStart.removeEventListener("click", startContinuousSession);
      sessionStop.removeEventListener("click", toggleContinuousSessionPause);
      sessionRestart.removeEventListener("click", restartContinuousSession);
      rallyLogCopy.removeEventListener("click", copyRallyLog);
      rallyLogClear.removeEventListener("click", clearRallyLog);
      [attackEnabled, attackRotation, attackPlayer].forEach((control) => control.removeEventListener("change", refreshAttackConfiguration));
      spikeEnabled.removeEventListener("change", refreshSpikeTarget);
      spikeFlightMode.removeEventListener("change", refreshSpikeTarget);
      spikeAttackAbility.removeEventListener("input", refreshUnlockedSpeed);
      spikeSeedMode.removeEventListener("change", refreshSpikeTarget);
      spikeClickMode.removeEventListener("change", refreshSpikeTarget);
      spikeClear.removeEventListener("click", clearSpikeTarget);
      [spikeTargetX, spikeTargetY].forEach((input) => input.removeEventListener("input", handleSpikeCoordinates));
      zoneCloseButton.removeEventListener("click", closeZoneEditor);
      zoneCopyButton.removeEventListener("click", handleCopyZones);
      zoneApplyButton.removeEventListener("click", handleApplyZones);
      settingsButton.removeEventListener("click", handleOpenSettings);
      settingsClose.removeEventListener("click", closeSettings);
      settingsCancel.removeEventListener("click", closeSettings);
      settingsApply.removeEventListener("click", handleApplySettings);
      settingsDialog.removeEventListener("close", handleSettingsClosed);
      appearancePlayer.removeEventListener("change", renderAppearanceEditor);
      appearanceFile.removeEventListener("change", handleAppearanceFile);
      [appearanceSkin, appearanceZoom, appearanceX, appearanceY].forEach((control) => {
        control.removeEventListener("input", handleAppearanceAdjustment);
      });
      appearanceRemove.removeEventListener("click", handleRemovePhoto);
      appearances.forEach(({ photoUrl }) => {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
      });
    },
  });
}
