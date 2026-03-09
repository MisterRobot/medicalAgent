import os
import logging
import yaml
import json
import time
from datetime import datetime, timedelta
from typing import List, Optional, AsyncGenerator, Tuple, Dict
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import AsyncOpenAI
from utils.image_processing import download_file_from_url, extract_images_from_zip
from pdf_generator import generate_pdf_report
import asyncio
import jwt
from passlib.context import CryptContext
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy import text

app = FastAPI(title="MedGemma API", version="1.0.0")

# --- 配置加载 ---
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "config.yaml")
APP_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "app.yaml")

def load_config():
    if not os.path.exists(CONFIG_PATH):
        return {"oss": {}, "models": []}
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_app_config():
    if not os.path.exists(APP_CONFIG_PATH):
        return {}
    with open(APP_CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medgemma")

config = load_config()
app_config = load_app_config()

db_config = app_config.get("db", {})
jwt_config = app_config.get("jwt", {})
token_config = app_config.get("token", {})
cors_config = app_config.get("cors", {})

def log_config_status():
    logger.info("app.yaml path=%s exists=%s", APP_CONFIG_PATH, os.path.exists(APP_CONFIG_PATH))
    db_missing = [k for k in ["host", "port", "user", "password", "name"] if not db_config.get(k)]
    jwt_missing = [k for k in ["secret", "alg", "expire_minutes"] if not jwt_config.get(k)]
    token_missing = [k for k in ["initial_tokens", "cost_per_analysis"] if not token_config.get(k)]
    if db_missing:
        logger.warning("db config missing: %s", ", ".join(db_missing))
    if jwt_missing:
        logger.warning("jwt config missing: %s", ", ".join(jwt_missing))
    if token_missing:
        logger.warning("token config missing: %s", ", ".join(token_missing))

log_config_status()

DB_HOST = db_config.get("host") or "localhost"
DB_PORT = int(db_config.get("port") or 3306)
DB_USER = db_config.get("user") or "root"
DB_PASSWORD = db_config.get("password") or ""
DB_NAME = db_config.get("name") or "wegame_medical"
DB_POOL_SIZE = int(db_config.get("pool_size") or 5)

JWT_SECRET = jwt_config.get("secret") or "dev-secret"
JWT_ALG = jwt_config.get("alg") or "HS256"
JWT_EXPIRE_MINUTES = int(jwt_config.get("expire_minutes") or 10080)

INITIAL_TOKENS = int(token_config.get("initial_tokens") or 100)
TOKEN_COST_PER_ANALYSIS = int(token_config.get("cost_per_analysis") or 10)

default_cors_allow_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

cors_allow_origins = cors_config.get("allow_origins") or default_cors_allow_origins
cors_allow_origin_regex = cors_config.get("allow_origin_regex")
cors_allow_credentials = bool(cors_config.get("allow_credentials", False))
cors_allow_methods = cors_config.get("allow_methods") or ["*"]
cors_allow_headers = cors_config.get("allow_headers") or ["*"]

logger.info(
    "cors allow_origins=%s allow_origin_regex=%s allow_credentials=%s",
    cors_allow_origins,
    cors_allow_origin_regex,
    cors_allow_credentials,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_origin_regex=cors_allow_origin_regex,
    allow_credentials=cors_allow_credentials,
    allow_methods=cors_allow_methods,
    allow_headers=cors_allow_headers,
)

pymysql_url = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
engine = create_engine(pymysql_url, pool_size=DB_POOL_SIZE, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class User(Base):
    __tablename__ = "med_users"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(32), unique=True, index=True, nullable=True)
    email = Column(String(128), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    token_balance = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tokens = relationship("TokenTransaction", back_populates="user")
    histories = relationship("DiagnosisHistory", back_populates="user")


class TokenTransaction(Base):
    __tablename__ = "med_token_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("med_users.id"), nullable=False, index=True)
    change = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reason = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="tokens")


class DiagnosisHistory(Base):
    __tablename__ = "med_diagnosis_histories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("med_users.id"), nullable=False, index=True)
    file_url = Column(Text, nullable=False)
    model_id = Column(String(128), nullable=False)
    model_name = Column(String(128), nullable=True)
    summary = Column(Text, nullable=True)
    findings_json = Column(Text, nullable=True)
    token_cost = Column(Integer, nullable=False, default=0)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="histories")


def ensure_database():
    base_url = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}?charset=utf8mb4"
    base_engine = create_engine(base_url, pool_pre_ping=True)
    with base_engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))


@app.on_event("startup")
def startup():
    ensure_database()
    Base.metadata.create_all(bind=engine)

# --- 数据模型 ---
class OSSConfig(BaseModel):
    region: str
    accessKeyId: str
    accessKeySecret: str
    bucket: str
    endpoint: str

class ModelConfig(BaseModel):
    name: str
    model_id: str
    description: Optional[str] = None

class AppConfigResponse(BaseModel):
    oss: OSSConfig
    models: List[ModelConfig]


class RegisterRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class LoginPasswordRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    password: str


class LoginLegacyRequest(BaseModel):
    username: str
    password: str


class LoginPhoneRequest(BaseModel):
    phone: str
    code: str


class UpdateProfileRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class PurchaseTokenRequest(BaseModel):
    amount: int

class AnalyzeRequest(BaseModel):
    file_url: str
    model_id: str


class AskRequest(BaseModel):
    """询问本次分析结果"""
    model_id: str
    question: str
    context: str  # 本次各批次总结与发现的文本摘要，供模型回答时参考


class GenerateReportRequest(BaseModel):
    """生成 PDF 报告请求"""
    file_url: str
    analysis_results: List[dict]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def get_current_user(request: Request) -> User:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    finally:
        db.close()


def get_current_user_optional(request: Request) -> Optional[User]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = int(payload.get("sub"))
    except Exception:
        return None
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user_id).first()
    finally:
        db.close()


# --- 核心逻辑 ---
async def analyze_stream(file_url: str, model_id: str, user_id: Optional[int], history_id: Optional[int], token_balance: Optional[int], token_cost: Optional[int]) -> AsyncGenerator[str, None]:
    """生成器：流式返回分析结果 (SSE 格式)"""
    
    selected_model = next((m for m in config.get("models", []) if m["model_id"] == model_id), None)
    if not selected_model:
        yield f"data: {json.dumps({'error': 'Model not found'})}\n\n"
        return

    if token_balance is not None or token_cost is not None:
        yield f"data: {json.dumps({'type': 'token', 'token_cost': token_cost, 'token_balance': token_balance}, ensure_ascii=True)}\n\n"

    client = AsyncOpenAI(
        api_key=selected_model.get("api_key"),
        base_url=selected_model.get("api_base")
    )
    
    try:
        overall_start = time.time()
        print(f"[analyze] START file_url={file_url} model_id={model_id}")
        # 2. 下载并处理文件
        yield f"data: {json.dumps({'status': 'downloading', 'message': '正在从 OSS 获取影像数据...'})}\n\n"
        # 注意：download_file_from_url 目前是同步的，为了不阻塞 loop，放入 thread pool
        file_content = await asyncio.to_thread(download_file_from_url, file_url)
        t_after_download = time.time()
        print(f"[analyze] download_file_from_url done in {t_after_download - overall_start:.3f}s")
        
        yield f"data: {json.dumps({'status': 'processing', 'message': '正在解析 DICOM/ZIP 文件...'})}\n\n"
        
        # 简单判断文件类型，如果是 ZIP 则提取，如果是单图则直接处理
        # 不限制总批数：根据本次总切片数循环批次（每批 BATCH_SIZE 张），不设上限以得到真实切片数
        images = await asyncio.to_thread(extract_images_from_zip, file_content, max_files=2000)
        
        if not images:
             yield f"data: {json.dumps({'error': 'No valid images found in the file'})}\n\n"
             return

        BATCH_SIZE = 8  # 每批 8 张切片请求大模型，本批返回并展示后再请求下一批
        total_images = len(images)
        batches = [images[i:i + BATCH_SIZE] for i in range(0, total_images, BATCH_SIZE)]
        print(f"[analyze] parse images done in {time.time() - t_after_download:.3f}s, total_images={total_images}, batches={len(batches)}")

        # 先下发实际切片总数与批次数，供前端正确展示（避免显示错误的上限值）
        yield f"data: {json.dumps({'type': 'meta', 'total_slices': total_images, 'total_batches': len(batches)}, ensure_ascii=True)}\n\n"

        # 发送图片列表给前端 (分批发送以避免单次 Payload 过大导致卡死)
        # img_list = [{"filename": img["filename"], "base64": img["base64"]} for img in images]
        # yield f"data: {json.dumps({'type': 'images', 'images': img_list})}\n\n"
        
        CHUNK_SIZE = 20
        img_list_full = [{"filename": img["filename"], "base64": img["base64"]} for img in images]
        
        for i in range(0, len(img_list_full), CHUNK_SIZE):
            chunk = img_list_full[i : i + CHUNK_SIZE]
            yield f"data: {json.dumps({'type': 'images', 'images': chunk})}\n\n"
            # 稍微让出一点 IO 时间，防止 Nginx/Frontend 缓冲区溢出
            await asyncio.sleep(0.02)

        yield f"data: {json.dumps({'status': 'analyzing', 'message': f'提取到 {total_images} 张切片，分为 {len(batches)} 批次进行分析...'})}\n\n"

        total_usage = [0, 0]
        batch_payloads: List[Dict] = []
        for batch_idx, batch_images in enumerate(batches):
            batch_start_ts = time.time()
            print(f"[analyze] batch {batch_idx + 1}/{len(batches)} START, images={len(batch_images)}")
            yield f"data: {json.dumps({'status': 'analyzing', 'message': f'正在分析第 {batch_idx + 1}/{len(batches)} 批次...'})}\n\n"
            
            # --- 构建 System Prompt (强制 JSON) ---
            system_prompt = """你是一位资深的胸部影像学专家 AI (Medical Agent)，主要分析 CT（优先）和 X 光影像。

            **任务**：
            对输入的医学影像进行**系统性、结构化分析**。不要输出任何 Markdown 或自然语言描述，**只输出严格的 JSON**。
            请按器官/解剖区域逐一检查，尽量避免「看错、看漏」，必要时使用“不确定”而不是臆测。
            
            **JSON 格式要求**：
            {
              "region": "主要影像部位 (如: 胸部 CT / 心肺 / 上腹部 等)",
              "findings": [
                {
                  "organ": "器官/部位名称 (如: 右肺上叶, 左肺下叶, 纵隔, 心脏, 肋骨, 胸壁软组织 等)",
                  "status": "正常" | "异常" | "不确定",
                  "details": "针对该器官在本切片上的具体影像学表现，精炼但要包含位置（左右/叶段/前后）、大小、密度/信号、形态边界、与周围结构关系等关键信息。",
                  "severity": "low" | "medium" | "high" (仅在异常时填写，否则为 low),
                  "slice_index": 0
                }
              ],
              "summary": "一句话总结本批次影像的主要发现（包括有无可疑结节/浸润/积液/骨破坏等）"
            }
            
            **系统阅片要点（务必遵循）**：
            1. 先整体判断图像类型和质量（CT 窗宽/窗位、是否有明显伪影），如图像质量明显受限请在 summary 中说明。
            2. 肺野：按叶/段系统检查双肺（上叶→中叶/舌段→下叶），留意结节、磨玻璃影、实变、条索影、支气管血管束异常等。
            3. 纵隔与心大血管：气管/主支气管通畅与否，纵隔淋巴结是否肿大，心影和大血管是否扩大或形态异常。
            4. 胸膜与胸腔：是否有胸腔积液、气胸、胸膜增厚或结节。
            5. 骨骼：肋骨、胸椎、胸骨是否有骨折、溶骨或成骨性病变。
            6. 胸壁软组织：皮下、肌肉层是否有肿块或异常密度影。
            
            **避免误判/漏诊的规则**：
            1. 对于任何存在怀疑但影像特征不典型的情况，请将 status 标为 "不确定"，在 details 中写明「可疑、需结合临床/随访」等，而不要下过于肯定的诊断。
            2. 如果某个器官整体基本正常，只允许写非常简练的正常描述，如 "未见明显异常"，不要过度延展无意义的正常描述。
            3. 如果图像显示范围有限（例如只扫到部分肺野或部分胸壁），请在 summary 中**明确指出检查范围局限性**，并提醒可能遗漏范围以外病变。
            4. 避免臆测病人既往病史或临床症状，所有结论必须能从影像本身合理推出。
            5. 不要包含 ```json 代码块标记，直接输出 JSON 字符串。
            """
            
            content = [{"type": "text", "text": f"请分析这第 {batch_idx+1} 批次的影像："}]
            for idx, img in enumerate(batch_images):
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img['base64']}"}
                })
                content.append({"type": "text", "text": f"[Image {idx+1}: {img['filename']}]"})
                
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content}
            ]

            # 4. 调用大模型
            enable_thinking = selected_model.get("enable_thinking", False)
            extra_body = {}
            if enable_thinking:
                extra_body = {"enable_thinking": True, "thinking_budget": 16384}

            stream = await client.chat.completions.create(
                model=model_id,
                messages=messages,
                stream=True,
                extra_body=extra_body,
                response_format={"type": "json_object"},
                stream_options={"include_usage": True}
            )

            current_json_buffer = ""
            last_chunk = None
            async for chunk in stream:
                last_chunk = chunk
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                    yield f"data: {json.dumps({'type': 'thinking', 'content': delta.reasoning_content}, ensure_ascii=True)}\n\n"
                if delta.content:
                    current_json_buffer += delta.content
                    yield f"data: {json.dumps({'type': 'json_chunk', 'content': delta.content, 'batch_id': batch_idx}, ensure_ascii=True)}\n\n"

            parsed_payload = None
            try:
                json_str = current_json_buffer or ""
                json_str = json_str.replace("```json", "").replace("```", "")
                match = json_str[json_str.find("{"):json_str.rfind("}") + 1] if "{" in json_str and "}" in json_str else ""
                if match:
                    parsed_payload = json.loads(match)
            except Exception:
                parsed_payload = None
            if parsed_payload:
                batch_payloads.append(parsed_payload)

            batch_prompt = batch_completion = 0
            if last_chunk and getattr(last_chunk, "usage", None):
                u = last_chunk.usage
                batch_prompt = getattr(u, "input_tokens", None) or getattr(u, "prompt_tokens", 0) or 0
                batch_completion = getattr(u, "output_tokens", None) or getattr(u, "completion_tokens", 0) or 0
                total_usage[0] += batch_prompt
                total_usage[1] += batch_completion
                yield f"data: {json.dumps({'type': 'usage', 'batch_id': batch_idx, 'prompt_tokens': batch_prompt, 'completion_tokens': batch_completion}, ensure_ascii=True)}\n\n"
            print(f"[analyze] batch {batch_idx + 1}/{len(batches)} DONE in {time.time() - batch_start_ts:.3f}s, "
                  f"prompt_tokens={batch_prompt}, completion_tokens={batch_completion}")

            if batch_idx < len(batches) - 1:
                await asyncio.sleep(1)

        summary_text = "\n".join([p.get("summary") for p in batch_payloads if isinstance(p, dict) and p.get("summary")])
        findings_list = []
        for p in batch_payloads:
            if isinstance(p, dict) and isinstance(p.get("findings"), list):
                findings_list.extend(p.get("findings"))
        if user_id is not None and history_id is not None:
            try:
                db = SessionLocal()
                history = db.query(DiagnosisHistory).filter(DiagnosisHistory.id == history_id, DiagnosisHistory.user_id == user_id).first()
                if history:
                    history.summary = summary_text or None
                    history.findings_json = json.dumps({"batches": batch_payloads, "findings": findings_list}, ensure_ascii=False)
                    history.prompt_tokens = total_usage[0]
                    history.completion_tokens = total_usage[1]
                    db.commit()
            finally:
                db.close()

        yield f"data: {json.dumps({'type': 'total_usage', 'prompt_tokens': total_usage[0], 'completion_tokens': total_usage[1]}, ensure_ascii=True)}\n\n"
        yield f"data: {json.dumps({'status': 'done'})}\n\n"
        print(f"[analyze] ALL DONE in {time.time() - overall_start:.3f}s, "
              f"total_prompt_tokens={total_usage[0]}, total_completion_tokens={total_usage[1]}")
        
    except Exception as e:
        print(f"Error: {e}")
        # 如果是取消异常，就不发送错误给前端了
        if "cancelled" not in str(e).lower():
             yield f"data: {json.dumps({'error': str(e)})}\n\n"


@app.get("/")
def read_root():
    return {"status": "ok", "service": "MedGemma Backend"}

@app.get("/api/config", response_model=AppConfigResponse)
def get_config():
    """获取前端配置"""
    oss_cfg = config.get("oss", {})
    models_cfg = config.get("models", [])
    
    safe_models = [
        {
            "name": m.get("name"),
            "model_id": m.get("model_id"),
            "description": m.get("description", "")
        }
        for m in models_cfg
    ]
    
    return {
        "oss": {
            "region": oss_cfg.get("region", ""),
            "accessKeyId": oss_cfg.get("access_key_id", ""),
            "accessKeySecret": oss_cfg.get("access_key_secret", ""),
            "bucket": oss_cfg.get("bucket_name", ""),
            "endpoint": oss_cfg.get("endpoint", "")
        },
        "models": safe_models
    }


@app.post("/api/auth/register")
def register(request: RegisterRequest):
    if not request.phone and not request.email:
        raise HTTPException(status_code=400, detail="Phone or email required")
    db = SessionLocal()
    try:
        if request.phone:
            exists = db.query(User).filter(User.phone == request.phone).first()
            if exists:
                raise HTTPException(status_code=409, detail="Phone already registered")
        if request.email:
            exists = db.query(User).filter(User.email == request.email).first()
            if exists:
                raise HTTPException(status_code=409, detail="Email already registered")
        user = User(
            phone=request.phone,
            email=request.email,
            password_hash=hash_password(request.password) if request.password else None,
            token_balance=0,
        )
        db.add(user)
        db.flush()
        if INITIAL_TOKENS > 0:
            user.token_balance = INITIAL_TOKENS
            tx = TokenTransaction(
                user_id=user.id,
                change=INITIAL_TOKENS,
                balance_after=user.token_balance,
                reason="register_bonus",
            )
            db.add(tx)
        db.commit()
        token = create_access_token(user.id)
        return {
            "token": token,
            "user": {
                "id": user.id,
                "phone": user.phone,
                "email": user.email,
                "token_balance": user.token_balance,
            },
            "token_balance": user.token_balance,
        }
    finally:
        db.close()


@app.post("/api/auth/login")
def login(request: LoginPasswordRequest):
    if not request.phone and not request.email:
        raise HTTPException(status_code=400, detail="Phone or email required")
    db = SessionLocal()
    try:
        q = None
        if request.phone:
            q = db.query(User).filter(User.phone == request.phone)
        elif request.email:
            q = db.query(User).filter(User.email == request.email)
        user = q.first() if q else None
        if not user or not user.password_hash or not verify_password(request.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_access_token(user.id)
        return {
            "token": token,
            "user": {
                "id": user.id,
                "phone": user.phone,
                "email": user.email,
                "token_balance": user.token_balance,
            },
            "token_balance": user.token_balance,
        }
    finally:
        db.close()


@app.post("/api/user/login")
def login_legacy(request: LoginLegacyRequest):
    identifier = request.username
    if not identifier:
        raise HTTPException(status_code=400, detail="Username required")
    db = SessionLocal()
    try:
        if "@" in identifier:
            user = db.query(User).filter(User.email == identifier).first()
        else:
            user = db.query(User).filter(User.phone == identifier).first()
        if not user or not user.password_hash or not verify_password(request.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_access_token(user.id)
        return {
            "token": token,
            "user": {
                "id": user.id,
                "phone": user.phone,
                "email": user.email,
                "token_balance": user.token_balance,
            },
            "token_balance": user.token_balance,
        }
    finally:
        db.close()


@app.post("/api/auth/login/phone")
def login_phone(request: LoginPhoneRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == request.phone).first()
        created = False
        if not user:
            user = User(phone=request.phone, token_balance=0)
            db.add(user)
            db.flush()
            created = True
        if created and INITIAL_TOKENS > 0:
            user.token_balance = INITIAL_TOKENS
            tx = TokenTransaction(
                user_id=user.id,
                change=INITIAL_TOKENS,
                balance_after=user.token_balance,
                reason="register_bonus",
            )
            db.add(tx)
        db.commit()
        token = create_access_token(user.id)
        return {
            "token": token,
            "user": {
                "id": user.id,
                "phone": user.phone,
                "email": user.email,
                "token_balance": user.token_balance,
            },
            "token_balance": user.token_balance,
            "is_new": created,
        }
    finally:
        db.close()


@app.get("/api/user/me")
def get_me(request: Request):
    user = get_current_user(request)
    return {
        "id": user.id,
        "phone": user.phone,
        "email": user.email,
        "token_balance": user.token_balance,
    }


@app.put("/api/user/profile")
def update_profile(payload: UpdateProfileRequest, request: Request):
    current = get_current_user(request)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == current.id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if payload.phone and payload.phone != user.phone:
            exists = db.query(User).filter(User.phone == payload.phone).first()
            if exists:
                raise HTTPException(status_code=409, detail="Phone already registered")
            user.phone = payload.phone
        if payload.email and payload.email != user.email:
            exists = db.query(User).filter(User.email == payload.email).first()
            if exists:
                raise HTTPException(status_code=409, detail="Email already registered")
            user.email = payload.email
        if payload.password:
            user.password_hash = hash_password(payload.password)
        db.commit()
        return {
            "id": user.id,
            "phone": user.phone,
            "email": user.email,
            "token_balance": user.token_balance,
        }
    finally:
        db.close()


@app.get("/api/tokens/balance")
def get_token_balance(request: Request):
    user = get_current_user(request)
    return {"token_balance": user.token_balance}


@app.get("/api/history")
def get_history(request: Request, limit: int = 20, offset: int = 0):
    user = get_current_user(request)
    db = SessionLocal()
    try:
        records = (
            db.query(DiagnosisHistory)
            .filter(DiagnosisHistory.user_id == user.id)
            .order_by(DiagnosisHistory.id.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
        items = [
            {
                "id": r.id,
                "file_url": r.file_url,
                "model_id": r.model_id,
                "model_name": r.model_name,
                "summary": r.summary,
                "findings_json": r.findings_json,
                "token_cost": r.token_cost,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ]
        return {"items": items, "limit": limit, "offset": offset}
    finally:
        db.close()


@app.post("/api/tokens/purchase")
def purchase_tokens(payload: PurchaseTokenRequest, request: Request):
    user = get_current_user(request)
    return {
        "status": "pending",
        "user_id": user.id,
        "amount": payload.amount,
        "payment_url": None,
    }

@app.post("/api/analyze")
async def analyze(payload: AnalyzeRequest, request: Request):
    """
    提交分析请求，返回 SSE 流
    前端需使用 EventSource 或 fetch 自行处理流
    """
    selected_model = next((m for m in config.get("models", []) if m["model_id"] == payload.model_id), None)
    if not selected_model:
        raise HTTPException(status_code=404, detail="Model not found")
    user = get_current_user_optional(request)
    history_id = None
    token_balance = None
    token_cost = None
    if user:
        db = SessionLocal()
        try:
            locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
            if not locked_user:
                raise HTTPException(status_code=404, detail="User not found")
            if locked_user.token_balance < TOKEN_COST_PER_ANALYSIS:
                raise HTTPException(status_code=402, detail="Insufficient tokens")
            locked_user.token_balance -= TOKEN_COST_PER_ANALYSIS
            tx = TokenTransaction(
                user_id=locked_user.id,
                change=-TOKEN_COST_PER_ANALYSIS,
                balance_after=locked_user.token_balance,
                reason="analysis",
            )
            history = DiagnosisHistory(
                user_id=locked_user.id,
                file_url=payload.file_url,
                model_id=payload.model_id,
                model_name=selected_model.get("name"),
                token_cost=TOKEN_COST_PER_ANALYSIS,
            )
            db.add(tx)
            db.add(history)
            db.commit()
            db.refresh(history)
            history_id = history.id
            token_balance = locked_user.token_balance
            token_cost = TOKEN_COST_PER_ANALYSIS
        finally:
            db.close()
    return StreamingResponse(
        analyze_stream(payload.file_url, payload.model_id, user.id if user else None, history_id, token_balance, token_cost),
        media_type="text/event-stream"
    )


@app.post("/api/ask")
async def ask_about_analysis(request: AskRequest):
    """
    根据本次分析结果上下文回答用户问题（如总结、异常说明等）
    返回 SSE 流
    """
    selected_model = next((m for m in config.get("models", []) if m["model_id"] == request.model_id), None)
    if not selected_model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    async def ask_stream():
        client = AsyncOpenAI(
            api_key=selected_model.get("api_key"),
            base_url=selected_model.get("api_base"),
        )
        system = """你是一位医学影像报告解读助手。用户会提供一段基于 AI 的影像分析结果摘要（多批次、多器官），并可能提出相关问题。
        请仅根据给定的分析结果上下文作答，不要编造未在上下文中出现的内容。回答简洁专业。"""
        user_content = f"""【本次分析结果摘要】\n{request.context}\n\n【用户问题】\n{request.question}"""
        
        try:
            ask_start = time.time()
            print(f"[ask] START model_id={request.model_id} question={request.question[:80]}...")
            stream = await client.chat.completions.create(
                model=request.model_id,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_content},
                ],
                stream=True,
                timeout=120.0,
                stream_options={"include_usage": True} 
            )
            
            last_chunk = None
            async for chunk in stream:
                last_chunk = chunk
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'answer', 'content': content}, ensure_ascii=True)}\n\n"
            
            if last_chunk and getattr(last_chunk, "usage", None):
                u = last_chunk.usage
                prompt_tokens = getattr(u, "input_tokens", None) or getattr(u, "prompt_tokens", 0) or 0
                completion_tokens = getattr(u, "output_tokens", None) or getattr(u, "completion_tokens", 0) or 0
                yield f"data: {json.dumps({'type': 'usage', 'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens}, ensure_ascii=True)}\n\n"
                print(f"[ask] DONE in {time.time() - ask_start:.3f}s, prompt_tokens={prompt_tokens}, completion_tokens={completion_tokens}")

            yield f"data: {json.dumps({'status': 'done'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        ask_stream(),
        media_type="text/event-stream"
    )


@app.post("/api/report/pdf")
async def generate_pdf(request: GenerateReportRequest):
    """生成 PDF 报告"""
    try:
        # 在线程池中运行 PDF 生成 (包含网络请求和文件处理)
        pdf_buffer = await asyncio.to_thread(
            generate_pdf_report, 
            request.file_url, 
            request.analysis_results
        )
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=medical_report.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {"status": "healthy"}
