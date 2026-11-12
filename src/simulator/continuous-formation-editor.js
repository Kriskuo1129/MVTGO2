import { CONTINUOUS_TEAMS, DEFAULT_CONTINUOUS_FORMATION,
  updateContinuousFormationPosition, validateContinuousFormation } from "./continuous-rally-formation.js";

export class ContinuousFormationEditor {
  constructor({ root, renderer, formation, onChange }) {
    this.renderer = renderer;
    this.panel = root.querySelector("#continuous-formation-editor");
    this.overlay = root.querySelector("#continuous-formation-overlay");
    this.select = root.querySelector("#continuous-formation-player");
    this.xInput = root.querySelector("#continuous-formation-x");
    this.yInput = root.querySelector("#continuous-formation-y");
    this.message = root.querySelector("#continuous-formation-message");
    this.onChange = onChange;
    this.formation = validateContinuousFormation(formation);
    this.active = false;
    this.drag = null;
    this.listeners = [];
    const listen = (element, type, handler) => {
      element.addEventListener(type, handler);
      this.listeners.push(() => element.removeEventListener(type, handler));
    };
    for (const team of CONTINUOUS_TEAMS) for (const player of this.formation.teams[team]) {
      this.select.add(new Option(`${team}｜${player.position}`, player.playerId));
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "continuous-formation-marker";
      marker.dataset.playerId = player.playerId;
      marker.dataset.team = team;
      this.overlay.append(marker);
    }
    listen(this.select, "change", () => this.render());
    const input = () => {
      if (this.xInput.value === "" || this.yInput.value === "") return;
      this.attempt(() => this.updateSelected({ x: Number(this.xInput.value), y: Number(this.yInput.value) }));
    };
    listen(this.xInput, "change", input); listen(this.yInput, "change", input);
    listen(this.overlay, "pointerdown", (event) => {
      const marker = event.target.closest("[data-player-id]");
      if (!this.active || !marker || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      this.select.value = marker.dataset.playerId;
      this.drag = { pointerId: event.pointerId };
      this.overlay.setPointerCapture?.(event.pointerId);
      this.attempt(() => this.updateSelected(this.renderer.clientToWorld(event.clientX, event.clientY)));
    });
    listen(this.overlay, "pointermove", (event) => {
      if (event.pointerId !== this.drag?.pointerId) return;
      event.preventDefault();
      this.attempt(() => this.updateSelected(this.renderer.clientToWorld(event.clientX, event.clientY)));
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) listen(this.overlay, type, (event) => {
      if (event.pointerId === this.drag?.pointerId) this.endDrag();
    });
    listen(root.querySelector("#continuous-formation-default"), "click", () => {
      this.attempt(() => {
        this.formation = DEFAULT_CONTINUOUS_FORMATION;
        this.onChange(this.formation); this.render();
        this.message.textContent = "已恢復並儲存 V1 預設站位。";
      });
    });
    this.render();
  }

  get selected() {
    return CONTINUOUS_TEAMS.flatMap((team) => this.formation.teams[team])
      .find((entry) => entry.playerId === this.select.value);
  }

  attempt(handler) {
    try { handler(); } catch (error) { this.message.textContent = `站位未套用：${error.message}`; }
  }

  updateSelected(point) {
    this.formation = updateContinuousFormationPosition(this.formation, this.select.value, point);
    this.onChange(this.formation); this.render();
    this.message.textContent = `${this.select.value} 已更新並儲存。`;
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
    const selected = this.selected ?? this.formation.teams.HOME[0];
    if (!this.select.value) this.select.value = selected.playerId;
    this.xInput.value = String(selected.x); this.yInput.value = String(selected.y);
    for (const marker of this.overlay.querySelectorAll("[data-player-id]")) {
      const player = CONTINUOUS_TEAMS.flatMap((team) => this.formation.teams[team])
        .find((entry) => entry.playerId === marker.dataset.playerId);
      marker.textContent = `${marker.dataset.team === "HOME" ? "H" : "A"}·${player.position}`;
      marker.classList.toggle("is-selected", player.playerId === selected.playerId);
      marker.style.left = `${player.x / 2280 * 100}%`;
      marker.style.top = `${player.y / 900 * 100}%`;
    }
  }

  destroy() { this.endDrag(); this.listeners.forEach((remove) => remove()); }
}
