function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function safeDimension(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export class HorizontalCamera {
  constructor({ worldWidth, worldHeight, smoothing = 0.14 }) {
    this.worldWidth = safeDimension(worldWidth);
    this.worldHeight = safeDimension(worldHeight);
    this.smoothing = clamp(Number.isFinite(smoothing) ? smoothing : 0.14, 0.01, 1);
    this.scale = 1;
    this.visibleWorldWidth = this.worldWidth;
    this.viewportPixelWidth = this.worldWidth;
    this.viewportPixelHeight = this.worldHeight;
    this.contentOffsetX = 0;
    this.currentX = 0;
    this.targetX = 0;
    this.maxX = 0;
  }

  resize(viewportWidth, viewportHeight) {
    const safeWidth = safeDimension(viewportWidth);
    const safeHeight = safeDimension(viewportHeight);
    this.scale = safeHeight / this.worldHeight;
    const requestedWorldWidth = safeWidth / this.scale;
    this.visibleWorldWidth = clamp(requestedWorldWidth, 1, this.worldWidth);
    this.viewportPixelWidth = this.visibleWorldWidth * this.scale;
    this.viewportPixelHeight = this.worldHeight * this.scale;
    this.contentOffsetX = Math.max(0, (safeWidth - this.viewportPixelWidth) / 2);
    this.maxX = Math.max(0, this.worldWidth - this.visibleWorldWidth);
    this.targetX = clamp(this.targetX, 0, this.maxX);
    this.currentX = clamp(this.currentX, 0, this.maxX);
    return this.getPresentation();
  }

  followWorldX(worldX, immediate = false) {
    const safeWorldX = clamp(Number.isFinite(worldX) ? worldX : 0, 0, this.worldWidth);
    this.targetX = clamp(safeWorldX - this.visibleWorldWidth / 2, 0, this.maxX);
    if (immediate) this.currentX = this.targetX;
    return this.targetX;
  }

  step() {
    const distance = this.targetX - this.currentX;
    if (Math.abs(distance) < 0.05) {
      this.currentX = this.targetX;
      return false;
    }
    this.currentX = clamp(this.currentX + distance * this.smoothing, 0, this.maxX);
    return true;
  }

  getPresentation() {
    return Object.freeze({
      scale: this.scale,
      cameraX: this.currentX,
      cameraY: 0,
      visibleWorldWidth: this.visibleWorldWidth,
      viewportPixelWidth: this.viewportPixelWidth,
      viewportPixelHeight: this.viewportPixelHeight,
      contentOffsetX: this.contentOffsetX,
      maxCameraX: this.maxX,
    });
  }

  screenToWorld(clientX, clientY, viewportRect) {
    const localX = clientX - viewportRect.left - this.contentOffsetX;
    const localY = clientY - viewportRect.top;
    return Object.freeze({
      x: clamp(this.currentX + localX / this.scale, 0, this.worldWidth),
      y: clamp(localY / this.scale, 0, this.worldHeight),
    });
  }
}
