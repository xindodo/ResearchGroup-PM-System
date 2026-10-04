<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {downloadExcel} from './excel'
import type {LiveProject} from './project-api'
import {taskPeople,taskTotalDays,formatDays} from './workday-summary'
import ProjectTimeSummary from './ProjectTimeSummary.vue'
const props=defineProps<{projects:LiveProject[];projectId?:string;refresh:()=>Promise<void>}>()
const query=ref(''),projectFilter=ref(''),personFilter=ref(''),from=ref(''),to=ref(''),filters=ref(false),ascending=ref(false),pageSize=ref(25),page=ref(1)
const collapsed=ref<string[]>([])
function toggleProject(id:string){collapsed.value=collapsed.value.includes(id)?collapsed.value.filter(v=>v!==id):[...collapsed.value,id]}
const scoped=computed(()=>props.projects.filter(p=>!props.projectId||p.id===props.projectId))
const rows=computed(()=>scoped.value.flatMap(project=>project.tasks.map(task=>({project,task,days:task.spentDays??null,totalDays:taskTotalDays(task),people:taskPeople(task,project)}))))
const filtered=computed(()=>rows.value.filter(r=>(!projectFilter.value||r.project.id===projectFilter.value)&&(!personFilter.value||r.people.some(p=>p.userId===personFilter.value))&&(!from.value||r.task.due>=from.value)&&(!to.value||!!r.task.due&&r.task.due<=to.value)&&`${r.project.title} ${r.task.title} ${r.task.taskType||''} ${r.people.map(p=>p.name).join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a,b)=>ascending.value?a.task.due.localeCompare(b.task.due):b.task.due.localeCompare(a.task.due)))
function displayDays(row:(typeof rows.value)[number]){return personFilter.value?row.days:row.totalDays}
const totalDays=computed(()=>filtered.value.reduce((sum,r)=>sum+(displayDays(r)??0),0)),totalPages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/pageSize.value)))
const visible=computed(()=>filtered.value.slice((page.value-1)*pageSize.value,page.value*pageSize.value))
const groups=computed(()=>{const map=new Map<string,{project:LiveProject;rows:(typeof rows.value);count:number;days:number}>();for(const row of visible.value){let group=map.get(row.project.id);if(!group){const all=filtered.value.filter(r=>r.project.id===row.project.id);group={project:row.project,rows:[],count:all.length,days:all.reduce((sum,r)=>sum+(displayDays(r)??0),0)};map.set(row.project.id,group)}group.rows.push(row)}return [...map.values()]})
watch([query,projectFilter,personFilter,from,to,pageSize,ascending],()=>page.value=1)
watch(totalPages,value=>{if(page.value>value)page.value=value})
async function exportRows(){await downloadExcel('工日明细-筛选结果.xlsx',[['项目','任务','任务类型','负责人','参与人员','开始时间','结束时间','工日'],...filtered.value.map(r=>[r.project.title,r.task.title,r.task.taskType||'',r.task.owner,r.people.filter(p=>p.userId!==r.task.assigneeId).map(p=>p.name).join('、'),r.task.start,r.task.due,displayDays(r)]),['合计','','','','','','',totalDays.value]],'工日明细')}
</script>
<template>
 <div class="timesheet-page"><div v-if="!projectId" class="timesheet-heading"><h2>工日表</h2></div>
 <ProjectTimeSummary :projects="projects" :project-id="projectId" v-model:project-filter="projectFilter" v-model:person-filter="personFilter" />
 <section class="panel timesheet-panel"><div class="timesheet-toolbar"><div class="timesheet-tools"><label>每页<select aria-label="工日每页条数" v-model.number="pageSize"><option :value="10">10条</option><option :value="25">25条</option><option :value="50">50条</option></select></label><button :disabled="!filtered.length" @click="exportRows">导出</button><button :aria-expanded="filters" @click="filters=!filters">筛选</button></div><input v-model="query" type="search" aria-label="搜索工日记录" placeholder="搜索项目、任务或人员"></div>
 <div v-if="filters" class="timesheet-filters"><label>截止日期起<input v-model="from" type="date"></label><label>截止日期止<input v-model="to" type="date" :min="from"></label><button @click="projectFilter='';personFilter='';from='';to='';query=''">清空</button></div>
 <div class="timesheet-scroll"><table class="timesheet-table" aria-label="工日明细"><colgroup><col><col class="wd-type"><col class="wd-owner"><col class="wd-people"><col class="wd-date"><col class="wd-date"><col class="wd-days"></colgroup><thead><tr><th>项目/任务名称</th><th>任务类型</th><th>负责人</th><th>参与人员</th><th>开始时间</th><th><button class="text-link" @click="ascending=!ascending">结束时间 {{ ascending?'↑':'↓' }}</button></th><th>工日</th></tr></thead>
 <tbody v-for="group in groups" :key="group.project.id"><tr class="wd-project-row"><td><div class="wd-name"><button class="text-link wd-toggle" :aria-label="`展开或收起项目 ${group.project.title}`" :aria-expanded="!collapsed.includes(group.project.id)" @click="toggleProject(group.project.id)"><span aria-hidden="true">{{ collapsed.includes(group.project.id)?'▸':'▾' }}</span></button><button class="text-link wd-project-name" @click="toggleProject(group.project.id)">{{ group.project.title }}</button><span class="wd-count">（{{ group.count }}项任务）</span></div></td><td>—</td><td>{{ group.project.owner||'—' }}</td><td>—</td><td>{{ group.project.start||'—' }}</td><td>{{ group.project.end||'—' }}</td><td>{{ formatDays(group.days) }}</td></tr>
 <template v-if="!collapsed.includes(group.project.id)"><tr v-for="row in group.rows" :key="row.task.id" class="wd-task-row"><td><div class="wd-name wd-task-name" :class="{'wd-subtask':row.task.parentId}"><span class="wd-spacer"></span><span class="wd-task-title"><span v-if="row.task.parentId">↳ </span>{{ row.task.title }}</span></div></td><td>{{ row.task.taskType||'未选择' }}</td><td>{{ row.task.owner||'—' }}</td><td>{{ row.people.filter(p=>p.userId!==row.task.assigneeId).map(p=>p.name).join('、')||'—' }}</td><td>{{ row.task.start||'—' }}</td><td>{{ row.task.due||'—' }}</td><td>{{ displayDays(row)==null?'—':formatDays(displayDays(row)!) }}</td></tr></template></tbody></table></div>
 <p v-if="!visible.length" class="muted timesheet-empty">暂无符合条件的项目任务</p>
 <footer class="timesheet-footer"><span>共{{ filtered.length }}项任务 · 合计 {{ formatDays(totalDays) }}工日</span><div><button :disabled="page===1" @click="page--">上一页</button><span>{{ page }} / {{ totalPages }}</span><button :disabled="page===totalPages" @click="page++">下一页</button></div></footer></section></div>
</template>
<style scoped>
.timesheet-heading,.timesheet-toolbar,.timesheet-tools,.timesheet-footer,.timesheet-footer>div{display:flex;align-items:center;justify-content:space-between;gap:10px}.timesheet-heading{margin-bottom:12px}.timesheet-heading h2{font-size:18px;color:var(--accent)}.timesheet-toolbar{margin-bottom:12px}.timesheet-tools{justify-content:flex-start}.timesheet-tools label{display:flex;align-items:center;gap:6px}.timesheet-page button,.timesheet-page input,.timesheet-page select{font:inherit}.timesheet-page button:not(.text-link),.timesheet-page input,.timesheet-page select{padding:6px 9px;border:1px solid var(--line);border-radius:5px;background:white;color:inherit}.timesheet-toolbar>input{width:min(330px,100%)}.timesheet-filters{display:flex;align-items:end;flex-wrap:wrap;gap:10px;margin-bottom:12px}.timesheet-filters label{display:grid;gap:4px}.timesheet-filters select{max-width:230px}.timesheet-scroll{overflow:auto}.timesheet-table{border-collapse:collapse;width:100%;min-width:880px;table-layout:fixed;text-align:left;font-size:14px}.timesheet-table th,.timesheet-table td{padding:5px 11px;border-bottom:1px solid var(--line);vertical-align:middle}.timesheet-table th{background:#f6f5f3;font-weight:600;white-space:nowrap}.timesheet-table td{overflow-wrap:anywhere}.timesheet-table td small{display:block;color:var(--muted);margin-top:3px}.timesheet-note{min-width:160px;max-width:240px;white-space:pre-wrap}.timesheet-actions{display:flex;gap:5px;white-space:nowrap}.timesheet-footer{margin-top:12px;color:var(--muted)}.timesheet-empty{padding:16px 0}.time-entry-form{width:min(730px,100%)}.time-members{display:grid;gap:5px;min-width:0}@media(max-width:720px){.timesheet-toolbar,.timesheet-footer{flex-wrap:wrap}.timesheet-toolbar>input{width:100%}.timesheet-filters label{flex:1;min-width:130px}.timesheet-filters select{width:100%}.timesheet-heading h2{font-size:17px}}

.timesheet-page{color:#473e36;--line:#e6e0d9;--muted:#716a62}
.timesheet-panel{background:#fff;border-color:var(--line)}
.timesheet-table th{background:#f6f5f3;color:#4b433c}
.timesheet-table th .text-link{color:inherit;font-weight:600}
.timesheet-table td{border-color:#eeeae5}
.timesheet-table tbody tr:hover{background:#fcf8f4}
.timesheet-table td strong{color:#253b57}
.timesheet-page button:not(.text-link){color:#493f36;border-color:#ddd7d0}
.timesheet-page button:not(.text-link):hover{background:#faf4ee}
.timesheet-page .pm-primary,.timesheet-page .pm-primary:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.timesheet-tools button[aria-expanded="true"]{background:var(--accent-soft);color:var(--accent);border-color:#dabca7}
.timesheet-state{display:inline-flex;padding:3px 6px;border:1px solid #dcd6ce;border-radius:4px;background:#f6f5f3;color:#716a62;white-space:nowrap}
.timesheet-state.running{border-color:#bfcde0;background:#f5f8fd;color:#315d94}
.timesheet-state.done{border-color:#b9d5c9;background:#f2f8f5;color:#34745d}
.wd-type{width:90px}.wd-owner{width:120px}.wd-people{width:170px}.wd-date{width:115px}.wd-days{width:75px}.wd-project-row{background:var(--peach,#f4eee7)}.wd-name{display:flex;align-items:center;gap:6px;min-height:24px}.wd-toggle,.wd-spacer{width:23px;flex:none}.wd-toggle{height:22px;display:inline-flex;align-items:center;justify-content:center}.wd-project-name{color:var(--accent);font-weight:400;text-align:left}.wd-task-title{color:var(--project-blue);font-weight:400;text-align:left}.wd-project-name:hover{text-decoration:underline}.wd-count{color:var(--muted);white-space:nowrap}.wd-task-name{padding-left:16px}.wd-subtask{padding-left:32px}.timesheet-table td:nth-last-child(-n+3){white-space:nowrap}.timesheet-table .text-link{padding:0;border:0;background:none;font:inherit}.timesheet-table tbody .wd-project-row:hover{background:var(--peach,#f4eee7)}
</style>
