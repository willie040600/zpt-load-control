"""顯示本次真實資料的 DP／MILP 驗證與敏感度，另執行邊界測試。"""
import json
import unittest
from prompt_optimizer import ROOT

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover(str(ROOT / 'analysis'), pattern='test_prompt_optimizer.py')
    if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
        raise SystemExit(1)
    path = ROOT / 'src/data/prompt-comparison.json'
    if not path.exists():
        raise SystemExit('請先執行 analysis/optimize_report.py --inputs 原始檔案清單。')
    data = json.loads(path.read_text())
    print(data['algorithmName'])
    for v in data['validation']:
        print(v['name'], v['value'], v['threshold'], '通過' if v['passed'] else '未通過')
    for s in data['sensitivity']:
        print('35t 上限', s['limit'], '使用', s['used35'], '節省', s['saving'])
    if not all(v['passed'] for v in data['validation']):
        raise SystemExit(1)
