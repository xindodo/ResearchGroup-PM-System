export type ImportAccount = {account:string;name:string;role:string;password:string}
export function parseAccountCsv(input:string):ImportAccount[] {
  const text=input.replace(/^\uFEFF/,''), rows:string[][]=[]
  let row:string[]=[], field='', quoted=false, closed=false
  for(let i=0;i<text.length;i++){
    const c=text[i]
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
    if(c==='"'){if(field||closed)throw Error('CSV引号格式不正确');quoted=true;continue}
    if(c===','||c==='\n'||c==='\r'){
      row.push(field);field='';closed=false
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[]}
    }else{if(closed)throw Error('CSV引号后只能是分隔符或换行');field+=c}
  }
  if(quoted)throw Error('CSV引号未闭合')
  row.push(field);if(row.some(v=>v.trim()))rows.push(row)
  const header=rows.shift()?.map(v=>v.trim())
  if(!header||header.join(',')!=='账号,姓名,角色,初始密码')throw Error('请使用下载的模板，表头须为：账号、姓名、角色、初始密码')
  if(!rows.length||rows.length>500)throw Error('每次请导入1至500个账号')
  return rows.map((r,i)=>{if(r.length!==4)throw Error(`第${i+2}行应有4列`);return {account:r[0]!.trim(),name:r[1]!.trim(),role:r[2]!.trim()||'导师',password:r[3]!}})
}
export const accountCsvTemplate='\uFEFF账号,姓名,角色,初始密码\r\n'
