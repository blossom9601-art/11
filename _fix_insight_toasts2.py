"""
insight_list_common.js 잔여 showToast 패턴 모두 제거
"""
import re

path = r'static/js/5.insight/5-1.insight/insight_list_common.js'
text = open(path, encoding='utf-8').read()

# 패턴 1: try{ if(typeof showToast...) showToast('...', '...'); }catch(_e){}
# 패턴 2: try{ if(typeof showToast...) showToast('...', '...'); }catch(_e){ alert('...'); }
# → 두 경우 모두 해당 라인 전체 제거 (앞 공백 포함)

# 한 줄 형태 제거 (showToast 가 포함된 try-catch 라인 전체)
def remove_toast_lines(s):
    lines = s.split('\n')
    result = []
    for line in lines:
        if 'showToast' in line:
            # showToast가 포함된 라인은 스킵 (제거)
            continue
        result.append(line)
    return '\n'.join(result)

before = text.count('showToast')
text = remove_toast_lines(text)
after = text.count('showToast')
print(f'showToast 제거: {before} → {after}')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)
print('저장 완료')
