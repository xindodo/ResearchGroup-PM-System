import { ref } from 'vue'
import type { RecordItem } from './data'
import { api } from './api'
export const records = ref<RecordItem[]>([])
export const toast = ref('')
let timer: ReturnType<typeof setTimeout>
export function notify(message: string) {
  toast.value = message
  clearTimeout(timer)
  timer = setTimeout(() => { toast.value = '' }, 4500)
}
export async function saveRecord(record: RecordItem) {
    try {
      const saved = await api<RecordItem>(record.id ? `/records/${record.id}` : '/records',record.id ? 'PUT' : 'POST',record)
      records.value = records.value.some(r => r.id === saved.id) ? records.value.map(r => r.id === saved.id ? saved : r) : [saved,...records.value]
      notify('已保存并发布'); return true
    } catch (e) { notify((e as Error).message); return false }
}
export async function deleteRecord(record: RecordItem) {
  try { await api(`/records/${record.id}`,'DELETE',{ revision:record.revision }); records.value = records.value.filter(r => r.id !== record.id); notify('记录已删除（保留可恢复数据）'); return true }
  catch (e) { notify((e as Error).message); return false }
}
