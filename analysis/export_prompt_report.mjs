// 在 Codex 的獨立報表執行目錄執行，套件僅使用 bundled workspace dependencies。
// node export_prompt_report.mjs report-data.json prompt-comparison.json output-directory
import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const [dataPath, comparisonPath, outputDir] = process.argv.slice(2);
const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const comparison = JSON.parse(await fs.readFile(comparisonPath, 'utf8'));
await fs.mkdir(outputDir, { recursive: true });
const wb = Workbook.create();
const names = ['總覽', '圖表', '月度分析', '路線機會', '合併明細', '費率比較', '假設與建議', '資料檢查', '驗證與運能'];
const sheets = Object.fromEntries(names.map((name) => [name, wb.worksheets.add(name)]));
const numeric = '#,##0;[Red](#,##0);–';
const mix = (value) => Object.entries(value).map(([t, n]) => `${Number(t)}噸×${n}`).join(' + ') || '無需付費載貨車';
const windowLabel = (g) => g.bucket < 0 ? '全天（理論）' : `${String(g.bucket * 2).padStart(2, '0')}:00–${String(g.bucket * 2 + 2).padStart(2, '0')}:00`;
function table(name, headers, rows, start = 5) {
  const sh = sheets[name];
  sh.showGridLines = false;
  sh.getRange('A2').values = [[name === '合併明細' ? 'B 推薦情境完整節省群組' : name]];
  sh.getRange('A2').format.font = { name: 'Arial', size: 14, bold: true, color: '#243E36' };
  const range = sh.getRangeByIndexes(start - 1, 0, rows.length + 1, headers.length);
  range.values = [headers, ...rows];
  range.format.font = { name: 'Arial', size: 10, color: '#293F35' };
  range.format.rowHeight = 24;
  range.format.columnWidth = 19;
  range.format.verticalAlignment = 'center';
  range.setNumberFormat(numeric);
  const heading = sh.getRangeByIndexes(start - 1, 0, 1, headers.length);
  heading.format.fill = '#304D40';
  heading.format.font = { name: 'Arial', size: 10, color: '#FFFFFF', bold: true };
  heading.format.horizontalAlignment = 'center';
  sh.getRangeByIndexes(start, 0, Math.max(1, rows.length), 1).format.columnWidth = 28;
  if (rows.length > 10) sh.freezePanes.freezeRows(start);
  if (rows.length) {
    const endColumn = String.fromCharCode(64 + headers.length);
    const t = sh.tables.add(`A${start}:${endColumn}${start + rows.length}`, true, 'Report' + names.indexOf(name));
    t.style = 'TableStyleMedium4';
    t.showFilterButton = true;
  }
  return sh;
}

const overview = table('總覽', ['情境', '最佳化成本（元）', '節省（元）', '節省率', '月推估（元）', '年推估（元）'], data.scenarios.map((s) => [s.label, s.cost, null, null, null, null]), 10);
overview.getRange('A2').values = [[data.algorithmName]];
overview.getRange('A4:D7').values = [
  ['去重成本基準（元）', data.audit.baselineCost, '實際作業日數', data.audit.operationDays],
  ['原始逐列費用（元）', data.audit.rawCost, '去重實體趟次', data.audit.trips],
  ['中繼重複費用（元）', null, '運費分撥（元）', data.audit.allocatedCost],
  ['期間', data.audit.start + '–' + data.audit.end, '缺漏作業日', data.audit.missingDates.join('、')],
];
overview.getRange('B6').formulas = [['=B5-B4']];
for (let r = 11; r <= 14; r++) {
  overview.getRange(`C${r}:F${r}`).formulas = [[`=$B$4-B${r}`, `=C${r}/$B$4`, `=C${r}/$D$4*30`, `=C${r}/$D$4*365`]];
}
overview.getRange('B4:B6').setNumberFormat(numeric);
overview.getRange('D4:D6').setNumberFormat(numeric);
overview.getRange('C11:F14').setNumberFormat(numeric);
overview.getRange('D11:D14').setNumberFormat('0.0%');
overview.getRange('A4:F7').format.columnWidth = 26;
overview.getRange('A4:F7').format.rowHeight = 26;
overview.getRange('A17').values = [['月／年化為推估，按實際作業日日均乘 30／365。']];
overview.getRange('A19').values = [['優先覆核高節省路線、容量異常、35 噸可用運能與承運商報價。']];

const months = [...new Set(data.monthly.map((r) => r.month))];
const monthlyRows = months.map((month) => {
  const cost = data.monthly.filter((r) => r.month === month).reduce((s, r) => s + r.cost, 0);
  const receive = data.demands.find((r) => r.month === month && r.kind === '收件');
  const deliver = data.demands.find((r) => r.month === month && r.kind === '送件');
  return [month, cost, receive?.events ?? null, deliver?.events ?? null, null, null];
});
const monthly = table('月度分析', ['月份', '去重成本（元）', '收件件次', '送件件次', '服務件次', '每件次成本（元）'], monthlyRows);
for (let r = 6; r < 6 + monthlyRows.length; r++) monthly.getRange(`E${r}:F${r}`).formulas = [[`=SUM(C${r}:D${r})`, `=B${r}/E${r}`]];
monthly.getRange(`F6:F${5 + monthlyRows.length}`).setNumberFormat('0.00');
monthly.getRange('A11:F11').values = [['月份', '運輸類型', '趟次', '成本（元）', '籠車數', '平均裝載率']];
monthly.getRangeByIndexes(11, 0, data.monthly.length, 6).values = data.monthly.map((r) => [r.month, r.ty, r.trips, r.cost, r.cages, r.load / 100]);
monthly.getRange('C12:E17').setNumberFormat(numeric);
monthly.getRange('F12:F30').setNumberFormat('0.0%');
monthly.getRange('A21').values = [['件次為收件與送件兩種服務事件，同一包裹可出現兩次。']];
monthly.getRange('A23').values = [['需求來源（合計區塊整月欄，53 個站所）：']];
data.demands.forEach((r, i) => { monthly.getRange(`A${24 + i}`).values = [[r.source]]; });

const lanes = table('路線機會', ['路線', '現況成本（元）', 'B 節省（元）', '節省率'], data.lanes.map((r) => [r.lane, r.current, r.saving, null]));
for (let r = 6; r < 6 + data.lanes.length; r++) lanes.getRange(`D${r}`).formulas = [[`=IF(B${r}=0,"n.a.",C${r}/B${r})`]];
lanes.getRange(`D6:D${5 + data.lanes.length}`).setNumberFormat('0.0%');

const groups = comparison.scenarios.B.groups.slice().sort((a, b) => b.saving - a.saving);
const details = table('合併明細', ['群組', '作業日期', '路線', '溫層', '時窗', '總籠', '免費容量', '付費需求', '固定成本', '現況成本', '建議成本', '節省', '現況車型', '建議車型', '來源派車單號', '實際發車時刻'], groups.map((g) => [g.groupId, new Date(g.date + 'T00:00:00Z'), g.lane, g.temp, windowLabel(g), g.cages, g.freeCapacity, null, g.fixed, g.current, g.cost, null, mix(g.currentMix), mix(g.mix), g.ids.join('、'), g.departures.join('、')]));
for (let r = 6; r < 6 + groups.length; r++) {
  details.getRange(`H${r}`).formulas = [[`=MAX(0,F${r}-G${r})`]];
  details.getRange(`L${r}`).formulas = [[`=J${r}-K${r}`]];
}
details.getRange(`B6:B${5 + groups.length}`).setNumberFormat('yyyy-mm-dd');
details.getRange('C5:C80').format.columnWidth = 28;
details.getRange(`M5:P${5 + groups.length}`).format.columnWidth = 42;

const rates = data.rates.filter((r) => r.size >= comparison.parameters.minCarrierSamples);
table('費率比較', ['路線', '溫層', '噸級', '承運商', '中位報價（元）', '報價樣本數'], rates.map((r) => [r.lane, r.temp, r.ton, r.carrier, r.median, r.size]));
sheets['費率比較'].getRange(`C6:C${5 + rates.length}`).setNumberFormat('0.0');
sheets['費率比較'].getRange(`C6:C${5 + rates.length}`).format.horizontalAlignment = 'center';
sheets['費率比較'].getRange(`D6:D${5 + rates.length}`).format.horizontalAlignment = 'left';
sheets['費率比較'].getRange('A3').values = [['僅納入同路線、溫層、噸級且至少 2 筆正費用報價的承運商。']];

table('假設與建議', ['項目', '模型規則／限制'], data.limitations.map((text, i) => [String(i + 1), text]));
sheets['假設與建議'].getRange('B5:B20').format.columnWidth = 145;
sheets['假設與建議'].getRange('A18').values = [['來源：analysis/車趟成本最佳化規格.md；參數與報價表由同次運算產生。']];

table('資料檢查', ['來源檔', '工作表', '列數', '起日', '迄日', '作業日數'], data.audit.sheets.map((r) => [r.file, r.sheet, r.rows, new Date(r.start + 'T00:00:00Z'), new Date(r.end + 'T00:00:00Z'), r.days]));
sheets['資料檢查'].getRange('A5:A20').format.columnWidth = 47;
sheets['資料檢查'].getRange('D6:E11').setNumberFormat('yyyy-mm-dd');
sheets['資料檢查'].getRange('A14:D17').values = [['付費零籠趟次', data.audit.fixedTrips, '保留固定成本（元）', data.audit.fixedCost], ['免費載貨趟次', data.audit.freeLoadedTrips, '容量異常趟次', data.audit.capacityAnomalies], ['超過標準容量趟次', data.audit.overloadedTrips, '容量回推眾數', JSON.stringify(data.audit.capacityModes)], ['缺漏作業日', data.audit.missingDates.join('、'), '差額容許', '< 0.5%']];
sheets['資料檢查'].getRange('D14:D15').setNumberFormat(numeric);
sheets['資料檢查'].getRange('A20:B22').values = [['來源檔', 'SHA-256'], ...data.audit.sources.map((r) => [r.file, r.sha256])];
sheets['資料檢查'].getRange('B20:B22').format.columnWidth = 75;

table('驗證與運能', ['驗證項目', '實測值', '門檻', '結果'], data.validation.map((r) => [r.name, r.value, r.threshold, r.passed ? '通過' : '未通過，需覆核']));
sheets['驗證與運能'].getRange('A5:A20').format.columnWidth = 46;
sheets['驗證與運能'].getRange('B6:B12').setNumberFormat('0.000000');
sheets['驗證與運能'].getRange('B6').setNumberFormat('0.0%');
sheets['驗證與運能'].getRange('B9').setNumberFormat('0.0%');
sheets['驗證與運能'].getRange('A16:F20').values = [['35t 上限倍數', '上限趟次', '使用趟次', '成本（元）', '節省（元）', '節省率'], ...data.sensitivity.map((r) => [r.multiplier ?? '無限制', r.limit ?? '無限制', r.used35, r.cost, r.saving, r.savingPct])];
sheets['驗證與運能'].getRange('D17:E20').setNumberFormat(numeric);
sheets['驗證與運能'].getRange('B17:C20').setNumberFormat(numeric);
sheets['驗證與運能'].getRange('F17:F20').setNumberFormat('0.0%');
sheets['驗證與運能'].getRange('A23').values = [['全域 MILP，固定／免費車保持現況；保留現況車也占付費載貨 35t 上限。']];

const charts = sheets['圖表']; charts.showGridLines = false;
charts.getRange('A2').values = [['成本結構、裝載率與情境節省']];
charts.getRange('A2').format.font = { size: 14, name: 'Arial', bold: true };
charts.getRange('A5:B9').values = [['情境', '節省（元）'], ...data.scenarios.map((r) => [r.label, r.saving])];
charts.getRange('A14:B20').values = [['裝載率', '趟次'], ...data.distribution.map((r) => [r.bin, r.trips])];
const typeCosts = ['集貨', '轉運', '繼送'].map((ty) => [ty, data.monthly.filter((r) => r.ty === ty).reduce((s, r) => s + r.cost, 0)]);
charts.getRange('A25:B28').values = [['運輸類型', '成本（元）'], ...typeCosts];
charts.getRange('A5:B28').format.columnWidth = 26;
charts.getRange('B5:B28').setNumberFormat(numeric);
for (const [range, title, start, end] of [['A5:B9', '四情境節省（新台幣元）', 'D4', 'L19'], ['A14:B20', '裝載率分布（趟次）', 'N4', 'V19'], ['A25:B28', '運輸類型成本（新台幣元）', 'D23', 'L38']]) {
  const chart = charts.charts.add('bar', charts.getRange(range));
  chart.title = title; chart.setPosition(start, end);
  chart.titleTextStyle.typeface = 'Arial'; chart.titleTextStyle.fontSize = 12;
  chart.yAxis = { numberFormatCode: '#,##0', numberFormatSourceLinked: false };
  chart.series.items[0].fill = '#386850';
}
overview.tabColor = '#304D40';
wb.recalculate();
console.log((await wb.inspect({ kind: 'table', range: '總覽!A10:F14', include: 'values,formulas', tableMaxRows: 5, tableMaxCols: 6, maxChars: 2000 })).ndjson);
console.log((await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 20 }, maxChars: 1000 })).ndjson);
const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(path.join(outputDir, '車趟演算法比較.xlsx'));
const previewDir = path.join(outputDir, 'previews'); await fs.mkdir(previewDir, { recursive: true });
for (const name of names) {
  const range = name === '圖表' ? 'A1:V39' : name === '合併明細' ? 'A1:L12' : name === '假設與建議' ? 'A1:B15' : name === '總覽' ? 'A1:F20' : 'A1:F20';
  const png = await wb.render({ sheetName: name, range, scale: 1.3, format: 'png' });
  await fs.writeFile(path.join(previewDir, `${name}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log('已匯出車趟演算法比較.xlsx 與九張工作表預覽');
