<script setup lang="ts">
import { computed } from 'vue'
import { projectDetail, type ProjectCore } from './project-detail-data'
const props = defineProps<{ projects: ProjectCore[]; currentUser: string; live?: boolean; currentUserId?: string }>()
const taskGroups = computed(() => props.projects.map(project => ({ project, detail: projectDetail(project) })))
const related = computed(() => taskGroups.value.filter(group => props.live ? group.project.memberIds?.includes(props.currentUserId || '') : group.project.owner === props.currentUser || group.detail.team.includes(props.currentUser)))
const tasks = computed(() => related.value.flatMap(group => group.detail.tasks))
const managedTasks = computed(() => taskGroups.value.filter(group => props.live ? (group.project.ownerId===props.currentUserId || group.project.studentOwnerId===props.currentUserId) : group.project.owner === props.currentUser).flatMap(group => group.detail.tasks))
const statuses = ['待开始', '进行中', '测试中', '待反馈', '已完成']
const projectStatuses = ['未开始', '进行中', '已暂停', '已取消', '已完成']
const projectCounts = computed(() => projectStatuses.map(label => ({ label, count: related.value.filter(group => (group.project as ProjectCore & { lifecycle?: string }).lifecycle === label).length })))
const chartColors = ['#b4aaa0', '#a4522e', '#b38b55', '#857c72', '#377562']
const ringBackground = computed(() => {
  if (!related.value.length) return '#efebe6'
  let angle = 0
  const segments = projectCounts.value.map((item, index) => {
    const start = angle
    angle += item.count / related.value.length * 360
    return `${chartColors[index]} ${start}deg ${angle}deg`
  })
  return `conic-gradient(${segments.join(',')})`
})
const taskCounts = computed(() => statuses.map(label => ({ label, count: managedTasks.value.filter(task => task.state === label).length, mine: tasks.value.filter(task => (props.live ? task.assigneeId===props.currentUserId : task.owner === props.currentUser) && task.state === label).length })))
const hours = computed(() => ['09月24日', '09月25日', '09月26日', '09月27日', '09月28日', '09月29日', '09月30日'].map(date => ({ date, hours: related.value.flatMap(group => group.detail.timesheets).filter(entry => entry.person === props.currentUser && entry.date === date).reduce((total, entry) => total + entry.hours, 0) })))
const totalHours = computed(() => hours.value.reduce((sum, day) => sum + day.hours, 0))
const maxHours = computed(() => Math.max(8, ...hours.value.map(day => day.hours)))
</script>
<template>
  <div class="pf-overview-grid">
    <section class="panel pf-status-panel"><div class="panel-head"><h2>项目状态统计</h2><span class="muted">我的相关项目</span></div><div class="pf-project-chart"><div class="pf-ring" :style="{ background: ringBackground }" role="img" :aria-label="`${related.length} 个相关项目`"><div><strong>{{ related.length }}</strong><span>相关项目</span></div></div><ul class="pf-legend"><li v-for="(item,index) in projectCounts" :key="item.label"><span class="pf-dot" :class="`tone-${index}`"></span><span>{{ item.label }}</span><b>{{ item.count }}</b></li></ul></div></section>
    <section class="panel pf-status-panel"><div class="panel-head"><h2>任务状态统计</h2><span class="muted">负责项目 / 本人</span></div><div class="pf-status-list"><div v-for="(item,index) in taskCounts" :key="item.label"><span class="pf-dot" :class="`tone-${index}`"></span><span>{{ item.label }}</span><span class="pf-status-bar"><i :style="{ width: `${item.count / (managedTasks.length || 1) * 100}%`, background: chartColors[index] }"></i></span><b>{{ item.count }}</b><small>本人 {{ item.mine }}</small></div></div></section>
    <section v-if="!live" class="panel pf-hours-panel"><div class="panel-head"><h2>我的每周工时</h2><strong>{{ totalHours }} <span>小时</span></strong></div><p class="pf-widget-description">09月24日 — 09月30日 · 示例周</p><div class="pf-hours-chart" role="img" :aria-label="`本周本人登记工时 ${totalHours} 小时`"><div v-for="day in hours" :key="day.date"><span>{{ day.hours }}</span><div class="pf-hour-column"><i :style="{ height: `${day.hours / maxHours * 100}%` }"></i></div><small>{{ day.date.slice(3,5) }}日</small></div></div></section>
    <section v-else class="panel pf-hours-panel"><h2>我的每周工时</h2><p class="pf-widget-description">工时登记将在后续开发中接入。</p></section>
  </div>
</template>
