<template>
  <div class="dashboard">
    <div class="page-header">
      <div class="header-content">
        <div>
          <h2>
            <el-icon><DataLine /></el-icon>
            数据概览
          </h2>
          <p>湖泊知识挖掘系统总体统计信息</p>
        </div>
        <div class="header-actions">
          <el-button 
            type="primary" 
            :icon="Refresh" 
            @click="refreshData"
            :loading="loading"
          >
            刷新数据
          </el-button>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="24" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6" v-for="stat in stats" :key="stat.key">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-icon">
              <el-icon><component :is="stat.icon" /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-number">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="24" class="charts-row">
      <!-- 湖泊热度排行榜 -->
      <el-col :xs="24" :lg="12">
        <div class="chart-container">
          <div class="chart-header">
            <h3>湖泊热度排行榜</h3>
            <p>按总提及次数排序</p>
          </div>
          <v-chart
            class="chart"
            :option="lakePopularityOption"
            :loading="loading"
            style="height: 400px"
          />
        </div>
      </el-col>

      <!-- 地理分布 -->
      <el-col :xs="24" :lg="12">
        <div class="chart-container">
          <div class="chart-header">
            <h3>地理分布统计</h3>
            <p>各地区湖泊数量分布</p>
          </div>
          <v-chart
            class="chart"
            :option="locationDistributionOption"
            :loading="loading"
            style="height: 400px"
          />
        </div>
      </el-col>
    </el-row>

    <!-- 方志诗词对比 -->
    <el-row :gutter="24">
      <el-col :span="24">
        <div class="chart-container">
          <div class="chart-header">
            <h3>方志与诗词提及对比</h3>
            <p>各湖泊在方志和诗词中的提及次数对比</p>
          </div>
          <v-chart
            class="chart"
            :option="comparisonOption"
            :loading="loading"
            style="height: 500px"
          />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useNeo4jStore } from '../stores/neo4j'
import { ElMessage } from 'element-plus'
import { DataLine, Location, Document, Edit, MapLocation, Refresh } from '@element-plus/icons-vue'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const neo4jStore = useNeo4jStore()
const loading = ref(false)
const overallStats = ref({})
const lakeStats = ref([])
const locationStats = ref([])

const stats = computed(() => [
  {
    key: 'lakes',
    label: '湖泊总数',
    value: overallStats.value.lake_count || 0,
    icon: 'Location'
  },
  {
    key: 'gazetteers',
    label: '方志文献',
    value: overallStats.value.gazetteer_count || 0,
    icon: 'Document'
  },
  {
    key: 'poems',
    label: '诗词作品',
    value: overallStats.value.poem_count || 0,
    icon: 'Edit'
  },
  {
    key: 'locations',
    label: '地理位置',
    value: overallStats.value.location_count || 0,
    icon: 'MapLocation'
  }
])

// 湖泊热度图表配置
const lakePopularityOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'shadow'
    },
    formatter: (params) => {
      const data = params[0]
      return `${data.name}<br/>总热度: ${data.value}<br/>方志: ${data.data.gazetteer_count}<br/>诗词: ${data.data.poem_count}`
    }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: lakeStats.value.slice(0, 10).map(item => item.lake_name),
    axisLabel: {
      rotate: 45
    }
  },
  yAxis: {
    type: 'value',
    name: '提及次数'
  },
  series: [
    {
      name: '总热度',
      type: 'bar',
      data: lakeStats.value.slice(0, 10).map(item => ({
        value: item.total_mentions,
        gazetteer_count: item.gazetteer_count,
        poem_count: item.poem_count
      })),
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0, color: '#667eea'
          }, {
            offset: 1, color: '#764ba2'
          }]
        }
      }
    }
  ]
}))

// 地理分布图表配置
const locationDistributionOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: '{a} <br/>{b} : {c} ({d}%)'
  },
  legend: {
    orient: 'vertical',
    left: 'left'
  },
  series: [
    {
      name: '湖泊分布',
      type: 'pie',
      radius: '50%',
      data: locationStats.value.slice(0, 10).map(item => ({
        value: item.lake_count,
        name: item.location
      })),
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }
  ]
}))

// 方志诗词对比图表配置
const comparisonOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross'
    }
  },
  legend: {
    data: ['方志提及', '诗词提及']
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: lakeStats.value.slice(0, 15).map(item => item.lake_name),
    axisLabel: {
      rotate: 45
    }
  },
  yAxis: {
    type: 'value',
    name: '提及次数'
  },
  series: [
    {
      name: '方志提及',
      type: 'bar',
      data: lakeStats.value.slice(0, 15).map(item => item.gazetteer_count),
      itemStyle: {
        color: '#409eff'
      }
    },
    {
      name: '诗词提及',
      type: 'bar',
      data: lakeStats.value.slice(0, 15).map(item => item.poem_count),
      itemStyle: {
        color: '#67c23a'
      }
    }
  ]
}))

const loadData = async () => {
  try {
    loading.value = true
    
    // 等待全局初始化完成，然后直接从缓存获取数据
    const initialized = await neo4jStore.waitForInitialization()
    
    if (!initialized) {
      throw new Error('初始化失败')
    }

    // 直接从缓存获取数据，避免重复查询
    overallStats.value = neo4jStore.cache.overallStats || {}
    lakeStats.value = neo4jStore.cache.lakeStats || []
    locationStats.value = neo4jStore.cache.locationDistribution || []

    console.log('Dashboard数据加载完成，使用缓存:', {
      stats: !!overallStats.value,
      lakes: lakeStats.value.length,
      locations: locationStats.value.length
    })

  } catch (error) {
    console.error('加载数据失败:', error)
    ElMessage.error('加载数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

// 刷新数据的方法
const refreshData = async () => {
  try {
    loading.value = true
    ElMessage.info('正在刷新数据...')
    
    // 刷新所有数据
    const success = await neo4jStore.refreshData()
    
    if (success) {
      // 重新获取缓存数据
      overallStats.value = neo4jStore.cache.overallStats || {}
      lakeStats.value = neo4jStore.cache.lakeStats || []
      locationStats.value = neo4jStore.cache.locationDistribution || []
      
      ElMessage.success('数据刷新完成')
    } else {
      ElMessage.error('数据刷新失败')
    }
  } catch (error) {
    console.error('刷新数据失败:', error)
    ElMessage.error('刷新数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard {
  padding: 24px;
}

.page-header {
  margin-bottom: 32px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 28px;
  color: #303133;
  margin-bottom: 8px;
}

.page-header p {
  color: #606266;
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.stats-row {
  margin-bottom: 32px;
}

.stat-card {
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-card :deep(.el-card__body) {
  padding: 24px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
}

.stat-info {
  flex: 1;
  color: white;
}

.stat-number {
  font-size: 32px;
  font-weight: bold;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
}

.charts-row {
  margin-bottom: 32px;
}

.chart-container {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.chart-container:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.chart-header {
  margin-bottom: 20px;
}

.chart-header h3 {
  font-size: 20px;
  color: #303133;
  margin-bottom: 4px;
}

.chart-header p {
  color: #909399;
  font-size: 14px;
}

.chart {
  width: 100%;
}
</style>
