import { api } from './api'
import { realProjectDetails, type ProjectCore } from './project-detail-data'

export interface ProjectPerson { id: string; name: string; active: boolean; role?:string }
export interface ProjectMember { userId: string; name: string; role: string; active?:boolean }
export interface ProjectUnit { name: string; role: string; contact: string; duty: string }
export interface ProjectTask {
  id: string; title: string; taskType?: string; spentDays?: number|null; assigneeId: string; owner: string; start: string; due: string;
  parentId: string | null; dependsOn: string | null; state: string; progress: number; revision: number; canEdit: boolean;milestoneIds:string[];participantIds?:string[];participants?:{userId:string;name:string}[];description?:string;createdAt?:string
}
export interface ProjectTimeEntry {id:string;taskId:string;userId:string;person:string;task:string;taskState:string;start:string;end:string;note:string;tags:string[];durationMinutes:number;revision:number;canEdit:boolean}
export interface ProjectMilestone {id:string;title:string;ownerId:string;owner:string;planned:string;actual:string;description:string;deliverable:string;acceptance:string;priority:string;taskIds:string[];dependsOn:string;tags:string[];state:string;progress:number;result:string;revision:number;canEdit:boolean;canManage:boolean;taskCount:number;completedTasks:number;taskProgress:number;createdAt:string;updatedAt:string}
export interface LiveProject extends ProjectCore {
  type: string; status: '正常推进' | '需要关注' | '待协调';
  lifecycle: '未开始' | '进行中' | '已暂停' | '已取消' | '已完成';
  ownerId: string; studentOwnerId?:string; studentOwner?:string; start: string; end: string; sponsor: string; tags: string[]; revision: number;
  canManage: boolean; canManageTasks?:boolean; members: ProjectMember[]; units: ProjectUnit[]; tasks: ProjectTask[];timeEntries:ProjectTimeEntry[];milestones:ProjectMilestone[];
  activities: { id: number; person: string; action: string; detail: string; date: string; kind: string }[]
}
export async function loadProjects() {
  const result = await api<{ projects: LiveProject[]; people: ProjectPerson[] }>('/pm/projects')
  realProjectDetails.clear()
  for (const p of result.projects) installProject(p)
  return result
}
export function installProject(p:LiveProject) {
    p.due = p.end
    p.memberIds = p.members.map(m=>m.userId)
    p.memberRoles = p.members.map(m=>m.role)
    realProjectDetails.set(p.id, {
      goal: p.summary, start: p.start, end: p.end, sponsor: p.sponsor, partner: '', coordinator: p.members.find(m=>m.role==='项目协调人')?.name || '',
      team: p.members.map(m=>m.name), taskTitles: ['', '', '', '', ''], milestoneTitles: ['', '', '', '', ''],
      documentTitles: ['', '', '', ''], riskTitle: '', discussion: '', note: '',
      tasks: p.tasks.map(t=>({...t, dependsOn: t.dependsOn || '—'})), units: p.units,
      activities: p.activities.map(a=>({...a,date:new Date(a.date).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})})),
      milestones: [], files: [], timesheets: [], discussions: [], notes: [], risks: [], approvals: [],
    })
}
