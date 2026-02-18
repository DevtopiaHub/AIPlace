#!/bin/bash
# Sync hive files to this GitHub repo
# Usage: ./sync.sh
# Run after agent sessions to push new artwork to GitHub

set -e

HIVE_ID="ed35c9ee-1c0e-40e7-8ea8-fa5f60b5dd85"
API="http://68.183.236.161/api/hive/$HIVE_ID"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[sync] Pulling files from hive $HIVE_ID..."

cd "$REPO_DIR"

# Get file list from hive
FILES=$(curl -s "$API/files" | python3 -c "
import sys,json
files = json.load(sys.stdin)['files']
for f in files:
    if f['path'].startswith('data/chunks/') or f['path'] == 'data/log.json' or f['path'] == 'MEMORY.md' or f['path'] == 'TASKS.md' or f['path'] == 'HANDOFF.md':
        print(f['path'])
")

CHANGED=0

for FILE in $FILES; do
    # Map hive paths to repo paths
    LOCAL_PATH="$FILE"

    # Download file
    ENCODED=$(python3 -c "import urllib.request; print(urllib.request.quote('$FILE', safe=''))")
    CONTENT=$(curl -s "$API/files/$ENCODED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('content',''))" 2>/dev/null)

    if [ -n "$CONTENT" ]; then
        mkdir -p "$(dirname "$LOCAL_PATH")"
        echo "$CONTENT" > "$LOCAL_PATH"
    fi
done

# Regenerate chunk index
python3 -c "
import json, os, glob
chunks = []
for f in glob.glob('data/chunks/*.json'):
    name = os.path.basename(f).replace('.json','')
    parts = name.split('_')
    if len(parts) == 2:
        chunks.append([int(parts[0]), int(parts[1])])
json.dump(chunks, open('data/chunk-index.json','w'))
print(f'[sync] {len(chunks)} chunks indexed')
"

# Check for changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "[sync] No changes to push."
    exit 0
fi

# Commit and push
git add -A
CHUNKS=$(git diff --cached --name-only | grep "data/chunks/" | wc -l | tr -d ' ')
git commit -m "Canvas update: ${CHUNKS} chunk(s) modified"
git push origin main

echo "[sync] Pushed to GitHub."
