<template>
  <div class="workflow-steps">
    <div class="workflow-header">
      <h3>🔄 AI 推理过程</h3>
      <div class="workflow-progress">
        <div 
          class="progress-bar" 
          :style="{ width: progressPercentage + '%' }"
        ></div>
      </div>
    </div>
    
    <div class="steps-container">
      <div
        v-for="(step, index) in steps"
        :key="step.step"
        :class="['step-item', step.status]"
      >
        <div class="step-number">
          <span v-if="step.status === 'completed'" class="step-icon">{{ step.icon }}</span>
          <span v-else-if="step.status === 'error'" class="step-icon">❌</span>
          <span v-else-if="step.status === 'processing'" class="step-icon loading">⏳</span>
          <span v-else class="step-icon">{{ step.step }}</span>
        </div>
        
        <div class="step-content">
          <div class="step-title">{{ step.name }}</div>
          <div class="step-description">{{ step.description }}</div>
          
          <div 
            v-if="step.result && step.status === 'completed'" 
            class="step-result"
          >
            <div class="result-header" @click="toggleResult(index)">
              <span>查看结果</span>
              <i :class="['fas', expandedResults[index] ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
            </div>
            <div v-if="expandedResults[index]" class="result-content">
              <MarkdownRenderer :content="step.result" />
            </div>
          </div>
          
          <div v-if="step.status === 'error'" class="step-error">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ step.result || step.description }}</span>
          </div>
        </div>
        
        <!-- 连接线 -->
        <div 
          v-if="index < steps.length - 1" 
          :class="['step-connector', { 'active': index < completedSteps }]"
        ></div>
      </div>
    </div>
    
    <div v-if="isProcessing" class="processing-indicator">
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span>AI 正在思考中...</span>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

export default {
  name: 'WorkflowSteps',
  components: {
    MarkdownRenderer
  },
  props: {
    steps: {
      type: Array,
      default: () => []
    },
    isProcessing: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const expandedResults = ref({})
    
    const completedSteps = computed(() => {
      return props.steps.filter(step => step.status === 'completed').length
    })
    
    const progressPercentage = computed(() => {
      if (props.steps.length === 0) return 0
      return (completedSteps.value / props.steps.length) * 100
    })
    
    const toggleResult = (index) => {
      expandedResults.value[index] = !expandedResults.value[index]
    }
    
    // 监听 steps 变化，自动展开最新完成的步骤
    watch(() => props.steps, (newSteps) => {
      if (newSteps.length > 0) {
        const lastStep = newSteps[newSteps.length - 1]
        if (lastStep.status === 'completed') {
          expandedResults.value[newSteps.length - 1] = true
        }
      }
    }, { deep: true })
    
    return {
      expandedResults,
      completedSteps,
      progressPercentage,
      toggleResult
    }
  }
}
</script>

<style scoped>
.workflow-steps {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 1.5rem;
  margin: 1rem 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.workflow-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.workflow-header h3 {
  color: #2c3e50;
  margin: 0 0 1rem 0;
  font-size: 1.2rem;
}

.workflow-progress {
  width: 100%;
  height: 4px;
  background: #e9ecef;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 2px;
  transition: width 0.5s ease;
}

.steps-container {
  position: relative;
}

.step-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  position: relative;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1rem;
  font-weight: bold;
  font-size: 1.1rem;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.step-item.completed .step-number {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.step-item.error .step-number {
  background: #e74c3c;
  color: white;
}

.step-item.processing .step-number {
  background: #f39c12;
  color: white;
}

.step-number .step-icon.loading {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 0.25rem;
  font-size: 1rem;
}

.step-description {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.step-result {
  margin-top: 0.5rem;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  overflow: hidden;
}

.result-header {
  background: #f8f9fa;
  padding: 0.75rem 1rem;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: #495057;
  transition: background 0.2s ease;
}

.result-header:hover {
  background: #e9ecef;
}

.result-content {
  padding: 1rem;
  background: white;
  max-height: 300px;
  overflow-y: auto;
  font-size: 0.9rem;
}

.step-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #e74c3c;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.step-connector {
  position: absolute;
  left: 19px;
  top: 40px;
  width: 2px;
  height: calc(100% - 20px);
  background: #e9ecef;
  transition: background 0.3s ease;
}

.step-connector.active {
  background: linear-gradient(180deg, #667eea, #764ba2);
}

.processing-indicator {
  text-align: center;
  padding: 1rem;
  color: #667eea;
  font-size: 0.9rem;
}

.loading-dots {
  display: inline-flex;
  gap: 4px;
  margin-right: 0.5rem;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #667eea;
  animation: loading 1.4s infinite ease-in-out;
}

.loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.loading-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes loading {
  0%, 80%, 100% { 
    transform: scale(0.8); 
    opacity: 0.5; 
  }
  40% { 
    transform: scale(1); 
    opacity: 1; 
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .workflow-steps {
    padding: 1rem;
    margin: 0.5rem 0;
  }
  
  .step-number {
    width: 32px;
    height: 32px;
    font-size: 0.9rem;
  }
  
  .step-connector {
    left: 15px;
  }
  
  .step-title {
    font-size: 0.9rem;
  }
  
  .step-description {
    font-size: 0.8rem;
  }
  
  .result-content {
    max-height: 200px;
    padding: 0.75rem;
  }
}
</style>
