from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, AsyncGenerator
import uvicorn
import os
import json
import asyncio
from datetime import datetime
from graph_agent import run_agent, run_agent_stream

app = FastAPI(title="知识图谱问答系统", description="基于LangGraph的智能问答API")

# 配置CORS，允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件配置
static_dir = os.path.join(os.path.dirname(__file__), "..", "knowledge-mining-visualization", "dist")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    print(f"✅ 静态文件目录已挂载: {static_dir}")
else:
    print(f"⚠️  静态文件目录不存在: {static_dir}")
    print("请先运行 npm run build 构建前端项目")

# 请求模型
class QueryRequest(BaseModel):
    query: str
    session_id: str = "default"

class ChatMessage(BaseModel):
    message: str
    timestamp: str
    type: str  # "user" 或 "assistant"

# 响应模型
class QueryResponse(BaseModel):
    success: bool
    data: Dict[Any, Any]
    message: str
    timestamp: str

# 简单的会话存储（生产环境建议使用Redis等）
chat_sessions = {}

@app.get("/")
async def root():
    """根路径，返回前端页面"""
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    else:
        return {
            "service": "知识图谱问答系统 API",
            "version": "1.0.0",
            "docs": "/docs",
            "message": "前端文件未找到，请先构建前端项目",
            "endpoints": {
                "chat": "/api/chat",
                "health": "/api/health",
                "history": "/api/chat/history/{session_id}"
            }
        }

# 处理前端路由，所有非API路径都返回index.html
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """处理前端路由"""
    # 如果是API路径，不处理
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    # 检查是否为静态资源
    file_path = os.path.join(static_dir, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # 否则返回index.html（用于SPA路由）
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    else:
        raise HTTPException(status_code=404, detail="Frontend files not found")

@app.post("/api/chat", response_model=QueryResponse)
async def chat_endpoint(request: QueryRequest):
    """聊天接口"""
    try:
        # 记录用户消息
        session_id = request.session_id
        if session_id not in chat_sessions:
            chat_sessions[session_id] = []
        
        user_message = ChatMessage(
            message=request.query,
            timestamp=datetime.now().isoformat(),
            type="user"
        )
        chat_sessions[session_id].append(user_message)
          # 调用图谱代理
        result = run_agent(request.query)
        
        # 记录助手回复
        assistant_message = ChatMessage(
            message=result.get("final_answer", "抱歉，我无法回答这个问题。"),
            timestamp=datetime.now().isoformat(),
            type="assistant"
        )
        chat_sessions[session_id].append(assistant_message)
          # 确保返回的数据包含工作流步骤
        response_data = {
            "final_answer": result.get("final_answer", "抱歉，我无法回答这个问题。"),
            "messages": result.get("workflow_steps", []),  # 工作流步骤
            "search_result": result.get("search_result", ""),
            "graph_result": result.get("graph_result", "")
        }
        
        return QueryResponse(
            success=True,
            data=response_data,
            message="查询成功",
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        return QueryResponse(
            success=False,
            data={},
            message=f"查询失败: {str(e)}",
            timestamp=datetime.now().isoformat()
        )

@app.post("/api/chat/stream")
async def chat_stream_endpoint(request: QueryRequest):
    """流式聊天接口，返回事件流(SSE)"""
    async def event_generator():
        try:
            async for chunk in run_agent_stream(request.query):
                # SSE格式: data: xxx\n\n
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*"
        }
    )

@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    """获取聊天历史"""
    if session_id in chat_sessions:
        return {
            "success": True,
            "data": chat_sessions[session_id],
            "message": "获取历史成功"
        }
    else:
        return {
            "success": True,
            "data": [],
            "message": "暂无聊天历史"
        }

@app.delete("/api/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    """清除聊天历史"""
    if session_id in chat_sessions:
        del chat_sessions[session_id]
    
    return {
        "success": True,
        "message": "历史记录已清除"
    }

@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "知识图谱问答系统"
    }

if __name__ == "__main__":
    print("🚀 启动知识图谱问答系统...")
    print("🔗 服务器地址: http://localhost:8000")
    print("📖 API 文档: http://localhost:8000/docs")
    print("🌐 Web 界面: http://localhost:8000")
    print("💡 如需开发模式，请运行 dev_mode.bat")
    
    uvicorn.run(
        "app:app", 
        host="0.0.0.0", 
        port=8000,
        reload=False  # 生产模式关闭热重载
    )