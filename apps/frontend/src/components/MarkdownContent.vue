<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../markdown'
const props=defineProps<{value:string}>()
const html=computed(()=>renderMarkdown(props.value))
</script>
<template><div class="markdown-content" v-html="html"></div></template>
<style>
.markdown-content{line-height:1.8;overflow-wrap:anywhere;min-width:0;color:var(--text)}
.markdown-content p{margin:6px 0}.markdown-content h1,.markdown-content h2,.markdown-content h3{margin:13px 0 6px}
.markdown-content ul,.markdown-content ol{padding-left:19px}.markdown-content li{margin:3px 0}
.markdown-content img,.markdown-content video{display:block;max-width:100%;max-height:600px;height:auto;margin:10px 0;border-radius:6px}
.markdown-content video{width:100%;background:#151515}.markdown-content a{color:var(--accent);text-decoration:underline}
.markdown-content pre{overflow:auto;padding:10px;background:#f4f1ed;border-radius:6px;white-space:pre}
.markdown-content blockquote{margin:10px 0;padding:3px 11px;border-left:3px solid var(--accent);background:#faf8f5}
.markdown-content table{display:block;overflow:auto;max-width:100%}.markdown-content th,.markdown-content td{border:1px solid var(--line);padding:5px 8px}
</style>
