import pandas as pd,numpy as np,json,glob
t=pd.read_pickle('out/trips.pkl')
m=pd.read_pickle('out/mismatch.pkl')
raw=pd.concat([pd.read_pickle(f) for f in glob.glob('data/*明細.pkl')])
end=raw.drop_duplicates('派車單號').set_index('派車單號')['任務完成時間']
# 結帳單位 = 負責的轉運中心(北轉、中轉、高轉;桃轉歸北轉)
bill=raw.drop_duplicates('派車單號').set_index('派車單號')['結帳單位']
# 籠車去向:各區常溫、低溫、棧板合計;多筆分攤列加總,超過總籠數時改用第一筆
REG=['北二','北','中','南','宜','花','玉','東','島']
for r_ in REG:
    raw['rg_'+r_]=raw[[r_+'常溫籠車',r_+'低溫籠車',r_+'棧板']].sum(axis=1)
rg_sum=raw.groupby('派車單號')[['rg_'+r_ for r_ in REG]].sum()
rg_first=raw.drop_duplicates('派車單號').set_index('派車單號')[['rg_'+r_ for r_ in REG]]
t['結束']=pd.to_datetime(t['派車單號'].map(end))
# bucket codes
def code(b):
    if not b: return 'OK'
    return b.split(' ')[0]
t['bk']=t['bucket'].map(code)
# split bucket 2 by grade from mismatch analysis
m['真省']=np.where((m['17價'].notna())&(m['17價']<m['費用']),m['費用']-m['17價'],0)
g2={}
for _,r in m.iterrows():
    if r['等級'].startswith('A'): g2[r['派車單號']]=('2A1' if r['真省']>0 else '2A2', r['真省'], r['17價'])
    elif r['等級'].startswith('B'): g2[r['派車單號']]=('2B',0,r['17價'])
    else: g2[r['派車單號']]=('2C',0,np.nan)
for i,r in t[t.bk=='2'].iterrows():
    t.loc[i,'bk']=g2[r['派車單號']][0]
t['act']='';t['tier']='';t['nTn']=np.nan;t['nCap']=np.nan;t['nN']=np.nan;t['nC']=np.nan;t['gid']=''
# A1 switch to 17T
for i,r in t[t.bk=='2A1'].iterrows():
    _,sv,p17=g2[r['派車單號']]
    t.loc[i,['act','tier','nTn','nCap','nN','nC']]=['sw','v',17,14,r['總籠'],p17]
price=t.groupby(['類型','發車','到著','級'])['費用'].median()
pricetype=t[t.費用>0].groupby(['類型','級'])['費用'].median()
def pr(typ,a,b,k):
    v=price.get((typ,a,b,k),np.nan)
    if np.isnan(v) or v==0: v=pricetype.get((typ,k),np.nan)
    return v
def combo(tot,typ,a,b):
    p35=pr(typ,a,b,'35'); p17=pr(typ,a,b,'17'); best=None
    for n35 in range(0,6):
        for n17 in range(0,8):
            if n35*20+n17*14>=tot and n35+n17>0:
                c=n35*p35+n17*p17
                if best is None or c<best[0]: best=(c,n35,n17)
    return best
gid=0
def merge_cluster(idx,tier):
    global gid
    d=t.loc[idx].sort_values('出發')
    b=combo(d['總籠'].sum(),d.iloc[0]['類型'],d.iloc[0]['發車'],d.iloc[0]['到著'])
    if not b: return
    k=b[1]+b[2]
    if k>=len(d) or b[0]>=d['費用'].sum(): return
    gid+=1
    veh=[35]*b[1]+[17]*b[2]
    tot=d['總籠'].sum(); capsum=sum(20 if v==35 else 14 for v in veh)
    keep=list(d.index[:k]); drop=list(d.index[k:])
    rem=tot
    for j,(i,v) in enumerate(zip(keep,veh)):
        cap=20 if v==35 else 14
        n=min(cap,rem) if j<k-1 else rem
        rem-=n
        t.loc[i,['act','tier','nTn','nCap','nN','nC','gid']]=['mg',tier,v,cap,n,(35 and (pr(d.iloc[0]['類型'],d.iloc[0]['發車'],d.iloc[0]['到著'],'35') if v==35 else pr(d.iloc[0]['類型'],d.iloc[0]['發車'],d.iloc[0]['到著'],'17'))),f'G{gid}']
    for i in drop:
        t.loc[i,['act','tier','nTn','nCap','nN','nC','gid']]=['dr',tier,np.nan,np.nan,0,0,f'G{gid}']
def clusters(d,gap):
    d=d.sort_values('出發'); out=[];cur=[]
    for i,r in d.iterrows():
        if cur and (r['出發']-d.loc[cur[0],'出發']).total_seconds()/60>gap: out.append(cur);cur=[]
        cur.append(i)
    if cur: out.append(cur)
    return [c for c in out if len(c)>=2]
for code_,gap,tier in (('3A',30,'v'),('3B',120,'w')):
    sub=t[t.bk==code_]
    for key,d in sub.groupby(['日期','類型','發車','到著']):
        for c in clusters(d,gap): merge_cluster(c,tier)
# pairs 4A/4B
for code_,tier in (('4A','v'),('4B','w')):
    sub=t[t.bk==code_]
    for key,d in sub.groupby(['日期','類型','到著']):
        d=d.sort_values('出發'); idx=list(d.index); used=set()
        for a in range(len(idx)):
            if idx[a] in used: continue
            for b_ in range(a+1,len(idx)):
                if idx[b_] in used: continue
                A,B=t.loc[idx[a]],t.loc[idx[b_]]
                if A['發車']==B['發車']: continue
                capm=max(A['cap'],B['cap'])
                if A['總籠']+B['總籠']<=capm:
                    used.update([idx[a],idx[b_]]); gid+=1
                    keep,drop=(idx[a],idx[b_]) if A['cap']>=B['cap'] else (idx[b_],idx[a])
                    K=t.loc[keep]; D=t.loc[drop]
                    add=800 if capm==20 else 500
                    t.loc[keep,['act','tier','nTn','nCap','nN','nC','gid']]=['mg',tier,K['噸'],K['cap'],A['總籠']+B['總籠'],K['費用']+add,f'G{gid}']
                    t.loc[drop,['act','tier','nTn','nCap','nN','nC','gid']]=['dr',tier,np.nan,np.nan,0,0,f'G{gid}']
                    break
t['sv']=np.where(t['act']!='',t['費用']-t['nC'].fillna(0),0)
print(t[t.act!=''].groupby(['tier','act']).agg(n=('費用','size'),sv=('sv','sum')))
print('verified saving',t[t.tier=='v']['sv'].sum(),'window',t[t.tier=='w']['sv'].sum())
# coords
TY={'集貨':'c','轉運':'t','繼送':'d'}
def mins(ts): return int(ts.hour*60+ts.minute)
rows=[]
for i,r in t.iterrows():
    h=mins(r['出發']); du=max(20,int((r['結束']-r['出發']).total_seconds()/60)) if pd.notna(r['結束']) else 120
    du=min(du,600)
    o=dict(id=str(r['派車單號']),d=r['日期'].strftime('%Y-%m-%d'),ty=TY[r['類型']],o=r['發車'],x=r['到著'],tn=float(r['噸']),cap=int(r['cap']),
           n=int(r['總籠']),lr=round(float(r['裝載率']),1),c=int(r['費用']),h=h,du=du,bk=r['bk'],emp=round(float(r['空載'])),cr=r['承運'])
    if r['溫層']=='低溫車': o['cold']=1
    if r['補']>0 or r['收']>0: o['ec']=int(r['補']+r['收'])
    if r['act']:
        o['act']=r['act']; o['tier']=r['tier']; o['gid']=r['gid']; o['sv']=int(round(r['sv']))
        if r['act']!='dr': o.update(nTn=float(r['nTn']),nCap=int(r['nCap']),nN=int(r['nN']),nC=int(round(r['nC'])))
    if r['bk'] in ('2B',) and pd.notna(g2[r['派車單號']][2]): o['p17']=int(g2[r['派車單號']][2])
    o['bh']=str(bill[r['派車單號']])
    rs=rg_sum.loc[r['派車單號']]
    if rs.sum()>r['總籠']: rs=rg_first.loc[r['派車單號']]
    rg={k[3:]:int(v) for k,v in rs.items() if v>0}
    if rg: o['rg']=rg
    rows.append(o)
json.dump(rows,open('out/trips.json','w'),ensure_ascii=False,separators=(',',':'))
print(len(rows)); import os; print(os.path.getsize('out/trips.json'))
print(t.bk.value_counts())
