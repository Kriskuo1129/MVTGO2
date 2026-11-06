import {
  SixPlayerReceiveSimulator,
  TEAM_SIMULATOR_PARAMETERS,
} from "./team-simulator.js";
import { TeamSimulatorRenderer } from "./team-simulator-renderer.js";
import { RECEIVE_SPEED_OPTIONS } from "./receive-animation.js";

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

export function createTeamSimulatorApp({ root, onExit }) {
  const simulator = new SixPlayerReceiveSimulator();
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
    onTargetSelected(target) {
      try {
        renderer.stop();
        if (simulator.getSnapshot().status === "RUNNING") simulator.reset();
        simulator.configure(readParameters());
        simulator.launch(target);
        renderer.play(simulator);
      } catch (error) {
        root.querySelector("#team-simulator-status").textContent = `參數錯誤：${error.message}`;
      }
    },
  });

  const players = simulator.getSnapshot().players;
  players.forEach((player) => {
    const appearance = createDefaultAppearance();
    appearances.set(player.id, appearance);
    renderer.setPlayerAppearance(player.id, appearance);
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
    renderer.setPlayerAppearance(playerId, appearance);
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
    renderer.stop();
    writeParameters(TEAM_SIMULATOR_PARAMETERS);
    simulator.configure(TEAM_SIMULATOR_PARAMETERS);
    renderer.resetCamera(simulator.getSnapshot());
    renderer.render(simulator.getSnapshot());
  };
  const handleCameraMode = () => renderer.setCameraMode(cameraMode.value);
  const closeSettings = () => settingsDialog.close();
  const handleOpenSettings = () => {
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

  return Object.freeze({
    show() {
      root.hidden = false;
      root.querySelector("#team-simulator-title").focus({ preventScroll: true });
      renderer.renderWhenReady(simulator.getSnapshot());
    },
    hide() {
      renderer.stop();
      if (settingsDialog.open) settingsDialog.close();
      root.hidden = true;
    },
    destroy() {
      photoLoadSequence += 1;
      renderer.destroy();
      resetButton.removeEventListener("click", handleReset);
      backButton.removeEventListener("click", handleBack);
      cameraMode.removeEventListener("change", handleCameraMode);
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
