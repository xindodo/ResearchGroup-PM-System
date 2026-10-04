import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { compileStyle } from '@vue/compiler-sfc'

// Scope personnel module styles to its container.
const personnelStyles = {
  name: 'personnel-style-scope', enforce: 'pre' as const,
  transform(source:string,id:string) {
    if (!id.endsWith('style.css?personnel-scope')) return
    const result=compileStyle({source,filename:id,id:'personnel-style-scope',scoped:false,postcssPlugins:[{
      postcssPlugin:'personnel-style-scope',
      Rule(rule:{selectors:string[];parent?:{type:string;name?:string;parent?:any}}) {
        for(let parent=rule.parent;parent;parent=parent.parent) if(parent.type==='atrule' && parent.name?.endsWith('keyframes')) return
        rule.selectors=rule.selectors.map(selector=>selector===':root'||selector==='body' ? '.project-personnel' : `.project-personnel ${selector}`)
      },
    }]})
    if(result.errors.length) throw result.errors[0]
    return result.code
  },
}

export default defineConfig(({ mode }) => ({ plugins: [personnelStyles,vue()], base: './', build: { rollupOptions: { input: { main: 'index.html', project: 'project-system.html' } } }, server: { proxy: { '/api': loadEnv(mode,'.','JTGC_').JTGC_API_TARGET || 'http://127.0.0.1:5180' } } }))
