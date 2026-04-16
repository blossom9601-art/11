"""
AI 브리핑 3단계: 규칙 기반 브리핑 고도화
- 추천 필터, 근거 문장, 신뢰도 점수 규칙 구현
"""

from typing import Any, Dict, List, Tuple
import re


class DomainRuleMap:
    """도메인 키워드 → 필터 매핑 규칙"""
    
    KEYWORD_FILTERS = {
        '서버': '시스템',
        '데이터센터': '데이터센터',
        'dc': '데이터센터',
        '네트워크': '데이터센터',
        'vpn': '데이터센터',
        'ip': '데이터센터',
        
        '프로젝트': '프로젝트',
        '과제': '프로젝트',
        '프젝': '프로젝트',
        '태스크': '프로젝트',
        'task': '프로젝트',
        '일정': '프로젝트',
        
        '비용': '비용관리',
        '비용관리': '비용관리',
        '예산': '비용관리',
        'cost': '비용관리',
        '청구': '비용관리',
        'billing': '비용관리',
        
        '블로그': '인사이트',
        '인사이트': '인사이트',
        '기술': '인사이트',
        '게시글': '인사이트',
        'blog': '인사이트',
        
        '거버넌스': '거버넌스',
        '정책': '거버넌스',
        '보안': '거버넌스',
        'security': '거버넌스',
        
        '시스템': '시스템',
        '설정': '시스템',
        'config': '시스템',
    }
    
    @classmethod
    def extract_filter_candidates(cls, query: str) -> List[str]:
        """쿼리 키워드에서 추천 필터 후보 추출"""
        query_lower = query.lower()
        candidates = []
        for keyword, filter_name in cls.KEYWORD_FILTERS.items():
            if keyword in query_lower and filter_name not in candidates:
                candidates.append(filter_name)
        return candidates[:2]  # 상위 2개만 반환


class ResultAnalyzer:
    """검색 결과 분석"""
    
    @staticmethod
    def analyze(rows: List[Dict[str, Any]], limit: int = 3) -> Dict[str, Any]:
        """
        결과 분석: 도메인 분포, 타입 분포, 다양성 지표
        """
        if not rows:
            return {
                'total': 0,
                'domains': [],
                'types': [],
                'domain_distribution': {},
                'type_distribution': {},
                'top_rows': [],
                'diversity_factor': 0.0,
            }
        
        domains = {}
        types = {}
        
        for row in rows[:limit]:
            domain = str(row.get('domain', 'unknown')).lower()
            row_type = str(row.get('type', 'unknown')).lower()
            
            domains[domain] = domains.get(domain, 0) + 1
            types[row_type] = types.get(row_type, 0) + 1
        
        # 다양성 지수: 서로 다른 도메인과 타입의 비율
        unique_domains = len(domains)
        unique_types = len(types)
        diversity_factor = (unique_domains / max(1, unique_domains)) * 0.3 + \
                           (unique_types / max(1, unique_types)) * 0.2
        diversity_factor = min(0.5, diversity_factor)
        
        return {
            'total': len(rows),
            'domains': list(domains.keys()),
            'types': list(types.keys()),
            'domain_distribution': domains,
            'type_distribution': types,
            'top_rows': rows[:limit],
            'diversity_factor': diversity_factor,
        }


class ConfidenceCalculator:
    """신뢰도 점수 계산"""
    
    @staticmethod
    def calculate(query: str, total: int, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        종합 신뢰도 점수 계산
        
        구성 요소:
        1. 기본 점수 (total 기반): 0.2 ~ 0.7
        2. 다양성 점수: analysis.diversity_factor
        3. 품질 점수: 정확 매칭 비율 (상위 3개)
        """
        # 기본 점수
        if total == 0:
            base_score = 0.2
        elif total < 10:
            base_score = 0.4 + (total / 20 * 0.3)
        else:
            base_score = 0.7
        
        # 다양성 점수
        diversity_score = analysis.get('diversity_factor', 0.0)
        
        # 품질 점수 (정확 매칭 비율)
        quality_score = 0.0
        top_rows = analysis.get('top_rows', [])
        if top_rows:
            query_lower = query.lower()
            exact_match_count = sum(
                1 for row in top_rows
                if query_lower in str(row.get('title', '')).lower()
            )
            quality_score = (exact_match_count / len(top_rows)) * 0.15
        
        # 최종 점수
        final_score = min(0.95, base_score + diversity_score + quality_score)
        
        # 등급 결정
        if final_score >= 0.75:
            grade = 'high'
        elif final_score >= 0.45:
            grade = 'medium'
        else:
            grade = 'low'
        
        return {
            'score': round(final_score, 3),
            'grade': grade,
            'explain': f'쿼리={query}, total={total}, 다양도={round(diversity_score, 3)}, 매칭도={round(quality_score, 3)}',
            'components': {
                'base_score': round(base_score, 3),
                'diversity_score': round(diversity_score, 3),
                'quality_score': round(quality_score, 3),
            }
        }


class SummaryBuilder:
    """근거 문장 생성"""
    
    @staticmethod
    def build_summary_lines(query: str, total: int, analysis: Dict[str, Any]) -> List[str]:
        """
        쿼리 특성과 결과 특성을 기반으로 자연어 안내 문장을 생성
        - 최소 1줄, 최대 10줄
        """
        lines: List[str] = []

        if total == 0:
            lines.append(f"'{query}'와 일치하는 결과를 현재 데이터에서 찾지 못했습니다.")
            lines.append("약어 대신 업무에서 자주 쓰는 전체 표현으로 검색해 보세요.")
            lines.append("예: 시스템명, 프로젝트명, 담당자, 문서 제목")
            return lines[:10]

        lines.append(f"'{query}' 관련 결과를 총 {total}건 확인했습니다.")
        lines.append("요청 의도와의 연관성을 우선해 순서를 정리했습니다.")

        domains = analysis.get('domain_distribution', {})
        if len(domains) > 1:
            domain_list = ', '.join(domains.keys())
            lines.append(f"결과는 [{domain_list}] 영역에 걸쳐 분포되어 있습니다.")
        else:
            domain_name = list(domains.keys())[0] if domains else 'unknown'
            lines.append(f"이번 결과는 주로 [{domain_name}] 영역에 집중되어 있습니다.")

        type_dist = analysis.get('type_distribution', {})
        if type_dist:
            type_list = ', '.join(list(type_dist.keys())[:3])
            lines.append(f"표시된 결과 유형은 {type_list} 중심입니다.")

        if total < 5:
            lines.append("결과가 적어 보입니다. 검색어를 조금 넓히거나 다른 표현을 함께 시도해 보세요.")
        elif total >= 20:
            lines.append("우선 상위 결과를 확인하고, 필요 시 도메인 필터로 범위를 좁히는 것을 추천드립니다.")
        else:
            lines.append("상위 결과부터 검토하신 뒤, 필요하면 필터를 적용해 정확도를 높여보세요.")

        # 사용성 안내를 마지막에 덧붙여 자연스럽게 마무리한다.
        lines.append("원하시면 필터를 적용해 필요한 범위만 빠르게 확인할 수 있습니다.")

        return lines[:10]


class RecommendedFilters:
    """추천 필터 생성"""
    
    @staticmethod
    def build_filters(query: str, analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        쿼리 및 결과 기반 추천 필터 생성
        """
        filters = []
        
        # 규칙 1: 쿼리 키워드 기반
        domain_candidates = DomainRuleMap.extract_filter_candidates(query)
        for domain in domain_candidates[:1]:  # 상위 1개만 추천
            filters.append({
                'type': 'domain_filter',
                'value': domain,
                'label': f"[{domain}] 범위로 좁히기",
                'reason': '쿼리 키워드와 관련성 높음',
            })
        
        # 규칙 2: 결과 도메인 단일화 검사
        domain_dist = analysis.get('domain_distribution', {})
        if domain_dist:
            total_results = sum(domain_dist.values())
            if total_results > 0:
                max_domain = max(domain_dist, key=domain_dist.get)
                max_ratio = domain_dist[max_domain] / total_results
                
                if max_ratio > 0.7:  # 70% 이상
                    filters.append({
                        'type': 'diversity_suggestion',
                        'value': '',
                        'label': f"다른 카테고리도 함께 검색",
                        'reason': f"{max_domain} 결과가 {int(max_ratio*100)}% 차지",
                    })
        
        # 규칙 3: 타입 다양화
        type_dist = analysis.get('type_distribution', {})
        if type_dist:
            if len(type_dist) == 1:
                current_type = list(type_dist.keys())[0]
                filters.append({
                    'type': 'type_diversity',
                    'value': '',
                    'label': f"다양한 항목 유형 보기 (현재: {current_type})",
                    'reason': '검색 풍부도 향상',
                })
        
        return filters[:2]  # 최대 2개 필터 반환


def build_enhanced_briefing(
    query: str,
    rows: List[Dict[str, Any]],
    total: int,
    latency_ms: int,
) -> Dict[str, Any]:
    """
    3단계 규칙 기반 브리핑 생성 (통합)
    
    호출자: app/routes/api.py의 _build_unified_search_briefing() 내에서 사용
    """
    # 결과 분석
    analysis = ResultAnalyzer.analyze(rows, limit=3)
    
    # 신뢰도 점수 계산
    confidence = ConfidenceCalculator.calculate(query, total, analysis)
    
    # 근거 문장 생성
    summary_lines = SummaryBuilder.build_summary_lines(query, total, analysis)
    
    # 추천 필터 생성
    recommended_filters = RecommendedFilters.build_filters(query, analysis)
    
    # 상위 3개 참고 자료 추출
    references = []
    for row in rows[:3]:
        references.append({
            'doc_id': str(row.get('id', '')),
            'title': str(row.get('title', '')),
            'domain': str(row.get('domain', '')),
            'type': str(row.get('type', '')),
            'reason': '검색 상위 결과',
        })
    
    return {
        'enabled': True,
        'version': 'v1',
        'mode': 'rule_based',
        'title': '검색 안내',
        'summary_lines': summary_lines,
        'recommended_filters': recommended_filters,
        'references': references,
        'confidence': confidence,
        'fallback_used': False,
        'latency_ms': int(max(0, latency_ms)),
        'generated_at': '',  # 호출자에서 설정
    }


if __name__ == '__main__':
    # 간단한 테스트
    test_rows = [
        {'id': 1, 'title': '서버 구성 가이드', 'domain': '데이터센터', 'type': 'page'},
        {'id': 2, 'title': '서버 운영 정책', 'domain': '거버넌스', 'type': 'document'},
        {'id': 3, 'title': '서버 비용 분석', 'domain': '비용관리', 'type': 'report'},
    ]
    
    briefing = build_enhanced_briefing('서버', test_rows, 3, 120)
    print("테스트 브리핑:")
    print(f"  Summary: {briefing['summary_lines']}")
    print(f"  Filters: {briefing['recommended_filters']}")
    print(f"  Confidence: {briefing['confidence']}")
