<script setup lang="ts">
import { downloadExcel } from './excel'
import { computed,ref,watch } from 'vue'
import type { LiveProject } from './project-api'
import { chinaToday,weekRange,monthRange } from './time-summary'
import {summarizeDays,formatDays} from './workday-summary'
const props=defineProps<{projects:LiveProject[];projectId?:string}>()
const projectFilter=defineModel<string>('projectFilter',{default:''}),personFilter=defineModel<string>('personFilter',{default:''})
const weekDate=ref(chinaToday()),month=ref(chinaToday().slice(0,7))
const projects=computed(()=>props.projects.filter(p=>(!props.projectId||p.id===props.projectId)&&(!projectFilter.value||p.id===projectFilter.value)))
const week=computed(()=>weekRange(weekDate.value)),monthPeriod=computed(()=>monthRange(month.value))
const all=computed(()=>summarizeDays(projects.value,week.value,monthPeriod.value)),people=computed(()=>all.value.filter(p=>!personFilter.value||p.userId===personFilter.value))
const totals=computed(()=>people.value.reduce((sum,p)=>({totalDays:sum.totalDays+p.totalDays,weekDays:sum.weekDays+p.weekDays,monthDays:sum.monthDays+p.monthDays}),{totalDays:0,weekDays:0,monthDays:0}))
watch(projectFilter,()=>{if(personFilter.value&&!all.value.some(p=>p.userId===personFilter.value))personFilter.value=''})
function reset(){projectFilter.value='';personFilter.value='';weekDate.value=chinaToday();month.value=chinaToday().slice(0,7)}
async function exportSummary(){const cells=[['成员','项目范围','参与项目数','总工日','统计周','周工日','统计月','月工日'],...people.value.map(p=>[p.name,props.projectId?projects.value[0]?.title||'':projectFilter.value?projects.value[0]?.title||'':'全部可见项目',p.projectCount,p.totalDays,week.value?.label||'',p.weekDays,month.value,p.monthDays])];await downloadExcel('人员工日统计.xlsx',cells,'工日统计')}
</script>
<template>
 <section class="panel time-summary" aria-label="人员工日统计"><div class="summary-title"><h3>人员工日统计</h3><div class="summary-actions"><slot name="actions" /><button :disabled="!people.length||!week||!monthPeriod" @click="exportSummary">导出统计</button></div></div>
 <div class="summary-filters"><label v-if="!projectId">项目范围<select aria-label="统计项目范围" v-model="projectFilter"><option value="">全部可见项目</option><option v-for="p in props.projects" :key="p.id" :value="p.id">{{ p.title }}</option></select></label><label>人员<select aria-label="统计人员" v-model="personFilter"><option value="">全部人员</option><option v-for="p in all" :key="p.userId" :value="p.userId">{{ p.name }}</option></select></label><label>统计周（选周内任一天）<input aria-label="统计周" type="date" v-model="weekDate"></label><label>统计月<input aria-label="统计月" type="month" v-model="month"></label><button @click="reset">重置统计</button></div>
 <div class="summary-cards"><div><span>总工日</span><strong>{{ formatDays(totals.totalDays) }}</strong></div><div><span>所选周工日</span><strong>{{ week?formatDays(totals.weekDays):'—' }}</strong></div><div><span>所选月工日</span><strong>{{ monthPeriod?formatDays(totals.monthDays):'—' }}</strong></div></div>
 <div class="summary-scroll"><table aria-label="人员工日汇总"><thead><tr><th>人员</th><th v-if="!projectId">参与项目数</th><th>总工日</th><th>周工日</th><th>月工日</th><th>已记录工日任务数</th></tr></thead><tbody><tr v-for="p in people" :key="p.userId" :data-user-id="p.userId"><td>{{ p.name }}</td><td v-if="!projectId">{{ p.projectCount }}</td><td>{{ formatDays(p.totalDays) }}</td><td>{{ week?formatDays(p.weekDays):'—' }}</td><td>{{ monthPeriod?formatDays(p.monthDays):'—' }}</td><td>{{ p.recordCount }}</td></tr></tbody></table></div><p v-if="!people.length" class="muted">暂无人员工日数据</p>
 <p class="summary-note muted">{{ projectId?'仅统计当前项目。':'汇总当前账号可见项目，可按项目范围筛选。' }}周一至周日为一周，月份按自然月；按任务截止日期归属统计周期。项目范围及人员筛选同步应用于下方列表。</p>
 </section>
</template>
<style scoped>
.time-summary button,.time-summary select,.time-summary input{font:inherit;padding:6px 9px;border:1px solid var(--line);border-radius:5px;background:white;color:inherit}
.time-summary{margin-bottom:14px;min-width:0}.summary-title{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.summary-actions{display:flex;margin-left:auto;align-items:center;gap:6px;flex-wrap:wrap}.summary-title h3{font-size:16px;margin:0;color:var(--accent)}.summary-filters{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin-bottom:12px}.summary-filters label{display:grid;gap:4px}.summary-filters select{max-width:260px}.summary-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.summary-cards>div{display:grid;gap:4px;border:1px solid var(--line);border-radius:6px;padding:10px;background:#faf9f7}.summary-cards strong{font-size:23px}.summary-cards span{color:var(--muted)}.summary-scroll{overflow:auto}.summary-scroll table{width:100%;min-width:620px;text-align:left;border-collapse:collapse;font-size:14px}.summary-scroll th,.summary-scroll td{padding:4px 10px;border-bottom:1px solid var(--line)}.summary-scroll th{background:#f6f5f3}.summary-note{font-size:14px;margin-top:10px}@media(max-width:720px){.summary-cards{grid-template-columns:1fr}.summary-filters label{flex:1;min-width:130px}.summary-filters select{width:100%;max-width:100%}}

.time-summary{color:#473e36;--line:#e6e0d9;--muted:#716a62;background:#fff}
.summary-cards>div{background:var(--peach,#f4eee7);border-color:var(--line)}
.summary-cards strong{color:#253b57}
.summary-scroll th{background:#f6f5f3;color:#4b433c}
.summary-scroll td{border-color:#eeeae5}
.summary-scroll tbody tr:hover{background:#fcf8f4}
.time-summary button{color:#493f36;border-color:#ddd7d0}
.time-summary button:hover{background:#faf4ee}
</style>
