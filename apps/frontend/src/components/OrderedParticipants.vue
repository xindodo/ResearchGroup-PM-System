<script setup lang="ts">
import { people } from '../data'
const names = defineModel<string[]>({ required: true })
function update(index: number, value: string) { names.value = names.value.map((name, i) => i === index ? value : name) }
function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= names.value.length) return
  const next = [...names.value]; [next[index], next[target]] = [next[target]!, next[index]!]; names.value = next
}
</script>

<template>
  <fieldset class="ordered-participants span-two">
    <legend>参与人员（按署名顺序）</legend>
    <p class="muted">每行一人，可选择已有人员或直接填写姓名；使用上移、下移调整顺序。</p>
    <div v-for="(name, index) in names" :key="index" class="ordered-person-row">
      <span class="person-rank">{{ index + 1 }}</span>
      <select :aria-label="`第${index + 1}位选择已有人员`" :value="people.includes(name) ? name : ''" @change="update(index, ($event.target as HTMLSelectElement).value)"><option value="" disabled>选择已有人员</option><option v-for="person in people" :key="person">{{ person }}</option></select>
      <input :aria-label="`第${index + 1}位姓名`" :value="name" placeholder="或手动填写姓名" maxlength="100" @input="update(index, ($event.target as HTMLInputElement).value)">
      <div class="ordered-person-actions"><button type="button" :aria-label="`上移第${index + 1}位`" :disabled="index === 0" @click="move(index, -1)">上移</button><button type="button" :aria-label="`下移第${index + 1}位`" :disabled="index === names.length - 1" @click="move(index, 1)">下移</button><button type="button" :aria-label="`删除第${index + 1}位`" @click="names = names.filter((_, i) => i !== index)">删除</button></div>
    </div>
    <p v-if="!names.length" class="muted">暂未添加参与人员</p>
    <button type="button" @click="names = [...names, '']">添加参与人员</button>
  </fieldset>
</template>

<style scoped>
.ordered-participants{margin:0;border:1px solid var(--line);border-radius:6px;padding:10px;min-width:0}
legend{padding:0 5px}.ordered-participants p{margin:0 0 8px;font-size:13px}
.ordered-person-row{display:grid;grid-template-columns:24px minmax(120px,1fr) minmax(120px,1.2fr) auto;align-items:center;gap:6px;margin-bottom:6px}
.ordered-person-row input,.ordered-person-row select{width:100%;min-width:0}.person-rank{font-weight:600;text-align:center}
.ordered-person-actions{display:flex;gap:3px}.ordered-person-actions button{padding:5px 6px;white-space:nowrap}
@media(max-width:700px){.ordered-person-row{grid-template-columns:24px minmax(0,1fr)}.ordered-person-row input,.ordered-person-actions{grid-column:2}.ordered-person-actions{flex-wrap:wrap}}
</style>
