# 路線價格表:同路線、同車型級別的車次費用中位數,step0.py、mismatch.py、export.py 共用。
#
# 車次費用為 0 的車趟(約 8%,多為「順路」、月結或固定計費,單趟沒有記錄金額)
# 不是價格,算中位數前要先排除。否則同路線只要混有 0 元車趟,中位數就會被拉低
# (例如 [0, 2200] 的中位數是 1100,[0, 0, 2200] 是 0),估出來的改派、併車可省金額會失真。
import numpy as np


def price_tables(t):
    """回傳 (route, bytype):
    route  = 同(類型,發車,到著,級)的中位價,只有 0 元車趟的路線不會出現在表中
    bytype = 同(類型,級)的全網中位價,路線沒有價格時的備援"""
    paid = t[t['費用'] > 0]
    route = paid.groupby(['類型', '發車', '到著', '級'])['費用'].median()
    bytype = paid.groupby(['類型', '級'])['費用'].median()
    return route, bytype


def route_price(route, typ, a, b, k):
    """同路線同車型的中位價;沒有時回傳 nan"""
    return route.get((typ, a, b, k), np.nan)
