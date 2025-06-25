import os
from typing import List, Any
from langchain_text_splitters import TextSplitter, RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.language_models import BaseChatModel

# --- 依赖与之前的实现 ---
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

# (这里我们直接复用上一版代码中的 LLMStructuralTextSplitter 及其辅助类)
# --- Pydantic 模型 ---
class StructuralChunk(BaseModel):
    content: str = Field(description="一个完整的文本块，例如一段完整的散文描述，或一首完整的诗歌及其相关标题与作者信息。")

class DocumentChunks(BaseModel):
    chunks: List[StructuralChunk]

# --- 智能结构分割器 ---
class LLMStructuralTextSplitter(TextSplitter):
    PROMPT_TEMPLATE = """
    你是一位顶级的古籍整理专家，精通各种古典中文文体。
    你的任务是仔细阅读下面提供的整段文本，并根据其内在的文体结构进行分块。
    分块规则：
    1.  将一段连续的散文叙述（如地理志、人物传记）作为一个独立的块。
    2.  将一首完整的诗歌作为一个独立的块。要点：诗歌的标题、作者和正文必须始终保持在同一个块内，绝不能将它们分开。
    3.  确保每个块在文体上是完整和统一的。
    4.  如果文本中包含多个不同的文体（如散文与诗歌），请将它们分开分块。
    5.  重要提示：请确保你输出的所有内容严格遵守安全准则，避免生成任何可能被内容过滤器拦截的文本。
    待处理文本: ```{input}```"""
    
    def __init__(self, llm: BaseChatModel, **kwargs: Any):
        super().__init__(**kwargs)
        self.llm = llm
        # 将核心逻辑构建成一个可调用的链，方便后续使用 .batch()
        self.chain = (
            ChatPromptTemplate.from_template(self.PROMPT_TEMPLATE)
            | self.llm.with_structured_output(DocumentChunks)
        )

    def split_text(self, text: str) -> List[str]:
        try:
            response_obj = self.chain.invoke({"input": text})
            if isinstance(response_obj, DocumentChunks):
                return [chunk.content.strip() for chunk in response_obj.chunks]
        except Exception as e:
            print(f"LLM 结构化分块时发生错误: {e}")
        return [text]


class ConcurrentHierarchicalSplitter(TextSplitter):
    """
    一个支持可控并发和错误处理的、生产级别的分层文本分割器。
    """
    def __init__(self, 
                 coarse_splitter: TextSplitter, 
                 fine_splitter: LLMStructuralTextSplitter,
                 max_concurrency: int = 5,
                 **kwargs: Any):
        super().__init__(**kwargs)
        self.coarse_splitter = coarse_splitter
        self.fine_splitter = fine_splitter
        self.max_concurrency = max_concurrency

    def split_text(self, text: str) -> List[str]:
        # 1. 重叠预分块
        print("--- 步骤 1: 正在进行重叠预分块... ---")
        coarse_chunks_text = self.coarse_splitter.split_text(text)
        print(f"--- 预分块完成，共得到 {len(coarse_chunks_text)} 个重叠的巨型块。 ---")
        
        # 2. 并发处理
        print(f"\n--- 步骤 2: 正在并发处理所有块 (并发上限: {self.max_concurrency})... ---")
        inputs = [{"input": chunk} for chunk in coarse_chunks_text]
        
        # --- 核心修改1：在 .batch() 中加入 return_exceptions=True ---
        results_list = self.fine_splitter.chain.batch(
            inputs, 
            config={"max_concurrency": self.max_concurrency},
            return_exceptions=True  # <-- 优雅处理错误的关键！
        )
        print("--- 并发处理完成。 ---")

        # 3. 裁剪去重，并处理异常
        print("\n--- 步骤 3: 正在进行结果的裁剪、去重与错误处理... ---")
        final_chunks = []
        seen_chunks = set()

        # --- 核心修改2：在循环中检查结果是成功还是异常 ---
        for i, result in enumerate(results_list):
            # 如果结果是一个异常对象
            if isinstance(result, Exception):
                failed_input_text = inputs[i]['input']
                print(f"  [警告] 第 {i+1} 个块处理失败，错误类型: {type(result).__name__}。将保留原始粗分块内容。")
                # 决策：将未被成功处理的原始粗分块直接加入最终结果
                # 这样可以保证数据不丢失，后续可以人工检查这些失败的块。
                if failed_input_text not in seen_chunks:
                    final_chunks.append(failed_input_text)
                    seen_chunks.add(failed_input_text)
                continue # 继续处理下一个结果

            # 如果结果是正常的 DocumentChunks 对象
            if isinstance(result, DocumentChunks):
                for chunk_obj in result.chunks:
                    chunk_content = chunk_obj.content.strip()
                    if chunk_content and chunk_content not in seen_chunks:
                        final_chunks.append(chunk_content)
                        seen_chunks.add(chunk_content)
            else:
                # 兜底处理未知类型的返回结果
                print(f"  [警告] 第 {i+1} 个块返回了未知类型的结果: {type(result).__name__}。")

        print("--- 裁剪、去重与错误处理完成。 ---")
        return final_chunks