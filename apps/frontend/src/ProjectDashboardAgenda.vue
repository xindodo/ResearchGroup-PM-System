<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { projectDetail, type ProjectCore } from './project-detail-data'
const props = defineProps<{ projects: ProjectCore[]; currentUser: string; currentUserId?: string; live?: boolean }>()
const emit = defineEmits<{ 'open-project': [id: string] }>()
const today = props.live ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) : '2026-10-01'
const month = ref(new Date(today+'T00:00:00'))
const selectedDate = ref(props.live ? today : '2026-10-08')
const managed = (project:ProjectCore) => props.live ? (project.ownerId===props.currentUserId || project.studentOwnerId===props.currentUserId) : project.owner===props.currentUser
const groups = computed(() => props.projects.map(project => ({ project, detail: projectDetail(project) })).filter(group => props.live ? group.project.memberIds?.includes(props.currentUserId || '') : managed(group.project) || group.detail.team.includes(props.currentUser)))
const events = computed(() => groups.value.flatMap(group => [
  ...group.detail.tasks.filter(task => task.state !== '已完成' && (managed(group.project) || (props.live ? task.assigneeId===props.currentUserId : task.owner === props.currentUser))).map(task => ({ date: task.due, title: task.title, kind: '任务', project: group.project })),
  ...group.detail.milestones.filter(item => item.state !== '已完成' && managed(group.project)).map(item => ({ date: item.planned, title: item.title, kind: '里程碑', project: group.project })),
]))
const cells = computed(() => {
  const year = month.value.getFullYear(), m = month.value.getMonth()
  const offset = (new Date(year,m,1).getDay()+6)%7
  return Array.from({length:42},(_,index) => {
    const date = new Date(year,m,index-offset+1)
    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    return { date: iso, day: date.getDate(), outside: date.getMonth()!==m, events: events.value.filter(event => event.date === iso) }
  })
})
const selectedEvents = computed(() => events.value.filter(event => event.date === selectedDate.value))
const activities = computed(() => groups.value.filter(group => managed(group.project)).flatMap(group => group.detail.activities.map(activity => ({...activity, project: group.project}))))
const todos = ref([{id:1,title:'核对中期检查材料目录',done:false},{id:2,title:'联系协作单位确认数据版本',done:false},{id:3,title:'整理上次项目例会纪要',done:true}])
const todoDraft=ref('')
const todoTab=ref('未完成')
const visibleTodos=computed(()=>todos.value.filter(item => todoTab.value === '已完成' ? item.done : !item.done))
function addTodo(){const title=todoDraft.value.trim();if(!title)return;todos.value.push({id:Date.now(),title,done:false});todoDraft.value=''}
function moveMonth(step:number){month.value=new Date(month.value.getFullYear(),month.value.getMonth()+step,1);selectedDate.value=`${month.value.getFullYear()}-${String(month.value.getMonth()+1).padStart(2,'0')}-01`}
</script>
<template>
  <div class="pf-bottom-grid">
    <section class="panel pf-calendar"><div class="panel-head"><h2>日历</h2><div class="pf-calendar-controls"><button aria-label="上个月" @click="moveMonth(-1)"><ChevronLeft :size="18" /></button><strong>{{ month.getFullYear() }}年{{ month.getMonth()+1 }}月</strong><button aria-label="下个月" @click="moveMonth(1)"><ChevronRight :size="18" /></button><button @click="month=new Date(today+'T00:00:00');selectedDate=today">{{ live?'今天':'示例今天' }}</button></div></div><p class="pf-widget-description">本人任务与负责项目的任务、里程碑截止日期</p><div class="pf-calendar-grid"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day" class="pf-weekday">{{ day }}</span><button v-for="cell in cells" :key="cell.date" :class="{ outside: cell.outside, selected: selectedDate===cell.date, today:cell.date===today }" :aria-label="`${cell.date}，${cell.events.length}项安排`" :aria-pressed="selectedDate===cell.date" @click="selectedDate=cell.date"><span>{{ cell.day }}</span><small v-if="cell.events.length">{{ cell.events.length }} 项</small><i v-if="cell.events.length"></i></button></div><div class="pf-agenda"><strong>{{ selectedDate }} 的安排</strong><button v-for="(event,index) in selectedEvents" :key="`${event.project.id}-${index}`" @click="emit('open-project',event.project.id)"><span class="pf-event-kind">{{ event.kind }}</span><span><span :class="{'pf-agenda-task':event.kind==='任务'}">{{ event.title }}</span><small>{{ event.project.title }}</small></span></button><p v-if="!selectedEvents.length">当日暂无安排</p></div></section>
    <div class="pf-side-widgets">
      <section v-if="!live" class="panel pf-todo"><div class="panel-head"><h2>我的待办事项</h2></div><div class="wb-filters"><button v-for="tab in ['未完成','已完成']" :key="tab" :class="{selected:todoTab===tab}" :aria-pressed="todoTab===tab" @click="todoTab=tab">{{ tab }} {{ todos.filter(item=>tab==='已完成'?item.done:!item.done).length }}</button></div><form class="pf-todo-form" @submit.prevent="addTodo"><input v-model="todoDraft" aria-label="新增待办事项" placeholder="添加个人待办事项" maxlength="150" /><button type="submit" :disabled="!todoDraft.trim()">添加</button></form><label v-for="todo in visibleTodos" :key="todo.id" class="pf-todo-item"><input type="checkbox" v-model="todo.done" /><span :class="{done:todo.done}">{{ todo.title }}</span></label><p v-if="!visibleTodos.length" class="pf-widget-description">暂无{{ todoTab }}待办</p></section>
      <section class="panel pf-activity"><div class="panel-head"><h2>最近项目活动</h2></div><div class="pf-activity-scroll"><button v-for="(activity,index) in activities" :key="index" @click="emit('open-project',activity.project.id)"><span class="pf-activity-dot"></span><span><strong>{{ activity.person }} · {{ activity.action }}</strong><span>{{ activity.detail }}</span><small>{{ activity.date }} · {{ activity.project.title }}</small></span></button><p v-if="!activities.length" class="pf-widget-description">暂无项目活动</p></div></section>
    </div>
  </div>
</template>
