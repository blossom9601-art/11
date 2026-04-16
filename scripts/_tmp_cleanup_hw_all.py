"""
하드웨어 유형 테이블 전체 정리
- legacy DB (dev_blossom.db @ project root): 마이그레이션 소스
- active DB (instance/dev_blossom.db): 실제 운영 DB
두 곳 모두 hw type 테이블 전체 삭제
"""
import sqlite3

hw_tables = ['hw_server_type', 'hw_storage_type', 'hw_san_type', 'hw_network_type', 'hw_security_type']
db_files = ['dev_blossom.db', 'instance/dev_blossom.db']

for db_path in db_files:
    print(f'\n=== {db_path} ===')
    conn = sqlite3.connect(db_path)
    for tbl in hw_tables:
        try:
            before = conn.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]
            conn.execute(f'DELETE FROM {tbl}')
            after = conn.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]
            print(f'  {tbl}: {before} → {after}개')
        except Exception as e:
            print(f'  {tbl}: 건너뜀 ({e})')
    conn.commit()
    conn.close()

print('\n완료. 브라우저에서 강력새로고침(Ctrl+Shift+R) 후 대시보드 확인')
