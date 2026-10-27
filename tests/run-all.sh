#!/usr/bin/env bash
# Runs every test suite against a local server it starts itself; exits non-zero if any suite fails.
# Usage: tests/run-all.sh [suite-name ...]   e.g. tests/run-all.sh sounds orbit-chat
set -u
cd "$(dirname "$0")/.."
python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null http://127.0.0.1:8000/ && break; sleep 0.1; done
curl -s -o /dev/null http://127.0.0.1:8000/ || { echo "Could not start the local test server"; exit 2; }
failed=0
if [ $# -gt 0 ]; then suites=(); for name in "$@"; do suites+=(tests/$name.*); done; else suites=(tests/*.py tests/*.mjs); fi
for t in "${suites[@]}"; do
  case $t in *ui_helpers.py) continue;; esac
  log=$(mktemp)
  if [[ $t == *.mjs ]]; then node --test "$t" >"$log" 2>&1; else timeout 300 python3 "$t" >"$log" 2>&1; fi
  if [ $? -eq 0 ]; then echo "PASS $t"; else echo "FAIL $t"; grep -E "Error|assert|not ok" "$log" | head -5; failed=1; fi
  rm -f "$log"
done
exit $failed
