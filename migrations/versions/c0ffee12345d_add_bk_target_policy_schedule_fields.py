"""Add structured schedule fields to bk_backup_target_policy.

Revision ID: c0ffee12345d
Revises: c0ffee12345c
Create Date: 2026-01-29

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ffee12345d'
down_revision = 'c0ffee12345c'
branch_labels = None
depends_on = None


def _infer_weekday_kor(raw: str) -> str:
    s = (raw or '').strip()
    if not s:
        return ''

    # Known legacy formats: FULL_Sat, FULL_SUN, etc.
    token = s
    if '_' in s:
        token = s.split('_')[-1]

    t = token.strip().upper()
    mapping = {
        'MON': '월',
        'TUE': '화',
        'WED': '수',
        'THU': '목',
        'FRI': '금',
        'SAT': '토',
        'SUN': '일',
    }
    if t in mapping:
        return mapping[t]

    # Already in Korean
    if token.strip() in {'월', '화', '수', '목', '금', '토', '일'}:
        return token.strip()

    return ''


def upgrade():
    op.add_column('bk_backup_target_policy', sa.Column('schedule_period', sa.Text(), nullable=True))
    op.add_column('bk_backup_target_policy', sa.Column('schedule_weekday', sa.Text(), nullable=True))
    op.add_column('bk_backup_target_policy', sa.Column('schedule_day', sa.Integer(), nullable=True))

    # Best-effort backfill from legacy schedule_name (keeps data usable after UI switch).
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, schedule_name FROM bk_backup_target_policy WHERE (schedule_period IS NULL OR schedule_period = '') AND schedule_name IS NOT NULL AND schedule_name <> ''"
    )).fetchall()

    for row in rows:
        policy_id = row[0]
        schedule_name = row[1]
        s = (schedule_name or '').strip()

        period = None
        weekday = None
        day = None

        # Exact Korean labels
        if s in ('매일',):
            period = '매일'
        elif s in ('매주',):
            period = '매주'
        elif s in ('매달',):
            period = '매달'
        elif s in ('매년',):
            period = '매년'

        # Legacy heuristics
        if period is None:
            if 'FULL_' in s.upper() or any(x in s.upper() for x in ('_MON', '_TUE', '_WED', '_THU', '_FRI', '_SAT', '_SUN')):
                period = '매주'
                weekday = _infer_weekday_kor(s) or None
            elif '월1회' in s or 'MONTH' in s.upper():
                period = '매달'
            elif '주1회' in s or 'WEEK' in s.upper():
                period = '매주'
                weekday = _infer_weekday_kor(s) or None
            elif '매일' in s or 'DAILY' in s.upper():
                period = '매일'

        if period is not None:
            conn.execute(
                sa.text(
                    "UPDATE bk_backup_target_policy SET schedule_period=:p, schedule_weekday=:w, schedule_day=:d WHERE id=:id"
                ),
                {'p': period, 'w': weekday, 'd': day, 'id': policy_id},
            )


def downgrade():
    op.drop_column('bk_backup_target_policy', 'schedule_day')
    op.drop_column('bk_backup_target_policy', 'schedule_weekday')
    op.drop_column('bk_backup_target_policy', 'schedule_period')
