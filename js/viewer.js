(function () {
  'use strict';

  var meta = { width: 5000, height: 5000, chunk_size: 128 };
  var palette = ['#f0f1f4'];
  var cam = { x: 2500, y: 2500, zoom: 1 };
  var chunks = {}, chunkImgs = {}, loading = {}, chunkIdx = [];
  var canvas, ctx, W, H;
  var drag = false, lastX = 0, lastY = 0, lastDist = 0;
  var MIN_Z = 0.01, MAX_Z = 60;

  function init() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    Promise.all([fetchJ('data/meta.json'), fetchJ('data/palette.json'), fetchJ('data/chunk-index.json')])
      .then(function (r) {
        if (r[0]) meta = r[0];
        if (r[1]) palette = r[1];
        if (r[2]) chunkIdx = r[2];
        fitToContent();
        buildMinimap();
        raf();
      });

    canvas.addEventListener('pointerdown', pDown);
    canvas.addEventListener('pointermove', pMove);
    canvas.addEventListener('pointerup', pUp);
    canvas.addEventListener('pointercancel', pUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', tStart, { passive: false });
    canvas.addEventListener('touchmove', tMove, { passive: false });
    canvas.addEventListener('touchend', pUp);

    setInterval(refresh, 8000);
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight - 44;
    canvas.width = W; canvas.height = H;
    canvas.style.height = H + 'px';
  }

  function fitToContent() {
    if (chunkIdx.length === 0) {
      cam.x = meta.width / 2;
      cam.y = meta.height / 2;
      cam.zoom = Math.min(W / meta.width, H / meta.height) * 0.9;
      return;
    }
    var cs = meta.chunk_size;
    var mnx = 1e9, mny = 1e9, mxx = 0, mxy = 0;
    for (var i = 0; i < chunkIdx.length; i++) {
      var c = chunkIdx[i];
      mnx = Math.min(mnx, c[0] * cs);
      mny = Math.min(mny, c[1] * cs);
      mxx = Math.max(mxx, (c[0] + 1) * cs);
      mxy = Math.max(mxy, (c[1] + 1) * cs);
    }
    var cw = mxx - mnx || cs, ch = mxy - mny || cs;
    cam.x = mnx + cw / 2;
    cam.y = mny + ch / 2;
    var pad = 1.4;
    cam.zoom = Math.min(W / (cw * pad), H / (ch * pad));
    cam.zoom = clampZ(cam.zoom);
  }

  function clampZ(z) { return Math.max(MIN_Z, Math.min(MAX_Z, z)); }
  function s2w(sx, sy) { return { x: cam.x + (sx - W / 2) / cam.zoom, y: cam.y + (sy - H / 2) / cam.zoom }; }
  function w2s(wx, wy) { return { x: (wx - cam.x) * cam.zoom + W / 2, y: (wy - cam.y) * cam.zoom + H / 2 }; }

  /* ── Pointer (mouse + single touch) ── */
  function pDown(e) { drag = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); }
  function pMove(e) {
    var w = s2w(e.clientX, e.clientY);
    document.getElementById('coords').textContent = '(' + Math.floor(w.x) + ', ' + Math.floor(w.y) + ')';
    if (!drag) return;
    cam.x -= (e.clientX - lastX) / cam.zoom;
    cam.y -= (e.clientY - lastY) / cam.zoom;
    lastX = e.clientX; lastY = e.clientY;
  }
  function pUp() { drag = false; lastDist = 0; }

  function onWheel(e) {
    e.preventDefault();
    var bef = s2w(e.clientX, e.clientY);
    cam.zoom = clampZ(cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    var aft = s2w(e.clientX, e.clientY);
    cam.x -= aft.x - bef.x; cam.y -= aft.y - bef.y;
    updateZoomLabel();
  }

  /* ── Pinch zoom ── */
  function tStart(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      lastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
    }
  }
  function tMove(e) {
    e.preventDefault();
    if (e.touches.length === 2 && lastDist > 0) {
      var d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      var bef = s2w(cx, cy);
      cam.zoom = clampZ(cam.zoom * (d / lastDist));
      var aft = s2w(cx, cy);
      cam.x -= aft.x - bef.x; cam.y -= aft.y - bef.y;
      lastDist = d;
      updateZoomLabel();
    }
  }

  function updateZoomLabel() {
    var el = document.getElementById('zoom-level');
    if (el) el.textContent = cam.zoom >= 1 ? Math.round(cam.zoom) + 'x' : cam.zoom.toFixed(2) + 'x';
  }

  /* ── Render loop ── */
  function raf() { render(); requestAnimationFrame(raf); }

  function render() {
    ctx.fillStyle = '#e4e6eb';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    var cs = meta.chunk_size, z = cam.zoom;
    var tl = s2w(0, 0), br = s2w(W, H);
    var x0 = Math.max(0, Math.floor(tl.x / cs));
    var y0 = Math.max(0, Math.floor(tl.y / cs));
    var x1 = Math.min(Math.ceil(meta.width / cs) - 1, Math.ceil(br.x / cs));
    var y1 = Math.min(Math.ceil(meta.height / cs) - 1, Math.ceil(br.y / cs));

    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var k = cx + '_' + cy;
        var s = w2s(cx * cs, cy * cs);
        if (chunkImgs[k]) {
          ctx.drawImage(chunkImgs[k], s.x, s.y, cs * z, cs * z);
        } else {
          ensure(cx, cy);
        }
      }
    }

    if (z >= 5) drawGrid(tl, br, z);
    drawBorder();
    updateMiniVP();
  }

  function drawGrid(tl, br, z) {
    ctx.strokeStyle = 'rgba(0,0,0,.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    var sx = Math.floor(tl.x), sy = Math.floor(tl.y);
    for (var x = sx; x <= Math.ceil(br.x); x++) { var p = w2s(x, 0); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H); }
    for (var y = sy; y <= Math.ceil(br.y); y++) { var p = w2s(0, y); ctx.moveTo(0, p.y); ctx.lineTo(W, p.y); }
    ctx.stroke();
  }

  function drawBorder() {
    var a = w2s(0, 0), b = w2s(meta.width, meta.height);
    ctx.strokeStyle = 'rgba(0,82,255,.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  /* ── Chunk loading ── */
  function ensure(cx, cy) {
    var k = cx + '_' + cy;
    if (chunks[k] !== undefined || loading[k]) return;
    var found = false;
    for (var i = 0; i < chunkIdx.length; i++) {
      if (chunkIdx[i][0] === cx && chunkIdx[i][1] === cy) { found = true; break; }
    }
    if (!found) { chunks[k] = null; return; }
    loading[k] = true;
    fetchJ('data/chunks/' + cx + '_' + cy + '.json').then(function (d) {
      chunks[k] = d;
      if (d) chunkImgs[k] = bakeChunk(d);
      delete loading[k];
    });
  }

  function bakeChunk(ch) {
    var cs = meta.chunk_size;
    var oc = document.createElement('canvas');
    oc.width = cs; oc.height = cs;
    var c2 = oc.getContext('2d');
    var img = c2.createImageData(cs, cs);
    var d = img.data;
    for (var y = 0; y < cs; y++) {
      var row = ch.pixels[y]; if (!row) continue;
      for (var x = 0; x < cs; x++) {
        var ci = row[x] || 0;
        if (ci === 0) continue;
        var hex = palette[ci] || '#000';
        var off = (y * cs + x) * 4;
        d[off] = parseInt(hex.slice(1, 3), 16);
        d[off + 1] = parseInt(hex.slice(3, 5), 16);
        d[off + 2] = parseInt(hex.slice(5, 7), 16);
        d[off + 3] = 255;
      }
    }
    c2.putImageData(img, 0, 0);
    return oc;
  }

  /* ── Minimap ── */
  function buildMinimap() {
    var mc = document.getElementById('minimap');
    if (!mc) return;
    var sz = mc.width = mc.height = mc.clientWidth * (window.devicePixelRatio || 1);
    var c2 = mc.getContext('2d');
    c2.fillStyle = '#e4e6eb';
    c2.fillRect(0, 0, sz, sz);

    if (chunkIdx.length === 0) return;
    var cs = meta.chunk_size, sc = sz / meta.width;

    var promises = chunkIdx.map(function (ci) {
      return fetchJ('data/chunks/' + ci[0] + '_' + ci[1] + '.json').then(function (ch) {
        if (!ch) return;
        for (var y = 0; y < cs; y++) {
          var row = ch.pixels[y]; if (!row) continue;
          for (var x = 0; x < cs; x++) {
            if (row[x] === 0) continue;
            var hex = palette[row[x]] || '#fff';
            c2.fillStyle = hex;
            var px = (ci[0] * cs + x) * sc;
            var py = (ci[1] * cs + y) * sc;
            c2.fillRect(px, py, Math.max(1, sc), Math.max(1, sc));
          }
        }
      });
    });
    Promise.all(promises).then(function () {
      c2.strokeStyle = '#0052FF';
      c2.lineWidth = 1;
      c2.strokeRect(0, 0, meta.width * sc, meta.height * sc);
    });
  }

  function updateMiniVP() {
    var vp = document.getElementById('minimap-vp');
    if (!vp) return;
    var wrap = vp.parentElement;
    var sz = wrap.clientWidth;
    var sc = sz / meta.width;
    var tl = s2w(0, 0), br = s2w(W, H);
    var l = Math.max(0, tl.x * sc), t = Math.max(0, tl.y * sc);
    var w = (br.x - tl.x) * sc, h = (br.y - tl.y) * sc;
    vp.style.left = l + 'px'; vp.style.top = t + 'px';
    vp.style.width = Math.max(2, Math.min(sz, w)) + 'px';
    vp.style.height = Math.max(2, Math.min(sz, h)) + 'px';
  }

  /* ── Auto-refresh ── */
  function refresh() {
    fetchJ('data/chunk-index.json').then(function (ci) {
      if (!ci) return;
      var changed = ci.length !== chunkIdx.length;
      if (!changed) {
        for (var i = 0; i < ci.length; i++) {
          if (ci[i][0] !== chunkIdx[i][0] || ci[i][1] !== chunkIdx[i][1]) { changed = true; break; }
        }
      }
      if (changed) {
        chunkIdx = ci;
        chunks = {}; chunkImgs = {}; loading = {};
        buildMinimap();
      }
    });
  }

  function fetchJ(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
