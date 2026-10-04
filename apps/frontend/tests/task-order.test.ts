import {test} from 'node:test'
import assert from 'node:assert/strict'
import {orderTaskTree,sortTaskSiblings} from '../src/task-order.ts'

const task=(id:string,start='2026-10-01',due='2026-10-03',parentId:string|null=null,dependsOn:string|null=null)=>({id,title:id,start,due,parentId,dependsOn})
const ids=(tasks:ReturnType<typeof task>[])=>tasks.map(t=>t.id)

test('补录顺序不影响开始日期、截止日期的升序排列，缺失日期排后',()=>{
  const tasks=[task('later','2026-10-03'),task('long','2026-10-01','2026-10-05'),task('undated',''),task('early')]
  assert.deepEqual(ids(sortTaskSiblings(tasks,tasks)),['early','long','later','undated'])
  assert.deepEqual(ids(sortTaskSiblings([...tasks].reverse(),tasks)),['early','long','later','undated'])
})

test('前后置关系优先于日期，完整依赖链按顺序显示',()=>{
  const tasks=[task('last','2026-10-01','2026-10-03',null,'middle'),task('middle','2026-10-02','2026-10-03',null,'first'),task('first','2026-10-04')]
  assert.deepEqual(ids(orderTaskTree(tasks)),['first','middle','last'])
})

test('同级子任务保留父子层级，列表和甘特图排序相同',()=>{
  const parent=task('parent','2026-10-01','2026-10-05')
  const children=[task('outline','2026-10-03','2026-10-05','parent','drawing'),task('drawing','2026-10-01','2026-10-03','parent','literature'),task('literature','2026-10-01','2026-10-03','parent')]
  assert.deepEqual(ids(sortTaskSiblings(children,[parent,...children])),['literature','drawing','outline'])
  assert.deepEqual(ids(orderTaskTree([parent,...children])),['parent','literature','drawing','outline'])
})

test('不同父任务的子任务依赖会调整整组顺序，不拆散父子任务',()=>{
  const tasks=[task('a'),task('a-child','2026-10-01','2026-10-03','a','b-child'),task('b','2026-10-04'),task('b-child','2026-10-04','2026-10-05','b')]
  assert.deepEqual(ids(orderTaskTree(tasks)),['b','b-child','a','a-child'])
})

test('缺失的前置任务及历史循环关系不会丢失任务或无限循环',()=>{
  const tasks=[task('a','2026-10-01','2026-10-03',null,'b'),task('b','2026-10-02','2026-10-03',null,'a'),task('c','2026-10-03','2026-10-04',null,'missing')]
  assert.equal(new Set(ids(orderTaskTree(tasks))).size,3)
  const broken=[task('a','2026-10-01','2026-10-03','b'),task('b','2026-10-02','2026-10-03','a')]
  assert.equal(new Set(ids(orderTaskTree(broken))).size,2)
})
