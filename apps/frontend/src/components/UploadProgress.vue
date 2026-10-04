<script setup lang="ts">
import type { useUploadProgress } from '../uploadProgress'
defineProps<{ state: ReturnType<typeof useUploadProgress>['progress']; filePercent:number; totalPercent:number }>()
</script>
<template>
  <section v-if="state.count" class="upload-progress" aria-label="上传进度">
    <div class="progress-heading"><span class="filename" :title="state.name">{{ state.index }}/{{ state.count }} · {{ state.name }}</span><strong>{{ filePercent }}%</strong></div>
    <progress :value="filePercent" max="100" aria-label="当前文件上传进度"/>
    <template v-if="state.count > 1"><div class="progress-heading"><span>整体传输进度</span><strong>{{ totalPercent }}%</strong></div><progress :value="totalPercent" max="100" aria-label="整体上传进度"/></template>
    <p role="status" :class="{error:state.failed}">{{ state.message }}</p>
  </section>
</template>
<style scoped>
.upload-progress{margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:8px}.progress-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px}.filename{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.progress-heading strong{flex-shrink:0}progress{display:block;width:100%;height:12px;margin:6px 0;accent-color:#a4522e}.upload-progress p{margin:5px 0 0;font-size:13px}
</style>
