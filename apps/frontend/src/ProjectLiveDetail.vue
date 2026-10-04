<script setup lang="ts">
import TagPills from './TagPills.vue'
import { onMounted, ref } from 'vue'
import { api } from './api'
import ProjectGantt from './ProjectGantt.vue'
import ProjectTimeline from './ProjectTimeline.vue'
import { detailTabs, type DetailGroup } from './project-detail-data'
import type { LiveProject } from './project-api'
const props=defineProps<{project:LiveProject;group:DetailGroup}>()
defineEmits<{back:[];changeGroup:[group:DetailGroup];openOrganization:[href:string]}>()
const directory=ref<{units:{id:string;name:string;category:string}[];people:{id:string;organizationId:string|null}[]}>({units:[],people:[]})
onMounted(async()=>{try{directory.value=await api('/organization')}catch{/* Keep project information visible when the directory is unavailable. */}})
function organizationLink(personId:string,unitName=''){
 const person=directory.value.people.find(person=>person.id===personId)
 const unit=directory.value.units.find(unit=>unitName?unit.name===unitName:unit.id===person?.organizationId)
 if(unitName&&!unit)return ''
 const url=new URL(location.href);url.search='';url.searchParams.set('view','organization')
 if(personId)url.searchParams.set('person',personId)
 url.searchParams.set('unit',unit?.id||'unassigned');url.searchParams.set('organizationCategory',unit?.category||'校内单位')
 return url.pathname+url.search+url.hash
}
const taskName=(id:string|null)=>props.project.tasks.find(t=>t.id===id)?.title || '—'
</script>
<template>
  <div class="detail-page">
    <section class="detail-hero project-title-only"><div class="detail-hero-main"><div class="detail-title-row"><h1>{{ project.title }}</h1><slot name="project-actions" /></div></div></section>
    <div class="detail-tabs" role="tablist" aria-label="项目详情栏目"><button v-for="tab in detailTabs" :key="tab.id" role="tab" :aria-selected="group===tab.id" :class="{selected:group===tab.id}" @click="$emit('changeGroup',tab.id)">{{ tab.label }}</button></div>
    <section v-if="group==='project_overview'" class="panel detail-section"><div class="overview-metrics"><div><span>整体进度</span><strong>{{ project.progress }}<small>%</small></strong></div><div><span>任务完成</span><strong>{{ project.tasks.filter(t=>t.state==='已完成').length }}/{{ project.tasks.length }}</strong></div><div><span>项目成员</span><strong>{{ project.members.length }}</strong></div><div><span>参与单位</span><strong>{{ project.units.length }}</strong></div></div><dl class="overview-facts"><div><dt>项目类型</dt><dd>{{ project.type }}</dd></div><div><dt>项目编号</dt><dd>{{ project.code || '未填写' }}</dd></div><div><dt>项目状态</dt><dd>{{ project.lifecycle }}</dd></div><div><dt>健康状态</dt><dd><span class="status" :class="project.status==='正常推进'?'good':'warn'">{{ project.status }}</span></dd></div><div><dt>项目负责人</dt><dd><a class="organization-tag" :href="organizationLink(project.ownerId)" @click.exact.prevent="$emit('openOrganization',organizationLink(project.ownerId))">{{ project.owner }}</a></dd></div><div><dt>牵头单位</dt><dd><a v-if="organizationLink('',project.unit) && project.unit" class="organization-tag" :href="organizationLink('',project.unit)" @click.exact.prevent="$emit('openOrganization',organizationLink('',project.unit))">{{ project.unit }}</a><span v-else>{{ project.unit || '—' }}</span></dd></div><div class="wide"><dt>学生负责人</dt><dd><a v-if="project.studentOwnerId" class="organization-tag" :href="organizationLink(project.studentOwnerId)" @click.exact.prevent="$emit('openOrganization',organizationLink(project.studentOwnerId))">{{ project.studentOwner }}</a><span v-else>—</span></dd></div><div><dt>参与人员</dt><dd class="organization-tags"><a v-for="member in project.members" :key="member.userId" class="organization-tag" :href="organizationLink(member.userId)" @click.exact.prevent="$emit('openOrganization',organizationLink(member.userId))">{{ member.name }}</a><span v-if="!project.members.length">—</span></dd></div><div><dt>参与单位</dt><dd class="organization-tags"><template v-for="(unit,index) in project.units" :key="index"><a v-if="organizationLink('',unit.name)" class="organization-tag" :href="organizationLink('',unit.name)" @click.exact.prevent="$emit('openOrganization',organizationLink('',unit.name))">{{ unit.name }}</a><span v-else>{{ unit.name }}</span></template><span v-if="!project.units.length">—</span></dd></div><div><dt>开始日期</dt><dd>{{ project.start || '未设置' }}</dd></div><div><dt>截止日期</dt><dd>{{ project.end || '未设置' }}</dd></div><div><dt>项目来源</dt><dd>{{ project.sponsor || '—' }}</dd></div><div><dt>项目标签</dt><dd><TagPills :tags="project.tags" /></dd></div><div><dt>当前阶段</dt><dd>{{ project.phase || '—' }}</dd></div><div class="wide"><dt>项目简介</dt><dd class="project-goal">{{ project.summary || '暂无项目简介' }}</dd></div></dl></section>
    <template v-else-if="group==='project_tasks'||group==='project_milestones'"><slot name="milestones" /></template>
    <template v-else-if="group==='project_timesheets'"><slot name="timesheets" /></template>
    <template v-else-if="group==='project_participants'"><section class="panel detail-section"><h2>参与单位</h2><div class="unit-grid"><article v-for="(unit,index) in project.units" :key="index" class="unit-card"><span class="unit-role">{{ unit.role }}</span><h3>{{ unit.name }}</h3><p>{{ unit.duty }}</p><small>联系人 {{ unit.contact || '—' }}</small></article></div><p v-if="!project.units.length" class="muted">暂无参与单位</p></section><section class="panel detail-section"><h2>项目人员</h2><div class="people-list"><div v-for="member in project.members" :key="member.userId"><span class="person-avatar">{{ member.name[0] }}</span><strong>{{ member.name }}</strong><span>{{ member.role }}</span></div></div></section></template>
    <ProjectTimeline v-else-if="group==='project_activity'" :key="project.id" :project="project" />
    <ProjectGantt v-else-if="group==='project_gantt'" :project="project" />
    <section v-else class="panel detail-section"><h2>{{ detailTabs.find(t=>t.id===group)?.label }}</h2><p class="muted">该模块将在后续开发中接入。</p></section>
  </div>
</template>

<style scoped>.organization-tags{display:flex;flex-wrap:wrap;gap:4px}.organization-tag{display:inline-flex;align-items:center;padding:1px 7px;border:1px solid #e7cdbb;border-radius:999px;background:var(--peach);color:var(--accent);line-height:1.5;overflow-wrap:anywhere}.organization-tag:hover{background:#ecd5c5;border-color:var(--accent);text-decoration:underline}.organization-tag:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.project-title-only{grid-template-columns:1fr}.project-title-only h1{margin:0}.project-goal{white-space:pre-wrap}.detail-title-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.detail-title-row h1{min-width:0;overflow-wrap:anywhere}.detail-title-row h2{margin:0}.detail-title-row:has(h2){margin-bottom:13px}</style>
