#!/bin/bash
# Run Loot Run's in-page autotest in headless Chrome and print the report.
# Usage: tools/run-tests.sh [regex]   (only run checks whose name matches the regex)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="file://$ROOT/index.html?autotest"
if [ $# -gt 0 ]; then URL="$URL&only=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")"; fi
for f in "$ROOT"/js/*.js; do node --check "$f" || echo "SYNTAX ERROR in $f"; done
"$CHROME" --headless=new --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --allow-file-access-from-files --window-size=1280,800 --virtual-time-budget=120000 \
  --dump-dom "$URL" 2>/dev/null | python3 -c '
import re, sys, html
d = sys.stdin.read()
m = re.search(r"<pre id=\"autotest\"[^>]*>(.*?)</pre>", d, re.S)
print(html.unescape(m.group(1)) if m else "NO REPORT FOUND")
t = re.search(r"<title>(.*?)</title>", d)
print("RESULT:", t.group(1) if t else None)
sys.exit(0 if t and "PASS" in t.group(1) else 1)
'
