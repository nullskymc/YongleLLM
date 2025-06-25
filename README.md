# 知识图谱问答系统

基于 LangGraph 和 Neo4j 的智能问答系统，支持地理位置推理和知识图谱问答。

## 🚀 快速开始

### 方法一：一键启动（推荐）
```bash
./deploy.sh  #构建
./deploy.sh start  #启动服务
```

### 方法二：手动启动

#### 1. 安装后端依赖
```bash
pip install -r requirements.txt
```

#### 2. 启动后端API服务
```bash
cd src
python app.py
```

#### 3. 启动前端Vue应用
```bash
cd knowledge-mining-visualization
npm install
npm run dev
```

## 📍 访问地址

- **前端Vue应用**: http://localhost:5173
- **后端API服务**: http://localhost:8000
- **内置聊天界面**: http://localhost:8000
- **API文档**: http://localhost:8000/docs

## 🎯 功能特性

### 1. 智能查询分类
系统会自动判断用户查询类型：
- **地名推理**: 使用搜索引擎进行地理位置推理
- **知识图谱问答**: 基于Neo4j知识图谱回答问题

### 2. 多种访问方式
- **Vue前端界面**: 现代化的可视化界面，支持聊天功能
- **内置聊天页面**: 简洁的HTML聊天界面
- **RESTful API**: 支持程序化调用

### 3. 实时问答
- 支持实时聊天对话
- 智能查询优化
- 错误处理和重试机制

## 🛠️ 技术栈

### 后端
- **FastAPI**: 现代、快速的Web框架
- **LangGraph**: 智能工作流编排
- **LangChain**: LLM应用开发框架
- **Neo4j**: 图数据库
- **DuckDuckGo**: 搜索引擎工具

### 前端
- **Vue 3**: 渐进式JavaScript框架
- **Element Plus**: Vue 3组件库
- **Vite**: 构建工具

## 📁 项目结构

```
YongleLLM/
├── src/                          # 后端源码
│   ├── app.py                   # FastAPI应用主文件
│   ├── graph_agent.py           # LangGraph智能代理
│   └── adapter.py               # 数据库适配器
├── knowledge-mining-visualization/ # 前端Vue应用
│   ├── src/
│   │   ├── views/Chat.vue       # 聊天组件
│   │   └── router/index.js      # 路由配置
│   └── package.json
├── requirements.txt              # Python依赖
├── start_system.bat             # 一键启动脚本
└── README.md                    # 项目说明
```

## 🔍 故障排除

### 常见问题

1. **端口占用**
   - 默认端口 8000
   - 如有冲突，请修改对应配置文件

2. **依赖安装失败**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Neo4j连接问题**
   - 检查 `adapter.py` 中的数据库连接配置
   - 确保Neo4j服务正在运行