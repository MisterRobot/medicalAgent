# Medical Agent - 智能医疗影像分析平台

基于 **Next.js (前端)** + **FastAPI (后端)** 的现代化医疗影像分析系统，集成多模态大模型，提供专业的影像诊断服务。

## 🏗️ 系统架构概览

### 架构模式
采用 **前后端分离 + 微服务化** 架构：
- **前端**: Next.js 16.1.6 + React 19 + TypeScript，支持 SSR/SSG
- **后端**: FastAPI + Python 3.10+，异步处理 + SSE 流式响应
- **部署**: Docker 容器化 + GitHub Actions CI/CD
- **存储**: 阿里云 OSS 直传，避免服务器带宽瓶颈

### 核心组件交互
```
用户上传 → OSS直传 → 后端批处理 → AI多模态分析 → SSE流式输出 → 前端实时渲染
```

### 数据流设计
1. **上传阶段**: 前端直接上传至 OSS，返回 URL 给后端
2. **处理阶段**: 后端异步下载、解压、分批处理（8张/批）
3. **分析阶段**: 多模型并发调用，支持思维链可视化
4. **渲染阶段**: 前端 Buffer 管理 + 正则提取 JSON，实时展示

## 🌟 核心特性

### 2. 强大的影像处理
- **OSS 直传**: 集成阿里云 OSS，支持 GB 级大文件极速上传，不占用应用服务器带宽。
- **多格式支持**: DICOM 序列 (ZIP), JPG, PNG。
- **智能批处理**: 后端自动将序列切片分组 (Batch Processing)，顺序提交给 AI 进行分析，避免 Token 溢出并提高稳定性。

### 3. AI 深度诊断
- **多模型支持**: 动态切换模型。
- **结构化输出**: 强制 AI 输出严格的 JSON 数据，包含器官 (Organ)、状态 (Status)、严重程度 (Severity) 和详细描述 (Details)。
- **思维链 (Thinking Process)**: 可视化展示 AI 的深度思考过程（可折叠），增加诊断透明度。

### 4. 专业级 UI/UX
- **分屏设计**: 左侧影像轮播 (Carousel) + 右侧实时诊断报告。
- **实时流式渲染**: 诊断结果按批次实时上屏，无需等待全部分析完成。
- **异常高亮**: 异常发现自动展开并标红，正常结果折叠显示，极大提升阅片效率。
- **PDF 报告导出**: 支持一键生成包含影像截图与诊断详情的 PDF 报告。
- **用户认证体系**: 提供登录/注册界面，支持多种登录方式（邮箱/手机）。
- **鲁棒性设计**: 前端内置 Buffer 缓冲与正则清洗机制，完美处理网络分包与非标准 JSON 输出。

## 🚀 快速开始

### 1. 环境准备
- Node.js 18+
- Python 3.10+
- 阿里云 OSS 账号 (AccessKey/Secret)
- 阿里云 DashScope (通义千问) API Key

### 2. 后端启动 (FastAPI)

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置 AK/SK (修改 config/config.yaml)
# 建议复制 config.yaml.example -> config.yaml

# 启动服务
python main.py
# 服务将运行在 http://localhost:8000
```

### 3. 前端启动 (Next.js)

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

## 📂 目录结构

```
medical_agent/
├── backend/                    # FastAPI 后端服务
│   ├── config/
│   │   └── config.yaml        # 多模型配置 (OSS + 6种AI模型)
│   ├── utils/
│   │   └── image_processing.py # ZIP解压 + DICOM转JPEG + Base64编码
│   ├── main.py                # 核心API：/analyze (SSE) + /ask + /config
│   ├── pdf_generator.py       # PDF 报告生成服务
│   ├── requirements.txt       # Python依赖：fastapi≥0.109 + openai≥1.0 + oss2
│   └── Dockerfile             # 后端容器化
├── frontend/                   # Next.js 前端应用
│   ├── app/
│   │   ├── login/             # 登录页面
│   │   ├── register/          # 注册页面
│   │   ├── page.tsx           # 首页：上传 + 模型选择
│   │   └── layout.tsx         # 根布局
│   ├── components/
│   │   ├── OSSUpload.tsx      # OSS直传组件（动态导入，SSR=false）
│   │   ├── AnalysisResult.tsx # SSE流式解析 + 分屏展示
│   │   └── ui/                # Shadcn UI组件库
│   ├── public/                # 静态资源
│   ├── package.json           # Next.js 16.1.6 + React 19 + Tailwind v4
│   └── next.config.ts         # Next.js配置（支持SSR/SSG）
├── .github/workflows/
│   └── deploy_medical_agent.yml # CI/CD：medical_agent目录变更自动部署
├── docker-compose.yml          # 生产容器编排（端口8501）
├── Dockerfile                 # 根容器（Streamlit备用）
├── app.py                     # Streamlit演示版本（备用入口）
└── README.md                  # 架构文档（本文件）
```

## 🔧 关键配置

### 后端配置 (`backend/config/config.yaml`)
```yaml
oss:
  access_key_id: "your-id"
  access_key_secret: "your-secret"
  bucket_name: "your-bucket"
  endpoint: "oss-cn-beijing.aliyuncs.com"

models:
  - name: ""
    api_key: "sk-..."
    enable_thinking: false
```

## 🛠️ 技术细节与架构亮点

### 1. 高性能上传架构
- **OSS 直传**: 前端直接上传至阿里云 OSS，绕过应用服务器，支持 GB 级大文件秒传
- **STS 临时凭证**: 后端动态生成上传凭证，保障安全
- **分片上传**: 自动处理大文件分片，断点续传

### 2. 智能批处理引擎
- **动态批次**: 8张/批次，避免 Token 溢出（单批约 2000 tokens）
- **并发控制**: 批次间 1s 间隔，避免触发模型速率限制
- **容错机制**: 网络异常自动重试，批次失败不影响后续

### 3. 流式响应架构
- **SSE 协议**: 基于 `text/event-stream`，支持实时推送
- **Buffer 管理**: 前端手动管理 TextDecoder，解决网络分包导致的字符截断
- **JSON 容错**: 正则提取器 `/\{[\s\S]*?\}/g` 精准提取嵌套 JSON
- **思维链可视化**: 支持 `enable_thinking=true` 时的推理过程展示

### 4. 前端状态管理
- **React 19**: 使用 `use()` Hook 处理异步数据
- **AbortController**: 彻底消除 Strict Mode 下的双重请求问题
- **动态导入**: OSSUpload 组件 SSR=false，避免服务端渲染冲突
- **分屏交互**: 左侧影像轮播 + 右侧诊断报告，支持切片跳转定位

### 5. 多模型路由
支持 6 种模型动态切换：
- **医学专用**: Google MedGemma（医学微调版）
- **本地部署**: Llama-3-V-20B（支持私有化）

### 6. 部署与监控
- **容器化**: 前后端独立 Dockerfile，支持水平扩展
- **CI/CD**: GitHub Actions 自动部署（`medical_agent/**` 路径触发）
- **健康检查**: `/health` 端点，集成容器探针
- **日志追踪**: 结构化日志输出，支持分布式追踪
