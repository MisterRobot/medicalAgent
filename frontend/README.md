# Medical Agent Frontend

基于 Next.js 14 构建的现代化医疗影像分析前端应用。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **UI 组件库**: Shadcn UI (Radix UI)
- **图标**: Lucide React
- **Markdown 渲染**: React Markdown + Remark GFM

## 核心组件

### 1. `AnalysisResult.tsx`
核心分析结果展示组件，负责：
- 与后端 SSE 接口建立连接，处理流式数据。
- **Image Carousel**: 展示多张切片缩略图与大图预览。
- **Accordion Findings**: 将后端返回的结构化诊断结果渲染为可折叠的卡片（异常自动展开）。
- **Thinking Process**: 展示 AI 的思维链过程。
- **Robust Parsing**: 内置 Buffer 缓冲机制，解决 SSE 分包导致的数据截断问题。

### 2. `OSSUpload.tsx`
阿里云 OSS 直传组件，负责：
- 获取后端签名的 STS Token。
- 直接将文件上传至 OSS Bucket，不经过应用服务器。
- 支持上传进度条展示。

## 开发指南

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 环境变量

请在根目录创建 `.env.local` (可选，通常默认连接 localhost:8000)：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```
