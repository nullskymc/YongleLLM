<template>
  <div class="chat-container">
    
    <div class="chat-messages" ref="messagesContainer">
      <div
        v-for="(message, index) in messages"
        :key="index"
        :class="['message', message.type]"
      >
        <div class="message-avatar">
          <i :class="message.type === 'user' ? 'fas fa-user' : 'fas fa-robot'"></i>
        </div>
        <div class="message-content">
          <!-- 工作流步骤展示 -->
          <WorkflowSteps 
            v-if="message.type === 'assistant' && message.workflow"
            :steps="message.workflow"
            :isProcessing="false"
          />
          
          <div class="message-text">
            <MarkdownRenderer 
              v-if="message.type === 'assistant' && !message.isTyping && !message.isStreaming" 
              :content="message.content" 
            />
            <div 
              v-else-if="message.type === 'assistant' && (message.isTyping || message.isStreaming)"
              class="typewriter-text"
              v-html="message.displayContent"
            ></div>
            <span v-else>{{ message.content }}</span>
          </div>
          
          <div class="message-time">{{ formatTime(message.timestamp) }}</div>
        </div>
      </div>

      <!-- 输入指示器 -->
      <div v-if="isLoading" class="message assistant">
        <div class="message-avatar">
          <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="chat-input">
      <div class="input-group">
        <input
          v-model="currentMessage"
          @keypress.enter="sendMessage"
          :disabled="isLoading || isTyping"
          placeholder="请输入您的问题，如：安东县在哪个省份？"
          class="message-input"
        />
        <button
          @click="sendMessage"
          :disabled="isLoading || isTyping || !currentMessage.trim()"
          class="send-button"
        >
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
      
      <div class="quick-questions">
        <span class="quick-label">快速提问：</span>
        <button
          v-for="question in quickQuestions"
          :key="question"
          @click="selectQuickQuestion(question)"
          :disabled="isLoading || isTyping"
          class="quick-btn"
        >
          {{ question }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, nextTick } from 'vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import WorkflowSteps from '@/components/WorkflowSteps.vue'

export default {
  name: 'Chat',
  components: {
    MarkdownRenderer,
    WorkflowSteps
  },
  setup() {
    const messages = reactive([
      {
        type: 'assistant',
        content: '你好！我是知识图谱问答助手。我可以帮你回答关于地理位置、历史文献、诗词等问题。',
        timestamp: new Date(),
        displayContent: '',
        isTyping: false
      }
    ])
    
    const currentMessage = ref('')
    const isLoading = ref(false)
    const isTyping = ref(false)
    const messagesContainer = ref(null)
    const accumulatedAnswer = ref('')
    
    // 打字机效果相关
    const typewriterQueue = ref([])
    const isTypewriting = ref(false)
    
    const quickQuestions = [
      '安东县在哪个省份？',
      '合肥志记载了哪些湖泊？',
      '有哪些诗词提到了湖泊？',
      '巢湖的地理位置在哪里？'
    ]
    
    const API_BASE_URL = import.meta.env.MODE === 'development' 
      ? 'http://localhost:8000' 
      : ''

    const scrollToBottom = () => {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
        }
      })
    }

    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    // 打字机效果函数
    const startTypewriting = async (messageIndex, fullText) => {
      if (isTypewriting.value) return
      
      isTypewriting.value = true
      const chars = Array.from(fullText) // 正确处理中文字符
      let displayedText = ''
      
      for (let i = 0; i < chars.length; i++) {
        displayedText += chars[i]
        
        // 更新消息显示内容
        messages[messageIndex] = {
          ...messages[messageIndex],
          displayContent: displayedText
        }
        
        // 滚动到底部
        nextTick(() => {
          scrollToBottom()
        })
        
        // 控制打字速度 (可以根据字符类型调整速度)
        const delay = chars[i].match(/[。！？.!?]/) ? 200 : 
                     chars[i].match(/[，；,;]/) ? 100 : 50
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      isTypewriting.value = false
    }

    const sendMessage = async () => {
      if (!currentMessage.value.trim() || isLoading.value || isTyping.value) return
      
      const userMessage = {
        type: 'user',
        content: currentMessage.value.trim(),
        timestamp: new Date()
      }
      
      messages.push(userMessage)
      const query = currentMessage.value.trim()
      currentMessage.value = ''
      isLoading.value = true
      
      scrollToBottom()
      
      // 创建助手消息容器
      const assistantMessage = {
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        workflow: [],
        displayContent: '',
        isTyping: false,
        isStreaming: true
      }
      
      messages.push(assistantMessage)
      scrollToBottom()
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: query,
            session_id: 'vue_chat'
          })
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        // 重置累积答案
        accumulatedAnswer.value = ''
        let currentWorkflow = []
        let sseBuffer = ''
        isLoading.value = false
        isTyping.value = true
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          sseBuffer += chunk
          let lines = sseBuffer.split(/\r?\n\r?\n/)
          // 保留最后一段（可能是不完整的）
          sseBuffer = lines.pop() || ''
          for (const block of lines) {
            const dataLine = block.split('\n').find(l => l.startsWith('data: '))
            if (dataLine) {
              try {
                const jsonStr = dataLine.slice(6)
                if (jsonStr.trim()) {
                  console.log('解析SSE数据:', jsonStr)
                  const data = JSON.parse(jsonStr)
                  console.log('解析后的数据:', data)
                  switch (data.type) {
                    case 'start':
                      const startMsgIndex = messages.length - 1
                      messages[startMsgIndex] = {
                        ...messages[startMsgIndex],
                        isStreaming: true
                      }
                      break
                    case 'step':
                      const existingStepIndex = currentWorkflow.findIndex(step => step.step === data.step)
                      if (existingStepIndex >= 0) {
                        currentWorkflow[existingStepIndex] = data
                      } else {
                        currentWorkflow.push(data)
                      }
                      const stepMsgIndex = messages.length - 1
                      messages[stepMsgIndex] = {
                        ...messages[stepMsgIndex],
                        workflow: [...currentWorkflow]
                      }
                      scrollToBottom()
                      break
                    case 'answer_chunk':
                      console.log('收到answer_chunk:', data.content, 'is_final:', data.is_final)
                      accumulatedAnswer.value += data.content
                      
                      if (data.is_final) {
                        console.log('答案完成，累积内容:', accumulatedAnswer.value)
                        const chunkMsgIndex = messages.length - 1
                        
                        // 启动打字机效果
                        messages[chunkMsgIndex] = {
                          ...messages[chunkMsgIndex],
                          displayContent: '',  // 重置显示内容
                          isTyping: true
                        }
                        
                        // 开始打字机效果
                        startTypewriting(chunkMsgIndex, accumulatedAnswer.value).then(() => {
                          // 打字机效果完成后更新状态
                          messages[chunkMsgIndex] = {
                            ...messages[chunkMsgIndex],
                            content: accumulatedAnswer.value,
                            isTyping: false,
                            isStreaming: false
                          }
                          isTyping.value = false
                        })
                      }
                      break
                    case 'complete':
                      const completeMsgIndex = messages.length - 1
                      
                      // 如果还没有开始打字机效果，或者累积答案为空，直接显示最终答案
                      if (!isTypewriting.value && !accumulatedAnswer.value) {
                        messages[completeMsgIndex] = {
                          ...messages[completeMsgIndex],
                          displayContent: '',
                          isTyping: true
                        }
                        
                        startTypewriting(completeMsgIndex, data.final_answer).then(() => {
                          messages[completeMsgIndex] = {
                            ...messages[completeMsgIndex],
                            content: data.final_answer,
                            workflow: data.workflow_steps || currentWorkflow,
                            isTyping: false,
                            isStreaming: false
                          }
                          isTyping.value = false
                        })
                      } else {
                        // 如果打字机效果已经在进行，只更新workflow
                        messages[completeMsgIndex] = {
                          ...messages[completeMsgIndex],
                          workflow: data.workflow_steps || currentWorkflow
                        }
                      }
                      break
                    case 'error':
                      const errorMsgIndex = messages.length - 1
                      messages[errorMsgIndex] = {
                        ...messages[errorMsgIndex],
                        content: `抱歉，处理出现问题：${data.message}`,
                        isTyping: false,
                        isStreaming: false
                      }
                      isLoading.value = false
                      isTyping.value = false
                      break
                  }
                }
              } catch (e) {
                console.error('解析流数据错误:', e)
              }
            }
          }
        }
        
      } catch (error) {
        console.error('Chat error:', error)
        const errorMsgIndex = messages.length - 1
        messages[errorMsgIndex] = {
          ...messages[errorMsgIndex],
          content: '抱歉，网络连接出现问题，请稍后重试。',
          isTyping: false,
          isStreaming: false
        }
        isLoading.value = false
        isTyping.value = false
      }
    }

    const selectQuickQuestion = (question) => {
      if (isLoading.value || isTyping.value) return
      currentMessage.value = question
      sendMessage()
    }

    onMounted(() => {
      scrollToBottom()
    })

    return {
      messages,
      currentMessage,
      isLoading,
      isTyping,
      messagesContainer,
      quickQuestions,
      sendMessage,
      selectQuickQuestion,
      formatTime
    }
  }
}
</script>

<style scoped>
.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: relative;
}

.chat-header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 1.5rem;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.chat-header h2 {
  color: #2c3e50;
  margin: 0 0 0.5rem 0;
  font-size: 1.8rem;
}

.chat-header p {
  color: #7f8c8d;
  margin: 0;
  font-size: 1rem;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  padding-bottom: 140px; /* 为浮动输入框留出空间 */
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.message {
  display: flex;
  margin-bottom: 1rem;
  align-items: flex-start;
}

.message.user {
  justify-content: flex-end;
}

.message.user .message-avatar {
  order: 2;
  margin-left: 0.5rem;
  margin-right: 0;
}

.message.user .message-content {
  order: 1;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 18px 18px 4px 18px;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-avatar i {
  font-size: 1.2rem;
  color: #667eea;
}

.message.user .message-avatar i {
  color: #764ba2;
}

.message-content {
  max-width: 70%;
  background: white;
  border-radius: 18px 18px 18px 4px;
  padding: 0.75rem 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

.message-text {
  line-height: 1.5;
  word-wrap: break-word;
  margin-top: 0.75rem; /* 在工作流步骤后添加间距 */
}

.message-text:first-child {
  margin-top: 0; /* 如果消息文本是第一个元素，则不需要上边距 */
}

.typewriter-text {
  line-height: 1.5;
  word-wrap: break-word;
  position: relative;
}

.typewriter-text::after {
  content: '█';
  animation: blink 1s infinite;
  color: #667eea;
  font-weight: normal;
  margin-left: 2px;
}

.message-time {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
  margin-top: 0.25rem;
  text-align: right;
}

.message.user .message-time {
  color: rgba(255, 255, 255, 0.8);
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 0.5rem 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #667eea;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { 
    transform: scale(0.8); 
    opacity: 0.5; 
  }
  40% { 
    transform: scale(1); 
    opacity: 1; 
  }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.chat-input {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.input-group {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  align-items: center;
}

.message-input {
  flex: 1;
  padding: 1rem 1.25rem;
  border: 2px solid rgba(102, 126, 234, 0.2);
  border-radius: 30px;
  outline: none;
  font-size: 1rem;
  background: white;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15), 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.message-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-button {
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.send-button:hover:not(:disabled) {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.send-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(102, 126, 234, 0.1);
}

.quick-label {
  font-size: 0.9rem;
  color: #7f8c8d;
  margin-right: 0.5rem;
}

.quick-btn {
  padding: 0.5rem 1rem;
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.8);
  color: #667eea;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.quick-btn:hover:not(:disabled) {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.quick-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 滚动条样式 */
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .chat-header {
    padding: 1rem;
  }
  
  .chat-header h2 {
    font-size: 1.5rem;
  }
  
  .message-content {
    max-width: 85%;
  }
  
  .chat-messages {
    padding-bottom: 160px; /* 移动端需要更多空间 */
  }
  
  .chat-input {
    padding: 0.75rem;
  }
  
  .input-group {
    gap: 0.5rem;
  }
  
  .message-input {
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
  }
  
  .send-button {
    width: 48px;
    height: 48px;
    font-size: 1rem;
  }
  
  .quick-questions {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }
  
  .quick-btn {
    font-size: 0.8rem;
    padding: 0.4rem 0.8rem;
  }
}
</style>
