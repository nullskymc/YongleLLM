<template>
  <div class="markdown-content" v-html="renderedContent"></div>
</template>

<script>
import { computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

export default {
  name: 'MarkdownRenderer',
  props: {
    content: {
      type: String,
      required: true
    }
  },
  setup(props) {
    // 配置 marked
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value
          } catch (err) {
            console.error('Highlight error:', err)
          }
        }
        return hljs.highlightAuto(code).value
      },
      breaks: true,
      gfm: true
    })

    const renderedContent = computed(() => {
      try {
        return marked(props.content)
      } catch (error) {
        console.error('Markdown parsing error:', error)
        return props.content
      }
    })

    return {
      renderedContent
    }
  }
}
</script>

<style scoped>
.markdown-content {
  line-height: 1.6;
  word-wrap: break-word;
}

/* Markdown 样式 */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin: 1rem 0 0.5rem 0;
  font-weight: bold;
  line-height: 1.3;
}

.markdown-content :deep(h1) { font-size: 1.8rem; color: #2c3e50; }
.markdown-content :deep(h2) { font-size: 1.5rem; color: #34495e; }
.markdown-content :deep(h3) { font-size: 1.3rem; color: #34495e; }
.markdown-content :deep(h4) { font-size: 1.1rem; color: #34495e; }
.markdown-content :deep(h5) { font-size: 1rem; color: #34495e; }
.markdown-content :deep(h6) { font-size: 0.9rem; color: #34495e; }

.markdown-content :deep(p) {
  margin: 0.5rem 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.markdown-content :deep(li) {
  margin: 0.25rem 0;
}

.markdown-content :deep(blockquote) {
  margin: 1rem 0;
  padding: 0.5rem 1rem;
  border-left: 4px solid #667eea;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 0 4px 4px 0;
}

.markdown-content :deep(blockquote p) {
  margin: 0;
}

.markdown-content :deep(code) {
  background: rgba(102, 126, 234, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9rem;
}

.markdown-content :deep(pre) {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 1rem;
  margin: 1rem 0;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.4;
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}

.markdown-content :deep(th) {
  background: rgba(102, 126, 234, 0.1);
  font-weight: bold;
}

.markdown-content :deep(tr:nth-child(even)) {
  background: rgba(0, 0, 0, 0.02);
}

.markdown-content :deep(a) {
  color: #667eea;
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid #ddd;
  margin: 1.5rem 0;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 0.5rem 0;
}

.markdown-content :deep(strong) {
  font-weight: bold;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(del) {
  text-decoration: line-through;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .markdown-content :deep(pre) {
    font-size: 0.8rem;
    padding: 0.8rem;
  }
  
  .markdown-content :deep(table) {
    font-size: 0.9rem;
  }
  
  .markdown-content :deep(th),
  .markdown-content :deep(td) {
    padding: 0.3rem;
  }
}
</style>
