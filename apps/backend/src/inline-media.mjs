import { saveFiles } from './files.mjs';
export function inlineFileIds(value='') {
  return [...new Set(String(value).match(/\/api\/files\/[\w-]+/g) || [])].map(url=>url.split('/').pop());
}
export function bindInlineMedia(db,dir,entity,id,content,userId){
  return saveFiles(db,dir,entity,id,inlineFileIds(content).map(fileId=>({data:`/api/files/${fileId}`})),false,userId);
}
