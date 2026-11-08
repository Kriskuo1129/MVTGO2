import { LINEUP_POSITIONS } from "../lineup/starting-lineup.js";
import { SIMULATOR_WORLD } from "./simulator.js";
import {
  ATTACK_ROTATIONS, ATTACK_TYPE_LABELS, ATTACK_POSITION_BOUNDS, DEFAULT_ATTACK_POSITIONS,
  getAttackPosition, setAttackPosition, validateAttackPositions,
} from "./attack-positions.js";

// 編輯草稿與套用快照只存在本次頁面；不寫入 Simulator、Match 或正式預設。
export class AttackPositionEditor {
  constructor({ root, renderer, onPreviewChange = () => {} }) {
    this.renderer = renderer;
    this.panel = root.querySelector("#attack-position-editor");
    this.overlay = root.querySelector("#attack-position-overlay");
    this.message = root.querySelector("#attack-position-message");
    this.output = root.querySelector("#attack-position-output");
    this.current = root.querySelector("#attack-position-current");
    this.selects = Object.fromEntries(["rotation", "playerSlot", "attackType"].map((key) =>
      [key, this.panel.querySelector(`[data-attack-select="${key}"]`)]));
    for (const [key, options] of Object.entries({
      rotation: ATTACK_ROTATIONS.map((value) => [value, value]),
      playerSlot: LINEUP_POSITIONS.map((value) => [value, value]),
      attackType: Object.entries(ATTACK_TYPE_LABELS).map(([value, label]) => [value, `${label}（${value}）`]),
    })) for (const [value, label] of options) this.selects[key].add(new Option(label, value));
    this.inputs = [...this.panel.querySelectorAll("[data-attack-coordinate]")];
    const bounds = ATTACK_POSITION_BOUNDS;
    for (const input of this.inputs) {
      input.min = input.dataset.attackCoordinate === "x" ? bounds.minX : bounds.minY;
      input.max = input.dataset.attackCoordinate === "x" ? bounds.maxX : bounds.maxY;
    }
    this.data = DEFAULT_ATTACK_POSITIONS;
    this.preview = DEFAULT_ATTACK_POSITIONS;
    this.active = false;
    this.placement = null;
    this.drag = null;
    this.listeners = [];
    const listen = (element, event, handler) => {
      element.addEventListener(event, handler);
      this.listeners.push(() => element.removeEventListener(event, handler));
    };
    Object.values(this.selects).forEach((select) => listen(select, "change", () => {
      this.endDrag(); this.placement = null; this.message.textContent = ""; this.render();
    }));
    this.inputs.forEach((input) => listen(input, "input", () => this.attempt(() => {
      const field = input.dataset.attackPoint;
      const values = this.inputs.filter((item) => item.dataset.attackPoint === field);
      if (values.some((item) => item.value.trim() === "")) throw new Error("X、Y 都需要輸入數值；尚未完成的輸入不會套用。");
      this.updatePoint(field, Object.fromEntries(values.map((item) => [item.dataset.attackCoordinate, Number(item.value)])));
    })));
    this.panel.querySelectorAll("[data-attack-place]").forEach((button) => listen(button, "click", () => {
      this.placement = button.dataset.attackPlace;
      this.message.textContent = `請點擊接球方半場設定 ${this.placement === "readyPosition" ? "READY" : "ATTACK"}。`;
    }));
    const action = (id, handler) => listen(root.querySelector(id), "click", () => this.attempt(handler));
    action("#attack-position-import", () => {
      const imported = validateAttackPositions(JSON.parse(this.output.value));
      this.endDrag(); this.data = imported; this.render();
      this.message.textContent = "JSON 驗證通過並載入草稿；尚未套用預覽。";
    });
    action("#attack-position-export", () => {
      this.output.value = JSON.stringify(this.data, null, 2);
      this.message.textContent = "已匯出全部草稿；未完成的項目保留 null／UNCONFIGURED。";
    });
    action("#attack-position-copy", async () => {
      this.output.value = JSON.stringify(this.data, null, 2);
      if (globalThis.navigator?.clipboard?.writeText) await navigator.clipboard.writeText(this.output.value);
      else {
        this.output.focus(); this.output.select();
        if (!document.execCommand("copy")) throw new Error("無法自動複製，請手動複製 JSON 欄位。");
      }
      this.message.textContent = "全部站位 JSON 已複製。";
    });
    action("#attack-position-apply", () => {
      if (this.hasPendingInput()) throw new Error("欄位仍有未完成或非法輸入，請修正後再套用。");
      this.preview = validateAttackPositions(this.data);
      onPreviewChange(this.preview);
      this.render(); this.message.textContent = "已套用至本次編輯預覽，作為重設基準；未修改正式預設或球員位置。";
    });
    action("#attack-position-reset", () => {
      this.endDrag(); this.placement = null; this.data = this.preview; this.render();
      this.message.textContent = "已重設至上次套用預覽；首次基準為正式預設（僅 R1／OH1／LEFT_LONG）。";
    });
    action("#attack-position-clear", () => {
      this.updatePoint("readyPosition", null); this.updatePoint("attackPosition", null);
    });
    listen(this.overlay, "pointerdown", (event) => {
      if (!this.active || event.button !== 0) return;
      const marker = event.target.closest("[data-attack-marker]");
      const field = marker?.dataset.attackMarker ?? this.placement;
      if (!field) return;
      event.preventDefault(); event.stopPropagation();
      this.attempt(() => {
        if (!marker) {
          this.updatePoint(field, this.renderer.clientToWorld(event.clientX, event.clientY));
          this.placement = null;
        } else {
          this.drag = { pointerId: event.pointerId, field,
            startPoint: this.renderer.clientToWorld(event.clientX, event.clientY),
            startPosition: getAttackPosition(this.data, this.selection)[field] };
          this.overlay.setPointerCapture(event.pointerId);
        }
      });
    });
    listen(this.overlay, "pointermove", (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      this.attempt(() => {
        const point = this.renderer.clientToWorld(event.clientX, event.clientY);
        const { field, startPoint, startPosition } = this.drag;
        this.updatePoint(field, { x: startPosition.x + point.x - startPoint.x,
          y: startPosition.y + point.y - startPoint.y });
      });
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) listen(this.overlay, type, (event) => {
      if (event.pointerId === this.drag?.pointerId) this.endDrag();
    });
    this.render();
  }

  async attempt(handler) {
    try { await handler(); } catch (error) { this.message.textContent = error.message; }
  }

  get selection() {
    return Object.fromEntries(Object.entries(this.selects).map(([key, select]) => [key, select.value]));
  }

  hasPendingInput() {
    const entry = getAttackPosition(this.data, this.selection);
    return this.inputs.some((input) => {
      const point = entry[input.dataset.attackPoint];
      return point ? input.value.trim() === "" || Number(input.value) !== point[input.dataset.attackCoordinate]
        : input.value.trim() !== "";
    });
  }

  updatePoint(field, point) {
    this.data = setAttackPosition(this.data, this.selection, field, point);
    this.message.textContent = "草稿已更新，尚未套用預覽。";
    this.render();
  }

  endDrag() {
    const drag = this.drag;
    this.drag = null;
    if (drag && this.overlay.hasPointerCapture?.(drag.pointerId)) this.overlay.releasePointerCapture(drag.pointerId);
  }

  setActive(active) {
    this.endDrag(); this.placement = null;
    this.active = active; this.panel.hidden = !active; this.overlay.hidden = !active;
    if (active) this.render();
  }

  render() {
    const entry = getAttackPosition(this.data, this.selection);
    this.current.textContent = JSON.stringify(entry, null, 2);
    this.inputs.forEach((input) => {
      const point = entry[input.dataset.attackPoint];
      input.value = point ? String(point[input.dataset.attackCoordinate]) : "";
    });
    for (const field of ["readyPosition", "attackPosition"]) {
      const marker = this.overlay.querySelector(`[data-attack-marker="${field}"]`);
      const point = entry[field];
      marker.hidden = !point;
      marker.textContent = `${entry.playerSlot} ${field === "readyPosition" ? "● READY" : "◆ ATTACK"}`;
      if (point) {
        marker.style.left = `${point.x / SIMULATOR_WORLD.width * 100}%`;
        marker.style.top = `${point.y / SIMULATOR_WORLD.height * 100}%`;
      }
    }
    const count = this.data.entries.filter((item) => item.status === "CONFIGURED").length;
    this.panel.querySelector("#attack-position-summary").textContent =
      `${entry.status}｜已設定 ${count} / 180 組｜${JSON.stringify(this.data) === JSON.stringify(this.preview) ? "已套用預覽" : "有未套用修改"}`;
    // 匯入文字由使用者管理，切換選項或拖曳不覆蓋待匯入 JSON。
  }

  destroy() { this.endDrag(); this.listeners.forEach((remove) => remove()); }
}
