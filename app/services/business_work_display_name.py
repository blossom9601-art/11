"""Limits for 카테고리 > 비즈니스 표시 이름(업무 분류·구분·상태·운영·그룹)."""

BUSINESS_WORK_DISPLAY_NAME_MAX_LEN = 16


def validate_business_work_display_name(display_name: str, *, field_label: str) -> None:
    """Raise ValueError if len(display_name) exceeds the policy (after caller strips)."""
    if len(display_name) > BUSINESS_WORK_DISPLAY_NAME_MAX_LEN:
        raise ValueError(
            f'{field_label}은(는) 최대 {BUSINESS_WORK_DISPLAY_NAME_MAX_LEN}글자까지 입력할 수 있습니다.'
        )
