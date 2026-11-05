import {
  DEFAULT_SIMULATOR_PARAMETERS,
  SinglePlayerChaseSimulator,
} from "./simulator.js";
import { SimulatorRenderer } from "./simulator-renderer.js";

const PARAMETER_FIELDS = Object.freeze({
  avatarSize: "simulator-avatar-size",
  playerSpeed: "simulator-player-speed",
  contactRange: "simulator-contact-range",
  flightDuration: "simulator-flight-duration",
  initialPlayerX: "simulator-player-x",
  initialPlayerY: "simulator-player-y",
});

export function createSinglePlayerSimulatorApp({ root, onExit }) {
  const simulator = new SinglePlayerChaseSimulator();
  const fields = Object.fromEntries(
    Object.entries(PARAMETER_FIELDS).map(([key, id]) => [key, root.querySelector(`#${id}`)]),
  );
  const resetButton = root.querySelector("#simulator-reset");
  const backButton = root.querySelector("#simulator-back");

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

  const renderer = new SimulatorRenderer({
    root,
    onTargetSelected(target) {
      try {
        renderer.stop();
        if (simulator.getSnapshot().status === "RUNNING") simulator.reset();
        simulator.configure(readParameters());
        simulator.launch(target);
        renderer.play(simulator);
      } catch (error) {
        root.querySelector("#simulator-status").textContent = `參數錯誤：${error.message}`;
      }
    },
  });

  const handleReset = () => {
    renderer.stop();
    writeParameters(DEFAULT_SIMULATOR_PARAMETERS);
    simulator.configure(DEFAULT_SIMULATOR_PARAMETERS);
    renderer.render(simulator.getSnapshot());
  };
  const handleBack = () => {
    renderer.stop();
    onExit();
  };
  resetButton.addEventListener("click", handleReset);
  backButton.addEventListener("click", handleBack);
  writeParameters(DEFAULT_SIMULATOR_PARAMETERS);
  renderer.render(simulator.getSnapshot());

  return Object.freeze({
    show() {
      root.hidden = false;
      root.querySelector("#simulator-title").focus({ preventScroll: true });
      renderer.render(simulator.getSnapshot());
    },
    hide() {
      renderer.stop();
      root.hidden = true;
    },
    destroy() {
      renderer.destroy();
      resetButton.removeEventListener("click", handleReset);
      backButton.removeEventListener("click", handleBack);
    },
  });
}
