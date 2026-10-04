<script setup lang="ts">
import { downloadExcel } from './excel'
import { computed, ref, watch, onMounted } from 'vue'
import { api, account } from './api'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, RotateCcw, Search, SlidersHorizontal } from '@lucide/vue'
import { projectDetail, type ProjectCore } from './project-detail-data'
import { projectOptions } from './project-options'

type Lifecycle = '未开始' | '进行中' | '已暂停' | '已取消' | '已完成'
type Project = ProjectCore & {
  type: string
  status: '正常推进' | '需要关注' | '待协调'
  lifecycle: Lifecycle
  tags: string[]
}

const props = defineProps<{ projects: Project[]; live?: boolean; userId?: string }>()
const emit = defineEmits<{ openProject: [id: string] }>()
const statusTabs: Lifecycle[] = ['未开始', '进行中', '已暂停', '已取消', '已完成']
const categories = computed(()=>['全部项目',...new Set([...(props.live?projectOptions.value.filter(o=>o.scope==='types').map(o=>o.name):['科研课题','工程建设','跨单位项目']),...props.projects.map(p=>p.type)])])
const category = ref('全部项目')
watch(categories,value=>{if(!value.includes(category.value))category.value='全部项目'})
const statusFilter = ref<Lifecycle | '全部'>('全部')
const query = ref('')
const ownerFilter = ref('')
const healthFilter = ref('')
const filtersOpen = ref(false)
const dueOrder = ref<'none' | 'asc' | 'desc'>('none')
const pageSize = ref(25)
const currentPage = ref(1)
const orderOpen = ref(false)
const unitOrder = ref<string[]>([])
const draftOrder = ref<string[]>([])
const orderError = ref('')
const orderBusy = ref(false)
const orderRevision = ref(0)
const orderUnits = ref<{id:string;name:string}[]>([])
const canSortUnits = computed(() => !props.live || account.value?.role === '系统管理员')
async function loadUnitOrder(){if(!props.live)return;const value=await api<{revision:number;units:{id:string;name:string}[]}>('/pm/unit-order');orderRevision.value=value.revision;orderUnits.value=value.units;unitOrder.value=value.units.map(unit=>unit.name)}
onMounted(async()=>{try{await loadUnitOrder()}catch(e){orderError.value=(e as Error).message}})
const unitNames = computed(() => [...new Set(props.projects.map(project => project.unit.trim()).filter(Boolean))].sort((a,b)=>{
  const ai=unitOrder.value.indexOf(a),bi=unitOrder.value.indexOf(b)
  return (ai<0?Infinity:ai)-(bi<0?Infinity:bi) || a.localeCompare(b,'zh-CN')
}))
async function editUnitOrder(){orderError.value='';orderBusy.value=true;try{await loadUnitOrder();draftOrder.value=props.live?orderUnits.value.map(unit=>unit.name):[...unitNames.value];orderOpen.value=true}catch(e){orderError.value=(e as Error).message}finally{orderBusy.value=false}}
function moveUnit(index:number,direction:number){const target=index+direction;if(target<0||target>=draftOrder.value.length)return;const next=[...draftOrder.value];[next[index],next[target]]=[next[target]!,next[index]!];draftOrder.value=next}
async function saveUnitOrder(){orderBusy.value=true;orderError.value='';try{if(props.live){await api('/pm/unit-order','PUT',{revision:orderRevision.value,ids:draftOrder.value.map(name=>orderUnits.value.find(unit=>unit.name===name)!.id)});await loadUnitOrder()}else{unitOrder.value=[...draftOrder.value]}currentPage.value=1;orderOpen.value=false}catch(e){orderError.value=(e as Error).message}finally{orderBusy.value=false}}

const rows = computed(() => props.projects.map(project => ({ project, detail: projectDetail(project) })))
const owners = computed(() => [...new Set(props.projects.map(project => project.owner))])
const filtered = computed(() => rows.value.filter(({ project, detail }) => {
  const needle = query.value.trim().toLocaleLowerCase()
  return (category.value === '全部项目' || project.type === category.value) &&
    (statusFilter.value === '全部' || project.lifecycle === statusFilter.value) &&
    (!ownerFilter.value || project.owner === ownerFilter.value) &&
    (!healthFilter.value || project.status === healthFilter.value) &&
    (!needle || `${project.title} ${project.code} ${project.unit} ${project.owner} ${detail.sponsor} ${project.tags.join(' ')}`.toLocaleLowerCase().includes(needle))
}))
const unitName=(project:Project)=>project.unit.trim()
const sorted = computed(() => [...filtered.value].sort((a,b)=>{
  const left=unitName(a.project),right=unitName(b.project)
  if(left!==right)return !left?1:!right?-1:unitNames.value.indexOf(left)-unitNames.value.indexOf(right)
  return dueOrder.value==='none'?0:dueOrder.value==='asc'?a.detail.end.localeCompare(b.detail.end):b.detail.end.localeCompare(a.detail.end)
}))
const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)))
const visible = computed(() => sorted.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const groups=computed(()=>{
 const result:{unit:string;count:number;rows:{project:Project;detail:ReturnType<typeof projectDetail>;index:number}[]}[]=[]
 visible.value.forEach((row,index)=>{const unit=unitName(row.project);let group=result.at(-1);if(!group||group.unit!==unit){group={unit,count:sorted.value.filter(row=>unitName(row.project)===unit).length,rows:[]};result.push(group)}group.rows.push({...row,index})})
 return result
})
const rangeStart = computed(() => sorted.value.length ? (currentPage.value - 1) * pageSize.value + 1 : 0)
const rangeEnd = computed(() => Math.min(currentPage.value * pageSize.value, sorted.value.length))
const activeExtraFilters = computed(() => Number(!!ownerFilter.value) + Number(!!healthFilter.value))
watch([category, statusFilter, query, ownerFilter, healthFilter, pageSize], () => { currentPage.value = 1 })
watch(totalPages,total=>{if(currentPage.value>total)currentPage.value=total})

function toggleStatus(status: Lifecycle) {
  statusFilter.value = statusFilter.value === status ? '全部' : status
}
function toggleDueOrder() {
  dueOrder.value = dueOrder.value === 'asc' ? 'desc' : 'asc'
}
function clearFilters() {
  category.value = '全部项目'
  statusFilter.value = '全部'
  query.value = ''
  ownerFilter.value = ''
  healthFilter.value = ''
  dueOrder.value = 'none'
  currentPage.value = 1
}
async function exportRows() {
  const values = [['编号', '项目名称', '项目类型', '牵头单位', '项目负责人', '标签', '开始日期', '截止日期', '成员', '状态'], ...sorted.value.map(({ project, detail }) => [project.code, project.title, project.type, project.unit, project.owner, project.tags.join('、'), detail.start, detail.end, detail.team.join('、'), project.lifecycle])]
  await downloadExcel(props.live ? '项目台账-筛选结果.xlsx' : '项目台账-预览.xlsx',values,'项目台账')
}
</script>

<template>
  <div class="project-list-page">
    <div class="project-list-controls">
      <div class="project-status-tabs" aria-label="项目状态筛选">
        <button v-for="status in statusTabs" :key="status" :class="['status-tab', { selected: statusFilter === status }, `status-${status}`]" :aria-pressed="statusFilter === status" @click="toggleStatus(status)"><strong>{{ projects.filter(project => project.lifecycle === status).length }}</strong>{{ status }}</button>
      </div>
      <button class="filter-button" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen"><SlidersHorizontal :size="17" />筛选<span v-if="activeExtraFilters" class="filter-count">{{ activeExtraFilters }}</span></button>
    </div>

    <div class="project-category-tabs" role="tablist" aria-label="项目分类">
      <button v-for="item in categories" :key="item" role="tab" :aria-selected="category === item" :class="{ selected: category === item }" @click="category = item">{{ item }}<span>{{ item === '全部项目' ? projects.length : projects.filter(project => project.type === item).length }}</span></button>
    </div>

    <section class="project-table-panel" aria-label="项目列表">
      <div class="project-table-toolbar">
        <div class="table-tools"><slot name="actions" /><button v-if="canSortUnits" :disabled="orderBusy" @click="editUnitOrder">课题组排序</button><label class="page-size-label">每页<select v-model.number="pageSize" aria-label="每页显示条数"><option :value="10">10 条</option><option :value="25">25 条</option><option :value="50">50 条</option></select></label><button @click="exportRows" :disabled="!sorted.length"><Download :size="16" />导出</button><button class="reset-button" aria-label="清空项目筛选" title="清空筛选" @click="clearFilters"><RotateCcw :size="16" /></button></div>
        <label class="project-search"><Search :size="18" /><input v-model="query" type="search" placeholder="搜索项目、编号或单位" aria-label="搜索项目" /></label>
      </div>
      <p v-if="orderError&&!orderOpen" role="alert" class="error">{{ orderError }}</p>
      <section v-if="orderOpen" class="unit-order-settings" aria-label="课题组排序设置">
        <div class="unit-order-heading"><h2>课题组排序</h2><span>系统管理员设置的顺序适用于所有账号</span></div>
        <ol><li v-for="(unit,index) in draftOrder" :key="unit"><span>{{ unit }}</span><button :disabled="orderBusy||index===0" :aria-label="`上移 ${unit}`" @click="moveUnit(index,-1)">上移</button><button :disabled="orderBusy||index===draftOrder.length-1" :aria-label="`下移 ${unit}`" @click="moveUnit(index,1)">下移</button></li></ol>
        <p v-if="!draftOrder.length">暂无已设置牵头单位的项目</p><p v-if="orderError" role="alert" class="error">{{ orderError }}</p>
        <div class="unit-order-actions"><button :disabled="orderBusy" @click="draftOrder=[...draftOrder].sort((a,b)=>a.localeCompare(b,'zh-CN'))">按名称排序</button><button :disabled="orderBusy" @click="orderOpen=false">取消</button><button class="primary" :disabled="orderBusy" @click="saveUnitOrder">保存排序</button></div>
      </section>
      <div v-if="filtersOpen" class="project-extra-filters"><label>项目负责人<select v-model="ownerFilter" aria-label="按项目负责人筛选"><option value="">全部项目负责人</option><option v-for="name in owners" :key="name">{{ name }}</option></select></label><label>健康状态<select v-model="healthFilter" aria-label="按健康状态筛选"><option value="">全部状态</option><option value="正常推进">正常推进</option><option value="需要关注">需要关注</option><option value="待协调">待协调</option></select></label><button @click="clearFilters">清空筛选</button></div>
      <p class="table-scroll-hint">左右滑动查看完整项目表</p>
      <div class="project-table-scroll"><table class="project-list-table"><thead><tr><th scope="col">#</th><th scope="col">项目名称</th><th scope="col">项目类型</th><th scope="col">牵头单位</th><th scope="col">项目负责人</th><th scope="col">标签</th><th scope="col">开始日期</th><th scope="col"><button class="sort-due" :aria-label="`按截止日期排序，当前${dueOrder === 'none' ? '未排序' : dueOrder === 'asc' ? '升序' : '降序'}`" @click="toggleDueOrder">截止日期<ArrowUp v-if="dueOrder === 'asc'" :size="14" /><ArrowDown v-else-if="dueOrder === 'desc'" :size="14" /><span v-else>↕</span></button></th><th scope="col">成员</th><th scope="col">状态</th></tr></thead><tbody v-for="group in groups" :key="group.unit"><tr class="project-unit-heading"><th colspan="10" scope="rowgroup">{{ group.unit || '未设置牵头单位' }}<span>{{ group.count }} 个项目</span></th></tr><tr v-for="({ project, detail, index }) in group.rows" :key="project.id" class="project-data-row"><td>{{ (currentPage - 1) * pageSize + index + 1 }}</td><td><button class="table-project-link" @click="emit('openProject', project.id)">{{ project.title }}</button></td><td>{{ project.type }}</td><td>{{ project.unit || '—' }}</td><td>{{ project.owner || '—' }}</td><td><div class="table-tags"><span v-for="tag in project.tags" :key="tag">{{ tag }}</span></div></td><td>{{ detail.start }}</td><td>{{ detail.end }}</td><td><div class="member-avatars" :aria-label="`成员：${detail.team.join('、')}`"><span v-for="person in detail.team.slice(0, 3)" :key="person" :title="person">{{ person.slice(0, 1) }}</span></div></td><td><span class="lifecycle-badge">{{ project.lifecycle }}</span></td></tr></tbody></table><div v-if="!visible.length" class="project-table-empty">没有符合条件的项目。<button @click="clearFilters">清空筛选</button></div></div>
      <div class="project-table-footer"><span>显示 {{ rangeStart }} 到 {{ rangeEnd }} 条，共 {{ sorted.length }} 条记录</span><div class="table-pagination"><button :disabled="currentPage <= 1" @click="currentPage--"><ChevronLeft :size="16" />上一页</button><span class="current-page">{{ currentPage }}</span><button :disabled="currentPage >= totalPages" @click="currentPage++">下一页<ChevronRight :size="16" /></button></div></div>
    </section>
  </div>
</template>
<style scoped>
.unit-order-settings{padding:12px 16px;border-bottom:1px solid var(--line);font-size:14px}.unit-order-heading{display:flex;align-items:center;gap:16px}.unit-order-heading h2{font-size:16px;color:var(--accent);margin:0}.unit-order-heading span{color:var(--muted)}.unit-order-settings ol{padding-left:24px;margin:10px 0;max-width:650px}.unit-order-settings li{padding:4px 0}.unit-order-settings li>span{display:inline-block;width:calc(100% - 150px);vertical-align:middle}.unit-order-settings button{font:inherit;padding:4px 9px;margin-right:6px;border:1px solid var(--line);border-radius:5px;background:white}.unit-order-settings button:disabled{opacity:.4}.unit-order-settings button.primary{background:var(--accent);color:white}.unit-order-actions{display:flex;gap:6px}

.project-list-table .project-unit-heading th{padding:6px 12px;text-align:left;background:#f4eee7;color:var(--accent);font-weight:600;font-size:14px;line-height:1.5;border-bottom:1px solid var(--line)}.project-unit-heading span{margin-left:10px;color:var(--muted);font-weight:400;font-size:12px}
</style>
