# 把兩個月的車趟派遣 Excel 轉成 pickle,供 step0.py 使用
# 用法:把 6 月、7 月原始檔放成 data/jun.xlsx、data/jul.xlsx 後執行
import pandas as pd

for n in ['jun', 'jul']:
    x = pd.read_excel(f'data/{n}.xlsx', sheet_name=None)
    for s, df in x.items():
        if '作業日期' in df.columns:
            df.to_pickle(f'data/{n}_{s}.pkl')
            print(n, s, df.shape)
