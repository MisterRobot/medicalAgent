'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Smartphone, Lock, ArrowRight, Eye, EyeOff, ShieldCheck, Activity, ArrowLeft } from 'lucide-react';
import { getApiBase } from '@/lib/apiBase';

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Form states
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const API_BASE_URL = getApiBase();

  const validatePhone = (value: string) => {
    if (!value) return '请输入手机号码';
    if (!/^1[3-9]\d{9}$/.test(value)) return '请输入有效的11位手机号码';
    return '';
  };

  const validateCode = (value: string) => {
    if (!value) return '请输入验证码';
    if (!/^\d{6}$/.test(value)) return '验证码应为6位数字';
    return '';
  };

  const validatePassword = (value: string) => {
    if (!value) return '请输入密码';
    if (value.length < 8) return '密码长度至少为8位';
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(value)) return '密码需包含字母和数字';
    return '';
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setErrors(prev => ({ ...prev, phone: phoneError }));
      return;
    }
    setErrors(prev => ({ ...prev, phone: '' }));
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '发送失败');
      }
      
      setCountdown(60);
      alert('验证码已发送');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '发送失败，请重试';
      alert(message || '发送失败，请重试');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const newErrors: { [key: string]: string } = {};
    const phoneError = validatePhone(phone);
    if (phoneError) newErrors.phone = phoneError;
    const codeError = validateCode(code);
    if (codeError) newErrors.code = codeError;
    const passwordError = validatePassword(password);
    if (passwordError) newErrors.password = passwordError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setIsLoading(true);

    try {
      // 1. Login/Register with Phone & Code
      const res = await fetch(`${API_BASE_URL}/api/auth/login/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
        credentials: 'omit'
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '注册/登录失败');
      }

      const user = await res.json();
      if (user?.token) {
        localStorage.setItem('medical_token', user.token);
      }

      // 2. If user entered a password, update it via profile update API
      if (password && user?.token) {
        try {
          const updateRes = await fetch(`${API_BASE_URL}/api/user/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user.token}`,
            },
            body: JSON.stringify({ password: password }),
            credentials: 'omit'
          });
          
          if (!updateRes.ok) {
            console.warn('Failed to set password:', await updateRes.text());
            // We don't block registration success if password set fails, but maybe alert user?
          }
        } catch (pwError: unknown) {
          console.error('Error setting password:', pwError);
        }
      }

      // Redirect
      window.location.href = '/profile'; 
      
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '注册失败，请检查输入';
      alert(message || '注册失败，请检查输入');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-teal-100 blur-3xl opacity-50" />
        <div className="absolute top-20 -left-20 w-60 h-60 rounded-full bg-blue-100 blur-3xl opacity-50" />
      </div>

      <div className="absolute top-6 left-6 z-20">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-slate-600 hover:text-teal-600 hover:bg-white/50 gap-1">
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Button>
        </Link>
      </div>

      <Card className="w-full max-w-md bg-white/80 backdrop-blur-xl border-slate-200 shadow-xl relative z-10 overflow-hidden">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-50 mb-4">
              <Activity className="w-6 h-6 text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">创建新账号</h1>
            <p className="text-sm text-slate-500 mt-2">
              注册即可使用专业的医疗影像智能分析服务
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">手机号码</label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="tel"
                  placeholder="请输入手机号码"
                  className="pl-10"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setPhone(val);
                    if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
                  }}
                  onBlur={() => setErrors(prev => ({ ...prev, phone: validatePhone(phone) }))}
                  error={!!errors.phone}
                  required
                />
              </div>
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">验证码</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="6位验证码"
                  className="flex-1 text-center tracking-widest"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCode(val);
                    if (errors.code) setErrors(prev => ({ ...prev, code: '' }));
                  }}
                  error={!!errors.code}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-32 text-xs whitespace-nowrap"
                  disabled={countdown > 0}
                  onClick={handleSendCode}
                >
                  {countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
                </Button>
              </div>
              {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">设置密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="8-20位字符，包含字母和数字"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                  }}
                  onBlur={() => setErrors(prev => ({ ...prev, password: validatePassword(password) }))}
                  error={!!errors.password}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>

            <div className="flex items-start gap-2 pt-2">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  type="checkbox"
                  className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                  required
                />
              </div>
              <label htmlFor="terms" className="text-xs text-slate-500 leading-5">
                我已阅读并同意
                <Link href="#" className="text-teal-600 hover:underline mx-1">
                  服务条款
                </Link>
                和
                <Link href="#" className="text-teal-600 hover:underline mx-1">
                  隐私政策
                </Link>
              </label>
            </div>

            <Button
              type="submit"
              className="w-full mt-2 bg-teal-600 hover:bg-teal-700"
              size="lg"
              isLoading={isLoading}
            >
              立即注册
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              已有账号？{' '}
              <Link
                href="/login"
                className="text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1 group"
              >
                直接登录
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </p>
          </div>

          {/* Security Badge */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs">数据安全已加密传输</span>
          </div>
        </div>
        
        {/* Footer decoration */}
        <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-400" />
      </Card>
    </div>
  );
}
