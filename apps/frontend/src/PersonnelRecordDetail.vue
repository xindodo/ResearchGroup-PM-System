<script setup lang="ts">
import { computed, ref } from 'vue'
import { records, saveRecord } from './store'
import { definitions, hasParticipantOwners, hasProjectTeam, ownerLabel, participantsOf, type Attachment, type RecordItem } from './data'
import { businessNames, displayPerson } from './personnel'
import { editable } from './api'
import MarkdownContent from './components/MarkdownContent.vue'
import ImageGallery from './components/ImageGallery.vue'
import RecordEditor from './components/RecordEditor.vue'
import AttachmentUploader from './components/AttachmentUploader.vue'
const props=defineProps<{recordId:string}>()
defineEmits<{back:[]}>()
const record=computed(()=>records.value.find(r=>r.id===props.recordId))
const editor=ref<RecordItem>()
const details=computed(()=>{
  const r=record.value;if(!r)return []
  const config=definitions[r.kind]
  const rows=[[`${config.noun}名称`,r.title],[`${config.noun}类型`,r.category]]
  if(['achievements','research','students'].includes(r.kind)){
    rows.splice(1,0,['成果来源',r.achievementSource||''])
    rows.push(['成果级别',r.level],['成果等级',r.achievementGrade||''],['成果年度',r.year])
  }else if(r.kind==='projects')rows.push(['项目来源',r.source],['开始日期',r.start],['结束日期',r.end])
  else if(r.kind==='materials')rows.push(['资料状态',r.materialStatus],['适用专业',r.major],['版本',r.version])
  else rows.push([r.kind==='daily'?'记录日期':r.kind==='teaching'?'工作日期':'活动日期',r.start])
  if(!hasParticipantOwners(r.kind))rows.push([ownerLabel(r.kind),displayPerson(r.owner)])
  if(r.kind==='students')rows.push(['指导老师',displayPerson(r.advisor||'')])
  if(hasParticipantOwners(r.kind)||hasProjectTeam(r.kind))rows.push([r.kind==='development'||r.kind==='teaching'?'参加人员':r.kind==='daily'?'相关人员':'参与人员',businessNames(participantsOf(r)).join('、')])
  return rows
})
function download(file:Attachment){const a=document.createElement('a');a.href=file.data.startsWith('/api/')?file.data+'?download=1':file.data;a.download=file.name;a.click()}
async function saveImages(images:Attachment[]){return !!record.value && editable(record.value) && await saveRecord({...record.value,images})}
</script>
<template>
  <button class="back-link text-button" @click="$emit('back')">← 返回人员详情</button>
  <template v-if="record"><div class="page-heading detail-heading"><h1>{{ record.title }}</h1><div v-if="editable(record)" class="actions"><AttachmentUploader :entity="record" :save="saveRecord"/><button class="primary" @click="editor=record">编辑{{ definitions[record.kind].noun }}</button></div></div><div class="detail-grid"><div><section class="panel"><h2>基本信息</h2><dl class="detail-fields"><div v-for="[label,value] in details" :key="label"><dt>{{ label }}</dt><dd>{{ value||'未填写' }}</dd></div></dl></section><section class="panel"><h2>正文 / 摘要</h2><MarkdownContent class="summary-text" :value="record.summary||'暂无正文或摘要'" /></section><ImageGallery :images="record.images||[]" :save-images="saveImages" :readonly="!editable(record)" /></div><aside><section class="panel"><header class="panel-heading"><h2>附件资料</h2><span class="muted">{{ record.attachments.length }} 个</span></header><div v-for="(file,index) in record.attachments" :key="index" class="attachment side-file"><div><strong>{{ file.name }}</strong><a class="text-button" :href="file.data" target="_blank" rel="noopener noreferrer">预览</a><button class="text-button" @click="download(file)">下载</button></div></div><p v-if="!record.attachments.length" class="quiet-empty">暂无附件</p></section></aside></div><RecordEditor v-if="editor" :key="editor.id" :record="editor" @close="editor=undefined" /></template>
  <section v-else class="panel empty-state"><h1>关联记录不存在或无权查看</h1></section>
</template>
