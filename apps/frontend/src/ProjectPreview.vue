<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ChevronDown, ChevronRight,
  Clock3, FolderKanban, Users,
  House, Landmark, Layers3, ListTodo, Menu, Settings,
} from '@lucide/vue'
import ProjectDetailPreview from './ProjectDetailPreview.vue'
import ProjectListPreview from './ProjectListPreview.vue'
import ProjectWorkbenchPreview from './ProjectWorkbenchPreview.vue'
import ProjectWorkbenchTaskList from './ProjectWorkbenchTaskList.vue'
import ProjectMilestonesPreview from './ProjectMilestonesPreview.vue'
import ProjectCollaborationPreview from './ProjectCollaborationPreview.vue'
import ProjectLiveDetail from './ProjectLiveDetail.vue'
import { detailTabs, projectDetail, type DetailGroup } from './project-detail-data'
import type { LiveProject } from './project-api'

type Project = {
  id: string
  title: string
  code: string
  type: string
  unit: string
  owner: string
  phase: string
  progress: number
  due: string
  status: '正常推进' | '需要关注' | '待协调'
  lifecycle: '未开始' | '进行中' | '已暂停' | '已取消' | '已完成'
  tags: string[]
  summary: string
}

const props = defineProps<{ live?: boolean; items?: LiveProject[]; userName?: string; userId?: string; userRole?:string }>()
const examples: Project[] = [
  { id: 'bridge', title: '长江干线桥梁群健康监测与韧性提升', code: 'KY-2026-014', type: '科研课题', unit: '武汉理工大学 · 交工系', owner: '陈明', phase: '现场试验', progress: 68, due: '10月18日', status: '正常推进', lifecycle: '进行中', tags: ['桥梁监测', '重点研发'], summary: '完成现场传感器布设，进入连续观测与模型校准阶段。' },
  { id: 'corridor', title: '东湖高新区智慧交通示范走廊建设', code: 'GC-2026-008', type: '工程建设', unit: '市交通建设中心 · 联合实施', owner: '周岚', phase: '施工实施', progress: 42, due: '10月12日', status: '需要关注', lifecycle: '进行中', tags: ['智慧交通', '示范工程'], summary: '第三方接口联调待确认，影响下一阶段验收准备。' },
  { id: 'network', title: '鄂湘赣区域综合交通协同研究', code: 'ZH-2026-003', type: '跨单位项目', unit: '三省联合工作组', owner: '李睿', phase: '方案评审', progress: 31, due: '10月25日', status: '待协调', lifecycle: '进行中', tags: ['区域协同', '联合研究'], summary: '牵头单位已提交初稿，等待协作单位反馈数据口径。' },
  { id: 'materials', title: '绿色道路材料全寿命周期评价', code: 'KY-2026-021', type: '科研课题', unit: '武汉理工大学 · 材料研究团队', owner: '陈明', phase: '数据采集', progress: 54, due: '11月06日', status: '正常推进', lifecycle: '进行中', tags: ['绿色材料', '寿命评价'], summary: '试验数据归集完成过半，准备中期成果汇报。' },
]

const navigation = [
  { id: 'home', title: '工作台', icon: House },
  { id: 'projects', title: '项目', icon: FolderKanban },
  { id: 'milestones', title: '里程碑', icon: Layers3 },
  { id: 'tasks', title: '任务', icon: ListTodo },
  { id: 'timesheets', title: '工日', icon: Clock3 },
  { id: 'organization', title: '组织', icon: Users },
  { id: 'settings', title: '系统管理', icon: Settings },
] as const

const projects = computed(() => props.live ? props.items || [] : examples)
const tasks = computed(() => projects.value.flatMap(p=>projectDetail(p).tasks.map(t=>({...t,project:p}))))
const taskGroups = computed(() => projects.value.map(project => ({
  project,
  tasks: [...projectDetail(project).tasks].sort((a,b)=>(b.due||'').localeCompare(a.due||'')),
})).sort((a,b)=>(b.project.due||'').localeCompare(a.project.due||'')))
const currentUser = computed(() => props.userName || '陈明')

const active = ref<(typeof navigation)[number]['id']>('home')
const selectedId = ref('bridge')
const detailOpen = ref(false)
const detailGroup = ref<DetailGroup>('project_overview')
const taskView=ref('list')
const personId = ref('')
const personRecordId = ref('')
const mobileOpen = ref(false)
const settingsLogs=ref(false),settingsTypes=ref(false)
watch(()=>props.userRole,role=>{if(role!=='系统管理员'&&active.value==='settings')navigate('home')})
const accountMenu = ref<HTMLDetailsElement>()
function closeAccountMenu(event: MouseEvent) { if(accountMenu.value && !accountMenu.value.contains(event.target as Node)) accountMenu.value.open=false }
function accountMenuKey(event: KeyboardEvent) { if(event.key==='Escape' && accountMenu.value?.open){accountMenu.value.open=false;accountMenu.value.querySelector('summary')?.focus()} }
onMounted(()=>{document.addEventListener('click',closeAccountMenu);document.addEventListener('keydown',accountMenuKey)})
onUnmounted(()=>{document.removeEventListener('click',closeAccountMenu);document.removeEventListener('keydown',accountMenuKey)})
const selected = computed(() => projects.value.find(project => project.id === selectedId.value))
const liveSelected = computed(() => props.items?.find(project => project.id === selectedId.value))
const pageTitle = computed(() => navigation.find(item => item.id === active.value)?.title || '工作台')

function updateAddress() {
  const url = new URL(window.location.href)
  if (detailOpen.value) {
    url.searchParams.set('project', selectedId.value)
    url.searchParams.set('group', detailGroup.value)
    url.searchParams.delete('view')
  } else {
    url.searchParams.delete('project')
    url.searchParams.delete('group')
    if (active.value === 'home') url.searchParams.delete('view')
    else url.searchParams.set('view', active.value)
  }
  if(active.value!=='organization'){url.searchParams.delete('unit');url.searchParams.delete('organizationCategory')}
  if (active.value === 'organization' && !detailOpen.value && personId.value) url.searchParams.set('person',personId.value)
  else url.searchParams.delete('person')
  if (active.value === 'organization' && !detailOpen.value && personRecordId.value) url.searchParams.set('personRecord',personRecordId.value)
  else url.searchParams.delete('personRecord')
  if(active.value==='settings'&&(settingsLogs.value||settingsTypes.value))url.searchParams.set('settings',settingsLogs.value?'logs':'types')
  else url.searchParams.delete('settings')
  window.history.pushState({}, '', url)
}
function restoreAddress() {
  const params = new URL(window.location.href).searchParams
  const project = projects.value.find(item => item.id === params.get('project'))
  const group = detailTabs.find(item => item.id === (params.get('group')==='project_milestones'?'project_tasks':params.get('group')))
  const view = navigation.find(item => item.id === params.get('view'))
  detailOpen.value = !!params.get('project')
  if (!project && detailOpen.value) selectedId.value = params.get('project')!
  if (project) { selectedId.value = project.id; active.value = 'projects' }
  else active.value = (view?.id==='settings'&&props.userRole!=='系统管理员') ? 'home' : view?.id || 'home'
  settingsLogs.value=params.get('settings')==='logs'
  settingsTypes.value=params.get('settings')==='types'
  detailGroup.value = group?.id || 'project_overview'
  personId.value = params.get('person') || ''
  personRecordId.value = params.get('personRecord') || ''
}
onMounted(() => { restoreAddress(); window.addEventListener('popstate', restoreAddress) })
onUnmounted(() => window.removeEventListener('popstate', restoreAddress))

function openOrganization(href:string){window.history.pushState({},'',href);restoreAddress();mobileOpen.value=false;window.scrollTo({top:0})}
function navigate(id: (typeof navigation)[number]['id']) {
  active.value = id
  settingsLogs.value=false
  settingsTypes.value=false
  detailOpen.value = false
  updateAddress()
  mobileOpen.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function openProject(id: string, group: DetailGroup = 'project_overview') {
  selectedId.value = id
  active.value = 'projects'
  detailOpen.value = true
  detailGroup.value = group==='project_milestones'?'project_tasks':group
  mobileOpen.value = false
  updateAddress()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function changeDetailGroup(group: DetailGroup) {
  detailGroup.value = group
  updateAddress()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function openPerson(id:string) { personId.value=id;personRecordId.value='';updateAddress();window.scrollTo({top:0}) }
function openPersonRecord(id:string) { personRecordId.value=id;updateAddress();window.scrollTo({top:0}) }
function backToPerson() { personRecordId.value='';updateAddress();window.scrollTo({top:0}) }
function closeMenu(){if(accountMenu.value)accountMenu.value.open=false}
function openProfile(id:string){active.value='organization';detailOpen.value=false;openPerson(id);mobileOpen.value=false;closeMenu()}
function showSettingsTypes(value:boolean){settingsTypes.value=value;updateAddress()}
function showSettingsLogs(value:boolean){settingsLogs.value=value;updateAddress();window.scrollTo({top:0})}
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div v-if="mobileOpen" class="sidebar-scrim" @click="mobileOpen = false"></div>
  <aside class="sidebar" :class="{ open: mobileOpen }" aria-label="项目管理导航">
    <button class="brand" @click="navigate('home')" aria-label="项目管理系统工作台">
      <svg width="35" height="39" viewBox="0 0 40 44" fill="none" aria-hidden="true"><path d="M3 39 15 5h10l12 34M12 39l6-34m10 34L22 5M8 26h24M13 14h14" stroke="currentColor" stroke-width="2.2"/><path d="M20 11v5m0 5v5m0 6v7" stroke="currentColor" stroke-width="2"/></svg>
      <span><strong>项目管理系统</strong></span>
    </button>
    <nav aria-label="主导航">
      <button v-for="item in navigation.filter(item=>item.id!=='settings')" :key="item.id" :class="{ active: active === item.id }" :aria-current="active === item.id ? 'page' : undefined" @click="navigate(item.id)">
        <component :is="item.icon" :size="19" stroke-width="1.8" /><span>{{ item.title }}</span>
        <span v-if="item.id === 'tasks'" class="nav-count">{{ tasks.length }}</span>
      </button>
    </nav>
    <div class="sidebar-bottom">
      <button v-if="live && userRole==='系统管理员'" class="system-settings-link" :class="{active:active==='settings'}" :aria-current="active==='settings'?'page':undefined" @click="navigate('settings')"><Settings :size="19"/><span>系统管理</span></button>
      <div v-if="!live" class="workspace-switch"><Landmark :size="17" /><span>综合项目办公室</span><ChevronDown :size="15" /></div>
      <details v-if="live" ref="accountMenu" class="account-menu" @keydown.esc="accountMenu && (accountMenu.open=false)"><summary class="profile" aria-label="用户菜单"><span class="avatar">{{ currentUser[0] }}</span><span class="account-identity"><strong>{{ currentUser }}</strong><small>{{ userRole }}</small></span><ChevronRight :size="15" /></summary><div class="account-menu-panel"><strong class="account-menu-name">{{ currentUser }}</strong><slot name="account-actions" :open-profile="openProfile" :close-menu="closeMenu" /></div></details>
      <div v-else class="profile"><span class="avatar">{{ currentUser[0] }}</span><span><strong>{{ currentUser }}</strong><small>项目管理员 · 页面预览</small></span></div>
    </div>
  </aside>

  <div class="workspace">
    <header class="mobile-topbar">
      <button class="mobile-toggle" aria-label="打开导航" :aria-expanded="mobileOpen" @click="mobileOpen = true"><Menu :size="21" /></button>
      <strong>项目管理系统</strong>
    </header>
    <main id="main-content" :class="{'task-full-width':active==='tasks'&&!detailOpen}">
      <slot name="controls" :project="detailOpen ? liveSelected : undefined" :group="detailGroup" :view="detailOpen ? 'project-detail' : active" />
      <section v-if="detailOpen && !selected" class="panel"><p>项目不存在或无权查看。</p><button class="text-link" @click="navigate('projects')">返回项目台账</button></section>
      <ProjectLiveDetail v-else-if="detailOpen && live && liveSelected" :project="liveSelected" :group="detailGroup" @back="navigate('projects')" @change-group="changeDetailGroup" @open-organization="openOrganization"><template #timesheets><slot name="timesheets" :project-id="liveSelected.id" /></template><template #milestones><slot name="milestones" :project-id="liveSelected.id" :open-project="(id:string)=>openProject(id,'project_milestones')" /></template><template #project-actions><slot name="project-detail-actions" :project="liveSelected" /></template><template #task-toolbar><slot name="project-task-toolbar" :project="liveSelected" /></template><template #task-actions="{ task }"><slot name="task-actions" :task="task" :project="liveSelected" /></template></ProjectLiveDetail>
      <ProjectDetailPreview v-else-if="detailOpen && selected" :project="selected" :group="detailGroup" @back="navigate('projects')" @change-group="changeDetailGroup" />
      <ProjectWorkbenchPreview v-else-if="active === 'home'" :projects="projects" :current-user="currentUser" :live="live" :current-user-id="userId" @open-project="id => openProject(id, 'project_tasks')" />

      <ProjectListPreview v-else-if="active === 'projects'" :projects="projects" :live="live" :user-id="userId" @open-project="openProject"><template #actions><slot name="project-list-actions" /></template></ProjectListPreview>
      <template v-else-if="live && active==='settings' && userRole==='系统管理员'"><slot name="settings" :logs="settingsLogs" :project-types="settingsTypes" :select-types="showSettingsTypes" :open-logs="()=>showSettingsLogs(true)" :back="()=>showSettingsLogs(false)" /></template>

      <template v-else-if="live && active==='timesheets'"><slot name="timesheets" :project-id="String()" /></template>
      <template v-else-if="live && active==='milestones'"><slot name="milestones" :project-id="String()" :open-project="(id:string)=>openProject(id,'project_milestones')" /></template>
      <ProjectMilestonesPreview v-else-if="active === 'milestones'" :projects="projects" @open-project="id => openProject(id, 'project_milestones')" />

      <template v-else-if="live && active==='organization'"><slot name="organization" :person-id="personId" :record-id="personRecordId" :open-person="openPerson" :open-record="openPersonRecord" :back-to-person="backToPerson" :open-project="(id:string)=>openProject(id,'project_overview')"><ProjectCollaborationPreview :projects="projects" mode="organization" live @open-project="id => openProject(id,'project_overview')" /></slot></template>
      <ProjectCollaborationPreview v-else-if="active === 'timesheets' || active === 'organization'" :key="active" :projects="projects" :mode="active" :live="live" @open-project="id => openProject(id, active === 'timesheets' ? 'project_timesheets' : 'project_overview')" />

      <div v-else class="global-task-page task-workbench">
        <div class="page-heading"><div><h1>{{ pageTitle }}</h1></div></div>
        <div v-if="live" class="task-view-tabs"><button :class="{selected:taskView==='list'}" @click="taskView='list'">任务列表</button><button :class="{selected:taskView==='load'}" @click="taskView='load'">人员饱和度</button></div>
        <slot v-if="live&&taskView==='load'" name="task-load" :open-project="(id:string)=>openProject(id,'project_tasks')" />
        <section v-else class="panel">
          <div class="panel-head"><h2>项目任务</h2><span class="muted">{{ tasks.length }} 项</span></div>
          <ProjectWorkbenchTaskList :groups="taskGroups" label="项目任务列表" empty="暂无项目任务" @open-project="id=>openProject(id,'project_tasks')" />
        </section>
      </div>
      <footer class="preview-footer"><span class="status-dot"></span>{{ live ? '项目管理系统' : '项目管理系统版面预览 · 页面数据仅作展示' }}</footer>
    </main>
  </div>
</template>

<style scoped>.account-menu{position:relative}.account-menu .profile{padding:10px 6px 0}.account-menu .avatar{width:48px;height:48px;font-size:18px}.account-menu .profile strong{font-size:16px}.account-identity{flex:1;min-width:0}.account-menu-name{display:block;padding:10px 10px 3px;font-size:15px}.account-menu summary{list-style:none;cursor:pointer;border-radius:6px}.account-menu summary::-webkit-details-marker{display:none}.account-menu summary:hover{background:var(--accent-soft)}.account-menu summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.account-menu-panel{position:absolute;bottom:calc(100% + 8px);left:0;right:0;background:white;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px #29252218;padding:5px;z-index:20}.account-menu-panel :deep(button){display:block;width:100%;padding:8px 10px;text-align:left;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit}.account-menu-panel :deep(button:hover){background:var(--accent-soft)}</style>

<style scoped>.system-settings-link{display:flex;align-items:center;gap:10px;width:100%;padding:8px 7px;margin-bottom:8px;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;text-align:left}.system-settings-link:hover,.system-settings-link.active{background:var(--accent-soft);color:var(--accent)}</style>

<style scoped>
.task-view-tabs{display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:12px}.task-view-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:6px 10px;color:var(--muted);font:inherit}.task-view-tabs button.selected{border-bottom-color:var(--accent);color:var(--accent)}.global-task-page{min-width:0}
.task-full-width{max-width:none;width:100%}
.global-task-page .panel{min-width:0;width:100%}
.global-task-page .page-heading{margin-bottom:0}
.global-task-page .panel-head h2{color:var(--accent)}
.global-task-table{min-width:0;width:100%}.global-task-table th,.global-task-table td{padding:5px 11px}
.global-task-table th:first-child{width:20%}
.global-task-table th:nth-child(3){width:90px}.global-task-table th:nth-child(4){width:100px}
.global-task-table th:nth-child(6){width:135px}
.global-task-table th:last-child{width:90px}
@media(max-width:720px){.global-task-table{min-width:900px}}
</style>
