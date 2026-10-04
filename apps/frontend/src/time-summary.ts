const day=86400000,offset=8*3600000
export function chinaToday(now=Date.now()){return new Date(now+offset).toISOString().slice(0,10)}
export function weekRange(anchor:string){const start=Date.parse(anchor+'T00:00:00+08:00');if(!Number.isFinite(start)||new Date(start+offset).toISOString().slice(0,10)!==anchor)return null;const monday=start-((new Date(start+offset).getUTCDay()+6)%7)*day;return {start:monday,end:monday+7*day,label:`${new Date(monday+offset).toISOString().slice(0,10)} — ${new Date(monday+6*day+offset).toISOString().slice(0,10)}`}}
export function monthRange(month:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;const start=Date.parse(month+'-01T00:00:00+08:00');if(!Number.isFinite(start))return null;const next=new Date(start+offset);next.setUTCMonth(next.getUTCMonth()+1);return {start,end:next.getTime()-offset,label:month}}
type Entry={userId:string;person:string;start:string;end:string}
type Project={id:string;members:{userId:string;name:string}[];timeEntries:Entry[]}
export function summarizeHours(projects:Project[],week:{start:number;end:number}|null,month:{start:number;end:number}|null){
 const people=new Map<string,{userId:string;name:string;projects:Set<string>;totalMinutes:number;weekMinutes:number;monthMinutes:number;recordCount:number}>()
 function person(id:string,name:string,projectId:string){let p=people.get(id);if(!p){p={userId:id,name,projects:new Set(),totalMinutes:0,weekMinutes:0,monthMinutes:0,recordCount:0};people.set(id,p)}p.name=name;p.projects.add(projectId);return p}
 for(const project of projects){for(const m of project.members)person(m.userId,m.name,project.id);for(const e of project.timeEntries||[]){const start=Date.parse(e.start+':00+08:00'),end=Date.parse(e.end+':00+08:00');if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;const p=person(e.userId,e.person,project.id);p.totalMinutes+=(end-start)/60000;p.recordCount++;if(week)p.weekMinutes+=Math.max(0,Math.min(end,week.end)-Math.max(start,week.start))/60000;if(month)p.monthMinutes+=Math.max(0,Math.min(end,month.end)-Math.max(start,month.start))/60000}}
 return Array.from(people.values()).map(p=>({...p,projectCount:p.projects.size})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
}
export function formatHours(minutes:number){return `${Math.floor(minutes/60).toString().padStart(2,'0')}:${Math.round(minutes%60).toString().padStart(2,'0')}`}
export function decimalHours(minutes:number){return Number((minutes/60).toFixed(2)).toString()}
