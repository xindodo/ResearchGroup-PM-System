<script setup lang="ts" generic="T extends { attachments: Attachment[] }">
import { ref } from 'vue'
import { Upload } from '@lucide/vue'
import type { Attachment } from '../data'
import { uploadFile } from '../api'
import { toast } from '../store'
import { useUploadProgress } from '../uploadProgress'
import UploadProgress from './UploadProgress.vue'

const props=defineProps<{entity:T;save:(value:T)=>Promise<boolean>}>()
const input=ref<HTMLInputElement>(), busy=ref(false), error=ref('')
const state=useUploadProgress()
const {progress,filePercent,totalPercent}=state
function open(){if(!busy.value)input.value?.click()}
defineExpose({open})
async function selected(event:Event){
  const element=event.target as HTMLInputElement
  const files=Array.from(element.files || [])
  element.value=''
  if(!files.length || busy.value)return
  // Capture the entity and revision before uploading, so navigation or concurrent edits
  // cannot attach files to another record or silently overwrite a newer revision.
  const snapshot=JSON.parse(JSON.stringify(props.entity)) as T
  const save=props.save
  error.value='';busy.value=true;state.begin(files)
  try{
    if(files.some(file=>!file.size || file.size>500*1024*1024))throw Error('每个附件须大于0且不超过500MB')
    for(const file of files){state.next(file);snapshot.attachments.push(await uploadFile(file,false,state.update))}
    state.finish('上传完成，正在保存…')
    if(!await save(snapshot))throw Error(toast.value || '附件保存失败，请刷新后重试')
    state.finish('附件已上传并保存')
  }catch(e){state.fail();error.value=(e as Error).message}
  finally{busy.value=false}
}
</script>
<template>
  <div class="direct-attachment-upload">
    <input ref="input" type="file" multiple hidden aria-label="直接上传附件" :disabled="busy" @change="selected">
    <button :disabled="busy" @click="open"><Upload :size="18"/>{{ busy?'正在上传…':'上传附件' }}</button>
    <UploadProgress :state="progress" :file-percent="filePercent" :total-percent="totalPercent"/>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.direct-attachment-upload{min-width:0;max-width:320px}
.direct-attachment-upload>.error{white-space:normal;overflow-wrap:anywhere}
</style>
