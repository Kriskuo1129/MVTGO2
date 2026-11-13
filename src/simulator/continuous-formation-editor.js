import { CONTINUOUS_FORMATION_MODES,
  constrainContinuousPosition, resetContinuousFormationMode, updateContinuousFormationPosition,
  validateContinuousFormation } from "./continuous-rally-formation.js";

export class ContinuousFormationEditor {
  constructor({ root, renderer, formation, onChange, onSave, onReload }) {
    this.renderer = renderer;
    this.panel = root.querySelector("#continuous-formation-editor");
    this.overlay = root.querySelector("#continuous-formation-overlay");
    this.modeSelect = root.querySelector("#continuous-formation-mode");
    this.select = root.querySelector("#continuous-formation-player");
    this.xInput = root.querySelector("#continuous-formation-x");
    this.yInput = root.querySelector("#continuous-formation-y");
    this.message = root.querySelector("#continuous-formation-message");
    this.onChange = onChange;
    this.onSave = onSave;
    this.onReload = onReload;
    this.formation = validateContinuousFormation(formation);
    this.active = false;
    this.drag = null;
    this.listeners = [];
    const listen = (element, type, handler) => {
      element.addEventListener(type, handler);
      this.listeners.push(() => element.removeEventListener(type, handler));
    };
    for (const position of this.formation.profiles.SERVE.map((entry) => entry.position)) {
      this.select.add(new Option(position, position));
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "continuous-formation-marker";
      marker.dataset.playerId = position;
      marker.dataset.team = "STANDARD";
      this.overlay.append(marker);
    }
    listen(this.modeSelect, "change", () => this.render());
    listen(this.select, "change", () => this.render());
    const input = () => {
      if (this.xInput.value === "" || this.yInput.value === "") return;
      this.attempt(() => this.updateSelected({ x: Number(this.xInput.value), y: Number(this.yInput.value) }, false));
    };
    listen(this.xInput, "change", input); listen(this.yInput, "change", input);
    listen(this.overlay, "pointerdown", (event) => {
      const marker = event.target.closest("[data-player-id]");
      if (!this.active || !marker || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      this.select.value = marker.dataset.playerId;
      this.drag = { pointerId: event.pointerId };
      this.overlay.setPointerCapture?.(event.pointerId);
      this.attempt(() => this.updateSelected(this.renderer.clientToWorld(event.clientX, event.clientY), true));
    });
    listen(this.overlay, "pointermove", (event) => {
      if (event.pointerId !== this.drag?.pointerId) return;
      event.preventDefault();
      this.attempt(() => this.updateSelected(this.renderer.clientToWorld(event.clientX, event.clientY), true));
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) listen(this.overlay, type, (event) => {
      if (event.pointerId === this.drag?.pointerId) this.endDrag();
    });
    listen(root.querySelector("#continuous-formation-default"), "click", () => {
      this.attempt(() => {
        this.formation = resetContinuousFormationMode(this.formation, this.mode);
        this.onChange(this.formation); this.render();
        this.message.textContent = `已還原 ${this.mode} 預設；按「儲存目前配置」寫入本機。`;
      });
    });
    listen(root.querySelector("#continuous-formation-save"), "click", () => this.attempt(() => {
      this.formation = validateContinuousFormation(this.onSave(this.formation));
      this.render(); this.message.textContent = `${this.mode} 與另一配置已儲存。`;
    }));
    listen(root.querySelector("#continuous-formation-reload"), "click", () => this.attempt(() => {
      this.formation = validateContinuousFormation(this.onReload());
      this.onChange(this.formation); this.render(); this.message.textContent = "已重新載入本機儲存站位。";
    }));
    this.render();
  }

  get mode() { return this.modeSelect.value || CONTINUOUS_FORMATION_MODES.SERVE; }

  get selected() {
    return this.formation.profiles[this.mode].find((entry) => entry.position === this.select.value);
  }

  attempt(handler) {
    try { handler(); } catch (error) { this.message.textContent = `站位未套用：${error.message}`; }
  }

  updateSelected(point, constrainDrag = false) {
    const legalPoint = constrainContinuousPosition(point);
    if (!constrainDrag && (Math.abs(legalPoint.x - point.x) > 1e-7 || Math.abs(legalPoint.y - point.y) > 1e-7)) {
      throw new RangeError("輸入座標超出 R1 合法半場範圍。");
    }
    this.formation = updateContinuousFormationPosition(this.formation, this.mode, this.select.value, legalPoint);
    this.onChange(this.formation); this.render();
    this.message.textContent = `${this.mode}/${this.select.value} 已更新；尚未儲存。`;
  }

  endDrag() {
    const drag = this.drag; this.drag = null;
    if (drag && this.overlay.hasPointerCapture?.(drag.pointerId)) this.overlay.releasePointerCapture(drag.pointerId);
  }

  setActive(active) {
    this.endDrag(); this.active = Boolean(active);
    this.panel.hidden = !this.active; this.overlay.hidden = !this.active;
    if (this.active) this.render();
  }

  render() {
    const selected = this.selected ?? this.formation.profiles[this.mode][0];
    if (!this.select.value) this.select.value = selected.position;
    this.xInput.value = String(selected.x); this.yInput.value = String(selected.y);
    for (const marker of this.overlay.querySelectorAll("[data-player-id]")) {
      const player = this.formation.profiles[this.mode]
        .find((entry) => entry.position === marker.dataset.playerId);
      marker.textContent = player.position;
      marker.classList.toggle("is-selected", player.position === selected.position);
      marker.style.left = `${player.x / 2280 * 100}%`;
      marker.style.top = `${player.y / 900 * 100}%`;
    }
  }

  destroy() { this.endDrag(); this.listeners.forEach((remove) => remove()); }
}
