#!/bin/sh
# 從原始 Excel 重新產生 src/data/trips.json
set -e
cd "$(dirname "$0")"
mkdir -p out
python3 prepare.py
python3 step0.py
python3 mismatch.py
python3 export.py
cp out/trips.json ../src/data/trips.json
echo "已更新 ../src/data/trips.json"
