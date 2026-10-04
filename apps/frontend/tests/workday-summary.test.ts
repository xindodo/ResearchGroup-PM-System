import {test} from 'node:test'
import assert from 'node:assert/strict'
import {summarizeDays,workdayRows,formatDays,taskTotalDays} from '../src/workday-summary.ts'
import {weekRange,monthRange} from '../src/time-summary.ts'
import type {LiveProject} from '../src/project-api.ts'

test('task days credit every unique owner and participant in full, ignoring legacy hours',()=>{
 const projects=[{id:'p',members:[{userId:'a',name:'甲'},{userId:'b',name:'乙'},{userId:'zero',name:'丙'}],tasks:[
  {id:'one',assigneeId:'a',owner:'甲',participantIds:['a','b','b'],participants:[{userId:'a',name:'甲'},{userId:'b',name:'乙'}],due:'2026-10-04',spentDays:1.5},
  {id:'two',assigneeId:'a',owner:'甲',due:'2026-10-05',spentDays:0.5},
  {id:'three',assigneeId:'b',owner:'乙',due:'2026-09-30',spentDays:2},
  {id:'unset',assigneeId:'a',owner:'甲',due:'2026-10-04',spentDays:null},
  {id:'no-date',assigneeId:'b',owner:'乙',due:'',spentDays:1}
 ],timeEntries:[{durationMinutes:99999}]}] as unknown as LiveProject[]
 const people=summarizeDays(projects,weekRange('2026-10-04'),monthRange('2026-10'))
 const a=people.find(p=>p.userId==='a')!,b=people.find(p=>p.userId==='b')!,zero=people.find(p=>p.userId==='zero')!
 assert.deepEqual([a.totalDays,a.weekDays,a.monthDays,a.recordCount],[2,1.5,2,2])
 assert.deepEqual([b.totalDays,b.weekDays,b.monthDays,b.recordCount],[4.5,3.5,1.5,3])
 assert.equal(zero.totalDays,0)
 assert.equal(workdayRows(projects).reduce((sum,r)=>sum+r.days,0),5)
 assert.equal(workdayRows(projects).reduce((sum,r)=>sum+r.totalDays,0),6.5)
 assert.equal(people.reduce((sum,p)=>sum+p.totalDays,0),6.5)
 assert.equal(taskTotalDays(projects[0].tasks[0]),3)
 assert.equal(taskTotalDays(projects[0].tasks[3]),null)
 assert.equal(formatDays(0.5),'0.5')
})
