import {
  DEFAULT_SIMULATOR_PARAMETERS,
} from "./simulator.js";
import { SixPlayerReceiveSimulator } from "./team-simulator.js";
import { TeamSimulatorRenderer } from "./team-simulator-renderer.js";

const PARAMETER_FIELDS = Object.freeze({
  avatarSize: "team-simulator-avatar-size",
  playerSpeed: "team-simulator-player-speed",
  contactRange: "team-simulator-contact-range",
  flightDuration: "team-simulator-flight-duration",
});

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

  const handleReset = () => {
    renderer.stop();
    writeParameters(DEFAULT_SIMULATOR_PARAMETERS);
    simulator.configure(DEFAULT_SIMULATOR_PARAMETERS);
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
  writeParameters(DEFAULT_SIMULATOR_PARAMETERS);

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
      renderer.destroy();
      resetButton.removeEventListener("click", handleReset);
      backButton.removeEventListener("click", handleBack);
      cameraMode.removeEventListener("change", handleCameraMode);
      settingsButton.removeEventListener("click", handleOpenSettings);
      settingsClose.removeEventListener("click", closeSettings);
      settingsCancel.removeEventListener("click", closeSettings);
      settingsApply.removeEventListener("click", handleApplySettings);
      settingsDialog.removeEventListener("close", handleSettingsClosed);
    },
  });
}
