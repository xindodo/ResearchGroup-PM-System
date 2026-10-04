<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { notify } from '../store'
const emit=defineEmits<{close:[]}>(), dialog=ref<HTMLDialogElement>(), current=ref(''),password=ref(''),confirm=ref(''),error=ref(''),busy=ref(false)
onMounted(()=>dialog.value?.showModal())
async function save(){error.value='';if(password.value!==confirm.value){error.value='两次新密码不一致';return}busy.value=true;try{await api('/password','POST',{current:current.value,password:password.value});notify('密码已修改，其他登录会话已退出');emit('close')}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
</script>
<template><dialog ref="dialog" class="editor" aria-label="修改密码" @cancel.prevent="emit('close')"><form @submit.prevent="save"><header class="dialog-heading"><h2>修改密码</h2></header><div class="dialog-body form-grid"><label class="span-two">当前密码<input v-model="current" type="password" autocomplete="current-password" required></label><label>新密码<input v-model="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128"></label><label>确认新密码<input v-model="confirm" type="password" autocomplete="new-password" required minlength="10" maxlength="128"></label><p class="error span-two" v-if="error" role="alert">{{error}}</p></div><footer class="dialog-footer"><button type="button" @click="emit('close')">取消</button><button class="primary" :disabled="busy">保存密码</button></footer></form></dialog></template>
