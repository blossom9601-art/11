# AI 브리핑 1단계 체크리스트 (기준선 측정과 범위 고정)

## 범위
- 목표: 통합검색 기준선 성능 측정 + 1단계 합의 항목 고정
- 대상 API: /api/search/unified

## A. 성능 기준선 측정
- [x] 쿼리셋 50개 준비
- [x] 측정 스크립트 작성
- [x] p50/p95/p99, 평균, 최대 지표 측정
- [x] 정상/비정상 응답 건수 기록
- [x] 결과 리포트(JSON/Markdown) 생성

## B. 범위 고정
- [x] AI 브리핑 출력 범위 정의(핵심 3줄, 추천 필터, 근거 문서)
- [x] 실패 시 폴백 정책 정의(브리핑 실패 시 검색결과만 반환)
- [x] 1단계 성공 기준 정의(검색 p95 800ms, 브리핑 포함 p95 1.5초)

## C. 산출물
- [x] scripts/ai_briefing/stage1_queries.json
- [x] scripts/ai_briefing/stage1_baseline.py
- [x] reports/ai_briefing/stage1_baseline_report.json
- [x] reports/ai_briefing/stage1_baseline_report.md

## D. 1차 측정 결과(테스트 환경)
- [x] query_count: 50
- [x] status_200_count: 50
- [x] latency p50: 153.55ms
- [x] latency p95: 483.69ms
- [x] latency p99: 2741.29ms
- [x] 결과 평균 total: 4.48
- [x] total=0 쿼리: 31

## 기준/합의 메모
- 브리핑은 동기 실시간 100% 강제가 아님
- 타임아웃/폴백 중심으로 서비스 안정성 우선
- 사용자 증가 대비를 위해 캐시/비동기 분리를 2단계에서 적용
- 테스트 DB에 일부 도메인 테이블이 없어(예: dr_training, rack_layouts) 해당 쿼리에서 오류 로그가 발생하나, API는 예외를 흡수하고 200으로 응답함
