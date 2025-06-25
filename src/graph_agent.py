from typing import TypedDict, Annotated
from langchain_neo4j import GraphCypherQAChain
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.prompts import PromptTemplate
from langchain.schema import HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from adapter import llm, graph
import re
import asyncio
from typing import AsyncGenerator
from datetime import datetime

# 定义状态类型
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    query: str
    search_result: str
    graph_result: str
    final_answer: str
    workflow_steps: list  # 专门用于存储工作流步骤

# 初始化工具
search_tool = DuckDuckGoSearchRun()
graph_chain = GraphCypherQAChain.from_llm(
    graph=graph, llm=llm, verbose=True, allow_dangerous_requests=True
)

# 1. 搜索引擎节点
def search_engine(state):  # 移除类型注解，兼容 dict
    """使用搜索引擎获取背景信息"""
    query = state["query"]
    
    # 构建搜索查询
    search_query = f"{query}"
    print(f"🔍 步骤1: 搜索引擎查询 - {search_query}")
    
    try:
        search_result = search_tool.run(search_query)
        print(f"✅ 搜索完成: {search_result[:200]}...")
          # 添加步骤信息到工作流步骤中
        step_message = {
            "step": 1,
            "name": "搜索引擎查询",
            "status": "completed",
            "description": f"正在搜索: {search_query}",
            "result": search_result[:300] + "..." if len(search_result) > 300 else search_result,
            "icon": "🔍"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        return {
            "search_result": search_result,
            "workflow_steps": workflow_steps
        }
        
    except Exception as e:
        print(f"❌ 搜索错误: {e}")
          # 添加错误步骤信息
        step_message = {
            "step": 1,
            "name": "搜索引擎查询",
            "status": "error",
            "description": f"搜索失败: {e}",
            "result": "",
            "icon": "❌"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        return {
            "search_result": f"搜索失败: {e}",
            "workflow_steps": workflow_steps
        }

# 2. 知识图谱问答节点
def query_knowledge_graph(state):  # 移除类型注解，兼容 dict
    """基于知识图谱回答问题"""
    query = state["query"]
    search_result = state.get("search_result", "")
    
    print(f"🧠 步骤2: 知识图谱查询")
    
    try:
        # 使用GraphCypherQAChain查询
        result = graph_chain.invoke({"query": query})
        graph_result = result["result"]
        
        print(f"✅ 图谱查询完成: {graph_result}")
        
        # 如果结果为空或不满意，尝试优化查询
        if not graph_result or "I don't know" in graph_result or len(graph_result.strip()) < 10:
            print(f"🔄 步骤2.1: 优化查询语句")
            # 提取关键词重新构建查询
            optimized_query = optimize_graph_query(query)
            print(f"优化后查询: {optimized_query}")
            
            result = graph_chain.invoke({"query": optimized_query})
            graph_result = result["result"]
        
        # 添加步骤信息
        step_message = {
            "step": 2,
            "name": "知识图谱查询",
            "status": "completed",
            "description": f"查询知识图谱: {query}",
            "result": graph_result,
            "icon": "🧠"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        return {
            "graph_result": graph_result,
            "workflow_steps": workflow_steps
        }
        
    except Exception as e:
        print(f"❌ 图谱查询错误: {e}")
        
        step_message = {
            "step": 2,
            "name": "知识图谱查询",
            "status": "error",
            "description": f"图谱查询失败: {e}",
            "result": "",
            "icon": "❌"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        return {
            "graph_result": f"查询失败: {e}",
            "workflow_steps": workflow_steps
        }

# 3. 结果融合节点（同步）
def synthesize_answer(state: AgentState):
    """融合搜索结果和图谱结果，生成最终答案"""
    query = state["query"]
    search_result = state.get("search_result", "")
    graph_result = state.get("graph_result", "")
    
    print(f"🔄 步骤3: 结果融合与生成答案")
      # 使用LLM融合两个结果
    synthesis_prompt = PromptTemplate.from_template("""
        请基于以下信息，为用户问题提供一个全面、准确的答案：

        用户问题: {query}

        搜索引擎结果:
        {search_result}

        知识图谱结果:
        {graph_result}

        请综合分析上述信息，提供一个简洁明确的答案。如果两个来源的信息有冲突，请指出并说明。
        如果某个来源没有相关信息，请只使用另一个来源的信息。
        """)
    
    try:
        formatted_prompt = synthesis_prompt.format(
            query=query,
            search_result=search_result,
            graph_result=graph_result
        )
        response = llm.invoke([HumanMessage(content=formatted_prompt)])
        
        final_answer = response.content
        print(f"✅ 融合完成: {final_answer}")
          # 添加步骤信息
        step_message = {
            "step": 3,
            "name": "结果融合",
            "status": "completed",
            "description": "融合搜索结果和知识图谱结果",
            "result": final_answer,
            "icon": "🔄"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        return {
            "final_answer": final_answer,
            "workflow_steps": workflow_steps
        }
        
    except Exception as e:
        print(f"❌ 结果融合错误: {e}")
        # 降级处理：如果融合失败，优先使用图谱结果，其次是搜索结果
        fallback_answer = ""
        if graph_result and "查询失败" not in graph_result:
            fallback_answer = graph_result
        elif search_result and "搜索失败" not in search_result:
            fallback_answer = "基于搜索结果：" + search_result[:500] + "..."
        else:            fallback_answer = "抱歉，无法获取相关信息，请稍后重试。"
        
        step_message = {
            "step": 3,
            "name": "结果融合",
            "status": "fallback",
            "description": f"融合失败，使用备选方案: {e}",
            "result": fallback_answer,
            "icon": "⚠️"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        return {
            "final_answer": fallback_answer,
            "workflow_steps": workflow_steps
        }



# 新增：用于流式输出的独立异步生成器
async def stream_synthesis(state: AgentState) -> AsyncGenerator[dict, None]:
    """
    流式处理的辅助函数：融合结果并生成最终答案。
    它是一个异步生成器，不作为图节点，专门由 run_agent_stream 调用。
    """
    query = state["query"]
    search_result = state.get("search_result", "")
    graph_result = state.get("graph_result", "")

    synthesis_prompt = PromptTemplate.from_template("""
        请基于以下信息，为用户问题提供一个全面、准确的答案：

        用户问题: {query}

        搜索引擎结果:
        {search_result}

        知识图谱结果:
        {graph_result}

        请综合分析上述信息，提供一个简洁明确的答案。如果两个来源的信息有冲突，请指出并说明。
        如果某个来源没有相关信息，请只使用另一个来源的信息。
        """)
    
    formatted_prompt = synthesis_prompt.format(
        query=query,
        search_result=search_result,
        graph_result=graph_result
    )

    accumulated_answer = ""
    try:
        # 使用 astream 实现流式响应
        async for chunk in llm.astream([HumanMessage(content=formatted_prompt)]):
            content = chunk.content
            if isinstance(content, str) and content:
                accumulated_answer += content
                yield {
                    "type": "answer_chunk",
                    "content": content,
                    "is_final": False
                }
        
        # 标记流结束
        yield { "type": "answer_chunk", "content": "", "is_final": True }

        # 构建最终的工作流步骤
        step_message = {
            "step": 3,
            "name": "结果融合",
            "status": "completed",
            "description": "融合搜索结果和知识图谱结果",
            "result": accumulated_answer,
            "icon": "🔄"
        }
        
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)

        # 通过特殊类型 yield 最终完整数据
        yield {
            "type": "final_data",
            "final_answer": accumulated_answer,
            "workflow_steps": workflow_steps
        }

    except Exception as e:
        print(f"❌ 流式结果融合错误: {e}")
        fallback_answer = graph_result or search_result or "抱歉，无法获取相关信息，请稍后重试。"
        
        yield { "type": "answer_chunk", "content": fallback_answer, "is_final": True }

        step_message = {
            "step": 3,
            "name": "结果融合",
            "status": "fallback",
            "description": f"融合失败，使用备选方案: {e}",
            "result": fallback_answer,
            "icon": "⚠️"
        }
        workflow_steps = state.get("workflow_steps", [])
        workflow_steps.append(step_message)
        
        yield {
            "type": "final_data",
            "final_answer": fallback_answer,
            "workflow_steps": workflow_steps
        }


def optimize_graph_query(original_query: str) -> str:
    """使用few-shot示例优化图谱查询语句"""    
    optimization_prompt = PromptTemplate.from_template("""
        你是一个知识图谱查询优化专家。请根据以下示例，将用户的原始查询转换为更适合知识图谱查询的格式。
        示例：
        原始查询：有哪些诗词提到了湖泊？
        优化查询：有哪些诗词提到了湖泊？
        原始查询：什么方志记载了湖的信息
        优化查询：哪些方志记载了湖泊信息？
        原始查询：方志里有湖的记录吗
        优化查询：方志中记载了哪些湖泊？
        现在请优化以下查询：        
        原始查询：{original_query}
        优化查询：
        """)
    
    try:
        formatted_prompt = optimization_prompt.format(original_query=original_query)
        response = llm.invoke([HumanMessage(content=formatted_prompt)])
          # 正确获取响应内容
        optimized_query = ""
        if hasattr(response, 'content') and response.content:
            optimized_query = str(response.content).strip()
        else:
            optimized_query = str(response).strip()
        
        # 如果优化结果为空或太短，返回原查询
        if len(optimized_query) < 3:
            return original_query
            
        return optimized_query
        
    except Exception as e:
        print(f"查询优化错误: {e}")
        return original_query

# 4. 构建工作流图
def create_workflow():
    """创建LangGraph工作流"""
    workflow = StateGraph(AgentState)
    
    # 添加节点
    workflow.add_node("search_engine", search_engine)
    workflow.add_node("query_knowledge_graph", query_knowledge_graph)
    workflow.add_node("synthesize_answer", synthesize_answer)
    
    # 设置入口点
    workflow.set_entry_point("search_engine")
    
    # 添加顺序边：搜索 -> 图谱查询 -> 结果融合 -> 结束
    workflow.add_edge("search_engine", "query_knowledge_graph")
    workflow.add_edge("query_knowledge_graph", "synthesize_answer")
    workflow.add_edge("synthesize_answer", END)
    
    return workflow.compile()

# 主执行函数
def run_agent(query: str):
    """运行智能问答代理"""
    app = create_workflow()
    
    initial_state = {
        "messages": [],
        "query": query,
        "search_result": "",
        "graph_result": "",
        "final_answer": "",
        "workflow_steps": []
    }
    
    print(f"\n=== 开始处理查询: {query} ===")
    
    # 运行工作流
    result = app.invoke(initial_state)
    
    print(f"\n=== 最终答案 ===")
    print(result["final_answer"])
    
    return result

# 流式执行函数 (重构)
async def run_agent_stream(query: str) -> AsyncGenerator[dict, None]:
    """运行智能问答代理 - 流式版本"""
    
    initial_state: AgentState = {
        "messages": [],
        "query": query,
        "search_result": "",
        "graph_result": "",
        "final_answer": "",
        "workflow_steps": []
    }
    
    print(f"\n=== 开始处理查询 (流式): {query} ====")
    
    # 发送开始信号
    yield {
        "type": "start",
        "message": "开始处理您的问题...",
        "timestamp": datetime.now().isoformat()
    }
    
    try:
        current_state = initial_state
        
        # 步骤1: 搜索引擎
        yield { "type": "step", "step": 1, "name": "搜索引擎查询", "status": "processing", "description": f"正在搜索: {query}", "icon": "🔍" }
        await asyncio.sleep(0.1)
        search_result_update = search_engine(current_state)
        current_state["search_result"] = search_result_update["search_result"]
        current_state["workflow_steps"] = search_result_update["workflow_steps"]
        yield { "type": "step", "step": 1, "name": "搜索引擎查询", "status": "completed", "description": "搜索完成", "result": current_state["search_result"][:200] + "...", "icon": "✅" }
        
        # 步骤2: 知识图谱查询
        yield { "type": "step", "step": 2, "name": "知识图谱查询", "status": "processing", "description": "查询知识图谱数据库...", "icon": "🧠" }
        await asyncio.sleep(0.1)
        graph_result_update = query_knowledge_graph(current_state)
        current_state["graph_result"] = graph_result_update["graph_result"]
        current_state["workflow_steps"] = graph_result_update["workflow_steps"]
        yield { "type": "step", "step": 2, "name": "知识图谱查询", "status": "completed", "description": "图谱查询完成", "result": current_state["graph_result"][:200] + "...", "icon": "✅" }
        
        # 步骤3: 生成最终答案 (流式)
        yield { "type": "step", "step": 3, "name": "生成答案", "status": "processing", "description": "正在生成最终答案...", "icon": "✨" }
        
        final_data_received = False
        async for result in stream_synthesis(current_state):
            if result["type"] == "answer_chunk":
                yield result  # 直接将答案块推送给客户端
            elif result["type"] == "final_data":
                current_state["final_answer"] = result["final_answer"]
                current_state["workflow_steps"] = result["workflow_steps"]
                final_data_received = True

        if not final_data_received:
             raise Exception("流式合成未能生成最终数据。")

        yield { "type": "step", "step": 3, "name": "生成答案", "status": "completed", "description": "答案生成完成", "icon": "✅" }
        
        # 发送完成信号
        yield {
            "type": "complete",
            "final_answer": current_state["final_answer"],
            "workflow_steps": current_state["workflow_steps"],
            "search_result": current_state["search_result"],
            "graph_result": current_state["graph_result"]
        }
        
    except Exception as e:
        print(f"处理查询时出错: {e}")
        yield {
            "type": "error",
            "message": f"处理失败: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }

if __name__ == "__main__":
    # 测试用例
    test_queries = [
        "安东县所在的省份",  # 地名推理
        "合肥志上记载有哪些湖？",  # 知识图谱问答
        "巢湖在哪里",  # 地名推理
        "有哪些诗词提到了湖泊？"  # 知识图谱问答
    ]
    
    for query in test_queries:
        try:
            result = run_agent(query)
            print("\n" + "="*50 + "\n")
        except Exception as e:
            print(f"处理查询 '{query}' 时出错: {e}")
            print("\n" + "="*50 + "\n")