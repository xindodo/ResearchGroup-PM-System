<script setup lang="ts">
defineProps<{tags:string[]}>()
</script>
<template><span v-if="tags.length" class="tag-pills"><span v-for="(tag,index) in tags" :key="index" class="tag-pill">{{ tag }}</span></span><span v-else>—</span></template>
<style scoped>.tag-pills{display:inline-flex;flex-wrap:wrap;gap:4px;vertical-align:middle}.tag-pill{display:inline-flex;align-items:center;padding:2px 6px;border:1px solid #e8ddd3;border-radius:999px;background:#fbf7f3;color:#735947;font-size:14px;line-height:1.3;overflow-wrap:anywhere}</style>
