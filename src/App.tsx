import { Scene } from './scene/Scene'
import { LeftPanel } from './ui/LeftPanel'
import { SidePanel } from './ui/SidePanel'
import { Timeline } from './ui/Timeline'
import { TopBar } from './ui/TopBar'

export function App() {
  return (
    <div className="app">
      <div className="canvas-wrap">
        <Scene />
      </div>
      <TopBar />
      <LeftPanel />
      <SidePanel />
      <Timeline />
      <div className="legend">
        <span><i style={{ background: '#3ccf7a' }} />≥90%</span>
        <span><i style={{ background: '#f5b93a' }} />80–90%</span>
        <span><i style={{ background: '#ef4d4d' }} />&lt;80%</span>
        <span><i style={{ background: '#9aa3ab' }} />空車</span>
        <span><i className="ghost" />建議取消</span>
      </div>
      <div className="footnote">
        資料:115 年 6 月、7 月(1–20 日)車趟派遣原始數據,共 9,748 趟。空載成本 = 車次費用 ×(1 − 裝載率),可省金額依同路線中位價估算,皆非正式會計口徑。
      </div>
    </div>
  )
}
