<template>
  <el-card v-if="showStatus" class="cache-status-card" shadow="never">
    <div class="cache-status">
      <div class="status-item">
        <el-icon><Coin /></el-icon>
        <span>缓存状态: {{ cacheInfo.initialized ? '已加载' : '未加载' }}</span>
      </div>
      <div v-if="cacheInfo.lastUpdated" class="status-item">
        <el-icon><Clock /></el-icon>
        <span>更新时间: {{ formatTime(cacheInfo.lastUpdated) }}</span>
      </div>
      <div class="status-item">
        <el-icon><Connection /></el-icon>
        <span>连接状态: {{ neo4jStore.connected ? '已连接' : '未连接' }}</span>
      </div>
      <div class="actions">
        <el-button 
          size="small" 
          type="text" 
          @click="refreshCache"
          :loading="neo4jStore.loading"
        >
          刷新缓存
        </el-button>
        <el-button 
          size="small" 
          type="text" 
          @click="showDetails = !showDetails"
        >
          {{ showDetails ? '隐藏' : '详情' }}
        </el-button>
      </div>
    </div>
    
    <div v-if="showDetails" class="cache-details">
      <h4>缓存详情</h4>
      <ul>
        <li v-for="(value, key) in cacheInfo.dataTypes" :key="key">
          {{ formatDataType(key) }}: {{ value ? '✓' : '✗' }}
          <span v-if="key === 'lakeDetailsCount' && value"> ({{ value }} 条)</span>
        </li>
      </ul>
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNeo4jStore } from '../stores/neo4j'
import { Coin, Clock, Connection } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const neo4jStore = useNeo4jStore()
const showDetails = ref(false)
const showStatus = computed(() => props.show)

const cacheInfo = computed(() => neo4jStore.getCacheInfo())

const formatTime = (date) => {
  return new Date(date).toLocaleString('zh-CN')
}

const formatDataType = (key) => {
  const typeMap = {
    overallStats: '总体统计',
    lakeStats: '湖泊统计',
    allLakes: '所有湖泊',
    allGazetteers: '所有方志',
    allPoems: '所有诗词',
    locationDistribution: '地理分布',
    lakeDetailsCount: '湖泊详情'
  }
  return typeMap[key] || key
}

const refreshCache = async () => {
  try {
    await neo4jStore.refreshData()
    ElMessage.success('缓存刷新完成')
  } catch (error) {
    ElMessage.error('缓存刷新失败')
  }
}
</script>

<style scoped>
.cache-status-card {
  position: fixed;
  top: 100px;
  right: 20px;
  width: 300px;
  z-index: 1000;
  border: 1px solid #e4e7ed;
}

.cache-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #606266;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.cache-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.cache-details h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #303133;
}

.cache-details ul {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 11px;
  color: #606266;
}

.cache-details li {
  margin-bottom: 4px;
}
</style>
