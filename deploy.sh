#!/bin/bash

show_help() {
    echo "用法: $0 [选项]"
    echo "选项："
    echo "  frontend   只构建前端"
    echo "  backend    只安装后端依赖"
    echo "  all        完整安装（默认）"
    echo "  start      启动 FastAPI 服务"
    echo "  help       显示帮助信息"
}

# 检查 Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        echo "❌ 未检测到 Node.js，请先安装 Node.js"
        exit 1
    fi
}

# 检查 Python
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON=python3
    elif command -v python &> /dev/null; then
        PYTHON=python
    else
        echo "❌ 未检测到 Python，请先安装 Python3"
        exit 1
    fi
}

frontend_build() {
    check_node
    echo "✅ Node.js 检测通过"
    cd "$(dirname "$0")/knowledge-mining-visualization" || exit 1
    echo "安装前端依赖..."
    npm install || { echo "❌ 前端依赖安装失败"; exit 1; }
    echo "构建前端项目..."
    npm run build || { echo "❌ 前端构建失败"; exit 1; }
    echo "✅ 前端构建完成"
    cd ..
}

backend_install() {
    check_python
    echo "✅ Python 检测通过"
    # 后端虚拟环境
    if [ ! -d ".venv" ]; then
        echo "创建 Python 虚拟环境 .venv ..."
        $PYTHON -m venv .venv || { echo "❌ 虚拟环境创建失败"; exit 1; }
    fi
    # 激活虚拟环境
    source .venv/bin/activate || { echo "❌ 虚拟环境激活失败"; exit 1; }
    echo "✅ 虚拟环境已激活"
    # 后端依赖
    if [ ! -f requirements.txt ]; then
        echo "❌ 未找到 requirements.txt"
        exit 1
    fi
    echo "安装后端依赖..."
    pip install -r requirements.txt || { echo "❌ 后端依赖安装失败"; exit 1; }
    echo "✅ 后端依赖安装完成"
}

start_service() {
    check_python
    if [ ! -d ".venv" ]; then
        echo "❌ 未检测到虚拟环境，请先执行 backend 或 all 进行安装"
        exit 1
    fi
    source .venv/bin/activate || { echo "❌ 虚拟环境激活失败"; exit 1; }
    cd src || exit 1
    echo "启动 FastAPI 服务..."
    python app.py
}

# 主逻辑
case "$1" in
    frontend)
        frontend_build
        ;;
    backend)
        backend_install
        ;;
    start)
        start_service
        ;;
    all|"" )
        echo "\n=========================================="
        echo "  湖泊知识挖掘系统 - 一键部署脚本"
        echo "==========================================\n"
        frontend_build
        backend_install
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo "❌ 无效参数: $1"
        show_help
        exit 1
        ;;
esac
