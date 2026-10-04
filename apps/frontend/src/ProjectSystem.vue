<script setup lang="ts">
import { onMounted, ref, provide } from 'vue'
import { account, api, session, login, logout } from './api'
import { installProject, loadProjects, type LiveProject, type ProjectPerson, type ProjectTask } from './project-api'
import ProjectPreview from './ProjectPreview.vue'
import ProjectEditors from './ProjectEditors.vue'
import ProjectTimesheets from './ProjectTimesheets.vue'
import ProjectMilestones from './ProjectMilestones.vue'
import ProjectTaskLoad from './ProjectTaskLoad.vue'
import ProjectPersonnel from './ProjectPersonnel.vue'
import ProjectOrganizationOptions from './ProjectOrganizationOptions.vue'
import { refreshData } from './bootstrap'
import { loadProjectOptions } from './project-options'
import ChangePassword from './components/ChangePassword.vue'
import SystemAdmin from './components/SystemAdmin.vue'
import { toast } from './store'
import './style.css?personnel-scope'
import {taskCompletionKey} from './task-completion'
const passwordOpen=ref(false)
const ready=ref(false),busy=ref(false),error=ref(''),username=ref(''),password=ref('')
const projects=ref<LiveProject[]>([]),people=ref<ProjectPerson[]>([])
const editingProject=ref<LiveProject|null>(),editingTask=ref<{project:LiveProject;task?:ProjectTask;assigneeId?:string}>()
const deletingProject=ref<LiveProject>(),deletionInfo=ref<{revision:number;tasks:number;workdayTasks:number;timeEntries:number;attachments:number}>(),deleteBusy=ref(false),deleteError=ref('')
async function askDelete(project:LiveProject){deletingProject.value=project;deletionInfo.value=undefined;deleteError.value='';deleteBusy.value=true;try{deletionInfo.value=await api(`/pm/projects/${project.id}/deletion-preview`)}catch(e){deleteError.value=(e as Error).message}finally{deleteBusy.value=false}}
async function deleteProject(){if(!deletingProject.value||!deletionInfo.value)return;deleteBusy.value=true;deleteError.value='';try{await api(`/pm/projects/${deletingProject.value.id}`,'DELETE',{revision:deletionInfo.value.revision});projects.value=projects.value.filter(p=>p.id!==deletingProject.value!.id);deletingProject.value=undefined;window.location.assign('/?view=projects')}catch(e){deleteError.value=(e as Error).message}finally{deleteBusy.value=false}}
async function refresh() {
  const result=await loadProjects();projects.value=result.projects;people.value=result.people
  await Promise.all([refreshData(),loadProjectOptions()])
}
onMounted(async()=>{try{await session();await refresh()}catch(e){if(account.value)error.value=(e as Error).message}finally{ready.value=true}})
async function signIn(){busy.value=true;error.value='';try{await login(username.value,password.value);await refresh();password.value=''}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function reload(){busy.value=true;error.value='';try{await session();await refresh()}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function signOut(){try{await logout();projects.value=[];people.value=[];editingProject.value=undefined;editingTask.value=undefined}catch(e){error.value=(e as Error).message}}
function acceptProject(saved:LiveProject){installProject(saved);const index=projects.value.findIndex(p=>p.id===saved.id);if(index<0)projects.value.unshift(saved);else projects.value[index]=saved}
const completing=ref(new Set<string>())
provide(taskCompletionKey,{
 getTask:id=>projects.value.flatMap(p=>p.tasks).find(t=>t.id===id),
 isSaving:id=>completing.value.has(id),
 async setCompleted(id,completed){
  if(completing.value.has(id))return
  const project=projects.value.find(p=>p.tasks.some(t=>t.id===id)),task=project?.tasks.find(t=>t.id===id)
  if(!project||!task)throw new Error('任务不存在，请刷新后重试')
  completing.value=new Set([...completing.value,id])
  try{acceptProject(await api<LiveProject>(`/pm/projects/${project.id}/tasks/${id}`,'PUT',{revision:task.revision,completed}))}
  finally{completing.value=new Set([...completing.value].filter(v=>v!==id))}
 }
})
async function saveProject(data:unknown){const old=editingProject.value;const saved=await api<LiveProject>('/pm/projects'+(old?'/'+old.id:''),old?'PUT':'POST',data);acceptProject(saved);editingProject.value=undefined}
async function saveTask(data:unknown){const edit=editingTask.value!;const saved=await api<LiveProject|{id:string;accessRevoked:true}>(`/pm/projects/${edit.project.id}/tasks${edit.task?'/'+edit.task.id:''}`,edit.task?'PUT':'POST',data);if('accessRevoked' in saved)projects.value=projects.value.filter(p=>p.id!==saved.id);else acceptProject(saved);editingTask.value=undefined}
async function deleteTask(){const edit=editingTask.value!;await api(`/pm/projects/${edit.project.id}/tasks/${edit.task!.id}`,'DELETE',{revision:edit.task!.revision});editingTask.value=undefined;await refresh()}
</script>
<template>
  <main v-if="!ready || !account" class="pm-login"><form class="panel" @submit.prevent="signIn"><h1>项目管理系统</h1><p class="muted">使用现有系统账号登录</p><p v-if="!ready" role="status">正在连接服务…</p><template v-else><label>账号<input v-model.trim="username" autocomplete="username" required maxlength="150"></label><label>密码<input v-model="password" type="password" autocomplete="current-password" required maxlength="128"></label><p v-if="error" class="pm-error" role="alert">{{ error }}</p><button class="pm-primary" :disabled="busy">{{ busy?'登录中…':'登录' }}</button></template></form></main>
  <ProjectPreview v-else live :items="projects" :user-name="account.name" :user-id="account.id" :user-role="account.role">
    <template #controls><p v-if="error" class="pm-error" role="alert">{{ error }}</p></template>
    <template #account-actions="{ openProfile, closeMenu }"><button v-if="account.role!=='只读访客'" @click="openProfile(account.id)">个人资料</button><button @click="passwordOpen=true;closeMenu()">修改密码</button><button :disabled="busy" @click="reload">{{ busy?'刷新中…':'刷新数据' }}</button><button :disabled="busy" @click="signOut">退出登录</button></template>
    <template #task-load="{ openProject }"><ProjectTaskLoad :projects="projects" :people="people" @open-project="openProject" /></template>
    <template #timesheets="{ projectId }"><ProjectTimesheets :projects="projects" :project-id="projectId" :refresh="refresh" /></template>
    <template #milestones="{ projectId, openProject }"><ProjectMilestones :projects="projects" :project-id="projectId" :combined="!!projectId" :refresh="refresh" @open-project="openProject" @edit-task="(project,task,assigneeId)=>editingTask={project,task,assigneeId}" /></template>
    <template #project-detail-actions="{ project }"><div v-if="project?.canManage" class="pm-project-actions"><button class="pm-inline-action" @click="editingProject=project">编辑项目</button><button v-if="account.role==='系统管理员'" class="pm-inline-action pm-delete-project" @click="askDelete(project)">删除项目</button></div></template>
    <template #project-task-toolbar="{ project }"><button v-if="project?.canManageTasks??project?.canManage" class="pm-inline-action" @click="editingTask={project}">添加任务</button></template>
    <template #project-list-actions><button v-if="account.role!=='只读访客'" class="pm-create-project" @click="editingProject=null">新建项目</button></template>
    <template #task-actions="{ project, task }"><button v-if="task.canEdit" class="text-link" @click="editingTask={project,task}">{{ (project.canManageTasks??project.canManage)?'编辑':'更新进度' }}</button></template>
    <template #settings="{ logs, projectTypes, selectTypes, openLogs, back }"><div v-if="account.role==='系统管理员'" class="project-personnel"><SystemAdmin :key="String(logs)" standalone :logs="logs" :project-types="projectTypes" @select-types="selectTypes" @open-logs="openLogs" @back="back" @updated="reload"><template #project-types><ProjectOrganizationOptions :role="account.role" :refresh="refresh" fixed-scope="types" heading="项目类型" /></template><template #project-sources><ProjectOrganizationOptions :role="account.role" :refresh="refresh" fixed-scope="sources" heading="项目来源" /></template><template #task-types><ProjectOrganizationOptions :role="account.role" :refresh="refresh" fixed-scope="taskTypes" heading="任务类型" /></template></SystemAdmin></div></template>
    <template #organization="{ personId, recordId, openPerson, openRecord, backToPerson, openProject }"><ProjectPersonnel :projects="projects" :role="account.role" :refresh="refresh" :person-id="personId" :record-id="recordId" @open-person="openPerson" @open-record="openRecord" @back-to-person="backToPerson" @open-project="openProject" /></template>
  </ProjectPreview>
  <div v-if="passwordOpen" class="project-personnel"><ChangePassword @close="passwordOpen=false" /></div>
  <div v-if="toast && !passwordOpen" class="project-personnel"><div class="toast" role="status">{{ toast }}</div></div>
  <div v-if="deletingProject" class="pm-modal" @click.self="!deleteBusy&&(deletingProject=undefined)"><section class="pm-form" role="dialog" aria-modal="true" aria-labelledby="delete-project-title"><h2 id="delete-project-title">删除项目</h2><p>确认删除“{{ deletingProject.title }}”？</p><p v-if="deleteBusy&&!deletionInfo">正在检查关联记录…</p><template v-if="deletionInfo"><p>关联记录：{{ deletionInfo.tasks }}项任务、{{ deletionInfo.workdayTasks }}项工日记录、{{ deletionInfo.timeEntries }}条原工时记录、{{ deletionInfo.attachments }}个附件。</p><p>删除后项目及关联记录将不再显示在项目、任务和工日列表中。数据和附件保留，可由管理员联系维护人员恢复。</p></template><p v-if="deleteError" role="alert" class="pm-error">{{ deleteError }}</p><div class="pm-form-actions"><button :disabled="deleteBusy" @click="deletingProject=undefined">取消</button><button class="pm-primary" :disabled="deleteBusy||!deletionInfo" @click="deleteProject">{{ deleteBusy?'处理中…':'确认删除' }}</button></div></section></div>
  <ProjectEditors v-if="account && (editingProject!==undefined || editingTask)" :key="editingTask?.task?.id || editingTask?.project.id || editingProject?.id || 'new'" :project="editingProject" :task-edit="editingTask" :people="people" :account="account" :save-project="saveProject" :save-task="saveTask" :delete-task="deleteTask" @close="editingProject=undefined;editingTask=undefined" />
</template>
<style>
.pm-project-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0}.pm-delete-project{color:var(--accent)}

.pm-inline-action{padding:6px 10px;border:1px solid var(--line);border-radius:5px;background:white;color:inherit;font:inherit;white-space:nowrap;flex-shrink:0}.table-tools .pm-create-project{padding:6px 10px;border:1px solid var(--accent);border-radius:5px;background:var(--accent);color:white;font:inherit;white-space:nowrap}.pm-login{min-height:100vh;display:grid;place-items:center}.pm-login form{width:min(420px,94vw);display:grid;gap:14px}.pm-login label,.pm-form label{display:grid;gap:5px}.pm-login input,.pm-form input,.pm-form select,.pm-form textarea{width:100%;min-width:0;border:1px solid var(--line);border-radius:5px;padding:7px;background:white;font:inherit;color:inherit}.pm-toolbar{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:6px;margin-bottom:16px}.pm-toolbar button,.pm-form button,.pm-login button{padding:6px 10px;border:1px solid var(--line);border-radius:5px;background:white;font:inherit;color:inherit}.pm-toolbar .pm-primary,.pm-form .pm-primary,.pm-login .pm-primary{background:var(--accent);color:white;border-color:var(--accent)}button:disabled{opacity:.55;cursor:default}.pm-error{color:#9c322b;padding:8px 0}.pm-modal{position:fixed;inset:0;background:#29252288;z-index:60;display:grid;place-items:center;padding:16px}.pm-form{background:var(--surface);border:1px solid var(--line);border-radius:8px;width:min(850px,100%);max-height:92vh;overflow:auto;padding:19px;display:grid;gap:13px}.pm-form h2{font-size:20px}.pm-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.pm-form fieldset{border:1px solid var(--line);border-radius:5px;padding:10px;display:grid;gap:8px}.pm-form .pm-member{display:flex;align-items:center;gap:8px}.pm-member input{width:auto}.pm-member select{width:auto;margin-left:auto}.pm-unit{display:grid;grid-template-columns:1fr 1fr;gap:8px;border-bottom:1px solid var(--line);padding-bottom:10px}.pm-form-actions{display:flex;justify-content:flex-end;gap:8px}.pm-form textarea{min-height:76px;resize:vertical}.task-child{padding-left:11px}.pm-form legend{padding:0 5px}.pm-form-header{display:flex;align-items:center;justify-content:space-between;gap:13px}@media(max-width:720px){.pm-modal{padding:6px}.pm-form{padding:13px}.pm-form-grid,.pm-unit{grid-template-columns:1fr}.pm-member{flex-wrap:wrap}}
</style>
