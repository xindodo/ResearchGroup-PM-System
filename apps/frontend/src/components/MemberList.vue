<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, SlidersHorizontal } from '@lucide/vue'
import { descendingDate } from '../dateOrder'
import { personnel, type PersonProfile } from '../personnel'
import { memberTypes } from '../data'
defineProps<{ standalone?: boolean }>()
const emit = defineEmits<{ 'open-person': [person: PersonProfile] }>()
const query = ref(''), direction = ref(''), type = ref('')
const ascending = ref(false)
const listedPersonnel = computed(() => personnel.value.filter(p => !['系统管理员','只读访客'].includes(p.role || '')))
const directions = computed(() => [...new Set(listedPersonnel.value.map(p => p.direction).filter(Boolean))])
const filtered = computed(() => {
  const result = listedPersonnel.value.filter(m => (!query.value.trim() || m.name.includes(query.value.trim())) && (!direction.value || m.direction === direction.value) && (!type.value || m.type === type.value))
  return ascending.value ? result.sort((a, b) => a.name.localeCompare(b.name, 'zh')) : result.sort((a,b)=>descendingDate(a.createdAt,b.createdAt))
})
function clear() { query.value = ''; direction.value = ''; type.value = '' }
</script>
<template>
  <div class="page-heading"><h1>人员信息</h1></div>
  <div class="filter-row">
    <label class="search-input"><Search :size="18"/><input v-model="query" aria-label="搜索人员姓名" placeholder="搜索人员姓名"></label>
    <select v-model="type" aria-label="成员类型筛选"><option value="">成员类型</option><option v-for="t in memberTypes" :key="t">{{t}}</option></select>
    <select v-model="direction" aria-label="研究方向筛选"><option value="">研究方向</option><option v-for="item in directions" :key="item">{{ item }}</option></select>
    <span class="live-filter"><SlidersHorizontal :size="15"/>即时筛选</span><button class="text-button" @click="clear">清空</button>
  </div>
  <section class="panel list-panel">
    <header class="panel-heading"><div class="inline"><h2>人员列表</h2><span class="muted">共 {{ filtered.length }} 人</span></div><button class="subtle-button" @click="ascending = !ascending">{{ ascending ? '姓名 ↑' : '默认排序' }}</button></header>
    <div class="table-scroll"><table class="records-table" aria-label="人员列表">
      <thead><tr><th class="title-column"><button class="sort-button" @click="ascending = !ascending">姓名 <span>↕</span></button></th><th>成员类型</th><th>研究方向</th><th class="operation-column">操作</th></tr></thead>
      <tbody><tr v-for="m in filtered" :key="m.id || m.name"><td><button v-if="standalone" class="record-link" @click="emit('open-person',m)">{{ m.name }}</button><RouterLink v-else class="record-link" :to="`/members/${encodeURIComponent(m.name)}`">{{ m.name }}</RouterLink></td><td>{{ m.type }}</td><td>{{ m.direction }}</td><td><button v-if="standalone" class="button outline-small" :aria-label="`查看${m.name}`" @click="emit('open-person',m)">查看</button><RouterLink v-else class="button outline-small" :aria-label="`查看${m.name}`" :to="`/members/${encodeURIComponent(m.name)}`">查看</RouterLink></td></tr></tbody>
    </table></div>
    <div v-if="!filtered.length" class="empty-state"><Search :size="36"/><h3>没有找到匹配的人员</h3><p>试试其他关键词，或清空筛选条件。</p><button @click="clear">清空筛选</button></div>
  </section>
</template>
