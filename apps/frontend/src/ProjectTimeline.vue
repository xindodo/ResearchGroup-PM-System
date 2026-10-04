<script setup lang="ts">
import { computed, ref } from 'vue'
import {taskTotalDays} from './workday-summary'
import ProjectDateRange from './ProjectDateRange.vue'
import type { LiveProject } from './project-api'
const props=defineProps<{project:LiveProject}>()
const filter=ref('')
const entries=computed(()=>[
  ...props.project.tasks.map(task=>({id:task.id,kind:'任务',title:task.title,date:task.due,start:task.start,end:task.due,owner:task.owner,people:task.participants?.map(person=>person.name)||[],spentDays:taskTotalDays(task),description:task.description||''})),
  ...props.project.milestones.map(node=>({id:node.id,kind:'里程碑',title:node.title,date:node.planned,start:'',end:node.planned,owner:node.owner,people:[...new Set(props.project.tasks.filter(task=>node.taskIds.includes(task.id)).flatMap(task=>[task.owner,...(task.participants?.map(person=>person.name)||[])]))].filter(name=>name!==node.owner),spentDays:null,description:node.description||''}))
].filter(row=>!filter.value||row.kind===filter.value).sort((a,b)=>(a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)))
const totalDays=computed(()=>entries.value.reduce((sum,row)=>sum+(row.spentDays??0),0))
</script>
<template>
  <section class="panel detail-section project-process">
    <div class="process-heading"><h2>项目过程</h2><select v-model="filter" aria-label="项目过程类型"><option value="">全部</option><option>里程碑</option><option>任务</option></select><span>{{ entries.length }}项</span></div>
    <div class="table-scroll"><table class="records-table process-table" aria-label="项目过程列表"><thead><tr><th>开始时间/结束时间</th><th>里程碑/任务</th><th>负责人</th><th>参与人员</th><th>工日</th><th>描述</th></tr></thead><tbody><tr v-for="row in entries" :key="row.kind+row.id" :data-entry-id="row.id"><td><ProjectDateRange :start="row.start" :end="row.end" /></td><td><div class="process-name"><span class="process-kind" :class="{'process-task':row.kind==='任务'}">{{ row.kind }}</span><span class="process-title">{{ row.title }}</span></div></td><td>{{ row.owner||'未设置' }}</td><td>{{ row.people.join('、')||'—' }}</td><td>{{ row.spentDays===null?'—':row.spentDays.toFixed(1) }}</td><td class="process-description" :title="row.description||'未填写'">{{ row.description||'未填写' }}</td></tr><tr v-if="!entries.length"><td colspan="6" class="quiet-empty">暂无项目过程</td></tr></tbody><tfoot><tr><th colspan="4">工日合计</th><td>{{ totalDays.toFixed(1) }}</td><td></td></tr></tfoot></table></div>
  </section>
</template>
<style scoped>
.process-heading{display:flex;align-items:center;gap:8px;margin-bottom:8px}.process-heading h2{margin:0;margin-right:auto}.process-heading select{width:auto}.process-heading>span{color:var(--muted)}.process-table{width:100%;min-width:850px;table-layout:fixed;border-collapse:collapse;text-align:left}.process-table th,.process-table td{padding:4px 8px;text-align:left;vertical-align:top;line-height:1.5}.process-table th{background:#f6f5f3;border-bottom:1px solid var(--line)}.process-table td{border-bottom:1px solid var(--line)}.process-table tbody tr:last-child td{border-bottom:0}.process-table th:nth-child(2){padding-left:72px}.process-name{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px;align-items:baseline}.process-title{min-width:0;overflow-wrap:anywhere;font-weight:400}.process-table th:nth-child(1){width:240px}.process-table th:nth-child(2){width:28%}.process-table th:nth-child(3){width:100px}.process-table th:nth-child(4){width:20%}.process-table th:nth-child(5){width:70px}.process-table tfoot{background:#f6f5f3;font-weight:600}.process-table td{vertical-align:top;overflow-wrap:anywhere}.process-kind{display:inline-block;background:#f4e8df;color:#a4522e;border:1px solid #e6d5c8;padding:1px 7px;border-radius:999px;text-align:center;box-sizing:border-box;font-size:12px;line-height:1.5;white-space:nowrap}.process-kind.process-task{color:var(--project-blue);background:#f5f8fd;border-color:#bfcde0}.process-table td.process-description{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
