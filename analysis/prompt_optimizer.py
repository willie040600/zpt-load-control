"""依車趟成本最佳化規格產生本地比較資料；不修改原始 Excel 或既有建議。

執行：python analysis/prompt_optimizer.py --inputs /path/jun.xlsx /path/jul.xlsx
金額為新台幣；作業日期用於分群，實際出發日期用於 3D 播放。
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import lil_matrix

ROOT = Path(__file__).resolve().parents[1]
ALGORITHM_NAME = '宅配通車趟成本最佳化（DP＋MILP）'
PARAMS = dict(windowHours=2, cap35=20, cap17=14, minCarrierSamples=2,
              carrierShift=0.5, cap35Scenarios=[1.0, 1.2, 1.5, None])
SHEETS = ['集貨明細', '轉運明細', '繼送明細']
LABELS = {'A': 'A 保守', 'B': 'B 推薦', 'C': 'C 積極（50% 移轉試算）', 'D': 'D 理論上限'}
LIMITS = [
    'A–C 僅同作業日期、車次名稱、溫層及固定 2 小時時段合併；D 取消時窗，僅為理論上限。',
    '容量依資料回推眾數：35 噸 20 籠、17／18.5／25 噸 14 籠；異常裝載紀錄另列，不擅自放大容量。',
    'C 以 50% 運量採路線中位價、50% 採合格最低承運商價的混合單價估算；不是逐車已議定報價。',
    '免費載貨車保留且容量只吸收同群組需求；付費零籠車固定保留。免費運能本身不列為節省。',
    'A 僅選群組內既有車型與承運商的中位報價；B–D 不使用其他路線、溫層或未出現車型費率。',
    '3D 新車沿用群組內實際發車時刻及任務時間作示意，未驗證路線中繼順序、碼頭、承運商可用車或服務品質。',
    'DP 情境未限制 35 噸全域運能，須併看 MILP 敏感度；保留現況亦納入 MILP 的整數決策，避免回退後超過上限。',
    '既有建議沿用原專案，包含 30 分鐘／跨站共車等不同假設，與本演算法的限制不同，不應視為同模型優劣排名。',
    '沒有座標與服務時窗最佳化，這是路線層級的車型成本模型；月／年化為實際作業日日均乘 30／365 的推估。',
]


def capacity(ton):
    return PARAMS['cap35'] if float(ton) == 35 else PARAMS['cap17']


def pack(demand, rates):
    """O(D × 車型數) 的至少覆蓋需求 DP，保留真實小數費率。"""
    demand = max(0, math.ceil(demand))
    if demand == 0:
        return 0.0, {}
    if not rates:
        return math.inf, {}
    dp, choice = [0.0] + [math.inf] * demand, [None] * (demand + 1)
    for d in range(1, demand + 1):
        for ton, rate in rates.items():
            value = dp[max(0, d - capacity(ton))] + rate
            if value < dp[d] - 1e-9:
                dp[d], choice[d] = value, ton
    mix, d = Counter(), demand
    while d > 0:
        ton = choice[d]
        mix[ton] += 1
        d = max(0, d - capacity(ton))
    return dp[demand], dict(mix)


def brute(demand, rates):
    if demand <= 0:
        return 0.0
    tons = list(rates)
    return min(sum(n * rates[t] for t, n in zip(tons, ns))
               for ns in itertools.product(*(range(math.ceil(demand / capacity(t)) + 1) for t in tons))
               if sum(n * capacity(t) for t, n in zip(tons, ns)) >= demand)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False,
                               default=lambda obj: obj.item() if isinstance(obj, np.generic) else str(obj)), encoding='utf-8')


def read_demand(files):
    """依表頭找合計區塊的整月欄，僅統計數值站所代碼，避免把總計列再加一次。"""
    records = []
    for path in files:
        book = pd.ExcelFile(path)
        for sheet in book.sheet_names:
            if not ('收件數' in sheet or '送件數' in sheet):
                continue
            data = pd.read_excel(book, sheet_name=sheet, header=None)
            starts = [j for j, v in data.iloc[0].items() if '合計' in str(v)]
            if not starts:
                raise ValueError(f'{path.name}/{sheet} 找不到常低溫合計區塊。')
            start = starts[-1]
            total_cols = [j for j, v in data.iloc[1].items() if j >= start and str(v) == '整月']
            if not total_cols:
                raise ValueError(f'{path.name}/{sheet} 找不到合計整月欄。')
            col = total_cols[0]
            stations = pd.to_numeric(data.iloc[:, 0], errors='coerce').notna()
            count = int(stations.sum())
            if count != 53:
                raise ValueError(f'{path.name}/{sheet} 有 {count} 站，與規格的 53 站不同，請先覆核。')
            total = pd.to_numeric(data.loc[stations, col], errors='coerce').fillna(0).sum()
            month = pd.Timestamp(data.iloc[1, start]).strftime('%Y-%m')
            records.append(dict(month=month, kind='收件' if '收件' in sheet else '送件', events=int(total),
                                source=f'{path.name}/{sheet} 合計區塊整月欄（第 {col + 1} 欄）', stations=count))
        book.close()
    return records


def read_inputs(files, out):
    frames, sources, checks = [], [], []
    for path in files:
        sources.append(dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        book = pd.ExcelFile(path)
        for sheet in SHEETS:
            raw = pd.read_excel(book, sheet_name=sheet)
            raw['_file'], raw['_sheet'] = path.name, sheet
            raw['_row'] = np.arange(len(raw)) + 2
            dates = pd.to_datetime(raw['作業日期'], errors='coerce')
            checks.append(dict(file=path.name, sheet=sheet, rows=len(raw),
                               start=str(dates.min().date()), end=str(dates.max().date()), days=dates.nunique()))
            frames.append(raw)
        book.close()
    raw = pd.concat(frames, ignore_index=True)
    for col in ['車次費用', '運費分撥', '籠車數', '裝載率']:
        raw[col] = pd.to_numeric(raw[col], errors='coerce').fillna(0)
    for col in ['作業日期', '車輛出發時間', '任務完成時間']:
        raw[col] = pd.to_datetime(raw[col], errors='coerce')
    missing = raw[['派車單號', '作業日期', '車輛出發時間', '車次名稱', '溫層', '車輛噸級']].isna().any(axis=1)
    negative = (raw[['車次費用', '籠車數', '裝載率']] < 0).any(axis=1)
    bad = raw[missing | negative]
    if len(bad):
        bad[['_file', '_sheet', '_row', '派車單號']].to_csv(out / '資料異常.csv', index=False)
        raise ValueError('識別／日期／路線缺漏或數值為負；已輸出資料異常，停止最佳化。')
    raw['派車單號'] = raw['派車單號'].astype(str)
    dd = raw.groupby('派車單號', sort=False).agg(
        fee=('車次費用', 'max'), cages=('籠車數', 'sum'), load=('裝載率', 'max'),
        lane=('車次名稱', 'first'), temp=('溫層', 'first'), tonLabel=('車輛噸級', 'first'),
        carrier=('承運廠商', 'first'), date=('作業日期', 'first'), dep=('車輛出發時間', 'first'),
        end=('任務完成時間', 'first'), origin=('發車單位', 'first'), dest=('到著單位', 'first'),
        bill=('結帳單位', 'first'), ty=('運輸類型', 'first'), legs=('車次費用', 'size'))
    dd.index = dd.index.astype(str)
    dd['ton'] = dd.tonLabel.str.extract(r'([\d.]+)', expand=False).astype(float)
    if not dd.ton.isin([17, 18.5, 25, 35]).all():
        raise ValueError('出現未定義容量的車型，請先覆核容量。')
    dd['cap'] = dd.ton.map(capacity)
    dd['bucket'] = dd.dep.dt.hour // PARAMS['windowHours']
    dd['bd'] = dd.date.dt.strftime('%Y-%m-%d')
    allocated, dedup = float(raw['運費分撥'].sum()), float(dd.fee.sum())
    cost_error = abs(dedup - allocated) / max(allocated, 1)
    inferred = (dd.cages / (dd.load / 100)).replace([np.inf, -np.inf], np.nan).round()
    modes = {str(t): int(inferred[(dd.ton == t) & (dd.cages > 0) & (dd.load > 0)].mode().iloc[0]) for t in dd.ton.unique()}
    anomalies = dd[(dd.cages > dd.cap) | ((dd.cages > 0) & (abs(inferred - dd.cap) > 1))]
    anomalies.reset_index().to_csv(out / '容量檢查異常.csv', index=False)
    missing_dates = []
    for _, d in dd.groupby(dd.date.dt.to_period('M')):
        missing_dates.extend(str(x.date()) for x in pd.date_range(d.date.min(), d.date.max()) if x not in set(d.date))
    audit = dict(sources=sources, sheets=checks, rawRows=len(raw), trips=len(dd),
                 rawCost=float(raw['車次費用'].sum()), baselineCost=dedup, allocatedCost=allocated,
                 duplicateCost=float(raw['車次費用'].sum()) - dedup, reconciliationError=cost_error,
                 operationDays=int(dd.date.nunique()), start=dd.bd.min(), end=dd.bd.max(), missingDates=missing_dates,
                 capacityModes=modes, capacityAnomalies=len(anomalies), overloadedTrips=int((dd.cages > dd.cap).sum()),
                 freeLoadedTrips=int(((dd.fee == 0) & (dd.cages > 0)).sum()),
                 fixedTrips=int(((dd.fee > 0) & (dd.cages == 0)).sum()),
                 fixedCost=float(dd.loc[(dd.fee > 0) & (dd.cages == 0), 'fee'].sum()),
                 status={c: {str(k): int(v) for k, v in raw[c].fillna('空白').value_counts().items()} for c in ['派車狀態', '中繼狀態', '車輛噸級', '車種', '溫層', '承運廠商']})
    write_json(out / '資料檢查.json', audit)
    if cost_error >= 0.005:
        raise ValueError('去重成本與運費分撥差距達 0.5%，已輸出檢查報告，停止最佳化。')
    if any(modes[str(t)] != capacity(t) for t in dd.ton.unique()):
        raise ValueError('容量回推眾數與規格不符，已輸出檢查報告，停止最佳化。')
    return raw, dd, audit


class Optimizer:
    def __init__(self, dd):
        self.dd = dd
        paid = dd[dd.fee > 0]
        self.median = paid.groupby(['lane', 'temp', 'ton']).fee.median()
        self.route_rates = {}
        for (lane, temp, ton), rate in self.median.items():
            self.route_rates.setdefault((lane, temp), {})[ton] = float(rate)
        self.carriers = paid.groupby(['lane', 'temp', 'ton', 'carrier']).fee.agg(['median', 'size']).reset_index()
        eligible = self.carriers[self.carriers['size'] >= PARAMS['minCarrierSamples']]
        self.cheap = {}
        for key, g in eligible.groupby(['lane', 'temp', 'ton']):
            best = g.sort_values(['median', 'carrier']).iloc[0]
            self.cheap[key] = (float(best['median']), str(best.carrier))

    def groups(self, window=True):
        d = self.dd.copy()
        if not window:
            d['bucket'] = -1
        groups = []
        for k, g in d.groupby(['bd', 'lane', 'temp', 'bucket'], sort=True):
            loaded = g[(g.fee > 0) & (g.cages > 0)]
            free = g[(g.fee == 0) & (g.cages > 0)]
            groups.append(dict(id=('W' if window else 'U') + str(len(groups)), date=k[0], lane=k[1], temp=k[2], bucket=int(k[3]),
                               ids=list(g.index), loaded=list(loaded.index), free=list(free.index),
                               current=float(g.fee.sum()), fixed=float(g.loc[(g.fee > 0) & (g.cages == 0), 'fee'].sum()),
                               cages=float(g.cages.sum()), freeCapacity=int(free.cap.sum()),
                               demand=max(0, math.ceil(g.cages.sum() - free.cap.sum())),
                               current35=int((loaded.ton == 35).sum())))
        return groups

    def rates(self, group, mode):
        if mode == 'A':
            local = self.dd.loc[group['loaded']].groupby(['ton', 'carrier']).fee.median()
            rates, carriers = {}, {}
            for (ton, carrier), rate in local.items():
                if ton not in rates or rate < rates[ton]:
                    rates[ton], carriers[ton] = float(rate), str(carrier)
            return rates, carriers
        rates, carriers = {}, {}
        lane, temp = group['lane'], group['temp']
        for ton, median in self.route_rates.get((lane, temp), {}).items():
            key = lane, temp, ton
            cheap, carrier = self.cheap.get(key, (float(median), '無合格低價報價，採路線中位價'))
            # 最低承運商價若高於全線中位價，不強制移轉。
            cheap = min(float(median), cheap)
            rates[ton] = float(median) if mode == 'B' else cheap if mode == 'D' else (1 - PARAMS['carrierShift']) * float(median) + PARAMS['carrierShift'] * cheap
            carriers[ton] = '路線中位費率' if mode == 'B' else f'50% 移轉試算：{carrier}' if mode == 'C' else carrier
        return rates, carriers

    def solve(self, group, mode):
        rates, carriers = self.rates(group, mode)
        cost, mix = pack(group['demand'], rates)
        changed = bool(group['loaded']) and group['fixed'] + cost < group['current'] - 1e-7
        return dict(**group, cost=group['fixed'] + cost if changed else group['current'],
                    changed=changed, mix=mix if changed else {}, rates=rates, carriers=carriers,
                    dpCost=cost if math.isfinite(cost) else group['current'] - group['fixed'])


def solve_global(groups, opt, cap35=None, keep=False):
    """全域 MILP。敏感度用二元保留現況選項，回退車輛也受 35t 上限約束。"""
    active = [g for g in groups if g['loaded']]
    variables, costs, uppers = [], [], []
    for gi, g in enumerate(active):
        rates, _ = opt.rates(g, 'B')
        for ton, rate in rates.items():
            variables.append((gi, ton)); costs.append(rate)
            uppers.append(math.ceil(g['demand'] / capacity(ton)) + 1)
        if keep:
            variables.append((gi, 'keep')); costs.append(g['current'] - g['fixed']); uppers.append(1)
    # 有運能限制時仍逐群禁止成本增加，不能用別群的節省補貼此群加價。
    n = len(active)
    mat = lil_matrix((n * (2 if keep else 1) + 1, len(costs)))
    lower = [g['demand'] for g in active] + ([-np.inf] * n if keep else []) + [0]
    upper = [np.inf] * n + ([g['current'] - g['fixed'] for g in active] if keep else []) + [np.inf if cap35 is None else cap35]
    for vi, (gi, ton) in enumerate(variables):
        g = active[gi]
        mat[gi, vi] = g['demand'] if ton == 'keep' else capacity(ton)
        if keep:
            mat[n + gi, vi] = costs[vi]
        mat[-1, vi] = g['current35'] if ton == 'keep' else int(ton == 35)
    result = milp(c=np.array(costs), integrality=np.ones(len(costs)), bounds=Bounds(np.zeros(len(costs)), uppers),
                  constraints=LinearConstraint(mat.tocsr(), lower, upper), options={'mip_rel_gap': 0.0})
    if not result.success:
        raise RuntimeError(f'MILP 求解未完成：{result.message}')
    xs = np.rint(result.x).astype(int)
    used = sum(int(xs[i]) * (active[gi]['current35'] if ton == 'keep' else int(ton == 35)) for i, (gi, ton) in enumerate(variables))
    total = float(np.dot(costs, xs)) + sum(g['fixed'] for g in active) + sum(g['current'] for g in groups if not g['loaded'])
    return total, used


def build_scene(results, dd, legacy, mode):
    """僅輸出異動與新增車；原單號作為來源，絕不以舊車數截斷 DP 新車。"""
    updates, added = {}, []
    for g in results:
        if not g['changed']:
            continue
        total = g['cages']
        for trip_id in g['free']:
            n = min(float(dd.loc[trip_id, 'cap']), total)
            total -= n
            updates[trip_id] = dict(n=n)
        templates = sorted(g['loaded'], key=lambda x: dd.loc[x, 'dep'])
        for trip_id in templates:
            updates[trip_id] = dict(removed=True)
        j = 0
        for ton, count in sorted(g['mix'].items(), reverse=True):
            for _ in range(count):
                src = templates[min(j, len(templates) - 1)]
                t = dict(legacy[src])
                for key in ['act', 'tier', 'gid', 'sv', 'nTn', 'nCap', 'nN', 'nC', 'p17', 'rg', 'ec']:
                    t.pop(key, None)
                n = min(capacity(ton), total)
                total -= n
                t.update(id=f'{mode}-{g["id"]}-{j}', sourceId=src, groupId=g['id'],
                         tn=ton, cap=capacity(ton), n=n, lr=round(n / capacity(ton) * 100, 4),
                         c=g['rates'][ton], cr=g['carriers'][ton], bk='OK' if n / capacity(ton) >= .8 else '5')
                added.append(t)
                j += 1
        assert abs(total) < 1e-6, ('需求未完整配置', g['id'], total)
    return updates, added


def run(files, out, target):
    out.mkdir(parents=True, exist_ok=True)
    raw, dd, audit = read_inputs(files, out)
    legacy = {t['id']: t for t in json.loads((ROOT / 'src/data/trips.json').read_text())}
    if set(dd.index) != set(legacy):
        raise ValueError('原始資料單號與現有 3D 資料不一致，請先重跑既有 analysis/run_all.sh。')
    opt = Optimizer(dd)
    groups, unlimited = opt.groups(), opt.groups(False)
    baseline = {i: dict(n=float(r.cages), c=float(r.fee), lr=float(r.load), cap=int(r.cap), bd=r.bd, lane=r.lane, temp=r.temp)
                for i, r in dd.iterrows()}
    scenarios, detailed = {}, {}
    for mode in LABELS:
        results = [opt.solve(g, mode) for g in (unlimited if mode == 'D' else groups)]
        detailed[mode] = results
        updates, added = build_scene(results, dd, legacy, mode)
        cost = sum(g['cost'] for g in results)
        saving = audit['baselineCost'] - cost
        rows = [dict(groupId=g['id'], date=g['date'], lane=g['lane'], temp=g['temp'], bucket=g['bucket'],
                     ids=g['ids'], current=g['current'], cost=g['cost'], saving=g['current'] - g['cost'],
                     cages=g['cages'], demand=g['demand'], fixed=g['fixed'], freeCapacity=g['freeCapacity'],
                     mix={str(t): n for t, n in g['mix'].items()},
                     rates={str(t): v for t, v in g['rates'].items()},
                     currentMix={str(t): int(n) for t, n in dd.loc[g['loaded']].groupby('ton').size().items()},
                     departures=[dd.loc[i, 'dep'].strftime('%Y-%m-%d %H:%M:%S') for i in g['ids']],
                     carriers=sorted(set(dd.loc[g['loaded'], 'carrier'].astype(str)))) for g in results]
        pd.DataFrame([{**r, 'ids': ','.join(r['ids']), 'mix': str(r['mix']), 'rates': str(r['rates'])} for r in rows]).to_csv(out / f'群組明細_{mode}.csv', index=False)
        scenarios[mode] = dict(label=LABELS[mode], cost=cost, saving=saving, savingPct=saving / audit['baselineCost'],
                               monthly=saving / audit['operationDays'] * 30, annual=saving / audit['operationDays'] * 365,
                               updates=updates, added=added, groups=[r for r in rows if r['saving'] > 1e-7])
        print(f'{LABELS[mode]}：成本 {cost:,.2f}，節省 {saving:,.2f} ({saving/audit["baselineCost"]:.2%})', flush=True)
    samples = [g for g in groups if g['loaded']]
    sample = np.random.default_rng(42).choice(len(samples), min(300, len(samples)), replace=False)
    mismatch = sum(abs(pack(samples[i]['demand'], opt.rates(samples[i], 'B')[0])[0] - brute(samples[i]['demand'], opt.rates(samples[i], 'B')[0])) > 1e-6 for i in sample)
    dp_total = sum(g['fixed'] + g['dpCost'] if g['loaded'] else g['current'] for g in detailed['B'])
    milp_total, _ = solve_global(groups, opt)
    paid = dd[dd.fee > 0]
    reconstruction = sum(opt.median.loc[(r.lane, r.temp, r.ton)] for r in paid.itertuples())
    rate_error = abs(reconstruction - paid.fee.sum()) / paid.fee.sum()
    validation = [
        dict(name='成本去重與運費分撥', value=audit['reconciliationError'], threshold='< 0.5%', passed=audit['reconciliationError'] < .005),
        dict(name=f'DP vs 暴力枚舉（{len(sample)} 群）', value=int(mismatch), threshold='0 個不一致', passed=mismatch == 0),
        dict(name='DP vs MILP（無資源限制）', value=abs(dp_total - milp_total), threshold='< 1 元', passed=abs(dp_total - milp_total) < 1),
        dict(name='中位費率回推誤差', value=float(rate_error), threshold='< 5%', passed=rate_error < .05),
        dict(name='群組建議費用不增加', value=sum(g['cost'] > g['current'] + 1e-6 for rows in detailed.values() for g in rows), threshold='0 個違反', passed=all(g['cost'] <= g['current'] + 1e-6 for rows in detailed.values() for g in rows)),
    ]
    cap_current = sum(g['current35'] for g in groups)
    sensitivity = []
    for multiplier in PARAMS['cap35Scenarios']:
        limit = None if multiplier is None else math.floor(cap_current * multiplier)
        cost, used = solve_global(groups, opt, limit, keep=True)
        assert limit is None or used <= limit
        sensitivity.append(dict(multiplier=multiplier, limit=limit, used35=used, cost=cost,
                                saving=audit['baselineCost'] - cost, savingPct=(audit['baselineCost'] - cost) / audit['baselineCost']))
    decomposition = [dict(source='同時段合併／既有車型', saving=scenarios['A']['saving']),
                     dict(source='擴充路線車型', saving=scenarios['B']['saving'] - scenarios['A']['saving']),
                     dict(source='50% 承運商移轉試算', saving=scenarios['C']['saving'] - scenarios['B']['saving']),
                     dict(source='取消時窗／全面低價（理論）', saving=scenarios['D']['saving'] - scenarios['C']['saving'])]
    # A 的局部價可能低於 B 的路線價，增量可為負；如實揭露，不強行改寫情境。
    decomposition_error = abs(sum(x['saving'] for x in decomposition) - scenarios['D']['saving'])
    validation.append(dict(name='情境節省與來源分解勾稽', value=decomposition_error, threshold='< 0.01 元', passed=decomposition_error < .01))
    # 場景全期間成本／貨量必須與模型相符。
    for mode, scene in scenarios.items():
        cost = cages = 0
        for i, r in dd.iterrows():
            update = scene['updates'].get(i, {})
            if not update.get('removed'):
                cost += r.fee; cages += update.get('n', r.cages)
        cost += sum(t['c'] for t in scene['added'])
        cages += sum(t['n'] for t in scene['added'])
        assert abs(cost - scene['cost']) < .01 and abs(cages - dd.cages.sum()) < .01, mode
    validation.append(dict(name='3D 費用與模型一致／貨量守恆', value=0, threshold='0 個違反', passed=True))
    payload = dict(algorithmName=ALGORITHM_NAME, parameters=PARAMS, audit=audit, baseline=baseline, scenarios=scenarios,
                   validation=validation, sensitivity=sensitivity, decomposition=decomposition, limitations=LIMITS)
    write_json(target, payload)
    # 報告中間資料不含姓名、車牌、電話與地址。
    monthly = dd.groupby([dd.date.dt.strftime('%Y-%m'), 'ty']).agg(trips=('fee', 'size'), cost=('fee', 'sum'), cages=('cages', 'sum'), load=('load', 'mean')).reset_index().rename(columns={'date': 'month'})
    savings_by_lane = pd.DataFrame(scenarios['B']['groups']).groupby('lane').saving.sum()
    lanes = dd.groupby('lane').agg(current=('fee', 'sum'), load=('load', 'mean'), trips=('fee', 'size'))
    lanes['saving'] = savings_by_lane.reindex(lanes.index).fillna(0)
    lanes = lanes.sort_values('saving', ascending=False)
    lanes['savingPct'] = lanes.saving / lanes.current.replace(0, np.nan)
    distribution = pd.DataFrame({'bin': pd.cut(dd.load.clip(upper=100), [-1, 19.999, 39.999, 59.999, 79.999, 99.999, 100], labels=['<20%', '20–40%', '40–60%', '60–80%', '80–100%', '100%']), 'fee': dd.fee}).groupby('bin', observed=False).agg(trips=('fee', 'size'), cost=('fee', 'sum')).reset_index()
    demands = read_demand(files)
    report = dict(algorithmName=ALGORITHM_NAME, scenarios=[{k: v for k, v in s.items() if k not in ['updates', 'added', 'groups']} for s in scenarios.values()],
                  audit=audit, validation=validation, sensitivity=sensitivity, decomposition=decomposition, limitations=LIMITS,
                  monthly=monthly.to_dict('records'), lanes=lanes.reset_index().astype(object).where(lanes.reset_index().notna(), None).to_dict('records'),
                  cases=sorted(scenarios['B']['groups'], key=lambda r: -r['saving'])[:10],
                  distribution=distribution.to_dict('records'), rates=opt.carriers.to_dict('records'),
                  demands=demands)
    write_json(out / 'report-data.json', report)
    summary = ['# ' + ALGORITHM_NAME + ' — 演算法比較', '', f'作業期間：{audit["start"]}–{audit["end"]}，{audit["operationDays"]} 個實際作業日，{len(dd):,} 趟。',
               f'成本基準：{audit["baselineCost"]:,.0f} 元；逐列重複費用 {audit["duplicateCost"]:,.0f} 元；與運費分撥差距 {audit["reconciliationError"]:.2%}。', '',
               '| 情境 | 節省（元） | 節省率 | 月推估（元） | 年推估（元） |', '|---|---:|---:|---:|---:|']
    summary += [f'| {s["label"]} | {s["saving"]:,.0f} | {s["savingPct"]:.1%} | {s["monthly"]:,.0f} | {s["annual"]:,.0f} |' for s in scenarios.values()]
    summary += ['', '## 驗證', '| 項目 | 實測 | 門檻 | 結果 |', '|---|---:|---|---|']
    summary += [f'| {v["name"]} | {v["value"]:.6f} | {v["threshold"]} | {"通過" if v["passed"] else "未通過，需覆核"} |' for v in validation]
    summary += ['', '## 35 噸敏感度（付費載貨車；固定／免費車另保留）', '| 上限 | 使用 35t | 節省（元） |', '|---|---:|---:|']
    summary += [f'| {s["limit"] if s["limit"] is not None else "無限制"} | {s["used35"]} | {s["saving"]:,.0f} |' for s in sensitivity]
    summary += ['', '## 推薦情境前十大路線', '| 路線 | 節省（元） |', '|---|---:|']
    summary += [f'| {lane} | {r.saving:,.0f} |' for lane, r in lanes.head(10).iterrows()]
    summary += ['', '## 限制與建議', *['- ' + x for x in LIMITS], '- 優先覆核推薦情境前十大路線與容量異常，再確認承運商報價與 35 噸可用運能。',
                '', '來源：資料檢查.json 提供原檔 SHA-256／工作表；群組明細 A–D CSV 提供單號與完整公式輸入。']
    (out / '演算法比較摘要.md').write_text('\n'.join(summary), encoding='utf-8')
    for source, path in zip(audit['sources'], files):
        assert source['sha256'] == hashlib.sha256(path.read_bytes()).hexdigest(), '原始檔被修改'
    print(json.dumps(dict(validation=validation, sensitivity=sensitivity), ensure_ascii=False, indent=2,
                     default=lambda obj: obj.item()), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', nargs='+', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'analysis/out/prompt')
    parser.add_argument('--target', type=Path, default=ROOT / 'src/data/prompt-comparison.json')
    args = parser.parse_args()
    run(args.inputs, args.out, args.target)
