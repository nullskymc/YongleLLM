<template>
  <div class="lakes-page">
    <div class="page-header">
      <h2>
        <el-icon><Location /></el-icon>
        湖泊详情
      </h2>
      <p>探索各个湖泊的详细信息和文献记录</p>
    </div>

    <!-- 搜索和筛选 -->
    <div class="search-section">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="16" :md="18">
          <el-input
            v-model="searchText"
            placeholder="搜索湖泊名称..."
            clearable
            size="large"
            @input="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :xs="24" :sm="8" :md="6">
          <el-select
            v-model="sortBy"
            placeholder="排序方式"
            size="large"
            style="width: 100%"
            @change="handleSort"
          >
            <el-option label="总热度" value="total" />
            <el-option label="方志数量" value="gazetteer" />
            <el-option label="诗词数量" value="poem" />
            <el-option label="名称" value="name" />
          </el-select>
        </el-col>
      </el-row>
    </div>

    <!-- 湖泊列表 -->
    <div class="lakes-grid">
      <el-row :gutter="24">
        <el-col 
          :xs="24" :sm="12" :lg="8" :xl="6"
          v-for="lake in paginatedLakes" 
          :key="lake.name"
        >
          <el-card 
            class="lake-card" 
            shadow="hover"
            @click="openLakeDetail(lake)"
          >
            <div class="lake-header">
              <h3>{{ lake.name }}</h3>
              <el-tag :type="getHeatLevel(lake.total_mentions).type" size="small">
                {{ getHeatLevel(lake.total_mentions).label }}
              </el-tag>
            </div>
            
            <div class="lake-location">
              <el-icon><MapLocation /></el-icon>
              <span>{{
                Array.isArray(lake.locations) && lake.locations.length
                  ? lake.locations.join('、')
                  : (lake.location || '位置不详')
              }}</span>
            </div>

            <div class="lake-stats">
              <div class="stat-item">
                <el-icon><Document /></el-icon>
                <span>方志：{{ lake.gazetteer_count }}</span>
              </div>
              <div class="stat-item">
                <el-icon><Edit /></el-icon>
                <span>诗词：{{ lake.poem_count }}</span>
              </div>
              <div class="stat-item total">
                <el-icon><DataLine /></el-icon>
                <span>总热度：{{ lake.total_mentions }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="filteredLakes.length > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[12, 24, 48, 96]"
        :total="filteredLakes.length"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 湖泊详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      :title="currentLake?.name"
      width="80%"
      top="25vh"
      append-to-body
      destroy-on-close
    >
      <div v-if="currentLake" class="lake-detail">
        <!-- 基本信息 -->
        <div class="detail-section">
          <h4>
            <el-icon><InfoFilled /></el-icon>
            基本信息
          </h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="湖泊名称">{{ currentLake.name }}</el-descriptions-item>
            <el-descriptions-item label="地理位置">
              {{
                Array.isArray(currentLake.locations) && currentLake.locations.length
                  ? currentLake.locations.join('、')
                  : (currentLake.location || '位置不详')
              }}
            </el-descriptions-item>
            <el-descriptions-item label="方志记录">{{ currentLake.gazetteer_count }} 条</el-descriptions-item>
            <el-descriptions-item label="诗词作品">{{ currentLake.poem_count }} 首</el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 方志记录 -->
        <div class="detail-section" v-if="lakeDetail?.gazetteers?.length">
          <h4>
            <el-icon><Document /></el-icon>
            方志记录
          </h4>
          <div class="content-list">
            <el-card 
              v-for="(gazetteer, index) in lakeDetail.gazetteers" 
              :key="index"
              class="content-card"
              shadow="never"
            >
              <div class="content-header">
                <el-tag type="info">{{ gazetteer.source }}</el-tag>
              </div>
              <div class="content-text">{{ gazetteer.content }}</div>
            </el-card>
          </div>
        </div>

        <!-- 诗词作品 -->
        <div class="detail-section" v-if="poemList.length">
          <h4>
            <el-icon><Edit /></el-icon>
            诗词作品
          </h4>
          <div class="content-list">
            <el-card 
              v-for="(poem, index) in poemList" 
              :key="index"
              class="content-card poem-card"
              shadow="never"
            >
              <div class="content-header">
                <el-tag type="success">{{ poem.title || poem.name }}</el-tag>
              </div>
              <div class="poem-content">{{ poem.content || poem.full_text }}</div>
            </el-card>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNeo4jStore } from '../stores/neo4j'
import { ElMessage } from 'element-plus'

const neo4jStore = useNeo4jStore()
const loading = ref(false)
const lakes = ref([])
const searchText = ref('')
const sortBy = ref('total')
const currentPage = ref(1)
const pageSize = ref(24)

// 详情对话框
const detailDialogVisible = ref(false)
const currentLake = ref(null)
const lakeDetail = ref(null)

// 筛选后的湖泊列表
const filteredLakes = computed(() => {
  let result = lakes.value

  // 搜索过滤
  if (searchText.value) {
    result = result.filter(lake => 
      lake.name.toLowerCase().includes(searchText.value.toLowerCase())
    )
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'total':
        return b.total_mentions - a.total_mentions
      case 'gazetteer':
        return b.gazetteer_count - a.gazetteer_count
      case 'poem':
        return b.poem_count - a.poem_count
      case 'name':
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })

  return result
})

// 分页后的湖泊列表
const paginatedLakes = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredLakes.value.slice(start, end)
})

// 获取热度等级
const getHeatLevel = (mentions) => {
  if (mentions >= 10) return { type: 'danger', label: '极热门' }
  if (mentions >= 5) return { type: 'warning', label: '热门' }
  if (mentions >= 2) return { type: 'primary', label: '普通' }
  return { type: 'info', label: '冷门' }
}

// 搜索处理
const handleSearch = () => {
  currentPage.value = 1
}

// 排序处理
const handleSort = () => {
  currentPage.value = 1
}

// 分页处理
const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1
}

const handleCurrentChange = (val) => {
  currentPage.value = val
}

// 打开湖泊详情
const openLakeDetail = async (lake) => {
  try {
    currentLake.value = lake
    detailDialogVisible.value = true
    
    // 加载详细信息
    const detail = await neo4jStore.getLakeDetails(lake.name)
    lakeDetail.value = detail
  } catch (error) {
    console.error('加载湖泊详情失败:', error)
    ElMessage.error('加载湖泊详情失败')
  }
}

// 加载数据
const loadData = async () => {
  try {
    loading.value = true
    
    // 等待全局初始化完成，然后直接从缓存获取数据
    const initialized = await neo4jStore.waitForInitialization()
    
    if (!initialized) {
      throw new Error('初始化失败')
    }

    // 直接从缓存获取数据
    lakes.value = neo4jStore.cache.allLakes || []
    
    console.log('Lakes数据加载完成，使用缓存，数量:', lakes.value.length)
  } catch (error) {
    console.error('加载湖泊数据失败:', error)
    ElMessage.error('加载湖泊数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})

// 诗词作品列表，兼容多种后端字段
const poemList = computed(() => {
  if (!lakeDetail.value) return []
  // 兼容不同后端字段
  if (Array.isArray(lakeDetail.value.poems)) return lakeDetail.value.poems
  if (Array.isArray(lakeDetail.value.poem_list)) return lakeDetail.value.poem_list
  if (Array.isArray(lakeDetail.value.poemInfos)) return lakeDetail.value.poemInfos
  return []
})
</script>

<style scoped>
.lakes-page {
  padding: 24px;
}

.page-header {
  margin-bottom: 32px;
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

.search-section {
  margin-bottom: 24px;
}

.lakes-grid {
  margin-bottom: 32px;
}

.lake-card {
  cursor: pointer;
  transition: all 0.3s ease;
  height: 200px;
}

.lake-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.lake-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.lake-header h3 {
  font-size: 18px;
  color: #303133;
  margin: 0;
}

.lake-location {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  margin-bottom: 16px;
}

.lake-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.stat-item.total {
  color: #409eff;
  font-weight: 500;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.lake-detail {
  max-height: 70vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 32px;
}

.detail-section h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  color: #303133;
  margin-bottom: 16px;
}

.content-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.content-card {
  background: #fafafa;
}

.content-header {
  margin-bottom: 12px;
}

.content-text {
  line-height: 1.6;
  color: #606266;
}

.poem-card {
  background: #f0f9ff;
}

.poem-content {
  line-height: 2;
  color: #606266;
  white-space: pre-line;
  font-family: serif;
}
</style>
