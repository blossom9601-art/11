"""
AI 브리핑 3단계 규칙 엔진 테스트
"""

import pytest
from scripts.ai_briefing.stage3_rules import (
    DomainRuleMap,
    ResultAnalyzer,
    ConfidenceCalculator,
    SummaryBuilder,
    RecommendedFilters,
    build_enhanced_briefing,
)


class TestDomainRuleMap:
    """도메인 키워드 → 필터 매핑 테스트"""
    
    def test_server_keyword_mapping(self):
        """'서버' 키워드는 data_center 필터로 매핑"""
        candidates = DomainRuleMap.extract_filter_candidates('서버 구성')
        assert '시스템' in candidates
    
    def test_project_keyword_mapping(self):
        """'프로젝트' 키워드는 project 필터로 매핑"""
        candidates = DomainRuleMap.extract_filter_candidates('프로젝트 진행')
        assert '프로젝트' in candidates
    
    def test_cost_keyword_mapping(self):
        """'비용' 키워드는 cost 필터로 매핑"""
        candidates = DomainRuleMap.extract_filter_candidates('비용 분석')
        assert '비용관리' in candidates
    
    def test_multiple_keyword_mapping(self):
        """여러 키워드 매핑 시 상위 2개만 반환"""
        candidates = DomainRuleMap.extract_filter_candidates('서버 비용 프로젝트')
        assert len(candidates) <= 2


class TestResultAnalyzer:
    """검색 결과 분석 테스트"""
    
    def test_empty_result_analysis(self):
        """빈 결과 분석"""
        result = ResultAnalyzer.analyze([])
        assert result['total'] == 0
        assert result['diversity_factor'] == 0.0
    
    def test_single_domain_analysis(self):
        """단일 도메인 결과 분석"""
        rows = [
            {'domain': '데이터센터', 'type': 'page'},
            {'domain': '데이터센터', 'type': 'page'},
        ]
        result = ResultAnalyzer.analyze(rows)
        assert result['total'] == 2
        assert len(result['domains']) == 1
        assert result['diversity_factor'] == 0.5  # 단일 도메인 + 단일 타입 = 0.5
    
    def test_multi_domain_analysis(self):
        """다중 도메인 결과 분석"""
        rows = [
            {'domain': '데이터센터', 'type': 'page'},
            {'domain': '비용관리', 'type': 'document'},
            {'domain': '거버넌스', 'type': 'report'},
        ]
        result = ResultAnalyzer.analyze(rows)
        assert result['total'] == 3
        assert len(result['domains']) >= 2
        assert result['diversity_factor'] > 0.0


class TestConfidenceCalculator:
    """신뢰도 점수 계산 테스트"""
    
    def test_zero_result_confidence(self):
        """결과 0건 시 신뢰도 낮음"""
        conf = ConfidenceCalculator.calculate('query', 0, {'diversity_factor': 0.0})
        assert conf['score'] <= 0.3
        assert conf['grade'] == 'low'
    
    def test_high_result_confidence(self):
        """결과 많을 시 신뢰도 높음"""
        conf = ConfidenceCalculator.calculate(
            'query',
            20,
            {'diversity_factor': 0.2, 'top_rows': [{'title': 'query result'}] * 3}
        )
        assert conf['score'] >= 0.6
        assert conf['grade'] in ['high', 'medium']
    
    def test_medium_result_confidence(self):
        """중간 결과 시 신뢰도 중간"""
        conf = ConfidenceCalculator.calculate(
            'query',
            5,
            {'diversity_factor': 0.1, 'top_rows': []}
        )
        assert 0.4 <= conf['score'] <= 0.7
        assert conf['grade'] in ['medium', 'low']


class TestSummaryBuilder:
    """근거 문장 생성 테스트"""
    
    def test_zero_result_summary(self):
        """결과 0건 시 근거 문장"""
        lines = SummaryBuilder.build_summary_lines(
            '서버',
            0,
            {'domain_distribution': {}}
        )
        assert 1 <= len(lines) <= 10
        assert '찾지 못했습니다' in lines[0]
    
    def test_single_result_summary(self):
        """결과 1건 시 근거 문장"""
        lines = SummaryBuilder.build_summary_lines(
            '프로젝트',
            1,
            {'domain_distribution': {'프로젝트': 1}}
        )
        assert 1 <= len(lines) <= 10
        assert any('프로젝트' in line for line in lines)
    
    def test_multi_domain_summary(self):
        """다중 도메인 결과 근거 문장"""
        lines = SummaryBuilder.build_summary_lines(
            'IT',
            10,
            {'domain_distribution': {'거버넌스': 3, '비용관리': 7}}
        )
        assert 1 <= len(lines) <= 10
        assert any('영역에 걸쳐 분포' in line for line in lines)
    
    def test_high_result_summary(self):
        """결과 많을 시 근거 문장"""
        lines = SummaryBuilder.build_summary_lines(
            'test',
            50,
            {'domain_distribution': {'category': 50}}
        )
        assert any('우선 상위 결과' in line for line in lines)


class TestRecommendedFilters:
    """추천 필터 생성 테스트"""
    
    def test_keyword_based_filter(self):
        """쿼리 키워드 기반 필터 추천"""
        filters = RecommendedFilters.build_filters(
            '서버 구성',
            {'domain_distribution': {}, 'type_distribution': {}}
        )
        assert any(f.get('type') == 'domain_filter' for f in filters)
    
    def test_diversity_filter_on_concentration(self):
        """도메인 집중 시 다양화 필터 추천"""
        filters = RecommendedFilters.build_filters(
            'query',
            {'domain_distribution': {'server': 8, 'other': 2}, 'type_distribution': {}}
        )
        assert any(f.get('type') == 'diversity_suggestion' for f in filters)
    
    def test_type_diversity_filter(self):
        """단일 타입 시 타입 다양화 필터"""
        filters = RecommendedFilters.build_filters(
            'query',
            {'domain_distribution': {}, 'type_distribution': {'page': 10}}
        )
        assert any(f.get('type') == 'type_diversity' for f in filters)


class TestBuiltEnhancedBriefing:
    """통합 브리핑 생성 테스트"""
    
    def test_empty_briefing(self):
        """빈 검색 결과 브리핑"""
        briefing = build_enhanced_briefing('query', [], 0, 100)
        assert briefing['enabled'] is True
        assert briefing['mode'] == 'rule_based'
        assert 1 <= len(briefing['summary_lines']) <= 10
        assert briefing['confidence']['grade'] == 'low'
    
    def test_normal_briefing(self):
        """정상 검색 결과 브리핑"""
        rows = [
            {'id': 1, 'title': '서버 구성 가이드', 'domain': '데이터센터', 'type': 'page'},
            {'id': 2, 'title': '서버 운영 정책', 'domain': '거버넌스', 'type': 'document'},
            {'id': 3, 'title': '서버 비용 분석', 'domain': '비용관리', 'type': 'report'},
        ]
        briefing = build_enhanced_briefing('서버', rows, 3, 120)
        
        assert briefing['enabled'] is True
        assert 1 <= len(briefing['summary_lines']) <= 10
        assert len(briefing['references']) <= 3
        assert len(briefing['recommended_filters']) > 0
        assert 0.0 <= briefing['confidence']['score'] <= 1.0
    
    def test_high_confidence_on_many_results(self):
        """결과 많을 시 신뢰도 높음"""
        rows = [{'id': i, 'title': f'Result {i}', 'domain': 'test', 'type': 'page'} for i in range(20)]
        briefing = build_enhanced_briefing('query', rows, 20, 100)
        
        assert briefing['confidence']['score'] >= 0.5
        assert briefing['confidence']['grade'] in ['high', 'medium']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
