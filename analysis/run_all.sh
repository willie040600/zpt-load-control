#!/bin/sh
# 從原始 Excel 重新產生 src/data/trips.json
set -e
cd "$(dirname "$0")"
# Windows 預設編碼不是 UTF-8,腳本會印出中文並寫出 JSON,要強制使用 UTF-8
export PYTHONUTF8=1
mkdir -p out
python3 prepare.py
python3 step0.py
python3 mismatch.py
python3 export.py
cp out/trips.json ../src/data/trips.json
cp out/meta.json ../src/data/meta.json
echo "已更新 ../src/data/trips.json、meta.json"
