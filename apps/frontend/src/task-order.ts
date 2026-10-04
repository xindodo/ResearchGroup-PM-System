type ScheduledTask = {id:string;title:string;start:string;due:string;parentId:string|null;dependsOn:string|null}

// Undated tasks go last. Titles and IDs only break ties; creation time is irrelevant.
function compareTasks(a:ScheduledTask,b:ScheduledTask){
  const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'9999-99-99'
  return date(a.start).localeCompare(date(b.start)) || date(a.due).localeCompare(date(b.due)) || a.title.localeCompare(b.title,'zh-CN') || a.id.localeCompare(b.id)
}

/** Keep sibling branches together, putting predecessor branches before successors. */
export function sortTaskSiblings<T extends ScheduledTask>(siblings:T[],tasks:T[]):T[]{
  const byId=new Map(tasks.map(t=>[t.id,t])), siblingIds=new Set(siblings.map(t=>t.id))
  function branch(id:string):string|undefined{
    const seen=new Set<string>()
    while(!seen.has(id)){
      if(siblingIds.has(id))return id
      seen.add(id);const parent=byId.get(id)?.parentId;if(!parent)return;id=parent
    }
  }
  const incoming=new Map(siblings.map(t=>[t.id,new Set<string>()]))
  for(const task of tasks){
    if(!task.dependsOn)continue
    const from=branch(task.dependsOn),to=branch(task.id)
    if(from&&to&&from!==to)incoming.get(to)!.add(from)
  }
  const remaining=[...siblings].sort(compareTasks),result:T[]=[]
  while(remaining.length){
    // A conflicting/cyclic dependency must not hide tasks or freeze rendering.
    const index=remaining.findIndex(t=>incoming.get(t.id)!.size===0)
    const [next]=remaining.splice(index<0?0:index,1);result.push(next!)
    for(const deps of incoming.values())deps.delete(next!.id)
  }
  return result
}

/** The list and Gantt use the same parent-first, sibling scheduling order. */
export function orderTaskTree<T extends ScheduledTask>(tasks:T[]):T[]{
  const ids=new Set(tasks.map(t=>t.id)),visited=new Set<string>(),result:T[]=[]
  function add(task:T){
    if(visited.has(task.id))return
    visited.add(task.id);result.push(task)
    sortTaskSiblings(tasks.filter(t=>t.parentId===task.id),tasks).forEach(add)
  }
  sortTaskSiblings(tasks.filter(t=>!t.parentId||!ids.has(t.parentId)),tasks).forEach(add)
  // Safely include any historical tasks with a malformed parent cycle.
  sortTaskSiblings(tasks.filter(t=>!visited.has(t.id)),tasks).forEach(add)
  return result
}
