"""
통계 모달 마이그레이션 스크립트
=================================
모든 *list.html 파일에서 인라인 통계 모달 HTML을
{% include 'layouts/_stats_modal.html' %} 로 교체합니다.

동작:
1. templates/ 아래 모든 HTML 파일을 스캔
2. id="system-stats-modal" 인라인 블록을 찾음
3. <!-- 통계 모달 --> 주석부터 모달 닫는 </div>까지 제거
4. {% include 'layouts/_stats_modal.html' %} 삽입
5. 기존 <script src="bls-stats-modal.js"> 태그 제거 (템플릿에 포함됨)
"""

import pathlib
import re

BASE = pathlib.Path(r"c:\Users\ME\Desktop\blossom\app\templates")


def find_modal_block(lines):
    """
    인라인 통계 모달 블록의 시작/끝 줄 인덱스를 반환.
    Returns (start_idx, end_idx) 또는 None.
    """
    modal_line = None
    for i, line in enumerate(lines):
        if 'id="system-stats-modal"' in line and '<div' in line:
            modal_line = i
            break

    if modal_line is None:
        return None

    # 모달 시작 전 주석 찾기 (<!-- 통계 모달 --> 또는 빈 줄)
    start = modal_line
    for j in range(modal_line - 1, max(modal_line - 5, -1), -1):
        stripped = lines[j].strip()
        if stripped.startswith('<!--') and '통계' in stripped and '모달' in stripped:
            start = j
            break
        elif stripped == '':
            # 빈 줄은 건너뛰고 더 위 검색
            continue
        else:
            break

    # div 중첩으로 모달 끝 찾기
    depth = 0
    end = modal_line
    for k in range(modal_line, len(lines)):
        opens = len(re.findall(r'<div\b', lines[k]))
        closes = len(re.findall(r'</div>', lines[k]))
        depth += opens - closes
        if depth == 0 and k >= modal_line:
            end = k
            break

    return (start, end)


def process_file(fpath):
    """파일 처리: 인라인 모달 제거 + include 삽입 + 기존 JS/CSS 참조 제거"""
    text = fpath.read_text(encoding='utf-8')
    lines = text.split('\n')

    block = find_modal_block(lines)
    if block is None:
        return False

    start, end = block

    # 들여쓰기 보존
    indent = ' ' * (len(lines[start]) - len(lines[start].lstrip()))

    # include 문 삽입
    new_lines = lines[:start]
    new_lines.append(indent + "{% include 'layouts/_stats_modal.html' %}")
    new_lines.extend(lines[end + 1:])

    new_text = '\n'.join(new_lines)

    # 기존 bls-stats-modal.js 독립 script 태그 제거 (템플릿에 포함됨)
    new_text = re.sub(
        r'\n[ \t]*<script src="/static/js/_shared/bls-stats-modal\.js[^"]*"></script>',
        '', new_text
    )

    # 기존 bls-stats-modal.css 독립 link 태그 제거 (템플릿에 포함됨)
    new_text = re.sub(
        r'\n[ \t]*<link[^>]*bls-stats-modal\.css[^>]*>',
        '', new_text
    )

    if new_text != text:
        fpath.write_text(new_text, encoding='utf-8', newline='\n')
        return True
    return False


def main():
    """모든 대상 HTML 파일을 처리"""
    files = sorted(BASE.rglob('*.html'))
    processed = 0
    skipped = 0
    already_migrated = 0

    for f in files:
        text = f.read_text(encoding='utf-8')

        # 이미 마이그레이션 된 파일 건너뛰기
        if "{% include 'layouts/_stats_modal.html' %}" in text:
            already_migrated += 1
            continue

        # system-stats-modal이 없는 파일 건너뛰기
        if 'id="system-stats-modal"' not in text:
            continue

        rel = f.relative_to(BASE)
        if process_file(f):
            processed += 1
            print(f"  [OK] {rel}")
        else:
            skipped += 1
            print(f"  [SKIP] {rel}")

    print(f"\n완료: {processed}개 변환, {skipped}개 스킵, {already_migrated}개 이미 완료")


if __name__ == '__main__':
    main()
