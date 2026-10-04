<script setup lang="ts">
import {computed,onMounted,ref} from 'vue'
import {api} from '../api'
type Config={appId:string;siteUrl:string;enabled:boolean;notifyCreated:boolean;notifyChanged:boolean;hasSecret:boolean;revision:number}
type Person={id:string;name:string;account:string;role:string;active:boolean;idType:string;receiveId:string;revision:number}
type Log={id:string;person:string;kind:string;status:string;attempts:number;error:string;createdAt:string}
const config=ref<Config>({appId:'',siteUrl:'https://pm.jtgc.cc',enabled:false,notifyCreated:true,notifyChanged:true,hasSecret:false,revision:0}),secret=ref(''),people=ref<Person[]>([]),logs=ref<Log[]>([]),query=ref(''),busy=ref(false),error=ref(''),message=ref(''),ready=ref(false)
const filtered=computed(()=>people.value.filter(p=>`${p.name} ${p.account}`.includes(query.value.trim())))
async function load(){const value=await api<{config:Config;people:Person[];logs:Log[]}>('/feishu');config.value=value.config;people.value=value.people;logs.value=value.logs;secret.value='';ready.value=true}
async function act(action:()=>Promise<void>){busy.value=true;error.value='';message.value='';try{await action()}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
onMounted(()=>act(load))
async function save(){await act(async()=>{await api('/feishu/config','PUT',{...config.value,appSecret:secret.value});await load();message.value='飞书配置已保存'})}
async function bind(p:Person){await act(async()=>{people.value=await api<Person[]>('/feishu/bindings/'+p.id,'PUT',{idType:p.idType,receiveId:p.receiveId,revision:p.revision});message.value=p.receiveId?`${p.name}的飞书绑定已保存`:`${p.name}的飞书绑定已解除`})}
async function test(p:Person){await act(async()=>{const result=await api<{ok:boolean;error:string;logs:Log[]}>('/feishu/test','POST',{userId:p.id});logs.value=result.logs;if(!result.ok)throw Error(result.error||'测试发送失败');message.value=`测试消息已发送给${p.name}，请在飞书确认收到`})}
async function retry(id:string){await act(async()=>{const value=await api<{logs:Log[]}>('/feishu/messages/'+id+'/retry','POST',{});logs.value=value.logs;message.value='已加入重试队列'})}
</script>
<template>
 <div class="feishu-settings">
  <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
  <form class="panel" @submit.prevent="save"><div class="section-heading"><h2>飞书应用配置</h2><button type="button" :disabled="busy" @click="act(load)">刷新</button></div>
   <div class="form-grid"><label>App ID<input v-model.trim="config.appId" required maxlength="100" placeholder="cli_开头的应用标识" :disabled="!ready||busy"></label><label>App Secret<input v-model="secret" type="password" autocomplete="new-password" :required="!config.hasSecret" maxlength="256" :placeholder="config.hasSecret?'已保存，留空不修改':'填写应用密钥'" :disabled="!ready||busy"></label><label class="site-url">系统地址<input v-model.trim="config.siteUrl" type="url" required maxlength="500" :disabled="!ready||busy"></label></div>
   <div class="switches"><label><input v-model="config.enabled" type="checkbox" :disabled="!ready||busy">启用自动通知</label><label><input v-model="config.notifyCreated" type="checkbox" :disabled="!ready||busy">新增任务通知</label><label><input v-model="config.notifyChanged" type="checkbox" :disabled="!ready||busy">任务变更通知</label><button class="primary" :disabled="!ready||busy">保存配置</button></div>
   <p class="muted config-note">先保存配置、绑定人员并发送测试，再启用自动通知。密钥加密保存，不回显。更换App ID会解除现有绑定并取消待发送消息。</p>
  </form>
  <section class="panel"><div class="section-heading"><h2>人员飞书绑定</h2><input v-model="query" type="search" aria-label="搜索飞书绑定人员" placeholder="搜索姓名或账号"></div><p class="muted">填写该应用下的Open ID、飞书用户ID，或飞书通讯录中登记的邮箱。接收人员须在应用可用范围内。</p>
   <div class="table-scroll"><table aria-label="飞书人员绑定"><thead><tr><th>姓名</th><th>系统账号</th><th>状态</th><th>标识类型</th><th>飞书接收标识</th><th>操作</th></tr></thead><tbody><tr v-for="p in filtered" :key="p.id"><td>{{ p.name }}</td><td>{{ p.account }}</td><td>{{ p.active?'启用':'停用' }}</td><td><select v-model="p.idType" :aria-label="`${p.name}飞书标识类型`" :disabled="busy"><option value="open_id">Open ID</option><option value="user_id">用户ID</option><option value="email">飞书登记邮箱</option></select></td><td><input v-model.trim="p.receiveId" :aria-label="`${p.name}飞书接收标识`" :placeholder="p.idType==='open_id'?'ou_开头':p.idType==='email'?'飞书通讯录邮箱':'飞书用户ID'" maxlength="254" :disabled="busy"></td><td><div class="row-actions"><button :disabled="busy||!ready" @click="bind(p)">保存绑定</button><button :disabled="busy||!p.active||!p.revision||!config.hasSecret" :aria-label="`给${p.name}发送测试`" @click="test(p)">发送测试</button></div></td></tr></tbody></table></div>
   <p v-if="!filtered.length" class="quiet-empty">暂无匹配人员</p>
  </section>
  <section class="panel"><div class="section-heading"><h2>发送记录</h2><span class="muted">最近100条</span></div><div class="table-scroll"><table aria-label="飞书发送记录"><thead><tr><th>时间</th><th>接收人</th><th>通知类型</th><th>状态</th><th>尝试次数</th><th>详情</th><th>操作</th></tr></thead><tbody><tr v-for="row in logs" :key="row.id"><td>{{ new Date(row.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}) }}</td><td>{{ row.person }}</td><td>{{ row.kind }}</td><td>{{ row.status }}</td><td>{{ row.attempts }}</td><td>{{ row.error||'—' }}</td><td><button v-if="['失败','未绑定'].includes(row.status)" :disabled="busy||!config.enabled" @click="retry(row.id)">重试</button></td></tr></tbody></table></div><p v-if="!logs.length" class="quiet-empty">暂无发送记录</p></section>
 </div>
</template>
<style scoped>
.feishu-settings{min-width:0}.section-heading,.switches,.row-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.section-heading{justify-content:space-between;margin-bottom:10px}.section-heading h2{margin:0}.section-heading>input{width:220px;max-width:100%}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}.form-grid label{display:grid;gap:5px}.site-url{grid-column:1/-1}.switches label{display:flex;align-items:center;gap:5px;margin-right:8px}.switches input{width:auto}.switches button{margin-left:auto}.config-note{margin:10px 0 0}.table-scroll{overflow:auto}table{width:100%;min-width:750px;border-collapse:collapse}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}td input,td select{min-width:120px;width:100%}.row-actions{flex-wrap:nowrap;white-space:nowrap}.feishu-settings p{overflow-wrap:anywhere}@media(max-width:600px){.form-grid{grid-template-columns:1fr}.switches button{margin-left:0}}
</style>
