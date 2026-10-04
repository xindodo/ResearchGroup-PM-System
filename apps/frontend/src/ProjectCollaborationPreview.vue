<script setup lang="ts">
import { computed, ref } from 'vue'
import { projectDetail, type ProjectCore } from './project-detail-data'
const props = defineProps<{ projects: ProjectCore[]; mode: 'timesheets' | 'organization'; live?: boolean }>()
const emit = defineEmits<{ 'open-project': [id: string] }>()
const projectId = ref('all')
const query = ref('')
const organizationTab = ref('参与单位')
const groups = computed(() => props.projects.map(project => ({ project, detail: projectDetail(project) })))
const selected = computed(() => groups.value.filter(group => projectId.value === 'all' || group.project.id === projectId.value))
const matches = (value: string) => value.toLowerCase().includes(query.value.trim().toLowerCase())
const timesheets = computed(() => selected.value.flatMap(group => group.detail.timesheets.map((entry,index) => ({ ...entry, key: `${group.project.id}-${index}`, project: group.project }))).filter(entry => matches(`${entry.project.title} ${entry.person} ${entry.task} ${entry.state}`)))
const hours = computed(() => timesheets.value.reduce((sum,entry) => sum + entry.hours,0))
const units = computed(() => selected.value.flatMap(group => group.detail.units.map((unit,index) => ({ ...unit, key: `${group.project.id}-${index}`, project: group.project }))).filter(unit => matches(`${unit.name} ${unit.contact} ${unit.role} ${unit.project.title}`)))
const members = computed(() => {
  const people = new Map<string, { name: string; assignments: { project: ProjectCore; role: string }[] }>()
  for (const group of selected.value) for (const [index,name] of group.detail.team.entries()) {
    const key=props.live ? group.project.memberIds?.[index] || name : name
    const person = people.get(key) || {name,assignments:[]}
    person.assignments.push({project:group.project,role:props.live ? group.project.memberRoles?.[index] || '项目成员' : name===group.project.owner?'项目负责人':name===group.detail.coordinator?'项目协调人':'项目成员'})
    people.set(key,person)
  }
  return [...people.values()].filter(person => matches(`${person.name} ${person.assignments.map(item=>`${item.project.title} ${item.role}`).join(' ')}`))
})
</script>
<template>
  <div class="collaboration-page">
    <div class="page-heading"><div><h1>{{ mode==='timesheets'?'工时':'组织' }}</h1><p>{{ mode==='timesheets'?'汇总各项目成员的任务工时及确认状态。':'集中查看各项目的参与单位、人员和协作角色。' }}</p></div><span v-if="!live" class="preview-pill page-preview">示例数据</span></div>
    <section class="panel collaboration-controls"><label>项目<select v-model="projectId"><option value="all">全部项目</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option></select></label><label>搜索<input v-model="query" type="search" :placeholder="mode==='timesheets'?'人员、任务或项目':'单位、人员、角色或项目'" /></label></section>
    <template v-if="mode==='timesheets'">
      <div class="ms-summary"><span><strong>{{ timesheets.length }}</strong> 条工时记录</span><span>累计 <b>{{ hours }}</b> 小时</span><span>待确认 <b>{{ timesheets.filter(entry=>entry.state==='待确认').length }}</b> 条</span></div>
      <section class="panel"><div class="ms-table-scroll"><table class="ms-table"><thead><tr><th>项目 / 任务</th><th>人员</th><th>日期</th><th>工时（小时）</th><th>状态</th></tr></thead><tbody><tr v-for="entry in timesheets" :key="entry.key"><td><button class="collaboration-link" @click="emit('open-project',entry.project.id)">{{ entry.task }}</button><small>{{ entry.project.title }}</small></td><td>{{ entry.person }}</td><td>{{ entry.date }}</td><td>{{ entry.hours }}</td><td><span class="ms-status" :class="{done:entry.state==='已确认'}">{{ entry.state }}</span></td></tr><tr v-if="!timesheets.length"><td colspan="5" class="collaboration-empty">没有符合条件的工时记录</td></tr></tbody></table></div></section>
    </template>
    <template v-else>
      <div class="ms-category-tabs" aria-label="组织内容"><button v-for="tab in ['参与单位','项目人员']" :key="tab" :class="{selected:organizationTab===tab}" :aria-pressed="organizationTab===tab" @click="organizationTab=tab">{{ tab }}</button></div>
      <section v-if="organizationTab==='参与单位'" class="panel"><div class="panel-head"><h2>参与单位与团队</h2><span class="muted">{{ units.length }} 条项目参与记录</span></div><div class="ms-table-scroll"><table class="ms-table"><thead><tr><th>单位 / 团队</th><th>角色</th><th>联系人</th><th>职责</th><th>所属项目</th></tr></thead><tbody><tr v-for="unit in units" :key="unit.key"><td>{{ unit.name }}</td><td>{{ unit.role }}</td><td>{{ unit.contact }}</td><td>{{ unit.duty }}</td><td><button class="collaboration-link" @click="emit('open-project',unit.project.id)">{{ unit.project.title }}</button></td></tr><tr v-if="!units.length"><td colspan="5" class="collaboration-empty">没有符合条件的单位记录</td></tr></tbody></table></div></section>
      <section v-else class="panel"><div class="panel-head"><h2>项目人员</h2><span class="muted">{{ members.length }} 人</span></div><div class="ms-table-scroll"><table class="ms-table"><thead><tr><th>姓名</th><th>参与项目及角色</th></tr></thead><tbody><tr v-for="person in members" :key="person.name"><td><strong>{{ person.name }}</strong></td><td><div v-for="item in person.assignments" :key="item.project.id" class="collaboration-assignment"><button class="collaboration-link" @click="emit('open-project',item.project.id)">{{ item.project.title }}</button><span class="ms-status">{{ item.role }}</span></div></td></tr><tr v-if="!members.length"><td colspan="2" class="collaboration-empty">没有符合条件的人员</td></tr></tbody></table></div></section>
    </template>
  </div>
</template>
