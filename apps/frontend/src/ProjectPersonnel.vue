<script setup lang="ts">
import OrganizationDirectory from './OrganizationDirectory.vue'
import type {LiveProject} from './project-api'
defineProps<{projects:LiveProject[];role:string;personId:string;recordId:string;refresh:()=>Promise<void>}>()
const emit=defineEmits<{'open-person':[id:string];'open-record':[id:string];'back-to-person':[];'open-project':[id:string]}>()
</script>
<template><OrganizationDirectory :projects="projects" @open-project="id=>emit('open-project',id)" :role="role" :person-id="personId" :record-id="recordId" :refresh="refresh" @open-person="id=>emit('open-person',id)" @open-record="id=>emit('open-record',id)" @back-to-person="emit('back-to-person')" /></template>
