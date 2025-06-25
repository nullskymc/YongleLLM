<template>
  <div class="gazetteers-page">
    <div class="page-header">
      <h2>
        <el-icon><Document /></el-icon>
        方志文献
      </h2>
      <p>查看各类方志文献及其记录的湖泊信息</p>
    </div>

    <!-- 搜索和筛选 -->
    <div class="search-section">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="16" :md="18">
          <el-input
            v-model="searchText"
            placeholder="搜索方志名称..."
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
            <el-option label="湖泊数量" value="count" />
            <el-option label="名称" value="name" />
          </el-select>
        </el-col>
      </el-row>
    </div>

    <!-- 方志列表 -->
    <div class="gazetteers-list">
      <el-card 
        v-for="gazetteer in paginatedGazetteers" 
        :key="gazetteer.name || gazetteer.source"
        class="gazetteer-card"
        shadow="hover"
      >
        <div class="gazetteer-header">
          <h3>{{ gazetteer.name || gazetteer.source }}</h3>
          <el-tag :type="getCountLevel(gazetteer.lake_count).type">
            记录 {{ gazetteer.lake_count }} 个湖泊
          </el-tag>
        </div>

        <div class="lakes-summary" v-if="Array.isArray(gazetteer.lakes) && gazetteer.lakes.length > 0">
          <h4>记录的湖泊：</h4>
          <div class="lakes-tags">
            <el-tag 
              v-for="lake in gazetteer.lakes.slice(0, 6)" 
              :key="lake"
              size="small"
              class="lake-tag"
              @click="showLakeContent(lake, gazetteer)"
            >
              {{ lake }}
            </el-tag>
            <el-tag 
              v-if="gazetteer.lakes.length > 6"
              size="small"
              type="info"
            >
              +{{ gazetteer.lakes.length - 6 }}
            </el-tag>
          </div>
        </div>

        <div class="gazetteer-actions">
          <el-button 
            type="primary" 
            size="small"
            @click="openGazetteerDetail(gazetteer)"
          >
            查看详情
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="filteredGazetteers.length > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="filteredGazetteers.length"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 方志详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      :title="currentGazetteer?.name || currentGazetteer?.source"
      width="80%"
      top="25vh"
      append-to-body
      destroy-on-close
    >
      <div v-if="currentGazetteer" class="gazetteer-detail">
        <!-- 统计信息 -->
        <div class="detail-section">
          <h4>
            <el-icon><DataAnalysis /></el-icon>
            统计信息
          </h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="方志名称">{{ currentGazetteer.name }}</el-descriptions-item>
            <el-descriptions-item label="记录湖泊数量">{{ currentGazetteer.lake_count }} 个</el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 湖泊记录 -->
        <div class="detail-section" v-if="Array.isArray(currentGazetteer.lakes) && currentGazetteer.lakes.length > 0">
          <h4>
            <el-icon><Location /></el-icon>
            湖泊记录详情
          </h4>
          <div class="content-list">
            <el-card 
              v-for="(lake, index) in currentGazetteer.lakes" 
              :key="lake || index"
              class="content-card"
              shadow="never"
            >
              <div class="content-header">
                <el-tag type="primary">{{ lake }}</el-tag>
              </div>
              <div class="content-text"></div>
            </el-card>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 湖泊内容对话框 -->
    <el-dialog
      v-model="contentDialogVisible"
      :title="`《${currentLakeContent?.gazetteer}》中关于 ${currentLakeContent?.lake} 的记录`"
      width="60%"
      top="25vh"
      append-to-body
      destroy-on-close
    >
      <div v-if="currentLakeContent" class="lake-content">
        <div class="content-text">{{ currentLakeContent.content }}</div>
      </div>

      <template #footer>
        <el-button @click="contentDialogVisible = false">关闭</el-button>
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
const gazetteers = ref([])
const searchText = ref('')
const sortBy = ref('count')
const currentPage = ref(1)
const pageSize = ref(20)

// 详情对话框
const detailDialogVisible = ref(false)
const currentGazetteer = ref(null)

// 内容对话框
const contentDialogVisible = ref(false)
const currentLakeContent = ref(null)

// 筛选后的方志列表
const filteredGazetteers = computed(() => {
  let result = gazetteers.value

  // 搜索过滤
  if (searchText.value) {
    result = result.filter(gazetteer => 
      (gazetteer.name || gazetteer.source || '').toLowerCase().includes(searchText.value.toLowerCase())
    )
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'count':
        return b.lake_count - a.lake_count
      case 'name':
        return (a.name || a.source || '').localeCompare(b.name || b.source || '')
      default:
        return 0
    }
  })

  return result
})

// 分页后的方志列表
const paginatedGazetteers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredGazetteers.value.slice(start, end)
})

// 获取数量等级
const getCountLevel = (count) => {
  if (count >= 10) return { type: 'danger', label: '丰富' }
  if (count >= 5) return { type: 'warning', label: '较多' }
  if (count >= 2) return { type: 'primary', label: '一般' }
  return { type: 'info', label: '较少' }
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

// 打开方志详情
const openGazetteerDetail = (gazetteer) => {
  currentGazetteer.value = gazetteer
  detailDialogVisible.value = true
}

// 显示湖泊内容
const showLakeContent = (lake, gazetteer = null) => {
  currentLakeContent.value = {
    lake: lake, // 直接用字符串
    content: '', // 没有内容，置空或后续可扩展
    gazetteer: gazetteer?.name || gazetteer?.source || currentGazetteer.value?.name || currentGazetteer.value?.source || '未知方志'
  }
  contentDialogVisible.value = true
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
    gazetteers.value = neo4jStore.cache.allGazetteers || []
    
    console.log('Gazetteers数据加载完成，使用缓存，数量:', gazetteers.value.length)
  } catch (error) {
    console.error('加载方志数据失败:', error)
    ElMessage.error('加载方志数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.gazetteers-page {
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

.gazetteers-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.gazetteer-card {
  transition: all 0.3s ease;
}

.gazetteer-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.gazetteer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.gazetteer-header h3 {
  font-size: 18px;
  color: #303133;
  margin: 0;
}

.lakes-summary {
  margin-bottom: 16px;
}

.lakes-summary h4 {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.lakes-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lake-tag {
  cursor: pointer;
  transition: all 0.2s ease;
}

.lake-tag:hover {
  transform: scale(1.05);
}

.gazetteer-actions {
  display: flex;
  justify-content: flex-end;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.gazetteer-detail {
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
  white-space: pre-line;
}

.lake-content .content-text {
  font-size: 16px;
  line-height: 1.8;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #409eff;
}
</style>
