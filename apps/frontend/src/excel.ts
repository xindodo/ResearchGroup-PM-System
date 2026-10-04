export async function createExcel(rows:unknown[][], sheetName='数据') {
  const { default: ExcelJS } = await import('exceljs')
  const workbook=new ExcelJS.Workbook()
  const sheet=workbook.addWorksheet(sheetName)
  for(const row of rows)sheet.addRow(row.map(value=>typeof value==='number'||typeof value==='boolean'?value:String(value??'')))
  sheet.views=[{state:'frozen',ySplit:1}]
  sheet.getRow(1).font={bold:true}
  if(rows[0]?.length)sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:rows[0].length}}
  sheet.columns.forEach((column,index)=>{column.width=Math.min(48,Math.max(16,...rows.slice(0,100).map(row=>String(row[index]??'').length*1.5+2)))})
  return workbook
}
export async function downloadExcel(filename:string, rows:unknown[][], sheetName='数据') {
  const workbook=await createExcel(rows,sheetName)
  await downloadWorkbook(filename,workbook)
}
export async function downloadWorkbook(filename:string, workbook:import('exceljs').Workbook) {
  const bytes=await workbook.xlsx.writeBuffer()
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
  const link=document.createElement('a');link.href=url;link.download=filename;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
