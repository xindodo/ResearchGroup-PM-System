import { ref } from 'vue'
import type { Attachment } from './data'
import { notify } from './store'
import { api } from './api'

export interface PersonProfile {
  organizationPerson?:boolean;organizationId?:string|null;userId?:string|null;organizationRevision?:number;
  employmentDate?: string; createdAt?: string; id?: string; revision?: number; active?: boolean; role?: string;
  name: string; type: string; position: string; title: string; phone: string;
  email: string; employeeId: string; orcid: string; direction: string;
  homepage: string; office: string; summary: string;
  attachments: Attachment[]; images: Attachment[];
}
export const personnel = ref<PersonProfile[]>([])
export const isSystemPerson = (name: string) => personnel.value.some(p => p.name === name && ['系统管理员','只读访客'].includes(p.role || ''))
export const displayPerson = (name: string) => isSystemPerson(name) ? '' : name
export const businessNames = (names: string[]) => names.filter(name => !isSystemPerson(name))
export async function savePerson(profile: PersonProfile): Promise<boolean> {
  try { const saved = await api<PersonProfile>(profile.organizationPerson?`/organization/people/${profile.id}/profile`:`/users/${profile.id}/profile`,'PUT',profile); personnel.value = personnel.value.map(p => p.id === saved.id ? saved : p); notify('人员信息已保存'); return true }
  catch(e) { notify((e as Error).message); return false }
}
