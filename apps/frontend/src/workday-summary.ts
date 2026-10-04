import type { LiveProject } from './project-api'

export function formatDays(days:number){return days.toFixed(1)}
export function taskTotalDays(task:LiveProject['tasks'][number]){
 if(typeof task.spentDays!=='number'||!Number.isFinite(task.spentDays))return null
 const ids=new Set([task.assigneeId,...(task.participantIds||[]),...(task.participants||[]).map(p=>p.userId)].filter(Boolean))
 return task.spentDays*ids.size
}
export function taskPeople(task:LiveProject['tasks'][number],project:LiveProject){
 const people=new Map<string,string>()
 if(task.assigneeId)people.set(task.assigneeId,task.owner)
 for(const id of task.participantIds||[])if(!people.has(id))people.set(id,task.participants?.find(p=>p.userId===id)?.name||project.members.find(m=>m.userId===id)?.name||id)
 for(const p of task.participants||[])if(p.userId&&!people.has(p.userId))people.set(p.userId,p.name)
 return [...people].map(([userId,name])=>({userId,name}))
}
export function workdayRows(projects:LiveProject[]){
 return projects.flatMap(project=>project.tasks.filter(task=>typeof task.spentDays==='number'&&Number.isFinite(task.spentDays)&&task.spentDays>=0).map(task=>({project,task,days:task.spentDays!,totalDays:taskTotalDays(task)!,people:taskPeople(task,project)})))
}
export function summarizeDays(projects:LiveProject[],week:{start:number;end:number}|null,month:{start:number;end:number}|null){
 const people=new Map<string,{userId:string;name:string;projects:Set<string>;totalDays:number;weekDays:number;monthDays:number;recordCount:number}>()
 function person(id:string,name:string,projectId:string){let p=people.get(id);if(!p){p={userId:id,name,projects:new Set(),totalDays:0,weekDays:0,monthDays:0,recordCount:0};people.set(id,p)}p.projects.add(projectId);return p}
 for(const project of projects)for(const m of project.members)person(m.userId,m.name,project.id)
 for(const row of workdayRows(projects)){
  const date=Date.parse(row.task.due+'T00:00:00+08:00')
  for(const member of row.people){const p=person(member.userId,member.name,row.project.id);p.totalDays+=row.days;p.recordCount++;if(week&&date>=week.start&&date<week.end)p.weekDays+=row.days;if(month&&date>=month.start&&date<month.end)p.monthDays+=row.days}
 }
 return [...people.values()].map(p=>({...p,projectCount:p.projects.size})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
}
