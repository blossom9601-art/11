"""
Ollama LLM 서비스 — RAG 답변 생성용
"""
import logging
import json
from urllib import request as urllib_request
from urllib.error import URLError
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# ─── 기본 설정 ────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = 'http://localhost:11434'
OLLAMA_MODEL = 'qwen2.5:1.5b'
OLLAMA_TIMEOUT = 180          # 초 (CPU 전용이므로 여유)
OLLAMA_MAX_CONTEXT = 6000    # 컨텍스트 문자 수 제한


def _get_config():
    """Flask app config 에서 Ollama 설정 로드 (실행 시점에만)."""
    try:
        from flask import current_app
        return {
            'base_url': current_app.config.get('OLLAMA_BASE_URL', OLLAMA_BASE_URL),
            'model': current_app.config.get('OLLAMA_MODEL', OLLAMA_MODEL),
            'timeout': current_app.config.get('OLLAMA_TIMEOUT', OLLAMA_TIMEOUT),
        }
    except Exception:
        return {
            'base_url': OLLAMA_BASE_URL,
            'model': OLLAMA_MODEL,
            'timeout': OLLAMA_TIMEOUT,
        }

_SYSTEM_PROMPT = (
    '당신은 IT 자산관리 시스템 "Blossom"의 AI 어시스턴트입니다.\n'
    '아래 규칙을 반드시 따르세요:\n'
    '1. 제공된 문서 컨텍스트를 기반으로 정확하고 상세하게 한국어로 답변하세요.\n'
    '2. 문서에 없는 내용은 추측하지 마세요.\n'
    '3. 핵심 내용을 체계적으로 정리하여 읽기 쉽게 작성하세요.\n'
    '4. 번호 매기기나 소제목(## 형식)을 활용하여 구조화된 답변을 제공하세요.\n'
    '5. 기술 용어는 정확하게 사용하고, 약어가 있으면 풀어서 설명하세요.\n'
    '6. 답변 길이는 충분히 상세하게 작성하되 불필요한 반복은 피하세요.'
)


def _check_ollama_available() -> bool:
    """Ollama 서버가 실행 중인지 확인."""
    cfg = _get_config()
    try:
        req = urllib_request.Request(
            f'{cfg["base_url"]}/api/tags',
            method='GET',
        )
        resp = urllib_request.urlopen(req, timeout=3)
        return resp.status == 200
    except Exception:
        return False


def _check_model_available(model: str = None) -> bool:
    """지정 모델이 로드되어 있는지 확인."""
    cfg = _get_config()
    model = model or cfg['model']
    try:
        req = urllib_request.Request(
            f'{cfg["base_url"]}/api/tags',
            method='GET',
        )
        resp = urllib_request.urlopen(req, timeout=5)
        data = json.loads(resp.read().decode('utf-8'))
        models = [m.get('name', '') for m in data.get('models', [])]
        return any(model in m for m in models)
    except Exception:
        return False


def generate_rag_answer(
    query: str,
    context_chunks: List[Dict[str, str]],
    model: str = None,
    timeout: int = None,
) -> Optional[Dict[str, Any]]:
    """
    RAG 컨텍스트 기반 LLM 답변 생성.

    Args:
        query: 사용자 질문
        context_chunks: [{'title': str, 'text': str, 'source': str}, ...]
        model: Ollama 모델명 (기본값: OLLAMA_MODEL)
        timeout: 요청 타임아웃 초 (기본값: OLLAMA_TIMEOUT)

    Returns:
        {'answer_text': str, 'sources': list, 'method': str} or None
    """
    cfg = _get_config()
    model = model or cfg['model']
    timeout = timeout or cfg['timeout']

    if not context_chunks:
        return None

    # 컨텍스트 조립
    context_parts = []
    total_len = 0
    sources = []
    for chunk in context_chunks:
        text = (chunk.get('text') or '').strip()
        title = chunk.get('title', '')
        if not text:
            continue
        # 컨텍스트 길이 제한
        if total_len + len(text) > OLLAMA_MAX_CONTEXT:
            remaining = OLLAMA_MAX_CONTEXT - total_len
            if remaining > 100:
                text = text[:remaining]
            else:
                break
        context_parts.append(f'[문서: {title}]\n{text}')
        total_len += len(text)
        source = {
            'title': title,
            'route_hint': chunk.get('route_hint', ''),
            'domain': chunk.get('domain', ''),
        }
        if source not in sources:
            sources.append(source)

    if not context_parts:
        return None

    context_str = '\n\n---\n\n'.join(context_parts)

    user_prompt = (
        f'다음은 관련 문서입니다:\n\n{context_str}\n\n'
        f'---\n\n'
        f'질문: {query}\n\n'
        f'위 문서를 기반으로 질문에 답변해주세요.'
    )

    try:
        payload = json.dumps({
            'model': model,
            'messages': [
                {'role': 'system', 'content': _SYSTEM_PROMPT},
                {'role': 'user', 'content': user_prompt},
            ],
            'stream': False,
            'keep_alive': '30m',
            'options': {
                'temperature': 0.3,
                'num_predict': 1024,
            },
        }).encode('utf-8')

        req = urllib_request.Request(
            f'{cfg["base_url"]}/api/chat',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        resp = urllib_request.urlopen(req, timeout=timeout)
        result = json.loads(resp.read().decode('utf-8'))
        answer_text = (
            result.get('message', {}).get('content', '').strip()
        )
        if not answer_text:
            return None

        return {
            'answer_text': answer_text,
            'sources': sources,
            'method': 'llm_rag',
        }
    except URLError as e:
        logger.warning('Ollama request failed: %s', e)
        return None
    except Exception:
        logger.exception('Ollama generate_rag_answer failed')
        return None


def generate_rag_answer_stream(
    query: str,
    context_chunks: List[Dict[str, str]],
    model: str = None,
    timeout: int = None,
):
    """
    RAG 컨텍스트 기반 LLM 답변 스트리밍 생성.
    Ollama stream=True 사용하여 토큰 단위로 yield 한다.
    """
    cfg = _get_config()
    model = model or cfg['model']
    timeout = timeout or cfg['timeout']

    if not context_chunks:
        return

    context_parts = []
    total_len = 0
    for chunk in context_chunks:
        text = (chunk.get('text') or '').strip()
        title = chunk.get('title', '')
        if not text:
            continue
        if total_len + len(text) > OLLAMA_MAX_CONTEXT:
            remaining = OLLAMA_MAX_CONTEXT - total_len
            if remaining > 100:
                text = text[:remaining]
            else:
                break
        context_parts.append(f'[문서: {title}]\n{text}')
        total_len += len(text)

    if not context_parts:
        return

    context_str = '\n\n---\n\n'.join(context_parts)
    user_prompt = (
        f'다음은 관련 문서입니다:\n\n{context_str}\n\n'
        f'---\n\n'
        f'질문: {query}\n\n'
        f'위 문서를 기반으로 질문에 답변해주세요.'
    )

    try:
        payload = json.dumps({
            'model': model,
            'messages': [
                {'role': 'system', 'content': _SYSTEM_PROMPT},
                {'role': 'user', 'content': user_prompt},
            ],
            'stream': True,
            'keep_alive': '30m',
            'options': {
                'temperature': 0.3,
                'num_predict': 1024,
            },
        }).encode('utf-8')

        req = urllib_request.Request(
            f'{cfg["base_url"]}/api/chat',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        resp = urllib_request.urlopen(req, timeout=timeout)

        for raw_line in resp:
            if not raw_line.strip():
                continue
            try:
                data = json.loads(raw_line.decode('utf-8'))
                token = data.get('message', {}).get('content', '')
                if token:
                    yield token
                if data.get('done'):
                    break
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    except URLError as e:
        logger.warning('Ollama stream request failed: %s', e)
    except Exception:
        logger.exception('Ollama generate_rag_answer_stream failed')


def get_status() -> Dict[str, Any]:
    """Ollama 서비스 상태 조회."""
    cfg = _get_config()
    available = _check_ollama_available()
    model_ready = _check_model_available() if available else False
    return {
        'available': available,
        'model': cfg['model'],
        'model_ready': model_ready,
        'base_url': cfg['base_url'],
    }
