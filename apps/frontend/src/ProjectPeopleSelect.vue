<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ProjectPerson } from './project-api'
const props=defineProps<{people:ProjectPerson[];modelValue:string[];ownerId:string;studentOwnerId?:string;label?:string}>()
const emit=defineEmits<{'update:modelValue':[ids:string[]]}>()
const open=ref(false),query=ref(''),root=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>()
const selected=computed(()=>props.people.filter(p=>p.id===props.ownerId||p.id===props.studentOwnerId||props.modelValue.includes(p.id)))
const rows=computed(()=>props.people.filter(p=>p.name.includes(query.value.trim())))
function toggle(id:string,checked:boolean){emit('update:modelValue',checked?[...props.modelValue,id]:props.modelValue.filter(value=>value!==id))}
function outside(event:MouseEvent){if(!root.value?.contains(event.target as Node))open.value=false}
function close(){open.value=false;trigger.value?.focus()}
onMounted(()=>document.addEventListener('click',outside))
onUnmounted(()=>document.removeEventListener('click',outside))
</script>
<template>
  <div ref="root" class="people-select" @keydown.esc.stop.prevent="close">
    <button ref="trigger" type="button" class="people-select-trigger" :aria-label="`选择${label||'参与人员'}`" :aria-expanded="open" @click="open=!open"><span>{{ selected.map(p=>p.name).join('、')||`请选择${label||'参与人员'}` }}</span><span aria-hidden="true">▾</span></button>
    <div v-if="open" class="people-select-panel"><input v-model="query" type="search" :aria-label="`搜索${label||'参与人员'}`" placeholder="搜索姓名"><div class="people-select-options" role="group" :aria-label="`${label||'参与人员'}选项`"><label v-for="person in rows" :key="person.id"><input type="checkbox" :checked="person.id===ownerId||person.id===studentOwnerId||modelValue.includes(person.id)" :disabled="person.id===ownerId||person.id===studentOwnerId" @change="toggle(person.id,($event.target as HTMLInputElement).checked)"><span>{{ person.name }}{{ person.active?'':'（已停用）' }}{{ person.id===ownerId?'（项目负责人）':person.id===studentOwnerId?'（学生负责人）':'' }}</span></label><p v-if="!rows.length" class="muted">没有匹配的人员</p></div><button type="button" @click="close">完成选择（{{ selected.length }}人）</button></div>
  </div>
</template>
<style scoped>
.people-select{position:relative;min-width:0}.people-select-trigger{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left}.people-select-trigger span:first-child{min-width:0;overflow-wrap:anywhere}.people-select-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:2;border:1px solid var(--line);border-radius:5px;background:white;box-shadow:0 6px 18px #29252218;padding:10px;display:grid;gap:8px}.people-select-options{max-height:210px;overflow:auto;display:grid;gap:2px}.people-select-options label{display:flex;align-items:center;gap:8px;padding:6px 4px}.people-select-options input{width:auto;flex:none;margin:0}.people-select-options label:hover{background:var(--accent-soft)}
</style>
