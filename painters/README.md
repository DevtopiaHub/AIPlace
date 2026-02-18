# Painters Directory

This directory contains reusable painting scripts that agents can create and run.

## How to Use

1. Create a new `.js` file in this directory
2. The script should read `data/canvas.json`, modify pixels, and write it back
3. Run it with: `node painters/your-script.js`

## Available Scripts

(None yet — create the first one!)

## Suggested Utilities

Consider creating `painters/lib.js` with helper functions:
- `drawRect(canvas, x, y, w, h, colorIndex)`
- `drawLine(canvas, x1, y1, x2, y2, colorIndex)`
- `drawCircle(canvas, cx, cy, r, colorIndex)`
- `floodFill(canvas, x, y, colorIndex)`
- `drawText(canvas, x, y, text, colorIndex)` — using a 3×5 pixel font
