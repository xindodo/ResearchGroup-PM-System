<script setup lang="ts">
import {inject,nextTick,ref} from 'vue'
import {taskCompletionKey} from './task-completion'
const props=defineProps<{taskId:string;title:string;state:string}>()
const context=inject(taskCompletionKey,undefined),error=ref('')
async function change(event:Event){
 const input=event.target as HTMLInputElement;error.value=''
 try{await context?.setCompleted(props.taskId,input.checked)}catch(e){error.value=(e as Error).message}
 await nextTick();input.checked=props.state==='已完成'
}
</script>
<template><span class="task-check-wrap"><input class="task-completion-checkbox" type="checkbox" :aria-label="`完成任务 ${title}`" :checked="state==='已完成'" :disabled="!context?.getTask(taskId)?.canEdit||context.isSaving(taskId)" :title="error||(!context?.getTask(taskId)?.canEdit?'只有任务负责人或项目管理人员可修改':'')" @change="change"><span v-if="error" class="task-check-error" role="alert">{{ error }}</span></span></template>
<style scoped>.task-check-wrap{display:inline-flex;align-items:center;gap:5px;flex:none}.task-completion-checkbox{appearance:auto;width:14px!important;height:14px!important;min-width:14px;margin:0;padding:0!important;accent-color:var(--accent);cursor:pointer}.task-completion-checkbox:disabled{cursor:default}.task-check-error{color:var(--accent);font-size:12px;max-width:220px}</style>
