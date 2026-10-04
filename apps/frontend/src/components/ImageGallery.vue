<script setup lang="ts">
import UploadProgress from './UploadProgress.vue'
import { useUploadProgress } from '../uploadProgress'
const uploadState = useUploadProgress()
const { progress, filePercent, totalPercent } = uploadState
import { computed, ref } from 'vue'
import { uploadFile } from '../api'
import { Upload, Download, X, Trash2 } from '@lucide/vue'
import { type Attachment } from '../data'

const props = defineProps<{ images: Attachment[]; saveImages: (images: Attachment[]) => boolean | Promise<boolean>; readonly?: boolean }>()
const images = computed(() => props.images)
const busy = ref(false)
const error = ref('')
const viewer = ref<HTMLDialogElement>()
const selected = ref<Attachment | null>(null)
const zoom = ref(false)
async function upload(event: Event) {
  if (props.readonly) return
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  uploadState.begin(files)
  error.value = ''; busy.value = true
  try {
    const additions: Attachment[] = []
    for (const file of files) {
      uploadState.next(file)
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片。')
      if (file.size > 500 * 1024 * 1024) throw new Error('每张图片不超过500MB。')
      const previewUrl = URL.createObjectURL(file)
      try {
        await new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error(`“${file.name}”无法识别为有效图片。`));img.src=previewUrl})
      } finally { URL.revokeObjectURL(previewUrl) }
      additions.push(await uploadFile(file, true, uploadState.update))
    }
    uploadState.finish('全部传输完成，正在保存图片…')
    if (!await props.saveImages([...images.value, ...additions])) throw new Error('图片保存失败，请刷新后重试。')
    uploadState.finish('图片上传并保存成功')
  } catch (e) { uploadState.fail(); error.value = (e as Error).message }
  finally { input.value = ''; busy.value = false }
}
function open(image: Attachment) { selected.value = image; zoom.value = false; viewer.value?.showModal() }
async function remove(index: number) {
  if (props.readonly) return
  if (!window.confirm('确定移除这张相关图片吗？')) return
  await props.saveImages(images.value.filter((_, i) => i !== index))
}
</script>

<template>
  <section class="panel related-images" aria-label="相关图片">
    <header class="panel-heading"><h2>相关图片 <small>{{ images.length }} 张</small></h2><label v-if="!readonly" class="button image-upload"><Upload :size="16"/>{{ busy ? '上传中…' : '上传图片' }}<input aria-label="上传相关图片" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple :disabled="busy" @change="upload"></label></header>
    <p class="muted">支持 JPG、PNG、WebP、GIF，每张不超过500MB，数量不限；点击图片可放大和下载。</p>
    <UploadProgress :state="progress" :file-percent="filePercent" :total-percent="totalPercent"/>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="images.length" class="image-grid">
      <figure v-for="(image, i) in images" :key="i" class="image-tile">
        <button class="image-thumbnail" :aria-label="`放大${image.name}`" @click="open(image)"><img :src="image.data" :alt="image.name" loading="lazy"></button>
        <figcaption><span :title="image.name">{{ image.name }}</span><a :href="image.data" :download="image.name" class="icon-button" :aria-label="`下载${image.name}`"><Download :size="16"/></a><button v-if="!readonly" class="icon-button" :aria-label="`移除图片${image.name}`" :disabled="busy" @click="remove(i)"><Trash2 :size="16"/></button></figcaption>
      </figure>
    </div>
    <p v-else class="quiet-empty">暂无相关图片</p>
  </section>
  <dialog ref="viewer" class="image-viewer" aria-label="图片预览" @click="($event.target === viewer) && viewer?.close()">
    <template v-if="selected">
      <header class="dialog-heading"><h2>{{ selected.name }}</h2><div class="inline"><button @click="zoom = !zoom">{{ zoom ? '适应窗口' : '查看原图' }}</button><a class="button" :href="selected.data" :download="selected.name"><Download :size="16"/>下载图片</a><button aria-label="关闭图片预览" class="icon-button" @click="viewer?.close()"><X :size="22"/></button></div></header>
      <div class="image-stage" :class="{ zoom }"><img :src="selected.data" :alt="selected.name"></div>
    </template>
  </dialog>
</template>
