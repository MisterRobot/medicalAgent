import io
import os
import zipfile
import requests
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.units import inch
from PIL import Image
from utils.image_processing import process_dicom_image

# 注册中文字体 (使用内置的 STSong-Light)
try:
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    FONT_NAME = 'STSong-Light'
except Exception:
    FONT_NAME = 'Helvetica' # Fallback

def download_file(url: str) -> bytes:
    """下载文件"""
    response = requests.get(url)
    response.raise_for_status()
    return response.content

def get_image_from_zip(zip_content: bytes, filename: str) -> Image.Image:
    """从ZIP内容中提取图片"""
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content)) as z:
            # 优先尝试精确匹配
            target_name = None
            if filename in z.namelist():
                target_name = filename
            else:
                # 尝试模糊匹配
                for name in z.namelist():
                    # 忽略 __MACOSX 等隐藏文件
                    if name.startswith('__MACOSX') or name.startswith('.'):
                        continue
                    if name.endswith(filename) or filename in name:
                        target_name = name
                        break
            
            if target_name:
                with z.open(target_name) as f:
                    file_bytes = f.read()
                    # 检查扩展名，决定如何处理
                    ext = target_name.lower().split('.')[-1] if '.' in target_name else ''
                    
                    if ext in ['dcm', 'dicom'] or not ext:
                        try:
                            return process_dicom_image(file_bytes)
                        except Exception as e:
                            print(f"DICOM processing error for {target_name}: {e}")
                            return None
                    else:
                        return Image.open(io.BytesIO(file_bytes)).convert("RGB")
            else:
                print(f"Image {filename} not found in zip")
    except Exception as e:
        print(f"Error extracting image {filename}: {e}")
    return None

def draw_wrapped_text(c, text, x, y, max_width, line_height=14):
    """绘制自动换行的文本"""
    from reportlab.lib.utils import simpleSplit
    # simpleSplit(text, fontName, fontSize, maxWidth)
    lines = simpleSplit(text, FONT_NAME, 10, max_width)
    for line in lines:
        c.drawString(x, y, line)
        y -= line_height
    return y

def generate_pdf_report(file_url: str, analysis_results: list) -> io.BytesIO:
    """
    生成 PDF 报告
    :param file_url: 原始影像文件 URL (ZIP)
    :param analysis_results: 分析结果列表，每项包含 {filename, region, content}
    :return: PDF 文件的 BytesIO 对象
    """
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # 1. 下载 ZIP
    try:
        zip_bytes = download_file(file_url)
    except Exception as e:
        c.drawString(100, height - 100, f"Error downloading file: {str(e)}")
        c.save()
        buffer.seek(0)
        return buffer

    # 2. 封面页
    c.setFont(FONT_NAME, 24)
    c.drawCentredString(width / 2, height - 200, "医学影像智能诊断报告")
    
    c.setFont(FONT_NAME, 14)
    c.drawCentredString(width / 2, height - 250, "Medical Agent AI Analysis Report")
    
    import time
    c.setFont(FONT_NAME, 12)
    c.drawCentredString(width / 2, height - 300, f"生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    c.drawCentredString(width / 2, height - 320, f"切片数量: {len(analysis_results)}")
    
    c.showPage()
    
    # 3. 内容页 (每页一张图 + 描述)
    for idx, item in enumerate(analysis_results):
        filename = item.get('filename', f'Image_{idx}')
        region = item.get('region', '未知部位')
        content = item.get('content', '')
        # 如果 content 是 list (JSON findings), 需要转换成字符串
        if isinstance(content, list):
            # 简单的格式化 findings
            text_lines = []
            for finding in content:
                organ = finding.get('organ', 'Unknown')
                status = finding.get('status', '')
                details = finding.get('details', '')
                text_lines.append(f"- {organ} [{status}]: {details}")
            content_str = "\n".join(text_lines)
        else:
            content_str = str(content)

        # 标题
        display_name = os.path.basename(filename)
        c.setFont(FONT_NAME, 16)
        if region and region != '未知部位':
            title_text = f"切片 #{idx + 1} - {region} ({display_name})"
        else:
            title_text = f"切片 #{idx + 1} ({display_name})"
        
        c.drawString(50, height - 50, title_text)
        c.setFont(FONT_NAME, 10)
        c.drawString(50, height - 70, f"原始路径: {filename}")
        
        # 图片 (尝试从 ZIP 获取)
        img = get_image_from_zip(zip_bytes, filename)
        if img:
            # 保持比例缩放
            img_width, img_height = img.size
            aspect = img_height / float(img_width)
            display_width = 400
            display_height = display_width * aspect
            
            # 限制最大高度
            if display_height > 400:
                display_height = 400
                display_width = display_height / aspect
                
            # 绘制图片 (居中)
            x_img = (width - display_width) / 2
            y_img = height - 100 - display_height
            
            c.drawImage(ImageReader(img), x_img, y_img, width=display_width, height=display_height)
            text_start_y = y_img - 30
        else:
            c.drawString(50, height - 150, "[图片加载失败]")
            text_start_y = height - 180

        # 描述文本
        c.setFont(FONT_NAME, 12)
        c.drawString(50, text_start_y, "诊断意见:")
        
        # 文本换行处理
        text_y = text_start_y - 20
        # 预处理文本，移除 JSON 格式残留
        clean_text = content_str.replace('"', '').replace('{', '').replace('}', '')
        
        text_y = draw_wrapped_text(c, clean_text, 50, text_y, width - 100)
        
        c.showPage()
        
    # 4. 汇总页 (Summary Page)
    c.showPage() # Start a new page for summary
    c.setFont(FONT_NAME, 20)
    c.drawCentredString(width / 2, height - 50, "分析总结 (Analysis Summary)")
    
    y_pos = height - 100
    c.setFont(FONT_NAME, 12)
    
    # 遍历所有结果生成汇总
    has_findings = False
    for idx, item in enumerate(analysis_results):
        filename = item.get('filename', f'Image_{idx}')
        display_name = os.path.basename(filename)
        region = item.get('region', '')
        content = item.get('content', '')
        
        # 构造统一的切片标识
        if region and region != '未知部位':
            slice_id = f"切片 #{idx + 1} - {region} ({display_name})"
        else:
            slice_id = f"切片 #{idx + 1} ({display_name})"
            
        # 提取关键发现 (如果是 list)
        findings_text = ""
        if isinstance(content, list):
            # 过滤出非正常的发现，或者列出所有
            abnormal_findings = []
            for f in content:
                status = f.get('status', '')
                if '异常' in status or 'abnormal' in status.lower() or 'nodule' in status.lower() or 'mass' in status.lower():
                     abnormal_findings.append(f"{f.get('organ', 'Unknown')}: {f.get('details', '')}")
            
            if abnormal_findings:
                findings_text = "; ".join(abnormal_findings)
            else:
                 # 如果没有明显异常，简略显示
                 findings_text = "未发现明显异常 (No significant abnormalities detected)"
        else:
            # 字符串内容，截取前部分或显示全部
            findings_text = str(content)[:100] + "..." if len(str(content)) > 100 else str(content)
            
        # 绘制一行汇总
        # 检查页面空间
        if y_pos < 50:
            c.showPage()
            c.setFont(FONT_NAME, 20)
            c.drawCentredString(width / 2, height - 50, "分析总结 (续)")
            y_pos = height - 100
            c.setFont(FONT_NAME, 12)
            
        c.setFont(FONT_NAME, 10)
        c.drawString(50, y_pos, slice_id)
        
        # 绘制发现内容 (换行处理)
        text_lines = simpleSplit(findings_text, FONT_NAME, 10, width - 100 - 20) # 缩进一点
        
        c.setFont(FONT_NAME, 10)
        curr_y = y_pos - 15
        for line in text_lines:
            if curr_y < 50:
                c.showPage()
                c.setFont(FONT_NAME, 20)
                c.drawCentredString(width / 2, height - 50, "分析总结 (续)")
                y_pos = height - 100
                curr_y = y_pos
                c.setFont(FONT_NAME, 10)
            
            c.drawString(70, curr_y, line) # 缩进显示内容
            curr_y -= 12
            
        y_pos = curr_y - 10 # 下一项的间距

    # 5. 免责声明页
    c.showPage()
    c.setFont(FONT_NAME, 18)
    c.drawCentredString(width / 2, height - 200, "免责声明")
    
    c.setFont(FONT_NAME, 12)
    disclaimer = "本报告由 AI 模型生成，仅供参考，不能作为最终医疗诊断依据。请务必咨询专业医生。"
    draw_wrapped_text(c, disclaimer, 50, height - 250, width - 100)
    
    c.save()
    buffer.seek(0)
    return buffer
