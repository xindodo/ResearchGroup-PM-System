import { ref } from 'vue'
import { api } from './api'
export interface ProjectOption {id:string;scope:'units'|'participantUnits'|'sources'|'types'|'taskTypes';name:string;contact:string;description:string;revision:number}
export const projectOptions=ref<ProjectOption[]>([])
export async function loadProjectOptions(){projectOptions.value=await api<ProjectOption[]>('/pm/options')}
