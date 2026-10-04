<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight } from '@lucide/vue'
import { projectDetail, type ProjectCore } from './project-detail-data'

const props = defineProps<{ projects: ProjectCore[] }>()
const emit = defineEmits<{ 'open-project': [id: string] }>()
const projectId = ref('all')
const category = ref('全部项目')
const status = ref('全部状态')
const search = ref('')
const categories = computed(() => ['全部项目', ...new Set(props.projects.map(project => project.type))])
const groups = computed(() => props.projects.map(project => ({ project, milestones: projectDetail(project).milestones })))
const filtered = computed(() => groups.value.filter(group => (projectId.value === 'all' || group.project.id === projectId.value) && (category.value === '全部项目' || group.project.type === category.value)).map(group => ({ ...group, milestones: group.milestones.filter(milestone => (status.value === '全部状态' || milestone.state === status.value) && `${group.project.title} ${group.project.code} ${milestone.title} ${milestone.owner} ${milestone.deliverable}`.toLowerCase().includes(search.value.trim().toLowerCase())) })).filter(group => group.milestones.length))
const visibleMilestones = computed(() => filtered.value.flatMap(group => group.milestones))
const count = (state: string) => visibleMilestones.value.filter(milestone => milestone.state === state).length
function reset() { projectId.value = 'all'; category.value = '全部项目'; status.value = '全部状态'; search.value = '' }
</script>

<template>
  <div class="milestone-page">
    <div class="page-heading"><div><h1>阶段与里程碑</h1><p>汇总各项目的阶段节点、责任人和交付成果。</p></div><span class="preview-pill page-preview">示例数据</span></div>
    <div class="ms-category-tabs" aria-label="项目分类"><button v-for="type in categories" :key="type" :class="{selected:category===type}" :aria-pressed="category===type" @click="category=type;projectId='all'">{{ type }}</button></div>
    <section class="panel ms-controls" aria-label="里程碑筛选"><label>项目<select v-model="projectId"><option value="all">全部项目</option><option v-for="project in projects.filter(item=>category==='全部项目'||item.type===category)" :key="project.id" :value="project.id">{{ project.title }}</option></select></label><label>节点状态<select v-model="status"><option v-for="state in ['全部状态','已完成','进行中','待开始']" :key="state">{{ state }}</option></select></label><label class="ms-search">搜索<input v-model="search" type="search" placeholder="项目、节点、责任人或交付成果" /></label><button class="ms-reset" @click="reset">重置</button></section>
    <div class="ms-summary" aria-live="polite"><span>当前显示 <strong>{{ filtered.length }}</strong> 个项目 · <strong>{{ visibleMilestones.length }}</strong> 个节点</span><span>已完成 <b>{{ count('已完成') }}</b></span><span>进行中 <b>{{ count('进行中') }}</b></span><span>待开始 <b>{{ count('待开始') }}</b></span></div>
    <section v-for="group in filtered" :key="group.project.id" class="panel ms-project" :data-project="group.project.id"><div class="panel-head ms-project-head"><div><button class="ms-project-link" @click="emit('open-project',group.project.id)">{{ group.project.title }}<ArrowRight :size="17" /></button><p>{{ group.project.code }} · {{ group.project.type }} · 负责人 {{ group.project.owner }} · 当前阶段 {{ group.project.phase }}</p></div><button class="text-link" @click="emit('open-project',group.project.id)">项目里程碑<ArrowRight :size="16" /></button></div><div class="ms-table-scroll"><table class="ms-table"><thead><tr><th>阶段 / 里程碑</th><th>计划日期</th><th>实际日期</th><th>责任人</th><th>交付成果</th><th>状态</th></tr></thead><tbody><tr v-for="milestone in group.milestones" :key="milestone.title"><td><strong>{{ milestone.title }}</strong></td><td>{{ milestone.planned }}</td><td>{{ milestone.actual }}</td><td>{{ milestone.owner }}</td><td>{{ milestone.deliverable }}</td><td><span class="ms-status" :class="{done:milestone.state==='已完成',running:milestone.state==='进行中'}">{{ milestone.state }}</span></td></tr></tbody></table></div></section>
    <section v-if="!filtered.length" class="panel ms-empty"><p>没有符合条件的项目节点</p><button class="text-link" @click="reset">清除筛选，查看全部项目</button></section>
  </div>
</template>
