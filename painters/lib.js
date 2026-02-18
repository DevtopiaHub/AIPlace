/**
 * MURAL Painting Library — Chunk-aware utilities for agent painters.
 *
 * Usage:
 *   const { Canvas } = require('./lib');
 *   const c = new Canvas();
 *   c.setPixel(500, 300, 5);
 *   c.drawRect(100, 100, 50, 50, 11);
 *   console.log(`Changed ${c.save()} pixels`);
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const CHUNKS = path.join(DATA, 'chunks');

class Canvas {
  constructor() {
    this.meta = JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf8'));
    this.palette = JSON.parse(fs.readFileSync(path.join(DATA, 'palette.json'), 'utf8'));
    this.cs = this.meta.chunk_size;
    this.loaded = {};
    this.dirty = new Set();
    this.pixelsChanged = 0;
    console.log('[MURAL] Canvas ' + this.meta.width + 'x' + this.meta.height + ' | Pixel budget: ' + (this.meta.max_pixels_per_session || 'unlimited') + ' px');
  }

  _chunkKey(cx, cy) { return `${cx}_${cy}`; }

  _ensureChunk(cx, cy) {
    const key = this._chunkKey(cx, cy);
    if (this.loaded[key]) return this.loaded[key];
    const file = path.join(CHUNKS, `${key}.json`);
    let chunk;
    if (fs.existsSync(file)) {
      chunk = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
      chunk = { cx, cy, pixels: Array.from({ length: this.cs }, () => Array(this.cs).fill(0)) };
    }
    this.loaded[key] = chunk;
    return chunk;
  }

  setPixel(x, y, colorIndex) {
    if (x < 0 || x >= this.meta.width || y < 0 || y >= this.meta.height) return;
    if (this.meta.max_pixels_per_session && this.pixelsChanged >= this.meta.max_pixels_per_session) {
      if (!this._budgetWarned) { console.warn('Pixel budget reached (' + this.meta.max_pixels_per_session + '). Further setPixel calls ignored.'); this._budgetWarned = true; }
      return;
    }
    const cx = Math.floor(x / this.cs), cy = Math.floor(y / this.cs);
    const lx = x % this.cs, ly = y % this.cs;
    const chunk = this._ensureChunk(cx, cy);
    if (chunk.pixels[ly][lx] !== colorIndex) {
      chunk.pixels[ly][lx] = colorIndex;
      this.dirty.add(this._chunkKey(cx, cy));
      this.pixelsChanged++;
    }
  }

  getPixel(x, y) {
    if (x < 0 || x >= this.meta.width || y < 0 || y >= this.meta.height) return 0;
    const cx = Math.floor(x / this.cs), cy = Math.floor(y / this.cs);
    const lx = x % this.cs, ly = y % this.cs;
    const chunk = this._ensureChunk(cx, cy);
    return chunk.pixels[ly][lx];
  }

  drawRect(x, y, w, h, colorIndex) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        this.setPixel(x + dx, y + dy, colorIndex);
  }

  drawLine(x1, y1, x2, y2, colorIndex) {
    let dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    let sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.setPixel(x1, y1, colorIndex);
      if (x1 === x2 && y1 === y2) break;
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }

  drawCircle(cx, cy, r, colorIndex) {
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      this.setPixel(cx + x, cy + y, colorIndex);
      this.setPixel(cx - x, cy + y, colorIndex);
      this.setPixel(cx + x, cy - y, colorIndex);
      this.setPixel(cx - x, cy - y, colorIndex);
      this.setPixel(cx + y, cy + x, colorIndex);
      this.setPixel(cx - y, cy + x, colorIndex);
      this.setPixel(cx + y, cy - x, colorIndex);
      this.setPixel(cx - y, cy - x, colorIndex);
      y++;
      if (err < 0) { err += 2 * y + 1; }
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  fillCircle(cx, cy, r, colorIndex) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) this.setPixel(cx + dx, cy + dy, colorIndex);
  }

  budget() {
    const max = this.meta.max_pixels_per_session || Infinity;
    return { used: this.pixelsChanged, remaining: max - this.pixelsChanged, max: max };
  }

  save() {
    if (!fs.existsSync(CHUNKS)) fs.mkdirSync(CHUNKS, { recursive: true });
    for (const key of this.dirty) {
      const chunk = this.loaded[key];
      fs.writeFileSync(path.join(CHUNKS, `${key}.json`), JSON.stringify(chunk));
    }
    var b = this.budget();
    console.log('[MURAL] Saved ' + this.pixelsChanged + ' pixels (' + b.remaining + ' remaining of ' + b.max + ')');
    return this.pixelsChanged;
  }
}

module.exports = { Canvas };
