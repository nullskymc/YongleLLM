<template>
  <div class="poems-page">
    <div class="page-header">
      <h2>
        <el-icon><Edit /></el-icon>
        诗词文学
      </h2>
      <p>欣赏古代诗词中的湖光山色</p>
    </div>

    <!-- 搜索和筛选 -->
    <div class="search-section">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="16" :md="18">
          <el-input
            v-model="searchText"
            placeholder="搜索诗词标题或内容..."
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
            <el-option label="标题" value="title" />
          </el-select>
        </el-col>
      </el-row>
    </div>

    <!-- 诗词列表 -->
    <div class="poems-grid">
      <el-row :gutter="24">
        <el-col 
          :xs="24" :sm="12" :lg="8"
          v-for="poem in paginatedPoems" 
          :key="poem.title || poem.name"
        >
          <el-card 
            class="poem-card" 
            shadow="hover"
            @click="openPoemDetail(poem)"
          >
            <div class="poem-header">
              <h3>{{ poem.title || poem.name }}</h3>
              <el-tag 
                v-if="poem.lake_count > 0"
                :type="getCountLevel(poem.lake_count).type" 
                size="small"
              >
                {{ poem.lake_count }} 个湖泊
              </el-tag>
            </div>
            
            <div class="poem-preview">
              {{ getPoemPreview(poem.content || poem.full_text) }}
            </div>

            <div class="lakes-mention" v-if="Array.isArray(poem.lakes) && poem.lakes.length > 0">
              <div class="mention-label">提及湖泊：</div>
              <div class="lakes-tags">
                <el-tag 
                  v-for="lake in poem.lakes.slice(0, 3)" 
                  :key="lake"
                  size="small"
                  type="primary"
                  class="lake-tag"
                >
                  {{ lake }}
                </el-tag>
                <el-tag 
                  v-if="poem.lakes.length > 3"
                  size="small"
                  type="info"
                >
                  +{{ poem.lakes.length - 3 }}
                </el-tag>
              </div>
            </div>

            <div class="poem-actions">
              <el-button type="primary" size="small">
                <el-icon><View /></el-icon>
                阅读全文
              </el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="filteredPoems.length > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[12, 24, 48, 96]"
        :total="filteredPoems.length"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 诗词详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      :title="currentPoem?.title || currentPoem?.name"
      width="70%"
      top="25vh"
      append-to-body
      destroy-on-close
      class="poem-dialog"
    >
      <div v-if="currentPoem" class="poem-detail">
        <!-- 诗词内容 -->
        <div class="poem-content-section">
          <div class="poem-full-content">
            {{ currentPoem.content || currentPoem.full_text }}
          </div>
        </div>

        <!-- 湖泊信息 -->
        <div class="detail-section" v-if="Array.isArray(currentPoem.lakes) && currentPoem.lakes.length > 0">
          <h4>
            <el-icon><Location /></el-icon>
            诗中湖泊
          </h4>
          <div class="lakes-info">
            <el-tag 
              v-for="lake in currentPoem.lakes" 
              :key="lake"
              size="large"
              type="primary"
              class="lake-info-tag"
            >
              {{ lake }}
            </el-tag>
          </div>
        </div>

        <!-- 文学价值分析 -->
        <div class="detail-section">
          <h4>
            <el-icon><Reading /></el-icon>
            文学特色
          </h4>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="提及湖泊数量">{{ currentPoem.lake_count }} 个</el-descriptions-item>
            <el-descriptions-item label="文本长度">{{ (currentPoem.content || currentPoem.full_text)?.length || 0 }} 字</el-descriptions-item>
            <el-descriptions-item label="类型特征">{{ getPoemType(currentPoem.content || currentPoem.full_text) }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyPoem">
          <el-icon><CopyDocument /></el-icon>
          复制诗词
        </el-button>
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
const poems = ref([])
const searchText = ref('')
const sortBy = ref('count')
const currentPage = ref(1)
const pageSize = ref(24)

// 详情对话框
const detailDialogVisible = ref(false)
const currentPoem = ref(null)

// 筛选后的诗词列表
const filteredPoems = computed(() => {
  let result = poems.value

  // 搜索过滤
  if (searchText.value) {
    result = result.filter(poem => 
      (poem.title || poem.name || '').toLowerCase().includes(searchText.value.toLowerCase()) ||
      (poem.content || poem.full_text || '').toLowerCase().includes(searchText.value.toLowerCase())
    )
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'count':
        return b.lake_count - a.lake_count
      case 'title':
        return (a.title || a.name || '').localeCompare(b.title || b.name || '')
      default:
        return 0
    }
  })

  return result
})

// 分页后的诗词列表
const paginatedPoems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredPoems.value.slice(start, end)
})

// 获取数量等级
const getCountLevel = (count) => {
  if (count >= 3) return { type: 'danger', label: '多湖' }
  if (count >= 2) return { type: 'warning', label: '双湖' }
  if (count >= 1) return { type: 'primary', label: '单湖' }
  return { type: 'info', label: '无湖' }
}

// 获取诗词预览
const getPoemPreview = (content) => {
  if (!content) return ''
  const lines = (content || '').split(/[。\n]/).filter(line => line.trim())
  return lines.slice(0, 2).join('。') + (lines.length > 2 ? '...' : '')
}

// 获取诗词类型
const getPoemType = (content) => {
  if (!content) return '未知'
  const length = (content || '').length
  if (length < 50) return '绝句'
  if (length < 100) return '律诗'
  if (length < 200) return '长诗'
  return '长篇诗词'
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

// 打开诗词详情
const openPoemDetail = (poem) => {
  currentPoem.value = poem
  detailDialogVisible.value = true
}

// 复制诗词
const copyPoem = async () => {
  try {
    await navigator.clipboard.writeText(`${currentPoem.value.title || currentPoem.value.name}\n\n${currentPoem.value.content || currentPoem.value.full_text}`)
    ElMessage.success('诗词已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败')
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
    poems.value = neo4jStore.cache.allPoems || []
    
    console.log('Poems数据加载完成，使用缓存，数量:', poems.value.length)
  } catch (error) {
    console.error('加载诗词数据失败:', error)
    ElMessage.error('加载诗词数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.poems-page {
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

.poems-grid {
  margin-bottom: 32px;
}

.poem-card {
  cursor: pointer;
  transition: all 0.3s ease;
  height: 280px;
  background: linear-gradient(135deg, #ffeef8 0%, #f0f9ff 100%);
  border: 1px solid #e4e7ed;
}

.poem-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-color: #409eff;
}

.poem-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.poem-header h3 {
  font-size: 18px;
  color: #303133;
  margin: 0;
  font-family: serif;
}

.poem-preview {
  font-family: serif;
  line-height: 1.8;
  color: #606266;
  margin-bottom: 16px;
  height: 80px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.lakes-mention {
  margin-bottom: 16px;
}

.mention-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.lakes-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.lake-tag {
  font-size: 12px;
}

.poem-actions {
  display: flex;
  justify-content: flex-end;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.poem-dialog :deep(.el-dialog__body) {
  padding: 32px;
}

.poem-detail {
  max-height: 70vh;
  overflow-y: auto;
}

.poem-content-section {
  margin-bottom: 32px;
  text-align: center;
}

.poem-full-content {
  font-family: serif;
  font-size: 18px;
  line-height: 2.2;
  color: #303133;
  background: linear-gradient(135deg, #ffeef8 0%, #f0f9ff 100%);
  padding: 32px;
  border-radius: 12px;
  border-left: 4px solid #409eff;
  white-space: pre-line;
  margin-bottom: 24px;
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

.lakes-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.lake-info-tag {
  font-size: 14px;
  padding: 8px 16px;
}
</style>
