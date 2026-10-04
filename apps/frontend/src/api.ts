import { ref } from 'vue'
export const prototype = false
export interface Account { id: string; account: string; name: string; role: string; active: boolean; revision: number }
export const account = ref<Account | null>(null)
let csrf = ''
export type UploadEvent = { loaded: number; phase: 'uploading' | 'confirming' | 'complete' }
export async function uploadFile(file: File, image = false, onProgress?: (event: UploadEvent) => void) {
  if (!file.size || file.size > 500 * 1024 * 1024) throw new Error('每个文件须大于0且不超过500MB')
  if (prototype) {
    const data = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onprogress=e=>onProgress?.({loaded:e.loaded,phase:'uploading'});reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('读取文件失败'));reader.readAsDataURL(file)})
    onProgress?.({loaded:file.size,phase:'complete'})
    return { name:file.name,type:file.type,size:file.size,data }
  }
  return new Promise<{name:string;type:string;size:number;data:string}>((resolve,reject)=>{
    const request=new XMLHttpRequest()
    request.upload.onprogress=e=>onProgress?.({loaded:Math.min(e.loaded,file.size),phase:e.loaded>=file.size?'confirming':'uploading'})
    request.upload.onload=()=>onProgress?.({loaded:file.size,phase:'confirming'})
    request.open('POST','/api/uploads?'+new URLSearchParams({name:file.name,image:image?'1':'0'}))
    request.setRequestHeader('Content-Type','application/octet-stream')
    request.setRequestHeader('X-CSRF-Token',csrf)
    request.timeout=30*60*1000
    request.onerror=()=>reject(new Error('上传网络中断，请检查连接后重试'))
    request.ontimeout=()=>reject(new Error('上传超时，请检查网络后重试'))
    request.onabort=()=>reject(new Error('上传已取消'))
    request.onload=()=>{
      let value
      try {value=JSON.parse(request.responseText)} catch {reject(new Error('上传失败，请检查网络及服务器上传限制'));return}
      if(request.status<200 || request.status>=300){if(request.status===401)account.value=null;reject(new Error(value.error || '上传失败'));return}
      onProgress?.({loaded:file.size,phase:'complete'});resolve(value)
    }
    onProgress?.({loaded:0,phase:'uploading'})
    request.send(file)
  })
}
export async function api<T = any>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin', headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, body: data !== undefined ? JSON.stringify(data) : undefined })
  const value = await response.json().catch(() => ({ error: '服务暂不可用，请确认本地API已启动' }))
  if (!response.ok) { if (response.status === 401) account.value = null; throw new Error(value.error || '请求失败') }
  return value
}
export async function session() { const result = await api('/session'); account.value = result.user; csrf = result.csrf }
export async function login(username: string, password: string) { const result = await api('/login','POST',{ account: username, password }); account.value = result.user; csrf = result.csrf }
export async function logout() { await api('/logout','POST',{}); account.value = null; csrf = '' }
export const reviewer = () => !!account.value && ['系统管理员'].includes(account.value.role)
export const editable = (_record: { creator?: string }) => (prototype || !!account.value) && account.value?.role !== '只读访客'
export const deletable = (record: { creator?: string }) => editable(record) && (prototype || reviewer() || record.creator === account.value?.id)
