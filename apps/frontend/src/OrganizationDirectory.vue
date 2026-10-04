<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {api,account} from './api'
import {personnel,type PersonProfile} from './personnel'
import type {LiveProject} from './project-api'
import PersonDetail from './components/PersonDetail.vue'
import PersonnelRecordDetail from './PersonnelRecordDetail.vue'
interface Unit{id:string;name:string;category:string;revision:number}
interface Person extends PersonProfile{id:string;organizationId:string|null;organizationRevision:number;userId:string|null}
const props=defineProps<{projects:LiveProject[];role:string;personId:string;recordId:string;refresh:()=>Promise<void>}>()
const emit=defineEmits<{'open-person':[id:string];'open-record':[id:string];'back-to-person':[];'open-project':[id:string]}>()
const units=ref<Unit[]>([]),people=ref<Person[]>([]),category=ref('所有单位'),unitId=ref(''),query=ref(''),personQuery=ref(''),memberType=ref(''),direction=ref(''),error=ref(''),busy=ref(false),pending=ref('')
const unitEditor=ref<Unit|null>(),unitDraft=ref({name:'',category:'校内单位'}),personEditor=ref<Person|null>(),personDraft=ref({name:'',userId:'',organizationId:''})
const admin=computed(()=>['系统管理员'].includes(props.role)),selected=computed(()=>units.value.find(u=>u.id===unitId.value)),person=computed(()=>personnel.value.find(p=>p.id===props.personId))
const rows=computed(()=>units.value.filter(u=>(category.value==='所有单位'||u.category===category.value)&&u.name.includes(query.value.trim())))
const members=computed(()=>people.value.filter(p=>(unitId.value==='unassigned'?!p.organizationId:p.organizationId===unitId.value)&&(!memberType.value||p.type===memberType.value)&&(!direction.value||p.direction===direction.value)&&`${p.name} ${p.direction||''}`.includes(personQuery.value.trim())))
const unassigned=computed(()=>people.value.filter(p=>!p.organizationId)),existing=computed(()=>people.value.filter(p=>p.userId&&(!p.organizationId||p.id===personEditor.value?.id)))
function readAddress(){const q=new URL(location.href).searchParams;unitId.value=q.get('unit')||'';const requested=q.get('organizationCategory');category.value=['所有单位','校内单位','其他高校','科研院所','其他企业'].includes(requested||'')?requested!:'所有单位';if(selected.value&&['校内单位','其他高校','科研院所','其他企业'].includes(selected.value.category))category.value=selected.value.category}
function address(){const u=new URL(location.href);if(unitId.value)u.searchParams.set('unit',unitId.value);else u.searchParams.delete('unit');u.searchParams.set('organizationCategory',category.value);history.pushState({},'',u)}
async function load(){const data=await api<{units:Unit[];people:Person[]}>('/organization');units.value=data.units;people.value=data.people}
onMounted(async()=>{try{await load();readAddress()}catch(e){error.value=(e as Error).message}window.addEventListener('popstate',readAddress)})
onUnmounted(()=>window.removeEventListener('popstate',readAddress))
function selectCategory(value:string){category.value=value;openUnit('')}
function openUnit(id:string){unitId.value=id;query.value='';personQuery.value='';memberType.value='';direction.value='';error.value='';pending.value='';unitEditor.value=undefined;personEditor.value=undefined;emit('open-person','');address()}
function editUnit(value:Unit|null){unitEditor.value=value;unitDraft.value={name:value?.name||'',category:value?.category||(category.value==='所有单位'?'校内单位':category.value)};error.value=''}
async function editPerson(value:Person|null){try{await load()}catch(e){error.value=(e as Error).message;return}if(value)value=people.value.find(p=>p.id===value!.id)||value;personEditor.value=value;personDraft.value={name:value?.name||'',userId:value?.userId||'',organizationId:value?.organizationId||(unitId.value==='unassigned'?'':unitId.value)};error.value=''}
async function mutate(action:()=>Promise<unknown>){busy.value=true;error.value='';try{await action();await props.refresh();await load();pending.value='';return true}catch(e){error.value=(e as Error).message;return false}finally{busy.value=false}}
async function saveUnit(){const old=unitEditor.value;if(await mutate(()=>api('/organization/units'+(old?'/'+old.id:''),old?'PUT':'POST',{...unitDraft.value,revision:old?.revision}))){unitEditor.value=undefined;if(old?.id===unitId.value){category.value=unitDraft.value.category==='校外单位'?'所有单位':unitDraft.value.category;address()}}}
async function savePerson(){const old=personEditor.value;if(await mutate(()=>api('/organization/people'+(old?'/'+old.id:''),old?'PUT':'POST',{...personDraft.value,revision:old?.organizationRevision||0}))){personEditor.value=undefined}}
async function removeUnit(u:Unit){if(pending.value!==u.id){pending.value=u.id;return}if(await mutate(()=>api('/organization/units/'+u.id,'DELETE',{revision:u.revision})))if(unitId.value===u.id)openUnit('')}
async function removePerson(p:Person){if(pending.value!==p.id){pending.value=p.id;return}await mutate(()=>api('/organization/people/'+p.id,'DELETE',{revision:p.organizationRevision}))}
</script>
<template>
 <div class="project-personnel organization-directory">
  <div class="category-tabs" role="tablist" aria-label="单位分类"><button v-for="value in ['所有单位','校内单位','其他高校','科研院所','其他企业']" :key="value" role="tab" :aria-selected="category===value" :class="{selected:category===value}" @click="selectCategory(value)">{{ value }}</button></div>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
  <PersonnelRecordDetail v-if="recordId" :record-id="recordId" @back="emit('back-to-person')"/>
  <PersonDetail v-else-if="personId" :key="personId" standalone :projects="projects" @open-project="id=>emit('open-project',id)" :person-id="personId" :name="person?.name||''" :role="role" @back="emit('open-person','');load()" @open-record="r=>emit('open-record',r.id||'')"/>
  <template v-else>
   <button v-if="unitId" class="back-link text-button" @click="openUnit('')">← 返回{{ category }}列表</button>
   <section v-if="!unitId||selected||unitId==='unassigned'" class="panel">
    <div class="directory-heading"><h1>{{ unitId?(selected?.name||'人员信息'):category }}</h1><div class="actions"><button v-if="admin&&!unitId" class="primary" @click="editUnit(null)">新增单位</button><button v-if="admin&&unitId" class="primary" @click="editPerson(null)">新增人员</button></div></div>
    <template v-if="!unitId">
     <label>搜索单位名称<input v-model="query" type="search" placeholder="输入单位名称"></label>
     <form v-if="unitEditor!==undefined&&admin" class="directory-form" @submit.prevent="saveUnit"><h2>{{ unitEditor?'编辑单位':'新增单位' }}</h2><label>单位名称<input v-model.trim="unitDraft.name" required maxlength="200"></label><label>单位分类<select v-model="unitDraft.category"><option>校内单位</option><option>其他高校</option><option>科研院所</option><option>其他企业</option><option v-if="unitEditor?.category==='校外单位'" value="校外单位">校外单位（原分类）</option></select></label><div class="actions"><button type="button" @click="unitEditor=undefined">取消</button><button class="primary" :disabled="busy">保存单位</button></div></form>
     <div class="table-scroll"><table aria-label="单位列表"><thead><tr><th>单位名称</th><th>人员数</th><th v-if="admin">操作</th></tr></thead><tbody><tr v-for="u in rows" :key="u.id"><td><button class="text-button" @click="openUnit(u.id)">{{ u.name }}</button></td><td>{{ people.filter(p=>p.organizationId===u.id).length }}</td><td v-if="admin"><div class="actions"><button @click="editUnit(u)">编辑</button><button :disabled="busy" @click="removeUnit(u)">{{ pending===u.id?'确认删除':'删除' }}</button><button v-if="pending===u.id" @click="pending=''">取消</button></div></td></tr></tbody></table></div>
     <p v-if="!rows.length" class="quiet-empty">暂无单位{{ query?'搜索结果':'' }}</p><button v-if="unassigned.length" class="text-button unassigned-link" @click="openUnit('unassigned')">未分配单位人员（{{ unassigned.length }}）</button>
    </template>
    <template v-else>
     <div class="person-filters" role="search" aria-label="人员筛选"><input aria-label="搜索人员姓名" v-model="personQuery" type="search" placeholder="输入姓名或研究方向"><select aria-label="成员类型筛选" v-model="memberType"><option value="">所有成员类型</option><option v-for="value in [...new Set(people.map(p=>p.type).filter(Boolean))]" :key="value">{{ value }}</option></select><select aria-label="研究方向筛选" v-model="direction"><option value="">所有研究方向</option><option v-for="value in [...new Set(people.map(p=>p.direction).filter(Boolean))]" :key="value">{{ value }}</option></select><button @click="personQuery='';memberType='';direction=''">清空</button></div>
     <form v-if="personEditor!==undefined&&admin" class="directory-form" @submit.prevent="savePerson"><h2>{{ personEditor?'编辑单位人员':'新增人员' }}</h2><label v-if="!personEditor">关联已有账号（选填）<select v-model="personDraft.userId"><option value="">不关联登录账号</option><option v-for="p in existing" :key="p.id" :value="p.userId!">{{ p.name }}</option></select></label><label v-if="!personDraft.userId">人员姓名<input v-model.trim="personDraft.name" required maxlength="100"></label><p v-else class="muted">账号姓名和登录权限在系统管理维护；移出单位保留账号。</p><label>所属单位<select v-model="personDraft.organizationId"><option value="">未分配单位</option><option v-for="u in units" :key="u.id" :value="u.id">{{ u.category }} · {{ u.name }}</option></select></label><div class="actions"><button type="button" @click="personEditor=undefined">取消</button><button class="primary" :disabled="busy">保存人员</button></div></form>
     <div class="table-scroll"><table aria-label="人员列表"><thead><tr><th>姓名</th><th>成员类型</th><th>研究方向</th><th>操作</th></tr></thead><tbody><tr v-for="p in members" :key="p.id"><td><button class="text-button" @click="emit('open-person',p.id!)">{{ p.name }}</button></td><td>{{ p.type||'—' }}</td><td>{{ p.direction||'—' }}</td><td><div class="actions"><button @click="emit('open-person',p.id!)">查看</button><template v-if="admin"><button @click="editPerson(p)">编辑</button><button v-if="p.organizationRevision" :disabled="busy" @click="removePerson(p)">{{ pending===p.id?'确认'+(p.userId?'移出':'删除'):(p.userId?'移出单位':'删除') }}</button><button v-if="pending===p.id" @click="pending=''">取消</button></template></div></td></tr></tbody></table></div><p v-if="!members.length" class="quiet-empty">暂无人员{{ personQuery?'搜索结果':'' }}</p>
    </template>
   </section>
   <section v-else class="panel"><h1>单位不存在或已删除</h1></section>
  </template>
 </div>
</template>
<style scoped>
.person-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,160px) minmax(0,200px) auto;align-items:center;gap:6px}.person-filters>input,.person-filters>select,.person-filters>button{min-width:0;margin:0;height:32px;min-height:32px;padding-top:4px;padding-bottom:4px}.person-filters>button{padding-inline:10px}@media(max-width:600px){.person-filters{grid-template-columns:minmax(0,1fr) minmax(0,90px) minmax(0,90px) auto;gap:4px}.person-filters>input,.person-filters>select{padding-left:5px}.person-filters>button{padding-inline:5px}}
.organization-directory{min-width:0;max-width:100%}.directory-heading .actions{width:auto;flex-shrink:1}.directory-heading h1{overflow-wrap:anywhere;min-width:0}.directory-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.directory-heading h1{font-size:22px}.organization-directory label{display:grid;gap:5px}.directory-form{display:grid;gap:10px;margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:6px}.organization-directory input,.organization-directory select{width:100%;min-width:0}.organization-directory table{width:100%;margin-top:12px}.organization-directory th,.organization-directory td{padding:4px 10px;text-align:left;border-bottom:1px solid var(--line)}.organization-directory table button{padding:4px 8px;line-height:1.4}.organization-directory table .text-button{padding:0}.unassigned-link{margin-top:12px}.actions{display:flex;gap:5px;flex-wrap:wrap}.table-scroll{overflow:auto;max-width:100%;min-width:0}@media(max-width:600px){.directory-heading h1{font-size:19px}.organization-directory th,.organization-directory td{padding:4px 5px}.organization-directory .category-tabs{overflow:auto}}
</style>
