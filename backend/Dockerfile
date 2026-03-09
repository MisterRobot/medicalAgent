FROM python:3.10-slim

# 可选：由 CI 传入本次构建对应的 Git 提交，用于在容器内排查版本
ARG GIT_SHA=""
ENV BUILD_SHA=${GIT_SHA}

WORKDIR /app

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制源代码
COPY . .

# 记录当前构建版本，便于在服务器容器内排查使用的是哪个 git 提交
RUN echo "$BUILD_SHA" > /app/BUILD_SHA || echo "unknown" > /app/BUILD_SHA

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
