<script setup lang="ts">
import { h, render, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Heading, Bold, Italic, Strikethrough, Minus, Quote, List, ListOrdered, Table, Link, Code, SquareCode, Ellipsis, Images, Video } from '@lucide/vue'
import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/i18n/zh-cn'
import { sanitizeEditor } from '../markdown'
import { uploadFile } from '../api'
import { useUploadProgress } from '../uploadProgress'
import UploadProgress from './UploadProgress.vue'
import MarkdownContent from './MarkdownContent.vue'
const props=withDefaults(defineProps<{modelValue:string;label:string;required?:boolean;maxlength?:number}>(),{maxlength:100000})
const emit=defineEmits<{ 'update:modelValue':[value:string]; busy:[value:boolean] }>()
const host=ref<HTMLElement>(), imagePicker=ref<HTMLInputElement>(), videoPicker=ref<HTMLInputElement>(), mode=ref('visual'), busy=ref(false), error=ref('')
const progressState=useUploadProgress(), {progress,filePercent,totalPercent}=progressState
let editor:Editor|undefined, disposed=false
// Keep Toast's commands/popups, replacing its bitmap sprites with app vector icons.
function toolbarIcons(){
  const icons={heading:Heading,bold:Bold,italic:Italic,strike:Strikethrough,hrline:Minus,quote:Quote,'bullet-list':List,'ordered-list':ListOrdered,table:Table,link:Link,code:Code,codeblock:SquareCode,more:Ellipsis}
  const container=document.createElement('span')
  for(const [name,icon] of Object.entries(icons)){
    render(h(icon,{size:18,color:'#292522','stroke-width':2}),container)
    host.value!.style.setProperty(`--editor-icon-${name}`,`url("data:image/svg+xml,${encodeURIComponent(container.innerHTML)}")`)
  }
  render(null,container)
}
// Toast UI serializes empty custom HTML blocks onto one line; expand videos before
// parsing again so CommonMark does not reinterpret them as unsupported inline HTML.
const editorMarkdown=(value:string)=>value.replace(/(<video\b[^>]*>)[\s\S]*?<\/video>/gi,'$1\n</video>')
function changed(){if(editor && mode.value==='visual')emit('update:modelValue',editor.getMarkdown())}
onMounted(()=>{
  toolbarIcons()
  editor=new Editor({el:host.value!,initialValue:editorMarkdown(props.modelValue || ''),initialEditType:'wysiwyg',hideModeSwitch:true,height:'320px',language:'zh-CN',usageStatistics:false,autofocus:false,
    toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol'],['table','link'],['code','codeblock']],
    customHTMLSanitizer:sanitizeEditor,
    customHTMLRenderer:{htmlBlock:{video(node){return [{type:'openTag',tagName:'video',outerNewLine:true,attributes:{src:node.attrs?.src || '',controls:'',preload:'metadata'}},{type:'closeTag',tagName:'video',outerNewLine:true}]}}},
    hooks:{addImageBlobHook:(blob,callback)=>{void insertFiles([blob instanceof File?blob:new File([blob],'粘贴图片.png',{type:blob.type})],callback)}},
    events:{change:changed},
  })
  const editable=host.value!.querySelector('.toastui-editor-ww-container [contenteditable=true]')
  editable?.setAttribute('role','textbox');editable?.setAttribute('aria-label',props.label);editable?.setAttribute('aria-multiline','true')
})
onBeforeUnmount(()=>{disposed=true;editor?.destroy()})
watch(()=>props.modelValue,value=>{if(editor && editor.getMarkdown()!==value)editor.setMarkdown(editorMarkdown(value || ''),false)})
async function switchMode(value:string){mode.value=value;await nextTick();if(value==='visual')editor?.setMarkdown(editorMarkdown(props.modelValue || ''),false)}
async function insertFiles(files:File[],callback?:(url:string,text?:string)=>void){
  if(!files.length || busy.value)return
  error.value='';busy.value=true;emit('busy',true);progressState.begin(files)
  try{
    for(const file of files){
      const image=/^image\/(png|jpeg|gif|webp)$/.test(file.type)
      if(!image && !/\.(mp4|webm)$/i.test(file.name))throw Error('支持 JPG、PNG、GIF、WebP 图片和 MP4、WebM 视频')
      progressState.next(file)
      const saved=await uploadFile(file,image,progressState.update)
      if(disposed)return
      if(!image && !saved.type.startsWith('video/'))throw Error('无法识别视频格式，请使用 MP4 或 WebM')
      if(callback)callback(saved.data,file.name)
      else{
        const fragment=image?`![图片](${saved.data})`:`<video src="${saved.data}" controls>\n</video>`
        const value=(editor?.getMarkdown() || props.modelValue || '')+'\n\n'+fragment+'\n'
        emit('update:modelValue',value);editor?.setMarkdown(editorMarkdown(value),false)
      }
    }
    progressState.finish('已插入，请保存当前内容')
  }catch(e){progressState.fail();error.value=(e as Error).message}
  finally{busy.value=false;emit('busy',false)}
}
function selected(event:Event){const el=event.target as HTMLInputElement;const files=Array.from(el.files || []);el.value='';void insertFiles(files)}
</script>
<template>
  <div class="markdown-editor" :data-label="label">
    <div class="markdown-label">{{label}}{{required?' *':''}}</div>
    <div class="markdown-tools">
      <button v-for="item in [['visual','可视化'],['source','Markdown'],['preview','预览']]" :key="item[0]" type="button" :aria-pressed="mode===item[0]" @click="switchMode(item[0]!)">{{item[1]}}</button>
      <div v-if="mode!=='visual'" class="editor-media-actions">
        <button class="editor-media-button" type="button" :disabled="busy" aria-label="插入图片" title="插入图片" @click="imagePicker?.click()"><Images :size="18" aria-hidden="true"/></button>
        <button class="editor-media-button" type="button" :disabled="busy" aria-label="插入视频" title="插入视频" @click="videoPicker?.click()"><Video :size="18" aria-hidden="true"/></button>
      </div>
      <input ref="imagePicker" hidden type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" aria-label="选择图片文件" @change="selected">
      <input ref="videoPicker" hidden type="file" multiple accept="video/mp4,video/webm" aria-label="选择视频文件" @change="selected">
    </div>
    <div class="editor-visual-pane" :class="{'editor-collapsed':mode!=='visual'}" :inert="mode!=='visual'">
      <div ref="host"></div>
      <div class="editor-media-actions editor-toolbar-media">
        <button class="editor-media-button" type="button" :disabled="busy" aria-label="插入图片" title="插入图片" @click="imagePicker?.click()"><Images :size="18" aria-hidden="true"/></button>
        <button class="editor-media-button" type="button" :disabled="busy" aria-label="插入视频" title="插入视频" @click="videoPicker?.click()"><Video :size="18" aria-hidden="true"/></button>
      </div>
    </div>
    <textarea v-if="mode==='source'" :aria-label="label" :value="modelValue" :maxlength="maxlength" :required="required" rows="10" @input="emit('update:modelValue',($event.target as HTMLTextAreaElement).value)"></textarea>
    <MarkdownContent v-if="mode==='preview'" :value="modelValue || '暂无内容'"/>
    <small>支持 Markdown。图片／视频每个不超过500MB，上传后请保存；视频支持 MP4、WebM。</small>
    <UploadProgress :state="progress" :file-percent="filePercent" :total-percent="totalPercent"/>
    <p v-if="error" role="alert" class="error">{{error}}</p>
    <p v-if="modelValue.length>maxlength" role="alert" class="error">内容不能超过{{maxlength}}字</p>
  </div>
</template>
<style>
.markdown-editor{min-width:0;width:100%}.markdown-label{margin-bottom:6px}.markdown-tools{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}
.markdown-editor .editor-collapsed{height:0;overflow:hidden;visibility:hidden;pointer-events:none}
.markdown-tools [aria-pressed=true]{color:var(--accent);border-color:var(--accent)}.markdown-editor>textarea{width:100%;font-family:monospace}
.markdown-editor .toastui-editor-defaultUI{border-color:var(--line);border-radius:6px;overflow:hidden}.markdown-editor .toastui-editor-contents{font-size:14px;color:#292522;font-family:inherit}
.markdown-editor .toastui-editor-toolbar{height:auto;flex-wrap:wrap}.markdown-editor .toastui-editor-defaultUI-toolbar{flex-wrap:wrap;height:auto;padding:3px}
.markdown-editor .toastui-editor-toolbar-icons{min-height:0;padding:0}.markdown-editor .toastui-editor-contents video{max-width:100%}
.markdown-editor>small{display:block;margin-top:6px}.markdown-editor>.markdown-content{padding:10px;border:1px solid var(--line);min-height:144px}
.markdown-editor .editor-visual-pane{position:relative}
.markdown-editor .toastui-editor-defaultUI-toolbar{background:#f7f6f3;align-items:center;padding:2px 4px;margin-right:70px;flex-wrap:nowrap;height:37px}
.markdown-editor .toastui-editor-toolbar{background:#f7f6f3;height:37px;border-bottom:1px solid var(--line)}
.markdown-editor .editor-toolbar-media{position:absolute;top:4px;right:5px}
.markdown-editor .editor-media-actions{display:flex;align-items:center;flex-shrink:0}
.markdown-editor .toastui-editor-defaultUI-toolbar button,.markdown-editor .editor-media-button{width:30px;height:30px;min-height:30px;min-width:30px;margin:0 1px;padding:0;border:1px solid transparent;border-radius:4px;color:#292522;background-color:transparent}
.markdown-editor .toastui-editor-toolbar-divider{height:16px;margin:0 4px;align-self:center;background:var(--line)}
.markdown-editor .toastui-editor-toolbar-icons{background-position:center!important;background-size:18px 18px!important;background-repeat:no-repeat}
.markdown-editor .toastui-editor-toolbar-icons.heading{background-image:var(--editor-icon-heading)}
.markdown-editor .toastui-editor-toolbar-icons.bold{background-image:var(--editor-icon-bold)}
.markdown-editor .toastui-editor-toolbar-icons.italic{background-image:var(--editor-icon-italic)}
.markdown-editor .toastui-editor-toolbar-icons.strike{background-image:var(--editor-icon-strike)}
.markdown-editor .toastui-editor-toolbar-icons.hrline{background-image:var(--editor-icon-hrline)}
.markdown-editor .toastui-editor-toolbar-icons.quote{background-image:var(--editor-icon-quote)}
.markdown-editor .toastui-editor-toolbar-icons.bullet-list{background-image:var(--editor-icon-bullet-list)}
.markdown-editor .toastui-editor-toolbar-icons.ordered-list{background-image:var(--editor-icon-ordered-list)}
.markdown-editor .toastui-editor-toolbar-icons.table{background-image:var(--editor-icon-table)}
.markdown-editor .toastui-editor-toolbar-icons.link{background-image:var(--editor-icon-link)}
.markdown-editor .toastui-editor-toolbar-icons.code{background-image:var(--editor-icon-code)}
.markdown-editor .toastui-editor-toolbar-icons.codeblock{background-image:var(--editor-icon-codeblock)}
.markdown-editor .toastui-editor-toolbar-icons.more{background-image:var(--editor-icon-more)}
.markdown-editor .editor-media-button:hover{background-color:var(--peach);border-color:var(--line)}
.markdown-editor .editor-media-button svg{width:18px;height:18px;flex-shrink:0}
.markdown-editor .markdown-tools{align-items:center}
@media(pointer:coarse){.markdown-editor .toastui-editor-defaultUI-toolbar button,.markdown-editor .editor-media-button{width:44px;height:44px;min-width:44px;min-height:37px}}
@media(pointer:coarse){.markdown-editor .toastui-editor-defaultUI-toolbar{margin-right:98px;height:51px}.markdown-editor .toastui-editor-toolbar{height:51px}}
</style>
