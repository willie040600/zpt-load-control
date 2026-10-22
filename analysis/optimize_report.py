"""重跑演算法、JSON／CSV／Markdown，並使用 Codex bundled artifact-tool 匯出 Excel。"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from prompt_optimizer import ROOT, run


def export_report(out, target):
    bundle = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node'
    node = bundle / 'bin/node'
    modules = bundle / 'node_modules'
    if not node.exists() or not (modules / '@oai/artifact-tool').exists():
        raise RuntimeError('找不到 Codex bundled artifact-tool，演算法 JSON／CSV／摘要已保留。可使用 --no-excel 只重跑計算。')
    with tempfile.TemporaryDirectory(prefix='zpt-report-') as temp:
        temp = Path(temp)
        os.symlink(modules, temp / 'node_modules', target_is_directory=True)
        shutil.copy(ROOT / 'analysis/export_prompt_report.mjs', temp / 'export_prompt_report.mjs')
        subprocess.run([str(node), str(temp / 'export_prompt_report.mjs'), str(out / 'report-data.json'), str(target), str(out)], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, nargs='+', required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'analysis/out/prompt')
    parser.add_argument('--no-excel', action='store_true')
    args = parser.parse_args()
    output = args.out.resolve()
    target = ROOT / 'src/data/prompt-comparison.json'
    run([p.resolve() for p in args.inputs], output, target)
    if not args.no_excel:
        export_report(output, target)
