<script setup lang="ts">
import {computed,ref} from 'vue'
import type {LiveProject} from '../project-api'
import {chinaToday,weekRange,monthRange} from '../time-summary'
import {summarizeDays,formatDays,workdayRows} from '../workday-summary'
const props=defineProps<{projects:LiveProject[];userId:string;section:'projects'|'tasks'|'hours'}>()
const emit=defineEmits<{'open-project':[id:string]}>()
const projects=computed(()=>props.userId?props.projects.filter(p=>p.ownerId===props.userId||p.studentOwnerId===props.userId||p.members.some(m=>m.userId===props.userId)):[])
const tasks=computed(()=>props.userId?props.projects.flatMap(project=>project.tasks.filter(t=>t.assigneeId===props.userId||(t.participantIds||[]).includes(props.userId)).map(task=>({project,task}))).sort((a,b)=>b.task.due.localeCompare(a.task.due)):[])
const times=computed(()=>workdayRows(props.projects).filter(row=>row.people.some(p=>p.userId===props.userId)).sort((a,b)=>b.task.due.localeCompare(a.task.due)))
const week=ref(chinaToday()),month=ref(chinaToday().slice(0,7))
const totals=computed(()=>summarizeDays(props.projects,weekRange(week.value),monthRange(month.value)).find(p=>p.userId===props.userId))
function projectRole(p:LiveProject){return p.ownerId===props.userId?'项目负责人':p.studentOwnerId===props.userId?'学生负责人':p.members.find(m=>m.userId===props.userId)?.role||'项目成员'}
</script>
<template>
 <div class="person-participation">
  <template v-if="section==='projects'">
   <div class="table-scroll"><table aria-label="项目参与列表"><thead><tr><th>项目名称</th><th>项目类型</th><th>参与身份</th><th>项目负责人</th><th>开始日期</th><th>截止日期</th><th>状态</th><th>进度</th></tr></thead><tbody><tr v-for="p in projects" :key="p.id"><td><button class="text-button" @click="emit('open-project',p.id)">{{ p.title }}</button></td><td>{{ p.type||'未填写' }}</td><td>{{ projectRole(p) }}</td><td>{{ p.owner }}</td><td>{{ p.start||'未填写' }}</td><td>{{ p.end||'未填写' }}</td><td>{{ p.lifecycle }}</td><td>{{ p.progress }}%</td></tr></tbody></table></div>
   <p v-if="!projects.length" class="quiet-empty">暂无项目参与记录</p>
  </template>
  <template v-else-if="section==='tasks'">
   <div class="table-scroll"><table aria-label="任务参与列表"><thead><tr><th>任务名称</th><th>任务类型</th><th>所属项目</th><th>参与身份</th><th>负责人</th><th>开始日期</th><th>截止日期</th><th>状态</th><th>进度</th></tr></thead><tbody><tr v-for="{project,task} in tasks" :key="task.id"><td>{{ task.title }}</td><td>{{ task.taskType||'未选择' }}</td><td><button class="text-button" @click="emit('open-project',project.id)">{{ project.title }}</button></td><td>{{ task.assigneeId===userId?'负责人':'参与人员' }}</td><td>{{ task.owner }}</td><td>{{ task.start||'未填写' }}</td><td>{{ task.due||'未填写' }}</td><td>{{ task.state }}</td><td>{{ task.progress }}%</td></tr></tbody></table></div>
   <p v-if="!tasks.length" class="quiet-empty">暂无任务参与记录</p>
  </template>
  <template v-else>
   <div class="hour-filters"><label>统计周<input v-model="week" type="date"></label><label>统计月<input v-model="month" type="month"></label></div>
   <div class="hour-totals"><div v-for="[label,minutes] in [['总工日',totals?.totalDays||0],['所选周工日',totals?.weekDays||0],['所选月工日',totals?.monthDays||0]]" :key="String(label)"><span>{{ label }}</span><strong>{{ formatDays(Number(minutes)) }}</strong></div></div>
   <div class="table-scroll"><table aria-label="人员工日列表"><thead><tr><th>所属项目</th><th>任务</th><th>开始时间</th><th>结束时间</th><th>工日</th></tr></thead><tbody><tr v-for="{project,task,days} in times" :key="task.id"><td><button class="text-button" @click="emit('open-project',project.id)">{{ project.title }}</button></td><td>{{ task.title }}</td><td>{{ task.start||'—' }}</td><td>{{ task.due||'—' }}</td><td>{{ formatDays(days) }}</td></tr></tbody></table></div>
   <p v-if="!times.length" class="quiet-empty">暂无工日记录</p>
  </template>
 </div>
</template>
<style scoped>
.person-participation{min-width:0}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:680px}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--bg)}td{overflow-wrap:anywhere}.hour-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.hour-filters label{display:flex;align-items:center;gap:6px}.hour-filters input{width:auto;min-width:0}.hour-totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.hour-totals>div{display:grid;gap:4px;padding:10px;border:1px solid var(--line);border-radius:6px}.hour-totals strong{font-size:22px}.hour-totals span{color:var(--muted)}
</style>
