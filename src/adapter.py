from langchain_openai import ChatOpenAI
from langchain_neo4j import Neo4jGraph
from dotenv import load_dotenv
from pydantic import SecretStr
import os

load_dotenv()  # 加载环境变量
base_url = os.getenv("BASE_URL")
api_key = SecretStr(os.getenv("API_KEY"))  # type: ignore
username = os.getenv("NEO4J_USERNAME")
password = SecretStr(os.getenv("NEO4J_PASSWORD")) # type: ignore
neo4j_url = os.getenv("NEO4J_URL")
model_name = str(os.getenv("MODEL_NAME"))

llm = ChatOpenAI(
    model=model_name, 
    temperature=0.2,  # 设置温度以控制输出的随机性
    base_url=base_url,
    api_key=api_key.get_secret_value(),  # type: ignore
    streaming=True,  # 启用流式输出
)

graph = Neo4jGraph(
    url=neo4j_url,
    username=username,
    password=password.get_secret_value()
)

if __name__ == "__main__":
   #check llm connection
   res = llm.invoke("Hello, world!")
   print(res.content)
   #check graph connection
   res = graph.query("MATCH (n) RETURN n LIMIT 1")
   print(res)