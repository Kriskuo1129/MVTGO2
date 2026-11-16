import { CONTINUOUS_FORMATION_MODES, CONTINUOUS_FORMATION_ROTATIONS,
  constrainContinuousPosition, exportContinuousFormationLibrary, importContinuousFormationLibrary,
  resetContinuousFormationLibraryMode, updateContinuousFormationLibraryPosition,
  validateContinuousFormationLibrary } from "./continuous-rally-formation.js";

export class ContinuousFormationEditor {
  constructor({ root, renderer, formation, onChange, onSave, onReload }) {
    this.renderer = renderer;
    this.panel = root.querySelector("#continuous-formation-editor");
    this.overlay = root.querySelector("#continuous-formation-overlay");
    this.rotationSelect = root.querySelector("#continuous-formation-rotation");
    this.modeSelect = root.querySelector("#continuous-formation-mode");
    this.select = root.querySelector("#continuous-formation-player");
    this.xInput = root.querySelector("#continuous-formation-x");
    this.yInput = root.querySelector("#continuous-formation-y");
    this.message = root.querySelector("#continuous-formation-message");
    this.onChange = onChange;
    this.onSave = onSave;
    this.onReload = onReload;
    this.importInput = root.querySelector("#continuous-formation-import-input");
    this.formation = validateContinuousFormationLibrary(formation);
    this.active = false;
    this.drag = null;
    this.listeners = [];
    const listen = (element, type, handler) => {
      element.addEventListener(type, handler);
      this.listeners.push(() => element.removeEventListener(type, handler));
    };
    for (const position of this.profile.SERVE.map((entry) => entry.position)) {
      this.select.add(new Option(position, position));
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "continuous-formation-marker";
      marker.dataset.playerId = position;
      marker.dataset.team = "STANDARD";
      this.overlay.append(marker);
    }
    listen(this.rotationSelect, "change", () => this.render());
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
        this.formation = resetContinuousFormationLibraryMode(this.formation,
          this.rotation, this.mode);
        this.persist();
        this.message.textContent = `已還原並儲存 ${this.rotation}/${this.mode} 預設。`;
      });
    });
    listen(root.querySelector("#continuous-formation-save"), "click", () => this.attempt(() => {
      this.persist(); this.message.textContent = "R1～R6 全部站位已儲存。";
    }));
    listen(root.querySelector("#continuous-formation-reload"), "click", () => this.attempt(() => {
      this.formation = validateContinuousFormationLibrary(this.onReload());
      this.onChange(this.formation); this.render(); this.message.textContent = "已重新載入本機儲存站位。";
    }));
    listen(root.querySelector("#continuous-formation-export"), "click", () => this.attempt(() => {
      const blob = new Blob([exportContinuousFormationLibrary(this.formation)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "MVTGO2_R1-R6_FORMATIONS.json"; anchor.hidden = true;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message.textContent = "已匯出 R1～R6 全部站位 JSON。";
    }));
    listen(root.querySelector("#continuous-formation-import"), "click", () => this.importInput.click());
    listen(this.importInput, "change", async () => {
      const file = this.importInput.files?.[0];
      this.importInput.value = "";
      if (!file) return;
      await this.attemptAsync(async () => {
        const imported = importContinuousFormationLibrary(await file.text());
        this.formation = validateContinuousFormationLibrary(this.onSave(imported));
        this.onChange(this.formation); this.render();
        this.message.textContent = "六輪站位匯入成功並已儲存。";
      });
    });
    this.render();
  }

  get rotation() { return this.rotationSelect.value || CONTINUOUS_FORMATION_ROTATIONS[0]; }

  get mode() { return this.modeSelect.value || CONTINUOUS_FORMATION_MODES.SERVE; }

  get profile() { return this.formation.rotations[this.rotation].profiles; }

  get selected() {
    return this.profile[this.mode].find((entry) => entry.position === this.select.value);
  }

  attempt(handler) {
    try { handler(); } catch (error) { this.message.textContent = `站位未套用：${error.message}`; }
  }

  async attemptAsync(handler) {
    try { await handler(); } catch (error) { this.message.textContent = `站位未套用：${error.message}`; }
  }

  persist() {
    this.formation = validateContinuousFormationLibrary(this.onSave(this.formation));
    this.onChange(this.formation); this.render();
  }

  updateSelected(point, constrainDrag = false) {
    const legalPoint = constrainContinuousPosition(point);
    if (!constrainDrag && (Math.abs(legalPoint.x - point.x) > 1e-7 || Math.abs(legalPoint.y - point.y) > 1e-7)) {
      throw new RangeError("輸入座標超出 R1 合法半場範圍。");
    }
    this.formation = updateContinuousFormationLibraryPosition(this.formation,
      this.rotation, this.mode, this.select.value, legalPoint);
    this.persist();
    this.message.textContent = `${this.rotation}/${this.mode}/${this.select.value} 已更新並自動儲存。`;
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
    const selected = this.selected ?? this.profile[this.mode][0];
    if (!this.select.value) this.select.value = selected.position;
    this.xInput.value = String(selected.x); this.yInput.value = String(selected.y);
    for (const marker of this.overlay.querySelectorAll("[data-player-id]")) {
      const player = this.profile[this.mode]
        .find((entry) => entry.position === marker.dataset.playerId);
      marker.textContent = player.position;
      marker.classList.toggle("is-selected", player.position === selected.position);
      marker.style.left = `${player.x / 2280 * 100}%`;
      marker.style.top = `${player.y / 900 * 100}%`;
    }
  }

  destroy() { this.endDrag(); this.listeners.forEach((remove) => remove()); }
}
