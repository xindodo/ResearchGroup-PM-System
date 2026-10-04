<script setup lang="ts">
import MarkdownEditor from './MarkdownEditor.vue'
import UploadProgress from './UploadProgress.vue'
import { useUploadProgress } from '../uploadProgress'
const uploadState = useUploadProgress()
const { progress, filePercent, totalPercent } = uploadState
import { computed, onMounted, reactive, ref } from 'vue'
import { X, Upload, Paperclip, Trash2 } from '@lucide/vue'
import { definitions, majors, people, participantsOf, parseParticipants, hasProjectTeam, hasParticipantOwners, ownerLabel, isCourseMaterial, courseCategories, type RecordItem } from '../data'
import { saveRecord, toast } from '../store'
import { prototype, uploadFile } from '../api'
import OrderedParticipants from './OrderedParticipants.vue'
import { isSystemPerson, businessNames } from '../personnel'

const props = defineProps<{ record: RecordItem }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const form = reactive<RecordItem>(JSON.parse(JSON.stringify(props.record)))
const isAchievement = form.kind === 'achievements' || form.kind === 'research' || form.kind === 'students'
if (isAchievement) { form.achievementSource ??= ''; form.achievementGrade ??= '' }
const supportsParticipants = hasParticipantOwners(form.kind) || hasProjectTeam(form.kind)
const originalParticipants = [...participantsOf(form)]
const orderedParticipants = ref(businessNames(originalParticipants))
const otherParticipants = ref(supportsParticipants ? businessNames(originalParticipants).filter(name => !people.includes(name)).join('，') : '')
if (supportsParticipants) form.participants = participantsOf(form).filter(name => people.includes(name))
const error = ref('')
const loading = ref(false)
const mediaBusy=ref(false)
const course = computed(() => form.kind === 'materials' && isCourseMaterial(form.category))
onMounted(() => dialog.value?.showModal())
async function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  error.value = ''
  const files = Array.from(input.files || [])
  if (!files.length) return
  uploadState.begin(files)
  loading.value = true
  try {
    for (const file of files) {
      uploadState.next(file)
      if (file.size > 500 * 1024 * 1024) throw new Error('附件每个限500MB，请选择较小的文件。')
      form.attachments.push(await uploadFile(file, false, uploadState.update))
    }
    uploadState.finish()
  } catch (e) { uploadState.fail(); error.value = (e as Error).message }
  finally { input.value = ''; loading.value = false }
}
async function submit() {
  if(mediaBusy.value)return
  error.value = ''
  if (!form.title.trim()) { error.value = '请填写名称'; return }
  const participants = hasProjectTeam(form.kind) ? orderedParticipants.value.map(name => name.trim()) : [...new Set([...(form.participants || []), ...parseParticipants(otherParticipants.value)])]
  if (hasProjectTeam(form.kind)) {
    const invalid = participants.findIndex(name => !name || /[、,，;；\n]/.test(name))
    if (invalid >= 0) { error.value = `第${invalid + 1}位参与人员请填写一个姓名，或删除该行。`; return }
    if (new Set(participants).size !== participants.length) { error.value = '参与人员姓名重复，请修改或删除重复行。'; return }
  }
  if (hasParticipantOwners(form.kind) && !participants.length && !originalParticipants.some(isSystemPerson)) { error.value = `请至少选择或填写一位${form.kind === 'daily' ? '相关人员' : '参加人员'}`; return }
  if (participants.some(isSystemPerson)) { error.value = '系统管理员账号不作为业务参与人员，请选择其他人员'; return }
  // Hide existing system-account associations without deleting them when unrelated fields are saved.
  const savedParticipants = [...participants]
  originalParticipants.forEach((name,index)=>{if(isSystemPerson(name))savedParticipants.splice(Math.min(index,savedParticipants.length),0,name)})
  if (form.kind === 'projects' && form.end && form.start && form.end < form.start) { error.value = '结束日期不能早于开始日期'; return }
  if (course.value && form.hours && Number(form.hours) !== Number(form.theory || 0) + Number(form.practice || 0)) { error.value = '总学时应等于理论学时与实践学时之和'; return }
  form.title = form.title.trim()
  loading.value=true
  try { if (await saveRecord(supportsParticipants ? { ...form, participants: savedParticipants } : form)) emit('close'); else error.value=toast.value || '保存失败，请重试' } finally { loading.value=false }
}
</script>

<template>
  <dialog ref="dialog" class="editor" @cancel.self.prevent="emit('close')" @click="($event.target === dialog) && emit('close')">
    <form @submit.prevent="submit">
      <header class="dialog-heading"><div><h2>{{ form.id ? '编辑' : '新增' }}{{ definitions[form.kind].title }}</h2><p>完善记录信息，统一归集教学科研资料</p></div><button type="button" class="icon-button" aria-label="关闭弹窗" @click="emit('close')"><X :size="22" /></button></header>
      <div class="dialog-body">
        <div class="form-grid">
          <label class="span-two">{{ definitions[form.kind].noun }}名称 <em>*</em><input v-model="form.title" required maxlength="150" autofocus placeholder="请输入完整名称"></label>
          <label v-if="isAchievement" class="span-two">成果来源<input v-model.trim="form.achievementSource" maxlength="150" placeholder="例如：教育部、中国公路学会"></label>
          <label>{{ definitions[form.kind].noun }}类型 <em>*</em><select v-model="form.category"><option v-for="cat in definitions[form.kind].categories" :key="cat">{{ cat }}</option></select></label>
          <fieldset v-if="hasParticipantOwners(form.kind)" class="participant-picker span-two"><legend>{{ form.kind === 'daily' ? '相关人员' : '参加人员' }}（可多选） *</legend><label v-for="name in people" :key="name"><input v-model="form.participants" type="checkbox" :value="name">{{ name }}</label></fieldset>
          <label v-else-if="form.kind === 'students'">项目主持（学生） <em>*</em><input v-model.trim="form.owner" required maxlength="100" placeholder="手工填写学生姓名"></label>
          <label v-else-if="form.kind !== 'news'">{{ ownerLabel(form.kind) }} <em>*</em><select v-model="form.owner"><option v-for="name in people" :key="name">{{ name }}</option></select></label>
          <label v-if="form.kind === 'students'">指导老师 <em>*</em><select v-model="form.advisor" required><option value="">请选择指导老师</option><option v-for="name in people" :key="name">{{ name }}</option></select></label>
          <OrderedParticipants v-if="hasProjectTeam(form.kind)" v-model="orderedParticipants"/>
          <label v-if="hasParticipantOwners(form.kind)" class="span-two">其他人员<input v-model="otherParticipants" aria-describedby="other-participants-help" placeholder="例如：张三，李四"><small id="other-participants-help" class="muted">可填写名单外的人员，多个姓名用中文或英文逗号分隔；与勾选人员合并后自动去重。</small></label>
          <template v-if="form.kind === 'materials'">
            <label>资料状态<select v-model="form.materialStatus"><option>现行</option><option>历史版本</option></select></label>
            <label>适用专业 <em>*</em><select v-model="form.major"><option v-for="major in majors" :key="major">{{ major }}</option></select></label>
            <label>版本 <em>*</em><input v-model="form.version" required placeholder="例如：2026版"></label>
            <template v-if="course">
              <div class="span-two form-section">课程信息</div>
              <label>课程名称<input v-model="form.course"></label><label>课程代码<input v-model="form.courseCode"></label>
              <label>课程类别<select v-model="form.courseType"><option v-for="c in courseCategories" :key="c">{{ c }}</option></select></label><label>学分<input v-model="form.credits" type="number" min="0" step="0.5"></label>
              <label>总学时<input v-model="form.hours" type="number" min="0"></label><label>理论学时<input v-model="form.theory" type="number" min="0"></label><label>实践学时<input v-model="form.practice" type="number" min="0"></label>
            </template>
          </template>
          <template v-if="isAchievement"><label class="span-two">成果级别<select v-model="form.level"><option>国家级</option><option>省部级</option><option>校级</option><option>其他</option></select></label><label>成果等级<input v-model.trim="form.achievementGrade" list="achievement-grades" maxlength="100" placeholder="例如：特等奖、一等奖（不适用可留空）"><datalist id="achievement-grades"><option v-for="grade in ['特等奖', '一等奖', '二等奖', '三等奖', '优秀奖']" :key="grade" :value="grade"/></datalist></label><label>成果年度<input v-model="form.year" type="number" min="1900" max="2100" required></label></template>
          <template v-if="form.kind === 'projects'"><label class="span-two">项目来源<input v-model="form.source" placeholder="例如：国家自然科学基金"></label><label>开始日期<input v-model="form.start" type="date" required></label><label>结束日期<input v-model="form.end" type="date" required></label></template>
          <label v-if="form.kind === 'news' || form.kind === 'teaching' || hasParticipantOwners(form.kind)">{{ form.kind === 'news' ? '发布日期' : form.kind === 'daily' ? '记录日期' : form.kind === 'teaching' ? '工作日期' : '活动日期' }}<input v-model="form.start" type="date"></label>
          <MarkdownEditor class="span-two" v-model="form.summary" :label="form.kind === 'news' ? '正文' : '摘要'" @busy="mediaBusy=$event"/>
        </div>
        <h3>附件资料</h3><label class="upload-zone"><Upload :size="22" /><span>{{ loading ? '正在上传附件…' : '选择附件' }}</span><small>每个文件不超过500MB</small><input type="file" multiple :disabled="loading || mediaBusy" @change="addFiles"></label>
        <div v-for="(file, index) in form.attachments" :key="index" class="file-row"><Paperclip :size="17" /><span>{{ file.name }}</span><button type="button" class="icon-button" :aria-label="`移除${file.name}`" @click="form.attachments.splice(index, 1)"><Trash2 :size="17" /></button></div>
    <UploadProgress :state="progress" :file-percent="filePercent" :total-percent="totalPercent"/>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
      </div>
      <footer class="dialog-footer"><span class="muted">{{ prototype ? '仅保存到此浏览器' : '' }}</span><button type="button" @click="emit('close')">取消</button><button class="primary" :disabled="loading">保存{{ definitions[form.kind].noun }}</button></footer>
    </form>
  </dialog>
</template>
