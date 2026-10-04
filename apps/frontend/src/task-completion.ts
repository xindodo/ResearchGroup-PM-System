import type {InjectionKey} from 'vue'
import type {ProjectTask} from './project-api'
export const taskCompletionKey:InjectionKey<{
 getTask:(id:string)=>ProjectTask|undefined;
 isSaving:(id:string)=>boolean;
 setCompleted:(id:string,completed:boolean)=>Promise<void>;
}>=Symbol('task-completion')
