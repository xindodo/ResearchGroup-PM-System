import type { RecordItem } from './data'
import { yearRange } from './timeFilter'

export function descendingDate(a?: string, b?: string) {
  return (b || '').localeCompare(a || '')
}
export function recordDate(record: RecordItem) {
  if(record.kind === 'materials') return record.createdAt || ''
  return (yearRange(record.kind) ? record.year : record.start) || ''
}
export function newestRecords(rows: RecordItem[]) {
  return [...rows].sort((a,b)=>descendingDate(recordDate(a),recordDate(b)) || descendingDate(a.createdAt,b.createdAt) || a.id.localeCompare(b.id))
}
