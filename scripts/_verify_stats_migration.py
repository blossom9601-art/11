"""마이그레이션 검증 스크립트"""
import pathlib

base = pathlib.Path(r"c:\Users\ME\Desktop\blossom\app\templates")

# 1. 남은 인라인 모달 확인
remaining = []
for f in sorted(base.rglob('*.html')):
    text = f.read_text(encoding='utf-8')
    if 'id="system-stats-modal"' in text:
        if "{% include 'layouts/_stats_modal.html' %}" not in text:
            remaining.append(str(f.relative_to(base)))

if remaining:
    print(f"REMAINING inline modals: {len(remaining)}")
    for r in remaining:
        print(f"  {r}")
else:
    print("OK: No remaining inline stats modals")

# 2. include 개수
includes = 0
for f in sorted(base.rglob('*.html')):
    text = f.read_text(encoding='utf-8')
    if "{% include 'layouts/_stats_modal.html' %}" in text:
        includes += 1
print(f"Total files with include: {includes}")

# 3. 인코딩 검증
corrupt = 0
for f in sorted(base.rglob('*.html')):
    text = f.read_text(encoding='utf-8')
    if '\ufffd' in text:
        corrupt += 1
        print(f"  CORRUPT: {f.relative_to(base)}")
print(f"Encoding check: {corrupt} corrupt files")

# 4. 한국어 키워드 존재 확인 (샘플)
sample = base / '2.hardware' / '2-1.server' / '2-1-1.onpremise' / '1.onpremise_list.html'
if sample.exists():
    t = sample.read_text(encoding='utf-8')
    has_kr = '하드웨어' in t or '서버' in t or '다운로드' in t or '추가' in t
    print(f"Korean keywords in sample: {'OK' if has_kr else 'MISSING!'}")
