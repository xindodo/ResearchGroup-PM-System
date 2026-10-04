import type {LiveProject,ProjectPerson,ProjectTask} from './project-api'
export type Capacity={userId:string;dailyLimit:number;revision:number}
export type LoadTask=ProjectTask&{project:LiveProject}
export function nextDates(start:string,count=14){const date=new Date(start+'T00:00:00Z');return Array.from({length:count},(_,index)=>new Date(date.getTime()+index*86400000).toISOString().slice(0,10))}
export function personTaskLoad(person:ProjectPerson,projects:LiveProject[],dates:string[],today:string,limit?:number){
 const tasks:LoadTask[]=projects.flatMap(project=>project.tasks.filter(t=>t.assigneeId===person.id||(t.participantIds||[]).includes(person.id)).map(task=>({...task,project})))
 const pending=tasks.filter(t=>t.state!=='已完成')
 const days=dates.map(date=>{const count=pending.filter(t=>(t.start||t.due)&&(t.due||t.start)&&(t.start||t.due)<=date&&(t.due||t.start)>=date).length;return {date,count,percent:limit===undefined?null:Math.round(count/limit*100)}})
 return {person,tasks,pending,days,limit,done:tasks.length-pending.length,overdue:pending.filter(t=>t.due&&t.due<today).length,undated:pending.filter(t=>!t.start&&!t.due).length}
}
