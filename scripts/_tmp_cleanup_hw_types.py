"""
하드웨어 유형 테이블 정리 스크립트
- hw_server_type: 34개 (12 is_deleted=1, 22 TEST-* 테스트 데이터)
- hw_storage_type: 11개 (9 is_deleted=1, 2 TEST-* 테스트)
- hw_san_type: 2개 (모두 TEST-*)
- hw_network_type: 7개 (1 is_deleted=1, 6 TEST-*)
- hw_security_type: 9개 (1 is_deleted=1, 8 TEST-*)
모두 테스트 데이터이므로 전체 삭제
"""
import sqlite3

DB = 'instance/dev_blossom.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

tables = ['hw_server_type', 'hw_storage_type', 'hw_san_type', 'hw_network_type', 'hw_security_type']

for tbl in tables:
    before = conn.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]
    conn.execute(f'DELETE FROM {tbl}')
    after = conn.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]
    print(f'{tbl}: {before}개 → {after}개 (삭제: {before - after}개)')

conn.commit()
conn.close()
print('\n완료. 대시보드 새로고침 시 전체 자산 0으로 표시됩니다.')
