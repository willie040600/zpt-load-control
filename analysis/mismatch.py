# 車型錯配(35 噸載 ≤14 籠)分級:依同路線是否常用 17 噸
import pandas as pd

t = pd.read_pickle('out/trips.pkl')
m = t[t.bucket.str.startswith('2 ')].copy()
r = t.groupby(['類型', '發車', '到著']).apply(lambda d: pd.Series({
    'n35': (d.級 == '35').sum(), 'n17': (d.級 == '17').sum(),
    'n35小': ((d.級 == '35') & (d.總籠 <= 14)).sum(),
    '35中位籠': d.loc[d.級 == '35', '總籠'].median(),
    '17中位籠': d.loc[d.級 == '17', '總籠'].median(),
    '35價': d.loc[d.級 == '35', '費用'].median(), '17價': d.loc[d.級 == '17', '費用'].median(),
    '17最大籠': d.loc[d.級 == '17', '總籠'].max()}), include_groups=False).reset_index()
m = m.merge(r, on=['類型', '發車', '到著'], how='left')

def grade(x):
    if x['n17'] >= 5: return 'A 同線已有17T常態(≥5趟)→可直接改'
    if x['n17'] >= 1: return 'B 同線17T偶有(1–4趟)→需確認'
    return 'C 同線從未用17T→需查場地/貨櫃限制'

m['等級'] = m.apply(grade, axis=1)
m.to_pickle('out/mismatch.pkl')
print(m['等級'].value_counts())
