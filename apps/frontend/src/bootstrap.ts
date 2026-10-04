import { api, account } from './api'
import { records } from './store'
import { personnel } from './personnel'
import { definitions, people, majors, memberTypes, type Kind } from './data'
export async function refreshData() {
  const data = await api('/bootstrap')
  account.value = data.user; records.value = data.records; personnel.value = data.personnel
  people.splice(0, people.length, ...data.personnel.filter((p: { role?: string }) => !['系统管理员','只读访客'].includes(p.role || '')).map((p: { name: string }) => p.name))
  majors.splice(0, majors.length, ...(data.dictionaries.majors || []).map((d: { name: string }) => d.name))
  memberTypes.splice(0, memberTypes.length, ...(data.dictionaries.memberTypes || []).map((d: { name: string }) => d.name))
  for (const key of Object.keys(definitions) as Kind[]) definitions[key].categories.splice(0, definitions[key].categories.length, ...(data.dictionaries[key] || []).map((d: { name: string }) => d.name))
}
