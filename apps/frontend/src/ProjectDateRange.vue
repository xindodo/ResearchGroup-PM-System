<script setup lang="ts">
defineProps<{start?:string;end?:string}>()
</script>
<template><span class="project-date-range"><span>{{ start||'—' }}</span><span class="date-separator">/</span><span>{{ end||'—' }}</span></span></template>
<style scoped>
.project-date-range{display:inline-grid;grid-template-columns:10ch 1ch 10ch;align-items:center;column-gap:4px;white-space:nowrap;font-variant-numeric:tabular-nums}.date-separator{text-align:center}
</style>
