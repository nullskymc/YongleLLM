import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Lakes from '../views/Lakes.vue'
import Gazetteers from '../views/Gazetteers.vue'
import Poems from '../views/Poems.vue'
import Chat from '../views/Chat.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard,
    meta: { title: '概览' }
  },
  {
    path: '/lakes',
    name: 'Lakes',
    component: Lakes,
    meta: { title: '湖泊详情' }
  },
  {
    path: '/gazetteers',
    name: 'Gazetteers',
    component: Gazetteers,
    meta: { title: '方志文献' }
  },  {
    path: '/poems',
    name: 'Poems',
    component: Poems,
    meta: { title: '诗词文学' }
  },
  {
    path: '/chat',
    name: 'Chat',
    component: Chat,
    meta: { title: '智能问答' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title} - 湖泊知识挖掘可视化系统`
  next()
})

export default router
