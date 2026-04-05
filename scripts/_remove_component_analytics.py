"""컴포넌트 list.html 7개 파일에서 통계분석 버튼 + 모달 제거."""
import re, pathlib

BASE = pathlib.Path(r"c:\Users\ME\Desktop\blossom\app\templates\9.category\9-4.component")

files = sorted(BASE.rglob("1.*_list.html"))
print(f"대상 파일 {len(files)}개: {[f.name for f in files]}")

# 패턴 1: analytics 버튼 (3줄)
btn_pat = re.compile(
    r' *<button class="header-btn" id="system-analytics-btn"[^>]*>.*?</button>\n',
    re.DOTALL
)

# 패턴 2: analytics 모달 + config script + JS include
modal_pat = re.compile(
    r' *<!-- 통계 분석 모달 -->\n'
    r' *<div id="system-analytics-modal".*?</div>\n'     # 모달 전체
    r' *<script>window\.__analyticsConfig=.*?</script>\n' # config
    r' *<script src="/static/js/_shared/list-analytics\.js[^"]*"></script>\n',
    re.DOTALL
)

for f in files:
    text = f.read_text(encoding='utf-8')
    orig = text

    text = btn_pat.sub('', text)
    text = modal_pat.sub('', text)

    if text != orig:
        f.write_text(text, encoding='utf-8', newline='\n')
        print(f"  [OK] {f.relative_to(BASE)}")
    else:
        print(f"  [SKIP] {f.relative_to(BASE)} — 변경 없음")
