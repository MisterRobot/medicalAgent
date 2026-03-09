'use client';

import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { flushSync } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { Loader2, BrainCircuit, FileText, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Activity, Pause, Download, List, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Slider } from './ui/Slider';
import { getApiBase } from '@/lib/apiBase';

// --- 新增：器官视角组件 ---
interface OrganViewProps {
  batchResults: BatchResult[];
  analyzedImages: { filename: string; base64: string }[];
  BATCH_SIZE: number;
  /** 当前选择的模型名称，用于在标题中展示 */
  modelName?: string;
}

const getRiskScore = (f: Finding) => {
  if (f.status === '异常') {
    if (f.severity === 'high') return 10;
    if (f.severity === 'medium') return 8;
    if (f.severity === 'low') return 6;
    return 5;
  }
  if (f.status === '不确定') return 2;
  return 0;
};

const OrganView: React.FC<OrganViewProps> = ({ batchResults, analyzedImages, BATCH_SIZE, modelName }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [expandedOrgans, setExpandedOrgans] = useState<string[]>([]);
  // 多选状态：空数组表示"全部"
  const [selectedOrgans, setSelectedOrgans] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 使用 ref 记录已自动展开过的器官，避免流式更新时反复重置用户的折叠操作
  const autoExpandedRef = useRef<Set<string>>(new Set());

  // 1. 聚合所有 Findings
  const aggregatedData = React.useMemo(() => {
    const findingsByOrgan: Record<string, (Finding & { globalIndex: number; batchId: number })[]> = {};
    const organStats: Record<string, { total: number; abnormal: number; high: number; medium: number; low: number }> = {};

    batchResults.forEach((batch) => {
      (batch.findings || []).forEach((f) => {
        const globalIndex = batch.batch_id * BATCH_SIZE + (f.slice_index ?? 0);
        if (!findingsByOrgan[f.organ]) {
          findingsByOrgan[f.organ] = [];
          organStats[f.organ] = { total: 0, abnormal: 0, high: 0, medium: 0, low: 0 };
        }
        findingsByOrgan[f.organ].push({ ...f, globalIndex, batchId: batch.batch_id });
        organStats[f.organ].total++;
        if (f.status === '异常') {
          organStats[f.organ].abnormal++;
          if (f.severity === 'high') organStats[f.organ].high++;
          else if (f.severity === 'medium') organStats[f.organ].medium++;
          else if (f.severity === 'low') organStats[f.organ].low++;
        }
      });
    });

    // Sort findings within each organ
    Object.values(findingsByOrgan).forEach(list => {
        list.sort((a, b) => getRiskScore(b) - getRiskScore(a));
    });

    const allOrgans = Object.keys(findingsByOrgan).sort();

    // Sort organs by max risk
    let sortedOrgans = Object.keys(findingsByOrgan).sort((a, b) => {
        const maxScoreA = Math.max(...findingsByOrgan[a].map(getRiskScore));
        const maxScoreB = Math.max(...findingsByOrgan[b].map(getRiskScore));
        return maxScoreB - maxScoreA;
    });

    // 多选过滤逻辑
    if (selectedOrgans.length > 0) {
      sortedOrgans = sortedOrgans.filter(org => selectedOrgans.includes(org));
    }

    // 默认展开有异常的器官
    const abnormalOrgans = Object.keys(organStats).filter(org => organStats[org].abnormal > 0);
    return { findingsByOrgan, organStats, abnormalOrgans, sortedOrgans, allOrgans };
  }, [batchResults, BATCH_SIZE, selectedOrgans]);

  // 初始化默认展开
  useEffect(() => {
    if (aggregatedData.abnormalOrgans.length > 0) {
      const newOrgans = aggregatedData.abnormalOrgans.filter(org => !autoExpandedRef.current.has(org));
      if (newOrgans.length > 0) {
        newOrgans.forEach(org => autoExpandedRef.current.add(org));
        setExpandedOrgans(prev => [...prev, ...newOrgans]);
      }
    }
  }, [aggregatedData.abnormalOrgans]);

  const toggleOrgan = (organ: string) => {
    setExpandedOrgans(prev => 
      prev.includes(organ) ? prev.filter(o => o !== organ) : [...prev, organ]
    );
  };

  // 自动跳转图片
  const jumpToSlice = (globalIndex: number) => {
    setCurrentImageIndex(globalIndex);
  };

  const currentImage = analyzedImages[currentImageIndex];

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[600px]">
      {/* 左侧：统一阅片器 */}
      <div className="w-full lg:w-5/12 flex flex-col gap-2 h-full">
        <Card className="flex-1 bg-black border-slate-800 overflow-hidden flex flex-col relative">
          <div className="flex-1 relative flex items-center justify-center bg-black">
            {currentImage ? (
              <>
                <Image
                  src={`data:image/jpeg;base64,${currentImage.base64}`}
                  alt={currentImage.filename}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain"
                  unoptimized
                />
                {/* 顶部信息栏 */}
                <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/80 to-transparent text-white flex justify-between items-start pointer-events-none">
                  <div className="bg-black/40 px-2 py-1 rounded backdrop-blur-sm">
                    <div className="text-sm font-medium text-teal-400">
                       切片 #{currentImageIndex + 1}
                    </div>
                    <div className="text-xs text-slate-300 opacity-80">
                      {currentImage.filename ? currentImage.filename.split(/[/\\]/).pop() : ''}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 bg-black/40 px-2 py-1 rounded">
                    {currentImageIndex + 1} / {analyzedImages.length}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-sm">等待影像加载...</div>
            )}
          </div>
          
          {/* 底部控制栏 */}
          <div className="h-14 bg-slate-900 border-t border-slate-800 flex items-center gap-4 px-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
              disabled={currentImageIndex <= 0}
              onClick={() => setCurrentImageIndex(i => Math.max(0, i - 1))}
            >
              <ChevronUp className="w-5 h-5 -rotate-90" />
            </Button>
            
            <div className="flex-1">
               <Slider
                 value={[currentImageIndex]}
                 min={0}
                 max={Math.max(0, analyzedImages.length - 1)}
                 step={1}
                 onValueChange={(vals) => setCurrentImageIndex(vals[0])}
                 className="cursor-pointer"
               />
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
              disabled={currentImageIndex >= analyzedImages.length - 1}
              onClick={() => setCurrentImageIndex(i => Math.min(analyzedImages.length - 1, i + 1))}
            >
              <ChevronDown className="w-5 h-5 -rotate-90" />
            </Button>
          </div>
        </Card>
      </div>

      {/* 右侧：按器官聚合的报告 */}
      <div className="w-full lg:w-7/12 h-full overflow-hidden flex flex-col">
        <Card className="flex-1 border-slate-200 bg-slate-50 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-200 bg-white flex justify-between items-center">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              智能诊断分析
              {modelName && (
                <span className="text-xs font-normal text-slate-500">
                  （当前模型：{modelName}）
                </span>
              )}
            </h3>
            <span className="text-xs text-slate-500">
              共发现 {Object.keys(aggregatedData.findingsByOrgan).length} 个部位信息
            </span>
          </div>
          
          <div className="p-3 border-b border-slate-200 bg-white flex items-center gap-2 relative z-20">
            <div className="relative" ref={filterRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={cn(
                  "h-8 gap-2 border-dashed",
                  selectedOrgans.length > 0 ? "text-teal-600 border-teal-200 bg-teal-50" : "text-slate-600"
                )}
              >
                <List className="w-4 h-4" />
                {selectedOrgans.length === 0 ? "筛选部位" : `已选 ${selectedOrgans.length} 个`}
              </Button>

              {isFilterOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100 mb-2">
                    <span className="text-xs font-medium text-slate-500">按部位筛选</span>
                    {selectedOrgans.length > 0 && (
                      <button
                        onClick={() => setSelectedOrgans([])}
                        className="text-xs text-teal-600 hover:text-teal-700"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {aggregatedData.allOrgans.map(org => {
                      const isSelected = selectedOrgans.includes(org);
                      const stats = aggregatedData.organStats[org];
                      return (
                        <div
                          key={org}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors",
                            isSelected ? "bg-teal-50 text-teal-700" : "hover:bg-slate-50 text-slate-700"
                          )}
                          onClick={() => {
                            setSelectedOrgans(prev =>
                              prev.includes(org) ? prev.filter(o => o !== org) : [...prev, org]
                            );
                          }}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                            isSelected ? "bg-teal-500 border-teal-500" : "border-slate-300 bg-white"
                          )}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="flex-1">{org}</span>
                          {stats.abnormal > 0 && (
                            <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded-full">
                              {stats.abnormal}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 已选标签展示 */}
            <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1.5">
              {selectedOrgans.map(org => (
                <span key={org} className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full border border-teal-100 whitespace-nowrap">
                  {org}
                  <button
                    onClick={() => setSelectedOrgans(prev => prev.filter(o => o !== org))}
                    className="hover:bg-teal-100 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {aggregatedData.sortedOrgans.length > 0 ? (
               aggregatedData.sortedOrgans.map((organ) => {
                 const findings = aggregatedData.findingsByOrgan[organ];
                 const stats = aggregatedData.organStats[organ];
                 const isAbnormal = stats.abnormal > 0;
                 const isExpanded = expandedOrgans.includes(organ);

                 return (
                   <div 
                     key={organ} 
                     className={cn(
                       "border rounded-lg transition-all bg-white shadow-sm overflow-hidden",
                       isAbnormal ? "border-red-200" : "border-slate-200"
                     )}
                   >
                     <div 
                       className={cn(
                         "flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors",
                         isAbnormal && "bg-red-50/30 hover:bg-red-50/50"
                       )}
                       onClick={() => toggleOrgan(organ)}
                     >
                       <div className="flex items-center gap-3">
                         <div className={cn(
                           "w-1.5 h-1.5 rounded-full",
                           isAbnormal ? "bg-red-500" : "bg-emerald-500"
                         )} />
                         <span className="font-bold text-slate-700">{organ}</span>
                         {isAbnormal ? (
                           <div className="flex gap-1.5 items-center flex-wrap">
                             <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                               异常 ({stats.abnormal})
                             </span>
                             {stats.high > 0 && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">高危 {stats.high}</span>}
                             {stats.medium > 0 && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">中危 {stats.medium}</span>}
                             {stats.low > 0 && <span className="text-[10px] bg-slate-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">低危 {stats.low}</span>}
                           </div>
                         ) : (
                           <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                             正常
                           </span>
                         )}
                       </div>
                       {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                     </div>

                     {isExpanded && (
                       <div className="border-t border-slate-100 divide-y divide-slate-50">
                         {findings.map((f, idx) => (
                           <div 
                             key={`${f.batchId}-${f.slice_index}-${idx}`}
                             className={cn(
                               "p-3 text-sm transition-colors cursor-pointer flex gap-3 group",
                               currentImageIndex === f.globalIndex ? "bg-teal-50" : "hover:bg-slate-50"
                             )}
                             onClick={() => jumpToSlice(f.globalIndex)}
                           >
                             <div className="flex-shrink-0 mt-0.5">
                               <span className={cn(
                                 "text-xs font-mono px-1.5 py-0.5 rounded border",
                                 currentImageIndex === f.globalIndex 
                                   ? "bg-teal-100 text-teal-700 border-teal-200"
                                   : "bg-slate-100 text-slate-500 border-slate-200 group-hover:border-teal-200 group-hover:text-teal-600"
                               )}>
                                 #{f.globalIndex + 1}
                               </span>
                             </div>
                             <div className="flex-1">
                               <p className={cn(
                                 "leading-relaxed",
                                 f.status === '异常' ? "text-slate-800 font-medium" : "text-slate-600"
                               )}>
                                 {f.details}
                               </p>
                               {f.status === '异常' && f.severity && (
                                 <div className="mt-1.5 flex items-center gap-2">
                                   <span className={cn(
                                     "text-[10px] px-1.5 rounded uppercase font-bold tracking-wider",
                                     f.severity === 'high' ? "bg-red-100 text-red-700" :
                                     f.severity === 'medium' ? "bg-amber-100 text-amber-700" :
                                     "bg-slate-100 text-slate-600"
                                   )}>
                                     {f.severity} RISK
                                   </span>
                                 </div>
                               )}
                             </div>
                             <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                               <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                 <ChevronDown className="w-4 h-4 -rotate-90 text-slate-400" />
                               </Button>
                             </div>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 );
               })
            ) : (
              <div className="text-center py-12 text-slate-400">
                <BrainCircuit className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>正在整理诊断发现...</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

type AnalysisStatus = 'connecting' | 'downloading' | 'analyzing' | 'streaming' | 'done' | 'error' | 'paused';

interface AnalysisResultProps {
  fileUrl: string;
  /** 当前选择的模型 ID（model_id） */
  modelId: string;
  /** 友好的模型名称，来自 /api/config 的 models.name，用于界面展示 */
  modelName?: string;
  onReset: () => void;
}

interface StreamMessage {
  status?: string;
  type?: 'thinking' | 'content' | 'images' | 'json_chunk' | 'meta' | 'usage' | 'total_usage' | 'token';
  content?: string;
  images?: { filename: string; base64: string }[];
  batch_id?: number;
  message?: string;
  error?: string;
  total_slices?: number;
  total_batches?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  token_balance?: number;
  token_cost?: number;
}

interface Finding {
  organ: string;
  status: '正常' | '异常' | '不确定';
  details: string;
  severity?: 'low' | 'medium' | 'high';
  /** 本批次内对应切片的 0-based 索引，用于点击跳转 */
  slice_index?: number;
}

/* OrganGroup removed */

interface BatchResult {
  batch_id: number;
  region?: string;
  findings: Finding[];
  summary?: string;
  raw_json?: string;
}

/* BatchBlock removed */

export const AnalysisResult: React.FC<AnalysisResultProps> = ({ fileUrl, modelId, modelName, onReset }) => {
  // 和后端 BATCH_SIZE 保持一致（每批 8 张，本批返回展示后再请求下一批）
  const BATCH_SIZE = 8;
  
  const [status, setStatus] = useState<AnalysisStatus>('connecting');
  const [statusMessage, setStatusMessage] = useState('正在建立连接...');
  const [thinkingContent, setThinkingContent] = useState('');
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [error, setError] = useState('');
  const [analyzedImages, setAnalyzedImages] = useState<{ filename: string; base64: string }[]>([]);
  // 使用 ref 暂存流式接收的图片，避免高频 setState 导致卡顿
  const pendingImagesRef = useRef<{ filename: string; base64: string }[]>([]);
  /** 由后端 meta 下发的实际切片总数与批次数，避免显示错误的上限 */
  const [totalSlicesFromServer, setTotalSlicesFromServer] = useState<number | null>(null);
  const [totalBatchesFromServer, setTotalBatchesFromServer] = useState<number | null>(null);
  /** 本次分析累计 token：输入/输出，由后端 usage / total_usage 事件更新 */
  const [tokenUsage, setTokenUsage] = useState({ prompt_tokens: 0, completion_tokens: 0 });
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenCost, setTokenCost] = useState<number | null>(null);
  
  // 结构化结果状态
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  // 整体折叠：本次分析的 CT 图片 + 报告作为一个整体折叠
  const [isCollapsedAll, setIsCollapsedAll] = useState(false);
  // 询问本次分析结果
  const [askInput, setAskInput] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [batchResults, thinkingContent]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;
    setTokenUsage({ prompt_tokens: 0, completion_tokens: 0 });
    setAnalyzedImages([]); // 清空旧图片
    pendingImagesRef.current = []; // 清空暂存区
    setBatchResults([]);   // 清空旧结果

    const startAnalysis = async () => {
      try {
        const API_BASE = getApiBase();
        const authToken = localStorage.getItem('medical_token');
        
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }

        const response = await fetch(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ file_url: fileUrl, model_id: modelId }),
          signal: signal,
        });

        if (!response.ok) {
          if (response.status === 402) throw new Error('Token余额不足');
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("无法读取响应流");

        let buffer = ''; 

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (signal.aborted) {
              reader.cancel();
              break;
          }

          // 修复：不要使用 { stream: true }
          const chunk = decoder.decode(value); 
          buffer += chunk;
          
          // 只有当包含双换行符时才尝试处理
          if (buffer.includes('\n\n')) {
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                  if (line.trim().startsWith('data: ')) {
                      const dataStr = line.trim().substring(6); 
                      try {
                        const data: StreamMessage = JSON.parse(dataStr);
                        
                        // Debug: 打印接收到的数据片段
                        if (data.type === 'json_chunk' && data.content) {
                             console.log(`[SSE] Received chunk for batch ${data.batch_id}:`, data.content);
                        }
                        
                        if (data.error) {
                          if (!signal.aborted) {
                              setStatus('error');
                              setError(data.error);
                          }
                          return;
                        }

                        if (signal.aborted) return;

                        if (data.status) {
                          if (data.status === 'done') {
                            setStatus('done');
                            // 确保图片已更新（防止 analyzing 事件丢失的情况）
                            if (pendingImagesRef.current.length > 0) {
                                setAnalyzedImages(prev => prev.length === 0 ? [...pendingImagesRef.current] : prev);
                            }
                            flushSync(() => {
                              setBatchResults(prev => {
                                const newResults = [...prev];
                                newResults.forEach(batch => {
                                  if (batch.raw_json && (!batch.findings || batch.findings.length === 0)) {
                                    try {
                                      let jsonStr = batch.raw_json || '';
                                      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                                      const match = jsonStr.match(/\{[\s\S]*\}/);
                                      if (match) jsonStr = match[0];
                                      const parsed = JSON.parse(jsonStr);
                                      batch.region = parsed.region;
                                      batch.findings = parsed.findings || [];
                                      batch.summary = parsed.summary;
                                    } catch { }
                                  }
                                });
                                return newResults;
                              });
                            });
                          } else {
                            // 如果状态变为 analyzing，说明图片接收完毕，一次性更新到状态
                            if (data.status === 'analyzing' && pendingImagesRef.current.length > 0) {
                                setAnalyzedImages([...pendingImagesRef.current]);
                            }
                            setStatus(data.status as AnalysisStatus);
                            if (data.message) setStatusMessage(data.message);
                          }
                        }

                        if (data.type === 'meta') {
                          if (data.total_slices != null) setTotalSlicesFromServer(data.total_slices);
                          if (data.total_batches != null) setTotalBatchesFromServer(data.total_batches);
                        }

                        if (data.type === 'token') {
                          if (data.token_balance != null) setTokenBalance(data.token_balance);
                          if (data.token_cost != null) setTokenCost(data.token_cost);
                        }

                        if (data.type === 'usage') {
                          setTokenUsage(prev => ({
                            prompt_tokens: prev.prompt_tokens + (data.prompt_tokens ?? 0),
                            completion_tokens: prev.completion_tokens + (data.completion_tokens ?? 0),
                          }));
                        }
                        if (data.type === 'total_usage') {
                          setTokenUsage({
                            prompt_tokens: data.prompt_tokens ?? 0,
                            completion_tokens: data.completion_tokens ?? 0,
                          });
                        }

                        if (data.type === 'images' && data.images) {
                          // 暂存到 ref，不立即触发重渲染，防止 UI 卡死
                          pendingImagesRef.current.push(...data.images);
                        }

                        if (data.type === 'thinking') {
                          setStatus('streaming');
                          setThinkingContent(prev => prev + (data.content || ''));
                        }

                        if (data.type === 'json_chunk' && data.content) {
                          setStatus('streaming');
                          const batchId = data.batch_id || 0;
                          flushSync(() => {
                            setBatchResults(prev => {
                              const newResults = [...prev];
                              let batchIndex = newResults.findIndex(b => b.batch_id === batchId);
                              if (batchIndex === -1) {
                                newResults.push({ batch_id: batchId, findings: [], raw_json: '' });
                                batchIndex = newResults.length - 1;
                              }
                              newResults[batchIndex] = { ...newResults[batchIndex] };
                              const batch = newResults[batchIndex];
                              batch.raw_json = (batch.raw_json || '') + data.content;
                              try {
                                let jsonStr = batch.raw_json || '';
                                jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                                const match = jsonStr.match(/\{[\s\S]*\}/);
                                if (match) jsonStr = match[0];
                                if (jsonStr.trim().startsWith('{') && jsonStr.trim().endsWith('}')) {
                                  const parsed = JSON.parse(jsonStr);
                                  batch.region = parsed.region;
                                  batch.findings = parsed.findings || [];
                                  batch.summary = parsed.summary;
                                }
                              } catch { }
                              return newResults;
                            });
                          });
                        }

                      } catch (error) {
                        console.warn("Parse error", error);
                      }
                  }
              }
          }
        }

      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus('paused');
          setStatusMessage('已暂停');
          return;
        }
        setStatus('error');
        setError(err instanceof Error ? err.message : '连接中断');
      }
    };

    startAnalysis();

    return () => {
      abortControllerRef.current = null;
      controller.abort();
    };
  }, [fileUrl, modelId]);

  /** 构建本次分析摘要文本供 /api/ask 使用，限制长度避免大请求卡住 */
  const MAX_ASK_CONTEXT_CHARS = 14000;
  const buildAskContext = (): string => {
    const parts: string[] = [];
    let total = 0;
    for (let i = 0; i < batchResults.length && total < MAX_ASK_CONTEXT_CHARS; i++) {
      const b = batchResults[i];
      const line1 = `【批次 ${i + 1}】${b.region || '影像分析'}`;
      const summaryLine = b.summary ? `总结：${b.summary}` : '';
      const findingLines = (b.findings || [])
        .map((f) => (f.status === '异常' ? `${f.organ}（异常）：${f.details.slice(0, 120)}` : `${f.organ}（${f.status}）`))
        .join('；');
      const block = [line1, summaryLine, findingLines].filter(Boolean).join('\n');
      if (total + block.length + 2 > MAX_ASK_CONTEXT_CHARS) {
        parts.push(block.slice(0, MAX_ASK_CONTEXT_CHARS - total - 20) + '\n…（已截断）');
        break;
      }
      parts.push(block);
      total += block.length + 2;
    }
    return parts.join('\n\n');
  };

  const handleAsk = async () => {
    const q = askInput.trim();
    if (!q || askLoading) return;
    setAskLoading(true);
    setAskAnswer(''); // 重置为空字符串，准备接收流式数据
    
    // 使用 AbortController 处理请求取消
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    
    try {
      const API_BASE = getApiBase();
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          question: q,
          context: buildAskContext(),
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(await res.text());
      
      // 处理 SSE 流
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("无法读取响应流");
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        buffer += chunk;
        
        if (buffer.includes('\n\n')) {
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                    const dataStr = line.trim().substring(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.error) {
                            setAskAnswer(prev => (prev || '') + `\n[错误: ${data.error}]`);
                            return;
                        }
                        if (data.type === 'answer' && data.content) {
                            setAskAnswer(prev => (prev || '') + data.content);
                        }
                    } catch (e) {
                        console.warn("Ask parse error", e);
                    }
                }
            }
        }
      }
      
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        setAskAnswer(prev => (prev || '') + '\n[请求超时（120 秒），请缩小分析批次或稍后重试。]');
      } else {
        setAskAnswer(prev => (prev || '') + `\n[请求失败：${e instanceof Error ? e.message : String(e)}]`);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (analyzedImages.length === 0) return;
    setIsGeneratingPdf(true);
    try {
        const payload = analyzedImages.map((img, index) => {
            const batchId = Math.floor(index / BATCH_SIZE);
            const localIndex = index % BATCH_SIZE;
            const batch = batchResults.find(b => b.batch_id === batchId);
            
            let content: Finding[] = [];
            if (batch && batch.findings) {
                content = batch.findings.filter(f => f.slice_index === localIndex);
            }
            
            return {
                filename: img.filename,
                region: batch?.region || 'Unknown',
                content: content
            };
        });

        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE}/api/report/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_url: fileUrl,
                analysis_results: payload
            })
        });

        if (!res.ok) throw new Error('PDF generation failed');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 参考 app.py 的命名风格
        a.download = "MedGemma_Diagnosis_Report.pdf";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (e) {
        console.error(e);
        alert('生成报告失败，请重试');
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  const totalSlices = totalSlicesFromServer ?? analyzedImages.length;
  const totalBatches = totalBatchesFromServer ?? batchResults.length;

  return (
    <div className="h-[calc(100vh-140px)] min-h-[260px]">
      {/* 顶部整体折叠/展开控制条 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-700">本次分析</span>
          <span>切片数：{totalSlices || '解析中...'}</span>
          <span>批次数：{totalBatches || '解析中...'}</span>
          {tokenCost != null && (
            <span className="text-slate-500">
              本次消耗：{tokenCost} Token
            </span>
          )}
          {tokenBalance != null && (
            <span className="text-slate-500">
              余额：{tokenBalance} Token
            </span>
          )}
          {(tokenUsage.prompt_tokens > 0 || tokenUsage.completion_tokens > 0) && (
            <span className="text-slate-500">
              输入 token：{tokenUsage.prompt_tokens.toLocaleString()}，输出 token：{tokenUsage.completion_tokens.toLocaleString()}
            </span>
          )}
          {status === 'done' && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 完成</span>}
          {status === 'paused' && <span className="text-amber-600 flex items-center gap-1">已暂停</span>}
          {(status === 'connecting' || status === 'downloading' || status === 'analyzing' || status === 'streaming') && (
            <span className="text-teal-600 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {statusMessage}
            </span>
          )}
          {status === 'error' && <span className="text-red-500">发生错误</span>}
        </div>
        <div className="flex items-center gap-2">
          {(status === 'connecting' || status === 'downloading' || status === 'analyzing' || status === 'streaming') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => abortControllerRef.current?.abort()}
              className="text-amber-600 border-amber-200 hover:bg-amber-50"
            >
              <Pause className="w-3 h-3 mr-1" />
              暂停分析
            </Button>
          )}
          {(status === 'done' || status === 'paused') && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGeneratePDF}
                disabled={isGeneratingPdf}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                {isGeneratingPdf ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                导出报告
              </Button>
              <Button size="sm" variant="outline" onClick={onReset}>
                开始新分析
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCollapsedAll(prev => !prev)}
          >
            {isCollapsedAll ? '展开本次分析' : '折叠本次分析'}
            {isCollapsedAll ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronUp className="w-3 h-3 ml-1" />}
          </Button>
        </div>
      </div>

      {isCollapsedAll ? (
        // 折叠态：只保留一张总览卡片
        <Card className="w-full h-[180px] flex items-center justify-center bg-slate-50 border-dashed border-slate-200">
          <div className="text-center space-y-3 px-6">
            <div className="text-sm font-medium text-slate-700">本次分析已折叠</div>
            <div className="text-xs text-slate-500 space-y-1">
              <div>切片总数：{totalSlices || '解析中...'}</div>
              <div>诊断批次：{totalBatches || '解析中...'}</div>
              {tokenCost != null && <div>本次消耗：{tokenCost} Token</div>}
              {tokenBalance != null && <div>余额：{tokenBalance} Token</div>}
              {(tokenUsage.prompt_tokens > 0 || tokenUsage.completion_tokens > 0) && (
                <div>输入 token：{tokenUsage.prompt_tokens.toLocaleString()}，输出 token：{tokenUsage.completion_tokens.toLocaleString()}</div>
              )}
              {status === 'done' && <div className="text-emerald-600">可展开查看详细影像与报告</div>}
            </div>
          </div>
        </Card>
      ) : (
        <div ref={scrollRef} className="space-y-4 overflow-y-auto">
          {/* 视图切换 Tabs 已移除 */}

          {/* 状态日志 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h4 className="font-semibold text-slate-700 mb-2 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              状态日志
            </h4>
            <div className="space-y-2 text-xs text-slate-500 font-mono">
              <div className={cn(
                'flex items-center gap-2',
                status === 'done' ? 'text-green-600' : status === 'paused' ? 'text-amber-600' : 'text-teal-600',
              )}>
                {status === 'done' && <CheckCircle2 className="w-3 h-3" />}
                {status !== 'done' && status !== 'paused' && <Loader2 className="w-3 h-3 animate-spin" />}
                {status === 'error' ? '发生错误' : status === 'done' ? '分析完成' : status === 'paused' ? '已暂停' : statusMessage}
              </div>
              {(tokenUsage.prompt_tokens > 0 || tokenUsage.completion_tokens > 0) && (
                <div className="text-slate-600">
                  输入 token：{tokenUsage.prompt_tokens.toLocaleString()}，输出 token：{tokenUsage.completion_tokens.toLocaleString()}
                </div>
              )}
              {error && <div className="text-red-500 bg-red-50 p-2 rounded">{error}</div>}
            </div>
          </div>

          {/* AI 思考过程（全局） */}
          {thinkingContent && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[280px]">
              <button
                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                className="w-full px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between hover:bg-slate-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <BrainCircuit className="w-5 h-5 text-indigo-600" />
                  <span>AI 深度思考过程</span>
                  {status !== 'done' && status !== 'error' && (
                    <span className="animate-pulse text-indigo-500">...</span>
                  )}
                </div>
                {isThinkingExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {isThinkingExpanded && (
                <div className="p-4 overflow-y-auto font-mono text-sm text-slate-600 bg-slate-50/50 flex-1">
                  <div className="prose prose-sm max-w-none prose-slate">
                    <ReactMarkdown>{thinkingContent}</ReactMarkdown>
                  </div>
                  {status === 'streaming' && (
                    <span className="inline-block w-2 h-4 bg-indigo-500 ml-1 animate-pulse" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 主要内容区域：器官聚合视角 */}
          {batchResults.length > 0 ? (
            <OrganView 
              batchResults={batchResults}
              analyzedImages={analyzedImages}
              BATCH_SIZE={BATCH_SIZE}
              modelName={modelName}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-4">
              {status === 'error' ? (
                <>
                  <AlertTriangle className="w-12 h-12 text-red-300" />
                  <p className="text-red-400">生成报告失败</p>
                </>
              ) : (
                <>
                  <Activity className="w-8 h-8 animate-pulse text-teal-400" />
                  <p>AI 正在阅片中，请稍候...</p>
                </>
              )}
            </div>
          )}

          {/* 询问本次分析结果：完成或暂停后均可基于已有批次提问 */}
          {batchResults.length > 0 && (status === 'done' || status === 'paused') && (
            <Card className="p-4 border-teal-100 bg-gradient-to-b from-white to-teal-50/30 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" />
                  询问本次分析结果
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGeneratePDF}
                  disabled={isGeneratingPdf}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 bg-white"
                >
                  {isGeneratingPdf ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                  导出 PDF
                </Button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                {status === 'paused' ? (
                  <>已暂停，可基于当前已分析的 <strong>{batchResults.length}</strong> 个批次结果回答（共 <strong>{totalBatches}</strong> 批次）。</>
                ) : (
                  <>可输入问题，如：总结异常发现、是否有建议随访等，将基于上述 <strong>{totalBatches}</strong> 个批次结果回答。</>
                )}
              </p>
              
              {askAnswer != null && (
                <div className="mb-4 p-4 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap">
                  {askAnswer}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder="输入问题，例如：本次分析有哪些异常？"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  disabled={askLoading}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleAsk}
                  disabled={askLoading || !askInput.trim()}
                  isLoading={askLoading}
                >
                  提问
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
