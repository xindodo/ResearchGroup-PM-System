<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from './api'
import { projectOptions, type ProjectOption } from './project-options'
const props=defineProps<{role:string;refresh:()=>Promise<void>;fixedScope?:ProjectOption['scope'];heading?:string}>()
const scope=ref<ProjectOption['scope']>(props.fixedScope||'units'),query=ref(''),error=ref(''),busy=ref(false),editing=ref<ProjectOption|null>(),pendingDelete=ref('')
const draft=ref({name:'',contact:'',description:''})
const label=computed(()=>scope.value==='units'?'牵头单位':scope.value==='participantUnits'?'参与单位':scope.value==='types'?'项目类型':scope.value==='taskTypes'?'任务类型':'项目来源')
const admin=computed(()=>['系统管理员'].includes(props.role))
const rows=computed(()=>projectOptions.value.filter(p=>p.scope===scope.value && `${p.name} ${p.contact} ${p.description}`.includes(query.value.trim())))
function edit(option:ProjectOption|null){editing.value=option;draft.value={name:option?.name||'',contact:option?.contact||'',description:option?.description||''};error.value='';pendingDelete.value=''}
async function save(){busy.value=true;error.value='';try{await api('/pm/options'+(editing.value?'/'+editing.value.id:''),editing.value?'PUT':'POST',{...draft.value,scope:scope.value,revision:editing.value?.revision});await props.refresh();editing.value=undefined}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function remove(option:ProjectOption){if(pendingDelete.value!==option.id){pendingDelete.value=option.id;return}busy.value=true;error.value='';try{await api('/pm/options/'+option.id,'DELETE',{revision:option.revision});await props.refresh();pendingDelete.value=''}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
</script>
<template>
  <section class="panel organization-options">
    <div class="options-heading"><h1>{{ heading||'单位与来源管理' }}</h1><button v-if="admin" class="primary" :disabled="busy" @click="edit(null)">新增{{ label }}</button></div>
    <div class="options-tools"><label v-if="!fixedScope">选项类型<select aria-label="选项类型" v-model="scope" @change="editing=undefined;error='';pendingDelete=''"><option value="units">牵头单位</option><option value="participantUnits">参与单位</option><option value="sources">项目来源</option></select></label><label>搜索{{ label }}<input v-model="query" type="search" :placeholder="'输入'+label+'名称、联系人或说明'"></label></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <form v-if="editing!==undefined && admin" class="option-form" @submit.prevent="save"><h2>{{ editing?'编辑':'新增' }}{{ label }}</h2><label>名称<input v-model.trim="draft.name" required maxlength="200"></label><label v-if="['units','participantUnits'].includes(scope)">联系人<input v-model.trim="draft.contact" maxlength="100"></label><label>说明<textarea v-model.trim="draft.description" maxlength="1000"></textarea></label><div class="actions"><button type="button" :disabled="busy" @click="editing=undefined">取消</button><button class="primary" :disabled="busy">保存{{ label }}</button></div></form>
    <div class="table-scroll"><table :aria-label="label+'目录'"><thead><tr><th>名称</th><th v-if="['units','participantUnits'].includes(scope)">联系人</th><th>说明</th><th v-if="admin">操作</th></tr></thead><tbody><tr v-for="option in rows" :key="option.id"><td>{{ option.name }}</td><td v-if="['units','participantUnits'].includes(scope)">{{ option.contact||'—' }}</td><td>{{ option.description||'—' }}</td><td v-if="admin"><div class="actions"><button :disabled="busy" @click="edit(option)">编辑</button><button :disabled="busy" @click="remove(option)">{{ pendingDelete===option.id?'确认删除':'删除' }}</button><button v-if="pendingDelete===option.id" @click="pendingDelete=''">取消</button></div></td></tr></tbody></table></div>
    <p v-if="!rows.length" class="quiet-empty">暂无{{ label }}{{ query?'搜索结果':'' }}</p><p v-if="scope!=='taskTypes'" class="muted">{{ admin?'已被项目使用的选项不能删除；改名会同步更新项目，保留原有数据。':'管理员可维护目录，表单共用这些下拉选项。' }}</p>
  </section>
</template>
<style scoped>
.options-heading,.options-tools{display:flex;align-items:center;justify-content:space-between;gap:13px;margin-bottom:16px}.options-tools{justify-content:flex-start;align-items:end}.options-tools label,.option-form label{display:grid;gap:5px}.options-tools label:last-child{flex:1}.option-form{display:grid;gap:11px;border:1px solid var(--line);border-radius:6px;padding:14px;margin:16px 0}.option-form h2{margin:0}.options-tools input,.options-tools select,.option-form input,.option-form textarea{width:100%;min-width:0}.table-scroll{overflow:auto}.actions{white-space:nowrap}.organization-options h1{font-size:23px}@media(max-width:720px){.options-tools{align-items:stretch;flex-direction:column}.options-heading{align-items:center}.options-heading h1{font-size:20px}}
</style>
