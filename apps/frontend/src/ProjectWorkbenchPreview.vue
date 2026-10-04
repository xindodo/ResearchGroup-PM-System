<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import ProjectWorkbenchTaskList from './ProjectWorkbenchTaskList.vue'
import ProjectDashboardAgenda from './ProjectDashboardAgenda.vue'
import ProjectTaskCheckbox from './ProjectTaskCheckbox.vue'
import { todoPeriods } from './workbench-todos'
import { projectDetail, type ProjectCore } from './project-detail-data'

const props = defineProps<{ projects: ProjectCore[]; currentUser: string; currentUserId?: string; live?: boolean }>()
const emit = defineEmits<{ 'open-project': [id: string] }>()
const personalFilter = ref('全部')
const groups = computed(() => props.projects.map(project => ({ project, tasks: [...projectDetail(project).tasks].sort((a,b)=>(b.due||'').localeCompare(a.due||'')) })).sort((a,b)=>(b.project.due||'').localeCompare(a.project.due||'')))
const personalTasks = computed(() => groups.value.flatMap(group => group.tasks.filter(task => props.live ? task.assigneeId === props.currentUserId : task.owner === props.currentUser).map(task => ({ ...task, project: group.project }))))
const managed = computed(() => groups.value.filter(group => props.live ? (group.project.ownerId === props.currentUserId || group.project.studentOwnerId === props.currentUserId) : group.project.owner === props.currentUser))
const visiblePersonalTasks = computed(() => personalTasks.value.filter(task => personalFilter.value === '全部' || (personalFilter.value === '未完成' ? task.state !== '已完成' : task.state === '已完成')).sort((a,b)=>(b.due||'').localeCompare(a.due||'')))
const personalGroups = computed(() => groups.value.map(group => ({project:group.project,tasks:visiblePersonalTasks.value.filter(task=>task.project.id===group.project.id)})).filter(group=>group.tasks.length))
const now = ref(new Date())
let dateTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { dateTimer = setInterval(() => { now.value = new Date() }, 60000) })
onUnmounted(() => clearInterval(dateTimer))
const today = computed(() => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now.value))
const dateHeading = computed(() => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(now.value))
const todoSections = computed(() => todoPeriods(personalTasks.value, today.value))
const overdueDays = (due: string) => Math.max(0, Math.round((Date.parse(today.value) - Date.parse(due)) / 86400000))
</script>

<template>
  <div class="task-workbench">
    <div class="wb-date-heading"><time :datetime="today">{{ dateHeading }}</time></div>

    <div class="wb-todos" aria-label="我的待办任务">
      <section v-for="section in todoSections" :key="section.title" class="panel wb-todo" :aria-label="section.title">
        <div class="wb-todo-heading"><h2>{{ section.title }}</h2><span>{{ section.tasks.length }} 项</span></div>
        <ul v-if="section.tasks.length" class="wb-todo-list">
          <li v-for="task in section.tasks" :key="task.id" :class="{'wb-overdue-row':overdueDays(task.due)>0}">
            <ProjectTaskCheckbox :task-id="task.id" :title="task.title" :state="task.state" />
            <div class="wb-todo-name"><button class="text-link wb-todo-task" :title="task.title" @click="emit('open-project',task.project.id)">{{ task.title }}</button></div>
            <span v-if="overdueDays(task.due)>0" class="wb-overdue-badge">逾期{{ overdueDays(task.due) }}天</span>
            <time :class="{'wb-todo-overdue':overdueDays(task.due)>0}">{{ task.due }}</time>
          </li>
        </ul>
        <p v-else class="wb-todo-empty">暂无{{ section.title }}</p>
      </section>
    </div>

    <section class="panel wb-personal" aria-labelledby="my-tasks-title">
      <div class="panel-head wb-section-head"><div><h2 id="my-tasks-title">我的任务进展</h2></div><div class="wb-filters" aria-label="我的任务状态"><button v-for="filter in ['全部', '未完成', '已完成']" :key="filter" :aria-pressed="personalFilter === filter" :class="{ selected: personalFilter === filter }" @click="personalFilter = filter">{{ filter }}</button></div></div>
      <ProjectWorkbenchTaskList :groups="personalGroups" label="我的任务列表" :empty="`当前没有${personalFilter==='全部'?'':personalFilter}任务`" @open-project="id=>emit('open-project',id)" />
    </section>

    <section class="wb-managed" aria-labelledby="managed-tasks-title">
      <div class="wb-managed-heading"><div><h2 id="managed-tasks-title">我负责项目的全部任务进展</h2></div></div>
      <div class="panel wb-managed-list"><ProjectWorkbenchTaskList :groups="managed" label="负责项目任务列表" empty="当前没有由您负责的项目" @open-project="id=>emit('open-project',id)" /></div>
    </section>
    <ProjectDashboardAgenda :projects="projects" :current-user="currentUser" :live="live" :current-user-id="currentUserId" @open-project="id => emit('open-project',id)" />
  </div>
</template>
<style scoped>
.wb-todos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px;font-size:14px}.wb-todo{min-width:0;padding:12px 16px}.wb-todo-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.wb-todo-heading h2{font-size:16px;color:var(--accent);margin:0}.wb-todo-heading>span,.wb-todo-empty{color:var(--muted)}.wb-todo-list{list-style:none;padding:0;margin:0;max-height:240px;overflow:auto}.wb-todo-list li{display:flex;align-items:center;gap:8px;padding:5px 0 5px 6px;border-top:1px solid var(--line);border-left:3px solid transparent}.wb-todo-name{flex:1;min-width:0}.wb-todo-name button{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font-weight:400;font-size:14px}.wb-todo-task{color:var(--project-blue)}.wb-todo-list time{white-space:nowrap;font-size:14px}.wb-todo-overdue{color:var(--accent);font-weight:600}.wb-overdue-row{background:#fff3ed;border-left-color:var(--accent)}.wb-overdue-badge{flex:none;color:white;background:var(--accent);border-radius:4px;padding:2px 5px;font-size:12px;white-space:nowrap}.wb-date-heading{color:var(--accent);font-size:16px;font-weight:600;margin-bottom:12px}.wb-todo-empty{margin:12px 0}.wb-todo-name button:hover{text-decoration:underline}@media(max-width:900px){.wb-todos{grid-template-columns:1fr}}
</style>
