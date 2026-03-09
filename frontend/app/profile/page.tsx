'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Activity, ArrowLeft, Clock, Database, FileText, Sparkles, Wallet } from 'lucide-react';
import { getApiBase } from '@/lib/apiBase';

type UserInfo = {
  id: number;
  phone?: string | null;
  email?: string | null;
  token_balance: number;
};

type HistoryItem = {
  id: number;
  file_url: string;
  model_id: string;
  model_name?: string | null;
  summary?: string | null;
  findings_json?: string | null;
  token_cost: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  created_at: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('medical_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    const load = async () => {
      try {
        const API_BASE = getApiBase();
        const [meRes, historyRes] = await Promise.all([
          fetch(`${API_BASE}/api/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/api/history?limit=30&offset=0`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!meRes.ok) throw new Error('无法获取用户信息');
        if (!historyRes.ok) throw new Error('无法获取诊断历史');

        const meData = await meRes.json();
        const historyData = await historyRes.json();
        setUser(meData);
        setHistory(historyData.items || []);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '加载失败';
        setError(message || '加载失败');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const totals = useMemo(() => {
    const totalCost = history.reduce((acc, cur) => acc + (cur.token_cost || 0), 0);
    const totalPrompt = history.reduce((acc, cur) => acc + (cur.prompt_tokens || 0), 0);
    const totalCompletion = history.reduce((acc, cur) => acc + (cur.completion_tokens || 0), 0);
    return { totalCost, totalPrompt, totalCompletion };
  }, [history]);

  return (
    <div className="min-h-screen bg-[#0b0f14] text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%),radial-gradient(circle_at_20%_40%,_rgba(16,185,129,0.16),_transparent_50%),radial-gradient(circle_at_80%_30%,_rgba(14,165,233,0.2),_transparent_45%)]" />
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(120deg,_rgba(148,163,184,0.08)_0%,_rgba(15,23,42,0)_60%)]" />
        <div className="relative max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-slate-200 hover:text-white">
                  <ArrowLeft className="w-4 h-4" />
                  返回首页
                </Button>
              </Link>
              <div>
                <div className="text-sm text-slate-300">个人中心</div>
                <h1 className="text-3xl font-bold tracking-tight">影像诊断档案</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                  继续分析
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 -mt-4">
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-emerald-200">
                <Wallet className="w-5 h-5" />
                <span className="text-sm">Token 余额</span>
              </div>
              <div className="text-4xl font-semibold">
                {loading ? '--' : user?.token_balance ?? 0}
              </div>
              <div className="text-xs text-slate-400">分析一次将消耗 Token</div>
            </div>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-cyan-200">
                <Database className="w-5 h-5" />
                <span className="text-sm">诊断历史</span>
              </div>
              <div className="text-4xl font-semibold">{loading ? '--' : history.length}</div>
              <div className="text-xs text-slate-400">累计归档影像批次</div>
            </div>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-indigo-200">
                <Sparkles className="w-5 h-5" />
                <span className="text-sm">累计消耗</span>
              </div>
              <div className="text-4xl font-semibold">{loading ? '--' : totals.totalCost}</div>
              <div className="text-xs text-slate-400">Tokens</div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <Card className="lg:col-span-1 bg-white/5 border-white/10 backdrop-blur-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-slate-200">
                <Activity className="w-5 h-5" />
                <span className="text-sm">账户信息</span>
              </div>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">用户 ID</span>
                  <span>{user?.id ?? '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">手机号</span>
                  <span>{user?.phone || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">邮箱</span>
                  <span>{user?.email || '-'}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-white/10 text-xs text-slate-500">
                Prompt Token 总计：{totals.totalPrompt.toLocaleString()}，Completion Token 总计：{totals.totalCompletion.toLocaleString()}
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2 bg-white/5 border-white/10 backdrop-blur-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 text-slate-200">
                  <FileText className="w-5 h-5" />
                  <span className="text-sm">诊断历史记录</span>
                </div>
                <div className="text-xs text-slate-400">最近 30 条</div>
              </div>

              {loading && (
                <div className="text-slate-400 text-sm py-10 text-center">正在加载...</div>
              )}
              {!loading && error && (
                <div className="text-rose-300 text-sm py-10 text-center">{error}</div>
              )}
              {!loading && !error && history.length === 0 && (
                <div className="text-slate-400 text-sm py-10 text-center">暂无历史记录</div>
              )}

              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                {history.map((item) => (
                  <div key={item.id} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-100">
                        {item.model_name || item.model_id}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">消耗 {item.token_cost} Token</div>
                    <div className="text-sm text-slate-200 line-clamp-2">
                      {item.summary || '暂无摘要'}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        查看影像
                      </a>
                      <span className="text-slate-500">Prompt {item.prompt_tokens ?? 0} / Completion {item.completion_tokens ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
