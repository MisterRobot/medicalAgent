'use client';

import React, { useCallback, useState } from 'react';
import Image from 'next/image';
import { UploadCloud, File, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OSSUploadProps {
  onUploadSuccess: (url: string, filename: string) => void;
  testUpload?: {
    url: string;
    filename: string;
  };
  ossConfig: {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
  };
}

export const OSSUpload: React.FC<OSSUploadProps> = ({ onUploadSuccess, testUpload, ossConfig }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadSpeed, setUploadSpeed] = useState<string>('');
  const [estimatedTime, setEstimatedTime] = useState<string>('');

  React.useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return '计算中...';
    if (seconds < 60) return `${Math.ceil(seconds)}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}分${secs}秒`;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validTypes = ['application/zip', 'application/x-zip-compressed', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setStatus('error');
      setErrorMessage('仅支持 ZIP、JPG、PNG 文件');
      return;
    }
    setFile(file);
    setStatus('idle');
    setProgress(0);
  };

  const uploadToOSS = async () => {
    if (!file) return;
    if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
      setStatus('error');
      setErrorMessage('OSS 配置不完整');
      return;
    }

    setStatus('uploading');
    setProgress(0);
    setUploadSpeed('');
    setEstimatedTime('计算中...');

    const startTime = Date.now();
    const totalBytes = file.size;

    try {
      // 动态导入 ali-oss 以避免服务端渲染错误
      const OSS = (await import('ali-oss')).default;
      
      const client = new OSS({
        region: ossConfig.region,
        accessKeyId: ossConfig.accessKeyId,
        accessKeySecret: ossConfig.accessKeySecret,
        bucket: ossConfig.bucket,
        secure: true, // 使用 HTTPS
      });

      const fileName = `uploads/${Date.now()}_${file.name}`;
      
      // 分片上传
      const result = await client.multipartUpload(fileName, file, {
        progress: (p: number) => {
          const percent = Math.floor(p * 100);
          setProgress(percent);

          // Calculate speed and time
          const currentTime = Date.now();
          const elapsedSeconds = (currentTime - startTime) / 1000;
          const uploadedBytes = p * totalBytes;

          if (elapsedSeconds > 0.5) { // Wait a bit for stable reading
            const speedBytesPerSec = uploadedBytes / elapsedSeconds;
            setUploadSpeed(formatSpeed(speedBytesPerSec));

            if (speedBytesPerSec > 0) {
              const remainingBytes = totalBytes - uploadedBytes;
              const remainingSeconds = remainingBytes / speedBytesPerSec;
              setEstimatedTime(formatTime(remainingSeconds));
            }
          }
        },
      });

      // 构造公共读 URL (假设 Bucket 是公共读)
      // 如果是私有 Bucket，需要调用 client.signatureUrl
      const url = result.res.requestUrls[0].split('?')[0]; 
      
      setStatus('success');
      onUploadSuccess(url, file.name);
      
    } catch (err: unknown) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '上传失败，请检查网络或 OSS 配置');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {status === 'idle' || status === 'error' ? (
        <div
          className={cn(
            "relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 text-center cursor-pointer group",
            isDragging ? "border-teal-500 bg-teal-50/50" : "border-slate-200 hover:border-teal-400 hover:bg-slate-50",
            status === 'error' && "border-red-300 bg-red-50/30"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".zip,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
          />
          
          <div className="flex flex-col items-center gap-4">
            {previewUrl ? (
              <div className="relative w-40 h-40 rounded-lg overflow-hidden shadow-sm border border-slate-200 bg-slate-50">
                <Image src={previewUrl} alt="Preview" width={160} height={160} className="w-full h-full object-contain" unoptimized />
              </div>
            ) : (
              <div className="p-4 bg-teal-50 rounded-full group-hover:scale-110 transition-transform duration-300">
                <UploadCloud className="w-8 h-8 text-teal-600" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-lg font-semibold text-slate-700">
                {file ? file.name : "点击或拖拽文件到此处"}
              </p>
              <p className="text-sm text-slate-500">
                支持 DICOM 压缩包 (ZIP) 或单张 CT 影像 (JPG/PNG)
              </p>
              {testUpload && (
                <div className="pt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatus('idle');
                      setErrorMessage('');
                      setProgress(0);
                      onUploadSuccess(testUpload.url, testUpload.filename);
                    }}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-teal-200 hover:text-teal-700 transition-colors shadow-sm"
                  >
                    测试上传
                  </button>
                </div>
              )}
            </div>
            {file && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  uploadToOSS();
                }}
                className="mt-4 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-colors shadow-sm"
              >
                开始智能分析
              </button>
            )}
          </div>
          
          {status === 'error' && (
            <div className="absolute bottom-4 left-0 right-0 text-red-500 text-sm flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {errorMessage}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <File className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">{file?.name}</p>
                <p className="text-xs text-slate-500">
                  {(file?.size || 0) / 1024 / 1024 > 1 
                    ? `${((file?.size || 0) / 1024 / 1024).toFixed(2)} MB` 
                    : `${((file?.size || 0) / 1024).toFixed(2)} KB`}
                </p>
              </div>
            </div>
            {status === 'success' ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : (
              <span className="text-sm font-semibold text-teal-600">{progress}%</span>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-300 ease-out rounded-full",
                status === 'success' ? "bg-green-500" : "bg-teal-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {status === 'uploading' && (
            <div className="flex justify-between items-center mt-3 text-xs text-slate-500 font-mono">
              <span>{uploadSpeed && `速度: ${uploadSpeed}`}</span>
              <span>{estimatedTime && `剩余: ${estimatedTime}`}</span>
            </div>
          )}
          
          {status === 'uploading' && (
            <p className="text-center text-xs text-slate-400 mt-1 animate-pulse">
              正在通过阿里云内网极速上传中...
            </p>
          )}
          
          {status === 'success' && (
            <p className="text-center text-xs text-green-600 mt-3 font-medium">
              上传成功！正在准备分析...
            </p>
          )}
        </div>
      )}
    </div>
  );
};
