'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnalysisResult } from '@/components/AnalysisResult';
import axios from 'axios';
import { getApiBase } from '@/lib/apiBase';

// 动态导入 OSSUpload 组件，并禁用 SSR
const OSSUpload = dynamic(() => import('@/components/OSSUpload').then(mod => mod.OSSUpload), {
  ssr: false,
  loading: () => <div className="h-64 flex items-center justify-center text-slate-400">正在加载上传组件...</div>
});

export default function Home() {
  const [models, setModels] = useState<{ name: string; model_id: string; description?: string }[]>([]);
  const [ossConfig, setOssConfig] = useState({
    region: '',
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
  });
  
  const [selectedModel, setSelectedModel] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 新增状态

  // 初始化加载配置
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // 假设后端运行在 8000 端口，生产环境需要配置 Nginx 反代或环境变量
        const API_BASE = getApiBase();
        const res = await axios.get(`${API_BASE}/api/config`);
        
        if (res.data) {
          setOssConfig(res.data.oss);
          setModels(res.data.models || []);
          if (res.data.models && res.data.models.length > 0) {
            setSelectedModel(res.data.models[0].model_id);
          }
        }
      } catch (error) {
        console.error("Failed to load config:", error);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    fetchConfig();
  }, []);

  const handleUploadSuccess = (url: string, _filename: string) => {
    void _filename;
    setFileUrl(url);
    setIsAnalyzing(true); // 触发分析界面
  };

  const handleReset = () => {
    setFileUrl('');
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* ... Header ... */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              ✚
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-emerald-600">
              MedGemma
            </h1>
          </div>
          <nav className="flex items-center gap-3">
             {isAnalyzing && (
               <Button variant="ghost" size="sm" onClick={handleReset}>返回上传</Button>
             )}
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-teal-600">
                个人中心
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-teal-600">
                登录
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm border-transparent">
                注册
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAnalyzing ? (
          <>
            <div className="text-center mb-12">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl mb-4">
                智能医学影像分析
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                利用多模态大模型技术，快速识别 CT/X 光影像中的解剖部位并生成辅助诊断建议。
              </p>
            </div>
            
            {/* Model Selection */}
            <div className="max-w-xl mx-auto mb-8">
               <label className="block text-sm font-medium text-slate-700 mb-2">选择 AI 模型</label>
               <select 
                 className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm rounded-md shadow-sm"
                 value={selectedModel}
                 onChange={(e) => setSelectedModel(e.target.value)}
                 disabled={isLoadingConfig}
               >
                 {models.map((m) => (
                   <option key={m.model_id} value={m.model_id}>
                     {m.description ? `${m.name} - ${m.description}` : m.name}
                   </option>
                 ))}
               </select>
            </div>

            {/* Upload Area */}
            <div className="mb-12">
              {isLoadingConfig ? (
                 <div className="text-center py-12 text-slate-500">正在连接服务...</div>
              ) : (
                <OSSUpload 
                  onUploadSuccess={handleUploadSuccess} 
                  testUpload={{
                    url: 'https://oss-pai-l2lua156215lxk0lxw-cn-hangzhou.oss-cn-hangzhou.aliyuncs.com/uploads/1771989875018_12.zip',
                    filename: '11.zip',
                  }}
                  ossConfig={ossConfig}
                />
              )}
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {/* ... (Cards) ... */}
               {[
                { title: '极速传输', desc: '采用阿里云 OSS 直传技术，绕过服务器带宽限制，千兆秒传。', icon: '🚀' },
                { title: '多模态分析', desc: '集成 Qwen-VL 等顶尖视觉模型，精准识别微小病灶。', icon: '👁️' },
                { title: '结构化报告', desc: '自动生成分部位、分器官的专业诊断建议，支持导出 PPT。', icon: '📄' },
              ].map((feature, i) => (
                <Card key={i} hover className="border-none shadow-none bg-slate-50 hover:bg-white">
                  <CardHeader>
                    <div className="text-4xl mb-4">{feature.icon}</div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <AnalysisResult 
            fileUrl={fileUrl} 
            modelId={selectedModel} 
            modelName={models.find(m => m.model_id === selectedModel)?.name || selectedModel}
            onReset={handleReset} 
          />
        )}
      </main>
    </div>
  );
}
