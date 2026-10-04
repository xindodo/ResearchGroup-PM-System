import type { RecordItem, Kind } from './data'
export const yearRange = (kind: Kind) => kind === 'achievements' || kind === 'research' || kind === 'students'
export const timeLabel = (kind: Kind) => ({news:'发布日期',development:'活动日期',teaching:'工作日期',daily:'记录日期',materials:'录入日期',achievements:'成果年度',research:'成果年度',students:'成果年度',projects:'项目起止时间'})[kind]
export function rangeError(from: string, to: string, yearly: boolean) {
  if(yearly && [from,to].some(v=>v && !/^[1-9]\d{3}$/.test(v)))return '请输入四位年度'
  return from && to && from > to ? '开始时间不能晚于结束时间' : ''
}
export function inTimeRange(r: RecordItem, from: string, to: string) {
  if(!from && !to)return true
  if(rangeError(from,to,yearRange(r.kind)))return false
  if(r.kind==='projects') {
    // Missing endpoints are not invented; use the known endpoint as a single date.
    const start=r.start || r.end, end=r.end || r.start
    return !!start && (!from || end>=from) && (!to || start<=to)
  }
  let value=yearRange(r.kind)?r.year:r.start
  if(r.kind==='materials') {
    const date=new Date(r.createdAt || '')
    value=Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
  }
  return !!value && (!from || value>=from) && (!to || value<=to)
}
