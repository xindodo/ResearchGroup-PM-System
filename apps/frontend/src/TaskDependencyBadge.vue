<script setup lang="ts">
import {computed} from 'vue'
import type {ProjectTask} from './project-api'
const props=defineProps<{task:ProjectTask;tasks:ProjectTask[]}>()
const before=computed(()=>props.tasks.find(t=>t.id===props.task.dependsOn))
const after=computed(()=>props.tasks.filter(t=>t.dependsOn===props.task.id))
const description=computed(()=>[before.value?`前置任务：${before.value.title}`:'',after.value.length?`后续任务：${after.value.map(t=>t.title).join('、')}`:''].filter(Boolean).join('\n'))
</script>
<template><span v-if="before||after.length" class="task-dependency-badge" :title="description" :aria-label="description" tabindex="0">{{ before?'← 前置':'' }}{{ before&&after.length?' · ':'' }}{{ after.length?'后续 '+after.length+' →':'' }}</span></template>
<style scoped>.task-dependency-badge{display:inline-block;flex:none;white-space:nowrap;border:1px solid #b9cce5;border-radius:999px;background:#f4f7fc;color:var(--project-blue,#315d94);font-size:12px;font-weight:400;line-height:18px;padding:0 6px;cursor:help}.task-dependency-badge:focus-visible{outline:2px solid var(--project-blue);outline-offset:2px}</style>
