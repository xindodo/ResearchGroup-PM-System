<script setup lang="ts">
import MarkdownEditor from './MarkdownEditor.vue'
import MarkdownContent from './MarkdownContent.vue'
import UploadProgress from './UploadProgress.vue'
import { useUploadProgress } from '../uploadProgress'
const uploadState = useUploadProgress()
const { progress, filePercent, totalPercent } = uploadState
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowLeft, Pencil, X, FileText, Upload, Trash2 } from '@lucide/vue'
import { personnel, savePerson, type PersonProfile } from '../personnel'
import { toast } from '../store'
import { memberTypes, type Attachment } from '../data'
import type { LiveProject } from '../project-api'
import PersonParticipation from './PersonParticipation.vue'
import { prototype, account, uploadFile } from '../api'
import AttachmentUploader from './AttachmentUploader.vue'
const directUploader=ref<{open:()=>void}>()
import ImageGallery from './ImageGallery.vue'

const props = defineProps<{ name: string; role: string; personId?: string; standalone?: boolean; projects?: LiveProject[] }>()
const emit = defineEmits<{ back: []; 'open-record': [record: import('../data').RecordItem]; 'open-project': [id:string] }>()
const person = computed(() => personnel.value.find(p => props.personId ? p.id === props.personId : p.name === props.name))
const canEdit = computed(() => props.role !== '只读访客' && (['系统管理员'].includes(props.role) || (!prototype && person.value?.id === account.value?.id)))
const tabs = ['basic','projects','tasks','hours'] as const
const tabLabels={basic:'基本信息',projects:'项目参与',tasks:'任务参与',hours:'工日'}
const activeSection = ref<typeof tabs[number]>('basic')
const linkedUserId=computed(()=>person.value?.organizationPerson?'':person.value?.userId||person.value?.id||'')
function tabKey(event: KeyboardEvent, index: number) {
  const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
  if (next < 0) return
  event.preventDefault(); activeSection.value = tabs[next]!
  document.getElementById(`person-tab-${activeSection.value}`)?.focus()
}
const fields = [
  { key: 'position', label: '职务' }, { key: 'title', label: '职称' },
  { key: 'employmentDate', label: '入职时间', type: 'date' },
  { key: 'phone', label: '手机号', type: 'tel' }, { key: 'email', label: '工作邮箱', type: 'email' },
  { key: 'employeeId', label: '工号/学号' }, { key: 'orcid', label: 'ORCID号' },
  { key: 'direction', label: '研究方向' }, { key: 'office', label: '办公地点' },
  { key: 'homepage', label: '个人学术主页', type: 'url' },
] as const
const basic = computed(() => person.value ? [['姓名', person.value.name], ['成员类型', person.value.type], ...fields.map(f => [f.label, person.value![f.key]])] : [])
const draft = ref<PersonProfile | null>(null), dialog = ref<HTMLDialogElement>(), error = ref(''), busy = ref(false)
async function edit() {
  if (!canEdit.value || !person.value) return
  uploadState.begin([])
  draft.value = JSON.parse(JSON.stringify(person.value)); error.value = ''
  await nextTick(); dialog.value?.showModal()
}
function close() { dialog.value?.close(); draft.value = null }
watch(() => props.role, () => { if (!canEdit.value) close() })
const mediaBusy=ref(false)
async function save() {
  if(mediaBusy.value)return
  if (!canEdit.value || !draft.value) return
  error.value = ''
  const orcid = (draft.value.orcid || '').trim().toUpperCase()
  if (orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) { error.value = 'ORCID号格式应为0000-0000-0000-000X（末位可为数字或X）。'; return }
  draft.value.orcid = orcid
  busy.value=true
  try { if (await savePerson(draft.value)) close(); else error.value=toast.value || '保存失败，请重试' } finally { busy.value=false }
}
async function uploadAttachments(event: Event) {
  const input = event.target as HTMLInputElement
  const current = draft.value
  if (!canEdit.value || !current) return
  error.value = ''; busy.value = true
  try {
    const files = Array.from(input.files || [])
    if (!files.length) return
    uploadState.begin(files)
    const additions: Attachment[] = []
    for (const file of files) {
      uploadState.next(file)
      if (file.size > 500 * 1024 * 1024) throw new Error('每个附件不超过500MB。')
      additions.push(await uploadFile(file, false, uploadState.update))
    }
    current.attachments.push(...additions)
    uploadState.finish()
  } catch (e) { uploadState.fail(); error.value = (e as Error).message }
  finally { busy.value = false; input.value = '' }
}
function saveImages(images: Attachment[]) { return !!person.value && canEdit.value && savePerson({ ...person.value, images }) }
function download(file: Attachment) { const a = document.createElement('a'); a.href = file.data.startsWith('/api/') ? file.data+'?download=1' : file.data; a.download = file.name; a.click() }
function preview(file: Attachment) {
  if(file.data.startsWith('/api/')){window.open(file.data,'_blank','noopener,noreferrer');return}
  if (!(file.type.startsWith('image/') || file.type === 'application/pdf' || file.type.startsWith('text/'))) { download(file); return }
  const bytes = Uint8Array.from(atob(file.data.split(',')[1]), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: file.type }))
  window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60000)
}
</script>

<template>
  <button v-if="standalone" class="back-link text-button" @click="emit('back')"><ArrowLeft :size="16"/>返回人员信息</button><RouterLink v-else to="/members" class="back-link"><ArrowLeft :size="16"/>返回人员信息</RouterLink>
  <template v-if="person">
    <div class="page-heading detail-heading"><h1>{{ person.name }}</h1><div v-if="canEdit" class="actions"><AttachmentUploader :key="person.id || person.name" ref="directUploader" :entity="person" :save="savePerson"/><button class="primary" @click="edit"><Pencil :size="18"/>编辑人员信息</button></div></div>
      <div class="category-tabs" role="tablist" aria-label="人员关联内容"><button v-for="(section, index) in tabs" :id="`person-tab-${section}`" :key="section" role="tab" :aria-selected="activeSection === section" :aria-controls="`person-panel-${section}`" :tabindex="activeSection === section ? 0 : -1" :class="{ selected: activeSection === section }" @click="activeSection = section" @keydown="tabKey($event, index)">{{ tabLabels[section] }}</button></div>
    <div v-if="activeSection === 'basic'" id="person-panel-basic" role="tabpanel" aria-labelledby="person-tab-basic" tabindex="0" class="detail-grid">
      <div>
        <section class="panel" aria-label="人员基本信息"><h2>基本信息</h2><dl class="detail-fields person-basic-fields"><div v-for="[label, value] in basic" :key="label"><dt>{{ label }}</dt><dd>{{ value || '未填写' }}</dd></div></dl></section>
        <section class="panel"><h2>个人简介</h2><MarkdownContent class="summary-text" :value="person.summary || '暂无个人简介'"/></section>
        <ImageGallery :images="person.images" :save-images="saveImages" :readonly="!canEdit"/>
      </div>
      <aside class="detail-side"><section class="panel"><header class="panel-heading"><h2>附件资料</h2><span class="muted">{{ person.attachments.length }} 个</span></header><div v-if="!person.attachments.length" class="quiet-empty"><FileText :size="30"/><p>暂无附件</p><button v-if="canEdit" @click="directUploader?.open()">添加附件</button></div><div v-for="(file, i) in person.attachments" :key="i" class="attachment side-file"><FileText :size="24"/><div><strong>{{ file.name }}</strong><button class="text-button" @click="preview(file)">预览</button><button class="text-button" @click="download(file)">下载</button></div></div></section></aside>
    </div>
    <section v-else :id="`person-panel-${activeSection}`" role="tabpanel" :aria-labelledby="`person-tab-${activeSection}`" tabindex="0" class="panel list-panel">
      <PersonParticipation :projects="projects||[]" :user-id="linkedUserId" :section="activeSection" @open-project="id=>emit('open-project',id)" />
    </section>
  </template>
  <section v-else class="panel empty-state"><h1>未找到该成员</h1></section>
  <dialog v-if="draft" ref="dialog" class="editor" aria-label="编辑人员信息" @cancel.self.prevent="close">
    <form @submit.prevent="save"><header class="dialog-heading"><h2>编辑人员信息 · {{ draft.name }}</h2><button type="button" class="icon-button" aria-label="关闭人员编辑" @click="close"><X :size="22"/></button></header>
      <div class="dialog-body"><div class="form-grid"><label v-for="field in fields" :key="field.key">{{ field.label }}<input v-model.trim="draft[field.key]" :type="'type' in field ? field.type : 'text'" :maxlength="field.key === 'homepage' ? 500 : 150"></label><MarkdownEditor class="span-two" v-model="draft.summary" label="个人简介" :maxlength="10000" @busy="mediaBusy=$event"/></div>
        <label v-if="!prototype">成员类型<select v-model="draft.type"><option v-for="type in memberTypes" :key="type">{{ type }}</option></select></label>
        <h3>附件资料</h3><label class="upload-zone"><Upload :size="22"/><span>选择附件</span><small>数量不限，每个不超过500MB</small><input aria-label="上传人员附件" type="file" multiple :disabled="busy || mediaBusy" @change="uploadAttachments"></label>
        <div v-for="(file, i) in draft.attachments" :key="i" class="file-row"><span>{{ file.name }}</span><button type="button" class="icon-button" :aria-label="`移除附件${file.name}`" @click="draft.attachments.splice(i, 1)"><Trash2 :size="17"/></button></div>
    <UploadProgress :state="progress" :file-percent="filePercent" :total-percent="totalPercent"/>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div><footer class="dialog-footer"><small>仅填写适合向本系老师展示的信息</small><button type="button" @click="close">取消</button><button class="primary" :disabled="busy">保存人员信息</button></footer>
    </form>
  </dialog>
</template>
<style scoped>
.person-basic-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:19px}
.person-basic-fields>div{grid-template-columns:84px minmax(0,1fr);gap:10px;min-width:0}
@media(max-width:700px){.person-basic-fields{grid-template-columns:minmax(0,1fr)}}
</style>
