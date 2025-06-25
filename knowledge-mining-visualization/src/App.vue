<template>
  <div class="main-container">
    <el-header class="header">
      <div class="header-content">
        <h1 class="title">
          <el-icon><DataLine /></el-icon>
          湖泊知识挖掘可视化系统
        </h1>
        <nav class="nav-menu">
          <el-menu
            :default-active="$route.path"
            mode="horizontal"
            router
            class="nav-menu-items"
          >
            <el-menu-item index="/">
              <el-icon><House /></el-icon>
              概览
            </el-menu-item>
            <el-menu-item index="/lakes">
              <el-icon><Location /></el-icon>
              湖泊详情
            </el-menu-item>
            <el-menu-item index="/gazetteers">
              <el-icon><Document /></el-icon>
              方志文献
            </el-menu-item>            <el-menu-item index="/poems">
              <el-icon><Edit /></el-icon>
              诗词文学
            </el-menu-item>
            <el-menu-item index="/chat">
              <el-icon><ChatDotRound /></el-icon>
              智能问答
            </el-menu-item>
          </el-menu>
        </nav>
      </div>
    </el-header>

    <el-main class="main-content">
      <div class="content-wrapper">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </el-main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useNeo4jStore } from './stores/neo4j'

const neo4jStore = useNeo4jStore()

onMounted(async () => {
  await neo4jStore.init()
})
</script>

<style scoped>
.header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0;
  height: 80px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
}

.title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title .el-icon {
  font-size: 28px;
  color: #409eff;
}

.nav-menu-items {
  background: transparent;
  border: none;
}

.main-content {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
</style>
