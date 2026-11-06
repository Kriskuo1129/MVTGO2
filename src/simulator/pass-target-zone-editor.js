import {
  createPassTargetZones,
  PASS_TARGET_ZONES_V1,
} from "./pass-target-zones.js";
import { SIMULATOR_WORLD } from "./simulator.js";

export const RECEIVING_SIDE_EDIT_BOUNDS = Object.freeze({
  minX: SIMULATOR_WORLD.width / 2,
  maxX: SIMULATOR_WORLD.width,
  minY: 0,
  maxY: SIMULATOR_WORLD.height,
});

export const DEFAULT_EDITABLE_PASS_TARGET_ZONES = Object.freeze({
  perfect: PASS_TARGET_ZONES_V1.perfect,
  normalOuter: PASS_TARGET_ZONES_V1.normalOuter,
});

const MINIMUM_ZONE_SIZE = 20;
const DRAG_CONTAINMENT_GAP = 1;
const COORDINATE_FIELDS = Object.freeze(["minX", "maxX", "minY", "maxY"]);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function copyRectangle(rectangle) {
  return COORDINATE_FIELDS.reduce((copy, field) => {
    copy[field] = rectangle[field];
    return copy;
  }, {});
}

function assertEditableRectangle(rectangle, label) {
  if (!COORDINATE_FIELDS.every((field) => Number.isFinite(rectangle?.[field]))) {
    throw new RangeError(`${label} 的四個座標都必須是有限數值。`);
  }
  if (rectangle.maxX - rectangle.minX < MINIMUM_ZONE_SIZE
    || rectangle.maxY - rectangle.minY < MINIMUM_ZONE_SIZE) {
    throw new RangeError(`${label} 的寬度與高度至少需要 ${MINIMUM_ZONE_SIZE} 世界單位。`);
  }
}

function contains(outer, inner) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX
    && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export function validateEditablePassTargetZones(zones) {
  const perfect = copyRectangle(zones.perfect);
  const normalOuter = copyRectangle(zones.normalOuter);
  assertEditableRectangle(perfect, "PERFECT 黃色區域");
  assertEditableRectangle(normalOuter, "NORMAL 藍色區域");
  if (!contains(RECEIVING_SIDE_EDIT_BOUNDS, normalOuter)) {
    throw new RangeError("NORMAL 藍色區域不得超出接球方世界範圍。");
  }
  if (!contains(normalOuter, perfect)) {
    throw new RangeError("PERFECT 黃色區域必須完整位於 NORMAL 藍色區域內。");
  }
  createPassTargetZones({
    perfect,
    normalOuter,
    bad: PASS_TARGET_ZONES_V1.bad,
  }, SIMULATOR_WORLD);
  return Object.freeze({
    perfect: Object.freeze(perfect),
    normalOuter: Object.freeze(normalOuter),
  });
}

function moveRectangle(rectangle, deltaX, deltaY, bounds) {
  const width = rectangle.maxX - rectangle.minX;
  const height = rectangle.maxY - rectangle.minY;
  const minX = clamp(rectangle.minX + deltaX, bounds.minX, bounds.maxX - width);
  const minY = clamp(rectangle.minY + deltaY, bounds.minY, bounds.maxY - height);
  return { minX, maxX: minX + width, minY, maxY: minY + height };
}

function resizeRectangle(rectangle, handle, deltaX, deltaY, bounds) {
  const resized = copyRectangle(rectangle);
  if (handle.includes("w")) {
    resized.minX = clamp(rectangle.minX + deltaX, bounds.minX, rectangle.maxX - MINIMUM_ZONE_SIZE);
  }
  if (handle.includes("e")) {
    resized.maxX = clamp(rectangle.maxX + deltaX, rectangle.minX + MINIMUM_ZONE_SIZE, bounds.maxX);
  }
  if (handle.includes("n")) {
    resized.minY = clamp(rectangle.minY + deltaY, bounds.minY, rectangle.maxY - MINIMUM_ZONE_SIZE);
  }
  if (handle.includes("s")) {
    resized.maxY = clamp(rectangle.maxY + deltaY, rectangle.minY + MINIMUM_ZONE_SIZE, bounds.maxY);
  }
  return resized;
}

export function transformEditableZones({ zones, zoneName, handle, deltaX, deltaY }) {
  const current = validateEditablePassTargetZones(zones);
  let perfect = copyRectangle(current.perfect);
  let normalOuter = copyRectangle(current.normalOuter);
  if (handle === "move") {
    if (zoneName === "perfect") {
      perfect = moveRectangle(perfect, deltaX, deltaY, {
        minX: normalOuter.minX + DRAG_CONTAINMENT_GAP,
        maxX: normalOuter.maxX - DRAG_CONTAINMENT_GAP,
        minY: normalOuter.minY + DRAG_CONTAINMENT_GAP,
        maxY: normalOuter.maxY - DRAG_CONTAINMENT_GAP,
      });
    } else {
      const movedNormal = moveRectangle(
        normalOuter,
        deltaX,
        deltaY,
        RECEIVING_SIDE_EDIT_BOUNDS,
      );
      const actualDeltaX = movedNormal.minX - normalOuter.minX;
      const actualDeltaY = movedNormal.minY - normalOuter.minY;
      normalOuter = movedNormal;
      perfect = moveRectangle(perfect, actualDeltaX, actualDeltaY, normalOuter);
    }
  } else if (zoneName === "perfect") {
    perfect = resizeRectangle(perfect, handle, deltaX, deltaY, {
      minX: normalOuter.minX + DRAG_CONTAINMENT_GAP,
      maxX: normalOuter.maxX - DRAG_CONTAINMENT_GAP,
      minY: normalOuter.minY + DRAG_CONTAINMENT_GAP,
      maxY: normalOuter.maxY - DRAG_CONTAINMENT_GAP,
    });
  } else {
    const containmentBounds = {
      minX: RECEIVING_SIDE_EDIT_BOUNDS.minX,
      maxX: RECEIVING_SIDE_EDIT_BOUNDS.maxX,
      minY: RECEIVING_SIDE_EDIT_BOUNDS.minY,
      maxY: RECEIVING_SIDE_EDIT_BOUNDS.maxY,
    };
    normalOuter = resizeRectangle(normalOuter, handle, deltaX, deltaY, containmentBounds);
    normalOuter.minX = Math.min(normalOuter.minX, perfect.minX);
    normalOuter.maxX = Math.max(normalOuter.maxX, perfect.maxX);
    normalOuter.minY = Math.min(normalOuter.minY, perfect.minY);
    normalOuter.maxY = Math.max(normalOuter.maxY, perfect.maxY);
    if (handle.includes("w")) normalOuter.minX = Math.min(normalOuter.minX, perfect.minX - DRAG_CONTAINMENT_GAP);
    if (handle.includes("e")) normalOuter.maxX = Math.max(normalOuter.maxX, perfect.maxX + DRAG_CONTAINMENT_GAP);
    if (handle.includes("n")) normalOuter.minY = Math.min(normalOuter.minY, perfect.minY - DRAG_CONTAINMENT_GAP);
    if (handle.includes("s")) normalOuter.maxY = Math.max(normalOuter.maxY, perfect.maxY + DRAG_CONTAINMENT_GAP);
  }
  return validateEditablePassTargetZones({ perfect, normalOuter });
}

export function createPassTargetZoneOutput(zones) {
  const validated = validateEditablePassTargetZones(zones);
  return Object.freeze({
    coordinateSystem: Object.freeze({
      origin: "TOP_LEFT",
      xDirection: "RIGHT",
      yDirection: "DOWN",
      worldWidth: SIMULATOR_WORLD.width,
      worldHeight: SIMULATOR_WORLD.height,
    }),
    receivingSide: "RIGHT",
    receivingSideEditBounds: RECEIVING_SIDE_EDIT_BOUNDS,
    perfect: validated.perfect,
    normalOuter: validated.normalOuter,
    bad: PASS_TARGET_ZONES_V1.bad,
    version: "V1",
  });
}

export class PassTargetZoneEditor {
  constructor({ root, renderer, onApply }) {
    this.root = root;
    this.renderer = renderer;
    this.onApply = onApply;
    this.panel = root.querySelector("#pass-target-zone-editor");
    this.viewport = root.querySelector("#team-simulator-viewport");
    this.overlay = root.querySelector("#pass-target-zone-overlay");
    this.output = root.querySelector("#pass-target-zone-output");
    this.message = root.querySelector("#pass-target-zone-message");
    this.inputs = new Map([...root.querySelectorAll("[data-zone-coordinate]")].map((input) => [
      `${input.dataset.zone}.${input.dataset.zoneCoordinate}`,
      input,
    ]));
    this.zones = validateEditablePassTargetZones(DEFAULT_EDITABLE_PASS_TARGET_ZONES);
    this.drag = null;
    this.active = false;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.overlay.addEventListener("pointerdown", this.handlePointerDown);
    this.inputs.forEach((input) => input.addEventListener("change", this.handleInput));
    this.render();
  }

  setActive(active) {
    this.active = active;
    this.panel.hidden = !active;
    this.overlay.hidden = !active;
    this.viewport.classList.toggle("is-editing-pass-zones", active);
    this.render();
  }

  handlePointerDown(event) {
    const target = event.target.closest("[data-zone]");
    if (!this.active || !target) return;
    event.preventDefault();
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    this.drag = {
      pointerId: event.pointerId,
      zoneName: target.dataset.zone,
      handle: event.target.dataset.handle || "move",
      startPoint: point,
      startZones: this.zones,
    };
    this.overlay.setPointerCapture(event.pointerId);
    this.overlay.addEventListener("pointermove", this.handlePointerMove);
    this.overlay.addEventListener("pointerup", this.handlePointerUp);
    this.overlay.addEventListener("pointercancel", this.handlePointerUp);
  }

  handlePointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const point = this.renderer.clientToWorld(event.clientX, event.clientY);
    this.zones = transformEditableZones({
      zones: this.drag.startZones,
      zoneName: this.drag.zoneName,
      handle: this.drag.handle,
      deltaX: point.x - this.drag.startPoint.x,
      deltaY: point.y - this.drag.startPoint.y,
    });
    this.message.textContent = "";
    this.render();
  }

  handlePointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.overlay.releasePointerCapture?.(event.pointerId);
    this.overlay.removeEventListener("pointermove", this.handlePointerMove);
    this.overlay.removeEventListener("pointerup", this.handlePointerUp);
    this.overlay.removeEventListener("pointercancel", this.handlePointerUp);
  }

  handleInput() {
    try {
      const next = { perfect: {}, normalOuter: {} };
      this.inputs.forEach((input) => {
        next[input.dataset.zone][input.dataset.zoneCoordinate] = Number(input.value);
      });
      this.zones = validateEditablePassTargetZones(next);
      this.message.textContent = "";
      this.render();
    } catch (error) {
      this.message.textContent = error.message;
      this.writeInputs();
    }
  }

  getPreviewConfiguration() {
    const output = createPassTargetZoneOutput(this.zones);
    return Object.freeze({
      perfect: output.perfect,
      normalOuter: output.normalOuter,
      bad: output.bad,
    });
  }

  applyPreview() {
    const configuration = this.getPreviewConfiguration();
    this.onApply(configuration);
    this.message.textContent = "目前區域已套用至本次六人實驗預覽。";
    return configuration;
  }

  async copyCoordinates() {
    const text = JSON.stringify(createPassTargetZoneOutput(this.zones), null, 2);
    this.output.value = text;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      this.output.focus();
      this.output.select();
      if (!document.execCommand("copy")) throw new Error("瀏覽器拒絕複製座標。");
    }
    this.message.textContent = "座標 JSON 已複製。";
  }

  writeInputs() {
    this.inputs.forEach((input, key) => {
      const [zoneName, field] = key.split(".");
      input.value = String(this.zones[zoneName][field]);
    });
  }

  renderRectangle(zoneName) {
    const rectangle = this.zones[zoneName];
    const element = this.overlay.querySelector(`[data-zone="${zoneName}"]`);
    element.style.left = `${rectangle.minX / SIMULATOR_WORLD.width * 100}%`;
    element.style.top = `${rectangle.minY / SIMULATOR_WORLD.height * 100}%`;
    element.style.width = `${(rectangle.maxX - rectangle.minX) / SIMULATOR_WORLD.width * 100}%`;
    element.style.height = `${(rectangle.maxY - rectangle.minY) / SIMULATOR_WORLD.height * 100}%`;
  }

  render() {
    this.renderRectangle("normalOuter");
    this.renderRectangle("perfect");
    this.writeInputs();
    this.output.value = JSON.stringify(createPassTargetZoneOutput(this.zones), null, 2);
  }

  destroy() {
    this.handlePointerUp({ pointerId: this.drag?.pointerId });
    this.overlay.removeEventListener("pointerdown", this.handlePointerDown);
    this.inputs.forEach((input) => input.removeEventListener("change", this.handleInput));
  }
}
