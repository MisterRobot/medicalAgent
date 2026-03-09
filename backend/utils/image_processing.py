import io
import os
import zipfile
import requests
import base64
import numpy as np
from PIL import Image

# 尝试导入 pydicom
try:
    import pydicom
    HAS_PYDICOM = True
except ImportError:
    HAS_PYDICOM = False

def download_file_from_url(url: str) -> bytes:
    """从 URL 下载文件内容"""
    try:
        resp = requests.get(url, stream=True)
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        raise Exception(f"Failed to download file from {url}: {e}")

def normalize_image(image: np.ndarray) -> np.ndarray:
    """将 DICOM 像素数组归一化到 0-255"""
    min_val = np.min(image)
    max_val = np.max(image)
    if max_val == min_val:
        return np.zeros(image.shape, dtype=np.uint8)
    image = (image - min_val) / (max_val - min_val) * 255
    return image.astype(np.uint8)

def process_dicom_image(dicom_content: bytes) -> Image.Image:
    """将 DICOM 字节流转换为 PIL Image"""
    if not HAS_PYDICOM:
        raise ImportError("pydicom not installed")
    
    with io.BytesIO(dicom_content) as f:
        ds = pydicom.dcmread(f)
        if 'PixelData' not in ds:
            raise ValueError("No pixel data found in DICOM file")
        
        pixel_array = ds.pixel_array
        # 处理多帧 (取第一帧)
        if len(pixel_array.shape) > 2 and pixel_array.shape[0] > 1:
             pixel_array = pixel_array[0]
             
        normalized = normalize_image(pixel_array)
        return Image.fromarray(normalized).convert("RGB")

def extract_images_from_zip(zip_content: bytes, max_files: int = 5) -> list[dict]:
    """
    从 ZIP 内容中提取图片 (支持 JPG/PNG/DICOM)
    返回: [{'filename': str, 'base64': str}, ...]
    """
    images = []
    with zipfile.ZipFile(io.BytesIO(zip_content)) as z:
        # 筛选文件
        file_list = [f for f in z.namelist() if not f.startswith('__MACOSX') and not f.startswith('.')]
        # 排序
        file_list.sort()
        
        # 限制数量
        count = 0
        for filename in file_list:
            if count >= max_files:
                break
            
            file_ext = filename.lower().split('.')[-1]
            try:
                with z.open(filename) as f:
                    file_bytes = f.read()
                    img = None
                    
                    if file_ext in ['jpg', 'jpeg', 'png']:
                        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
                    elif file_ext in ['dcm', 'dicom'] or not file_ext: # 假设无后缀的是 DICOM
                        try:
                            img = process_dicom_image(file_bytes)
                        except Exception:
                            continue # 跳过无法解析的 DICOM
                    
                    if img:
                        # 压缩尺寸，避免 Token 过大
                        img.thumbnail((512, 512))
                        buffered = io.BytesIO()
                        img.save(buffered, format="JPEG")
                        img_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
                        
                        images.append({
                            "filename": filename,
                            "base64": img_b64
                        })
                        count += 1
            except Exception as e:
                print(f"Error processing {filename}: {e}")
                continue
                
    return images
