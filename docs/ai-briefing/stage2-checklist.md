# AI 브리핑 2단계 체크리스트 (API 확장 + 폴백 구조)

## 범위
- 목표: 통합검색 API에 브리핑 필드 추가, 폴백 구조 구현 및 검증
- 대상 API: /api/search/unified
- 요구사항: 브리핑 생성 실패 시에도 검색 결과는 유지

## A. API 응답 스키마 확장
- [x] `include_briefing` 파라미터 추가 (기본값: true)
- [x] 응답에 `briefing` 객체 조건부 추가
- [x] 브리핑 필드 스키마 정의:
  - enabled: bool (브리핑 활성화 여부)
  - version: str (v1)
  - mode: str (rule_based | ml | fallback)
  - title: str (AI 브리핑)
  - summary_lines: List[str] (핵심 3줄)
  - recommended_filters: List[Dict] (빈 리스트로 시작)
  - references: List[Dict] (상위 3개 문서)
  - confidence: Dict {score, grade, explain}
  - fallback_used: bool (폴백 사용 여부)
  - latency_ms: int (생성 소요시간)
  - generated_at: str (ISO8601 타임스탬프)

## B. 폴백 및 헬퍼 구현
- [x] `_as_bool()` 함수 (모듈 레벨 이동)
  - Query string / JSON payload 파라미터 bool 변환
  - '1', 'true', 'yes' → True
  - '0', 'false', 'no' → False
- [x] `_briefing_fallback()` 함수 (모듈 레벨 이동)
  - 브리핑 생성 실패 시 폴백 객체 반환
  - summary_lines: 기본 안내 메시지
  - confidence.score: 0.0
  - fallback_used: true
  - latency_ms: 기록
- [x] `_build_unified_search_briefing()` 함수 (모듈 레벨 이동)
  - 검색 결과 기반 규칙 브리핑 생성 (초기)
  - 상위 3개 references 추출
  - summary_lines 3줄 작성 (쿼리, 결과 개수, 범위 안내)
  - confidence 계산 (total 기반 0.2 ~ 0.7)
  - mode: rule_based

## C. 흐름 제어 및 테스트
- [x] 빈 쿼리(q='') 시 briefing 미포함 또는 disabled 상태 반환
- [x] 정상 쿼리 시 briefing 포함
- [x] `include_briefing=0` 시 briefing 필드 제외
- [x] 브리핑 생성 예외 발생 시 fallback 반환 (검색 결과 유지)
- [x] 테스트 작성: 3개 케이스 (기본, 비활성화, 예외)
- [x] 테스트 통과 확인

## D. 산출물
- [x] app/routes/api.py
  - `_as_bool()` 함수 (line 24501)
  - `_briefing_fallback()` 함수 (line 24514)
  - `_build_unified_search_briefing()` 함수 (line 24534)
  - unified_search_pages() 수정 (briefing 로직 추가)
  - import time 추가 (latency 측정용)
- [x] tests/test_unified_search_briefing_api.py
  - test_unified_search_returns_briefing
  - test_unified_search_can_disable_briefing
  - test_unified_search_briefing_fallback_on_exception

## E. 2단계 테스트 결과
- [x] 3 tests passed
- [x] 경고: DeprecationWarnings (기존 코드, 해결 불필요)
- [x] 실패: 0

## 품질 메트릭
- API 응답 시간: 기준선 대비 유지 (briefing 폴백 활성 시에도)
- 폴백 적중률: N/A (첫 구현)
- 검색 결과 유지율: 100% (폴백 시에도 rows 유지)

## 기준/합의 메모
- 2단계 성공 조건: 브리핑 필드 추가 + 예외 처리 + 테스트 3개 통과
- 3단계 이후에 규칙 고도화(추천 필터, 근거 문장 강화) 진행
- performance 측정은 4주 프로덕션 대비 이후에 진행 예정
