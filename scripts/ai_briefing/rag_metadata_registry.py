"""RAG 메타데이터 레지스트리 (MVP)

전 도메인 원천 데이터를 공통 메타 스키마로 변환하기 위한 매핑 정의.
"""

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class SourceMapping:
    domain: str
    source_name: str
    source_type: str          # db_row | page_detail | attachment
    entity_type: str
    id_field: str
    title_fields: List[str]
    body_fields: List[str]
    route_template: str
    menu_code: str
    page_key: str


RAG_SOURCE_MAPPINGS: List[SourceMapping] = [
    SourceMapping(
        domain="인사이트",
        source_name="insight_blog",
        source_type="db_row",
        entity_type="blog",
        id_field="id",
        title_fields=["title"],
        body_fields=["content", "tags", "author"],
        route_template="/p/insight_blog_it_detail?id={id}",
        menu_code="insight",
        page_key="insight_blog_it",
    ),
    SourceMapping(
        domain="프로젝트",
        source_name="project",
        source_type="db_row",
        entity_type="project",
        id_field="id",
        title_fields=["project_name"],
        body_fields=["project_number", "description", "status"],
        route_template="/p/proj_completed_detail?project_id={id}",
        menu_code="project",
        page_key="proj_completed_detail",
    ),
    SourceMapping(
        domain="시스템",
        source_name="server",
        source_type="db_row",
        entity_type="server",
        id_field="id",
        title_fields=["name", "hostname"],
        body_fields=["hostname", "ip_address", "location"],
        route_template="/p/hw_server_onpremise_detail?asset_id={id}",
        menu_code="system.server",
        page_key="hw_server_onpremise_detail",
    ),
    SourceMapping(
        domain="거버넌스",
        source_name="dr_training",
        source_type="db_row",
        entity_type="policy_training",
        id_field="training_id",
        title_fields=["training_name"],
        body_fields=["training_type", "participant_org", "training_result"],
        route_template="/p/gov_dr_training?training_id={id}",
        menu_code="governance",
        page_key="gov_dr_training",
    ),
    SourceMapping(
        domain="데이터센터",
        source_name="rack_layout",
        source_type="db_row",
        entity_type="rack",
        id_field="id",
        title_fields=["floor_key"],
        body_fields=["updated_by"],
        route_template="/p/dc_rack_list?rack_id={id}",
        menu_code="datacenter",
        page_key="dc_rack_list",
    ),
    SourceMapping(
        domain="비용관리",
        source_name="cost_detail",
        source_type="db_row",
        entity_type="cost_item",
        id_field="id",
        title_fields=["content"],
        body_fields=["cost_type", "amount"],
        route_template="/p/cost_opex_dashboard",
        menu_code="cost",
        page_key="cost_opex_dashboard",
    ),
]


def mapping_by_domain() -> Dict[str, List[SourceMapping]]:
    grouped: Dict[str, List[SourceMapping]] = {}
    for item in RAG_SOURCE_MAPPINGS:
        grouped.setdefault(item.domain, []).append(item)
    return grouped
