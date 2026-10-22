import pandas as pd,numpy as np,itertools
from pricing import price_tables,route_price
pd.set_option('display.width',250); pd.set_option('display.max_columns',40)
frames=[]
for n in ['jun','jul']:
    for s in ['集貨明細','轉運明細','繼送明細']:
        frames.append(pd.read_pickle(f'data/{n}_{s}.pkl'))
raw=pd.concat(frames,ignore_index=True)
raw['補']=raw[['補空常溫籠車','補空低溫籠車','補空棧板']].sum(axis=1)
raw['收']=raw[['收空常溫籠車','收空低溫籠車','收空棧板']].sum(axis=1)
# trip level: one row per 派車單號
g=raw.groupby('派車單號',sort=False)
t=g.agg(日期=('作業日期','first'),類型=('運輸類型','first'),發車=('發車單位','first'),到著=('到著單位','first'),
        噸級=('車輛噸級','first'),溫層=('溫層','first'),費用=('車次費用','first'),裝載率=('裝載率','first'),
        總籠=('總籠車數','first'),補=('補','first'),收=('收','first'),出發=('車輛出發時間','first'),
        承運=('承運廠商','first'),中繼=('中繼1','first'),車次=('車次名稱','first')).reset_index()
t['日期']=pd.to_datetime(t['日期']); t['出發']=pd.to_datetime(t['出發'])
t['噸']=t['噸級'].astype(str).str.extract(r'([\d.]+)')[0].astype(float)
t['cap']=np.where(t['噸']>=25,20,14)
t['週日']=t['日期'].dt.dayofweek==6
t['月']=t['日期'].dt.month
t['低']=t['裝載率']<80
t['重低']=t['裝載率']<50
print('trips',len(t),'raw rows',len(raw))
print(t.groupby('類型').agg(趟=('費用','size'),費用=('費用','sum'),均裝=('裝載率','mean'),低=('低','mean'),重低=('重低','mean')))
REMOTE={'花蓮','台東','澎湖','金門','航一','航二','松山機場(外島空運件)','高金碼頭'}
t['bucket']=''
low=t['低']
def asg(mask,name):
    m=mask&low&(t['bucket']=='')
    t.loc[m,'bucket']=name
# S1 structural
asg(t['溫層'].eq('低溫車'),'1A 低溫/特殊溫層')
asg(t['發車'].isin(REMOTE)|t['到著'].isin(REMOTE),'1B 偏遠/外島/港口機場')
asg((t['補']>0)|(t['收']>0),'1C 補空/收空調度')
# price table: median cost by route+tonnage class
t['級']=np.where(t['噸']>=25,'35','17')
price,pricetype=price_tables(t)   # 排除 0 元車趟,見 pricing.py
def pr(typ,a,b,k):
    return route_price(price,typ,a,b,k)
# S2 oversized vehicle: 35T carrying <=14
m=(t['級']=='35')&(t['總籠']<=14)&low&(t['bucket']=='')
sav=[]
for i,r in t[m].iterrows():
    p17=pr(r['類型'],r['發車'],r['到著'],'17')
    sav.append(max(0,r['費用']-p17) if not np.isnan(p17) else np.nan)
t.loc[m,'bucket']='2 車型錯配(35T載≤14籠)'
t['可省']=0.0
t.loc[m,'可省']=pd.Series(sav,index=t[m].index).fillna(0)
t['可省可信']=''
t.loc[m,'可省可信']=np.where(pd.Series(sav,index=t[m].index).isna(),'無同線17T價','')
# S3 same-day same-route split, with departure-time clustering
grp=t.groupby(['日期','類型','發車','到著'])
split_info={}
def best_combo(tot,typ,a,b):
    p35=pr(typ,a,b,'35'); p17=pr(typ,a,b,'17')
    p35=p35 if not np.isnan(p35) else pricetype.get((typ,'35'),np.nan)
    p17=p17 if not np.isnan(p17) else pricetype.get((typ,'17'),np.nan)
    best=None
    for n35 in range(0,6):
        for n17 in range(0,8):
            if n35*20+n17*14>=tot and (n35+n17)>0:
                c=n35*(p35 if n35 else 0)+n17*(p17 if n17 else 0)
                if best is None or c<best[0]: best=(c,n35,n17)
    return best
def eval_cluster(d,typ,a,b):
    best=best_combo(d['總籠'].sum(),typ,a,b)
    if best and best[0]<d['費用'].sum() and (best[1]+best[2])<len(d):
        return d['費用'].sum()-best[0]
    return 0
for key,d in grp:
    if len(d)<2: continue
    typ,a,b=key[1],key[2],key[3]
    d=d.sort_values('出發')
    # theoretical (ignore time)
    th=eval_cluster(d,typ,a,b)
    if th<=0: continue
    # cluster by 30 / 120
    for lab,gap in (('3A',30),('3B',120)):
        cl=[];cur=[]
        for i,r in d.iterrows():
            if cur and (r['出發']-d.loc[cur[0],'出發']).total_seconds()/60>gap:
                cl.append(cur);cur=[]
            cur.append(i)
        if cur: cl.append(cur)
        for c in cl:
            if len(c)<2: continue
            dd=d.loc[c]; sv=eval_cluster(dd,typ,a,b)
            if sv>0:
                lowidx=[i for i in c if t.loc[i,'低']]
                for i in lowidx:
                    prev=split_info.get(i)
                    if prev is None or (lab=='3A' and prev[0]=='3B'):
                        split_info[i]=(lab,sv/len(lowidx))
                    elif prev is not None and lab=='3B' and prev[0]=='3B':
                        pass
    # theoretical only for remaining low trips in group
    for i in d.index[d['低']]:
        if i not in split_info: split_info[i]=('3C',th/ max(1,d['低'].sum()))
names={'3A':'3A 同站同日多趟·時差≤30分(可立即併)','3B':'3B 同站同日多趟·時差30–120分(時窗池)','3C':'3C 同站同日多趟·時間分散(理論可併,時窗不允許)'}
for i,(lab,s_) in split_info.items():
    if low[i] and t.loc[i,'bucket']=='':
        t.loc[i,'bucket']=names[lab]; t.loc[i,'可省']=s_
# S4 cross-station pooling among remaining low trips: same date,type,到著, depart diff
rest=t[low&(t['bucket']=='')].copy()
pair_ids={}
for key,d in rest.groupby(['日期','類型','到著']):
    d=d.sort_values('出發'); idx=list(d.index); used=set()
    for i in range(len(idx)):
        if idx[i] in used: continue
        for j in range(i+1,len(idx)):
            if idx[j] in used: continue
            a,b=t.loc[idx[i]],t.loc[idx[j]]
            if a['發車']==b['發車']: continue
            diff=(b['出發']-a['出發']).total_seconds()/60
            capmax=max(a['cap'],b['cap'])
            if a['總籠']+b['總籠']<=capmax and diff<=120:
                used.update([idx[i],idx[j]])
                cheap=min(a['費用'],b['費用']); add=800 if capmax==20 else 500
                lab='4A 跨站共車候選(時差≤30分)' if diff<=30 else '4B 時窗調整池(30–120分)'
                pair_ids[idx[i]]=(lab,max(0,cheap-add)); pair_ids[idx[j]]=(lab,0)
                break
for i,(lab,s) in pair_ids.items():
    t.loc[i,'bucket']=lab; t.loc[i,'可省']=s
# S5 sunday
m=low&(t['bucket']=='')&t['週日']
t.loc[m,'bucket']='5 週日貨少'
# S6 residual
m=low&(t['bucket']=='')
t.loc[m,'bucket']='6 其他(需預排資料判定)'
t['空載']=t['費用']*(1-t['裝載率'].clip(upper=100)/100)
t.to_pickle('out/trips.pkl')
L=t[low]
sumy=L.groupby('bucket').agg(趟數=('費用','size'),平均裝載率=('裝載率','mean'),總費用=('費用','sum'),空載估計=('空載','sum'),可省估計=('可省','sum')).round(0)
sumy['趟數占比']=(sumy['趟數']/sumy['趟數'].sum()*100).round(1)
sumy['空載占比']=(sumy['空載估計']/sumy['空載估計'].sum()*100).round(1)
print(sumy)
print('低裝載趟',len(L),'全部趟',len(t),'空載合計',L['空載'].sum().round(),'總車次費用',t['費用'].sum())
print(pd.crosstab(L['bucket'],L['類型'],values=L['空載'],aggfunc='sum').round(0))
print(pd.crosstab(L['bucket'],L['類型']))
