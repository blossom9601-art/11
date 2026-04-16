# Stage 4: RAG 메타데이터 MVP (전 도메인)

## 목표
- 인사이트 중심 문서 검색을 넘어, 전 도메인(시스템/거버넌스/데이터센터/비용관리/프로젝트/인사이트) 데이터를 통합 인덱싱한다.
- DB 행, 상세페이지 정보, 첨부파일(PDF/Excel/Word/PPT)을 공통 메타 스키마로 표준화한다.
- 답변은 근거 기반(RAG)으로 구성하고, 권한 필터를 선행 적용한다.

## 1차 산출물
- SQL 스키마: `scripts/sql/rag_metadata_schema.sql`
  - `rag_documents`
  - `rag_chunks`
  - `rag_index_jobs`
- 매핑 레지스트리: `scripts/ai_briefing/rag_metadata_registry.py`
  - 도메인별 원천(source) 매핑
- 인덱싱 스캐폴드: `scripts/ai_briefing/rag_ingest_pipeline.py`
  - 문서/청크 생성
  - 변경분 처리용 잡 페이로드 스텁
- 인덱스 워커: `scripts/ai_briefing/rag_index_worker.py`
  - `rag_index_jobs` 큐 처리 (pending -> done/failed)
  - 문서 upsert + 청크 재생성
  - 첨부파일 텍스트 추출 연동

## 권장 처리 흐름
1. 원천 수집
- DB 행: 핵심 테이블에서 제목/본문 후보 필드 수집
- 첨부파일: 파일 텍스트 추출 후 문서화

2. 정규화
- 공통 메타 필드 채움
- `content_hash` 생성
- 기존 해시와 비교해 변경분만 재인덱싱

3. 청크 분할
- 청크 크기/겹침 설정으로 문맥 유지
- `rag_chunks` 저장

4. 검색/생성
- 권한 필터 적용
- 하이브리드 검색(BM25 + 벡터)
- 근거 상위 K개로 자연어 답변 생성

## 도메인 매핑(초안)
- 인사이트: 블로그/기술자료/첨부
- 프로젝트: 프로젝트/태스크/리스크/조달
- 시스템: 서버/스토리지/SAN/네트워크/보안장비
- 거버넌스: 정책/훈련/취약점
- 데이터센터: 랙/출입/CCTV/온습도
- 비용관리: OPEX/CAPEX/코스트 디테일

## 다음 구현 단계
1. 첨부파일 파서 연결
- PDF: `pypdf` 또는 `pdfplumber`
- DOCX: `python-docx`
- XLSX: `openpyxl`
- PPTX: `python-pptx`

2. 인덱싱 잡 실행기
- `rag_index_jobs` 기반 워커
- 실패 재시도/백오프/에러 로그

3. 검색 API 확장
- 근거 포함 응답 포맷
- 권한 기반 결과 필터링

4. UI 연동
- 답변 카드 + 근거 카드
- 문서명/위치/스니펫 표시

## 실행 예시
```powershell
# 1) RAG 스키마 생성
python scripts/ai_briefing/rag_index_worker.py --db instance/rag.db --bootstrap

# 2) (애플리케이션 코드에서) rag_index_jobs에 attachment upsert job enqueue
# payload_json 예시:
# {
#   "attachment_paths": ["C:/docs/a.pdf", "C:/docs/b.docx"],
#   "route_hint": "/p/insight_blog_it_detail?id=10",
#   "menu_code": "insight",
#   "page_key": "insight_blog_it",
#   "entity_type": "attachment"
# }

# 3) 큐 실행
python scripts/ai_briefing/rag_index_worker.py --db instance/rag.db --max-jobs 200
```
