import { computed, reactive } from 'vue'
import type { UploadEvent } from './api'

export function useUploadProgress() {
  const progress=reactive({count:0,index:0,name:'',size:0,loaded:0,total:0,completedBytes:0,message:'',failed:false})
  const filePercent=computed(()=>progress.size ? Math.min(100,Math.floor(progress.loaded/progress.size*100)) : 0)
  const totalPercent=computed(()=>progress.total ? Math.min(100,Math.floor((progress.completedBytes+progress.loaded)/progress.total*100)) : 0)
  function begin(files:File[]) {Object.assign(progress,{count:files.length,index:0,name:'',size:0,loaded:0,total:files.reduce((n,f)=>n+f.size,0),completedBytes:0,message:'准备上传',failed:false})}
  function next(file:File) {
    progress.completedBytes+=progress.loaded;progress.loaded=0;progress.index++;progress.name=file.name;progress.size=file.size;progress.message='准备上传'
  }
  function update(event:UploadEvent) {progress.loaded=event.loaded;progress.message=event.phase==='confirming'?'传输完成，服务器确认中…':event.phase==='complete'?'当前文件上传成功':'正在上传…'}
  function finish(message='全部上传成功，请保存表单') {progress.message=message}
  function fail() {progress.failed=true;progress.message='上传或保存失败，请查看下方提示后重试'}
  return {progress,filePercent,totalPercent,begin,next,update,finish,fail}
}
