export function todoPeriods<T extends { due: string; state: string }>(tasks: T[], today: string) {
  const date = new Date(`${today}T00:00:00Z`)
  const offset = (days: number) => new Date(date.getTime() + days * 86400000).toISOString().slice(0, 10)
  const pending = tasks.filter(task => task.state !== '已完成' && /^\d{4}-\d{2}-\d{2}$/.test(task.due) && Number.isFinite(Date.parse(task.due)))
    .sort((a, b) => a.due.localeCompare(b.due))
  return [
    { title: '今日待办', tasks: pending.filter(task => task.due <= offset(5)) },
    { title: '近期待办', tasks: pending.filter(task => task.due >= offset(6) && task.due <= offset(10)) },
    { title: '逾期任务', tasks: pending.filter(task => task.due < today) },
  ]
}
