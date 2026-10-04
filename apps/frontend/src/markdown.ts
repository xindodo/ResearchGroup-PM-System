import { marked } from 'marked'
import DOMPurify from 'dompurify'
export function sanitizeContent(html:string){
  const clean=DOMPurify.sanitize(html,{
    ALLOWED_TAGS:['p','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','a','img','video','source'],
    ALLOWED_ATTR:['href','src','alt','title','controls','preload','playsinline','type','start','colspan','rowspan'],
  })
  return safeURLs(clean)
}
export function sanitizeEditor(html:string){
  return safeURLs(DOMPurify.sanitize(html,{ADD_TAGS:['video'],ADD_ATTR:['controls','preload','playsinline'],FORBID_TAGS:['iframe','object','embed','script','style'],FORBID_ATTR:['style']}))
}
function safeURLs(clean:string){
  const template=document.createElement('template');template.innerHTML=clean
  for(const el of template.content.querySelectorAll('[src],[href]')){
    const attr=el.hasAttribute('src')?'src':'href', value=el.getAttribute(attr) || ''
    const local=/^\/api\/files\/[\w-]+$/.test(value)
    const inlineImage=el.tagName==='IMG' && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)
    if(attr==='src' ? !local && !inlineImage : !local && !/^(https?:|mailto:|#)/i.test(value))el.removeAttribute(attr)
    if(el.tagName==='A'){el.setAttribute('rel','noopener noreferrer');el.setAttribute('target','_blank')}
  }
  for(const video of template.content.querySelectorAll('video')){video.setAttribute('controls','');video.setAttribute('preload','metadata');video.setAttribute('playsinline','')}
  return template.innerHTML
}
export const renderMarkdown=(value:string)=>sanitizeContent(marked.parse(value || '',{async:false,breaks:true,gfm:true}) as string)
export function markdownExcerpt(value:string){const template=document.createElement('template');template.innerHTML=renderMarkdown(value);return (template.content.textContent || '').replace(/\s+/g,' ').trim().slice(0,100)}
