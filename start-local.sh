#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if command -v node >/dev/null 2>&1; then
  exec node node_modules/vite/bin/vite.js --host 127.0.0.1 "$@"
fi
zpt_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ -x "$zpt_node" ]]; then
  exec "$zpt_node" node_modules/vite/bin/vite.js --host 127.0.0.1 "$@"
fi
echo '請先安裝 Node.js 並在專案執行 npm ci。' >&2
exit 1
