import { createExcel, downloadWorkbook } from './excel'
export type ImportAccount={account:string;name:string;role:string;password:string}
const headers=['账号','姓名','角色','初始密码']
export async function downloadAccountTemplate() {
  const workbook=await createExcel([headers],'账号导入')
  const sheet=workbook.getWorksheet('账号导入')!
  sheet.columns.forEach(column=>{column.numFmt='@';column.width=24})
  for(let row=2;row<=501;row++)sheet.getCell(row,3).dataValidation={type:'list',allowBlank:true,formulae:['"系统管理员,导师,学生,只读访客"']}
  const notes=workbook.addWorksheet('填写说明')
  notes.addRows([['填写说明'],['在“账号导入”工作表填写，每次最多500个账号。'],['账号、姓名、初始密码必填；角色留空默认为导师。'],['密码长度10至128位；账号和密码列保持文本格式。'],['已有账号不会被覆盖。请保持四列表头不变。']]);notes.getColumn(1).width=80
  await downloadWorkbook('账号批量导入模板.xlsx',workbook)
}
export async function parseAccountExcel(bytes:ArrayBuffer):Promise<ImportAccount[]> {
  const { default:ExcelJS }=await import('exceljs')
  const workbook=new ExcelJS.Workbook()
  try{await workbook.xlsx.load(bytes)}catch{throw Error('无法读取Excel文件，请使用下载的.xlsx模板')}
  const sheet=workbook.getWorksheet('账号导入')||workbook.worksheets[0]
  if(!sheet)throw Error('Excel文件没有工作表')
  function cell(row:number,column:number):string {
    const value=sheet!.getCell(row,column).value
    if(value==null)return ''
    if(typeof value==='string')return value
    if(typeof value==='number'&&column!==4)return String(value)
    throw Error(`第${row}行第${column}列须为文本，不能使用公式；密码请按文本填写`)
  }
  if(headers.some((header,index)=>cell(1,index+1).trim()!==header)||sheet.getRow(1).actualCellCount!==4)throw Error('请使用下载的模板，表头须为：账号、姓名、角色、初始密码')
  const rows:ImportAccount[]=[]
  sheet.eachRow((row,index)=>{
    if(index===1||!row.hasValues)return
    const values=[1,2,3,4].map(column=>cell(index,column))
    if(!values.some(value=>value.trim()))return
    if(row.cellCount>4)throw Error(`第${index}行应有4列`)
    rows.push({account:values[0]!.trim(),name:values[1]!.trim(),role:values[2]!.trim()||'导师',password:values[3]!})
  })
  if(!rows.length||rows.length>500)throw Error('每次请导入1至500个账号')
  return rows
}
