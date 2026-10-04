import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ProjectSystem from './ProjectSystem.vue'
import './project-preview.css'
import './project-detail-preview.css'
import './project-list-preview.css'
import './project-workbench-preview.css'
import './project-milestones-preview.css'
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]})
createApp(ProjectSystem).use(router).mount('#app')
