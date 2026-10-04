import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todoPeriods } from '../src/workbench-todos.ts'

test('今日含逾期至第5天，近期含第6至10天，排除完成与无日期任务', () => {
  const tasks = ['2026-09-27','2026-10-04','2026-10-09','2026-10-10','2026-10-14','2026-10-15',''].map(due => ({due,state:'进行中'}))
  tasks.push({due:'2026-10-04',state:'已完成'})
  const [today, upcoming, overdue] = todoPeriods(tasks, '2026-10-04')
  assert.deepEqual(today.tasks.map(t=>t.due), ['2026-09-27','2026-10-04','2026-10-09'])
  assert.equal(upcoming.title, '近期待办')
  assert.deepEqual(upcoming.tasks.map(t=>t.due), ['2026-10-10','2026-10-14'])
  assert.deepEqual(overdue.tasks.map(t=>t.due), ['2026-09-27'])
  assert.deepEqual(todoPeriods([{due:'2027-01-05',state:'待开始'}],'2026-12-31')[0].tasks.length,1)
})
