'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Mail, Lock, Smartphone, ArrowRight, Eye, EyeOff, Activity, ArrowLeft } from 'lucide-react';
import { getApiBase } from '@/lib/apiBase';

export default function LoginPage() {
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const API_BASE_URL = getApiBase();

  const validatePhone = (value: string) => {
    if (!value) return '请输入手机号码';
    if (!/^1[3-9]\d{9}$/.test(value)) return '请输入有效的11位手机号码';
    return '';
  };

  const validateEmail = (value: string) => {
    if (!value) return '请输入邮箱地址';
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return '请输入有效的邮箱地址';
    return '';
  };

  const validateCode = (value: string) => {
    if (!value) return '请输入验证码';
    if (!/^\d{6}$/.test(value)) return '验证码应为6位数字';
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
    if (loginMethod === 'email') {
      const emailError = validateEmail(email);
      if (emailError) newErrors.email = emailError;
      if (!password) newErrors.password = '请输入密码';
    } else {
      const phoneError = validatePhone(phone);
      if (phoneError) newErrors.phone = phoneError;
      const codeError = validateCode(code);
      if (codeError) newErrors.code = codeError;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setIsLoading(true);

    try {
      let endpoint = '';
      let body = {};

      if (loginMethod === 'email') {
        endpoint = `${API_BASE_URL}/api/auth/login`;
        body = { email, password };
      } else {
        endpoint = `${API_BASE_URL}/api/auth/login/phone`;
        body = { phone, code };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit'
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '登录失败');
      }

      const data = await res.json();
      if (data?.token) {
        localStorage.setItem('medical_token', data.token);
      }
      window.location.href = '/profile';
      
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '登录失败，请检查输入';
      alert(message || '登录失败，请检查输入');
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
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">欢迎回来</h1>
            <p className="text-sm text-slate-500 mt-2">
              登录您的医疗影像智能分析平台账号
            </p>
          </div>

          {/* Login Method Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-lg mb-6">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                loginMethod === 'email'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setLoginMethod('email')}
            >
              邮箱登录
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                loginMethod === 'phone'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setLoginMethod('phone')}
            >
              手机验证码
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {loginMethod === 'email' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">邮箱地址</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="email"
                      placeholder="doctor@example.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
                      }}
                      onBlur={() => setErrors(prev => ({ ...prev, email: validateEmail(email) }))}
                      error={!!errors.email}
                      required
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">密码</label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      忘记密码？
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                      }}
                      error={!!errors.password}
                      required
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
              </div>
            ) : (
              <div className="space-y-4">
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
                      className="w-28 text-xs whitespace-nowrap"
                      disabled={countdown > 0}
                      onClick={handleSendCode}
                    >
                      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </Button>
                  </div>
                  {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-6 bg-teal-600 hover:bg-teal-700"
              size="lg"
              isLoading={isLoading}
            >
              登录
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              还没有账号？{' '}
              <Link
                href="/register"
                className="text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1 group"
              >
                立即注册
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </p>
          </div>
        </div>
        
        {/* Footer decoration */}
        <div className="h-1.5 w-full bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-400" />
      </Card>
    </div>
  );
}
