import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseAccountCsv,accountCsvTemplate} from '../src/account-csv.ts'
test('account CSV accepts Excel UTF-8 BOM and quoted values without changing passwords',()=>{
  assert.deepEqual(parseAccountCsv(accountCsvTemplate+'a@example.cc,甲,," pass,word-123 "\r\n'),[{account:'a@example.cc',name:'甲',role:'导师',password:' pass,word-123 '}])
  assert.equal(parseAccountCsv(accountCsvTemplate+'a,甲,导师,"pass""word-123"')[0]?.password,'pass"word-123')
})
test('account CSV rejects malformed headers, quotes, rows and oversized batches',()=>{
  for(const value of ['账号,姓名\na,甲',accountCsvTemplate,accountCsvTemplate+'a,甲,教师',accountCsvTemplate+'a,甲,,"unclosed',accountCsvTemplate+'a,甲,,"password"extra',accountCsvTemplate+Array(501).fill('a,甲,,password-123').join('\n')])assert.throws(()=>parseAccountCsv(value))
})
