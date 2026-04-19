"""
insight_list_common.js 에서 showToast 를 모두 제거하고
performBulkDelete / handleDelete 에서 401 세션 만료 시
/login 으로 리다이렉트하도록 수정
"""
import re

path = r'static/js/5.insight/5-1.insight/insight_list_common.js'
text = open(path, encoding='utf-8').read()

# ── 1. downloadRowsAsCsv 성공 토스트 제거 ───────────────────────────────
text = text.replace(
    "    try{\n      if(typeof showToast === 'function') showToast('CSV 파일이 다운로드되었습니다.', 'success');\n    }catch(_e){}\n  }",
    "  }"
)

# ── 2. performBulkDelete 전체 교체 ─────────────────────────────────────
old_bulk = """\
    async function performBulkDelete(ids){
      const list = Array.isArray(ids) ? ids : [];
      const count = list.length;
      if(count === 0){
        try{ if(typeof showToast === 'function') showToast('삭제처리할 행을 먼저 선택하세요.', 'info'); }catch(_e){ alert('삭제처리할 행을 먼저 선택하세요.'); }
        return;
      }

      let ok = 0;
      for(const id of list){
        try{
          await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
          ok += 1;
        }catch(_e){
          // keep going
        }
      }

      try{ if(typeof showToast === 'function') showToast(`${ok}개 항목이 삭제처리되었습니다.`, 'success'); }catch(_e){}
      if(selectAll){ selectAll.checked = false; selectAll.indeterminate = false; }
      await load();
    }"""

new_bulk = """\
    async function performBulkDelete(ids){
      const list = Array.isArray(ids) ? ids : [];
      const count = list.length;
      if(count === 0) return;

      let ok = 0;
      let lastErr = null;
      for(const id of list){
        try{
          await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
          ok += 1;
        }catch(_e){
          if(!lastErr) lastErr = _e;
        }
      }

      if(selectAll){ selectAll.checked = false; selectAll.indeterminate = false; }

      if(ok === 0 && lastErr){
        const errMsg = (lastErr && lastErr.message) || '';
        // 세션 만료(401) 감지 → 로그인 페이지로 이동
        if(errMsg.includes('로그인') || errMsg.includes('login') || errMsg.includes('401')){
          window.location.href = '/login';
          return;
        }
        console.error('[insight] 삭제 실패:', errMsg);
        return;
      }

      await load();
    }"""

if old_bulk in text:
    text = text.replace(old_bulk, new_bulk)
    print('performBulkDelete 교체 완료')
else:
    print('ERROR: performBulkDelete 원본을 찾을 수 없음')

# ── 3. handleDelete 토스트 제거 + 401 처리 ──────────────────────────────
old_handle = """\
    async function handleDelete(id){
      if(!id) return;
      try{
        await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
        try{ if(typeof showToast === 'function') showToast('삭제되었습니다.', 'success'); }catch(_e){}
        // If last item on page was deleted, go back a page when appropriate.
        const totalPages = Math.max(1, Math.ceil(Math.max(0, state.total - 1) / state.pageSize));
        if(state.page > totalPages) state.page = totalPages;
        await load();
      }catch(err){
        try{ if(typeof showToast === 'function') showToast(err.message || '삭제 중 오류', 'error'); }catch(_e){ alert(err.message || '삭제 중 오류'); }
      }
    }"""

new_handle = """\
    async function handleDelete(id){
      if(!id) return;
      try{
        await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
        // 마지막 항목 삭제 시 이전 페이지로 이동
        const totalPages = Math.max(1, Math.ceil(Math.max(0, state.total - 1) / state.pageSize));
        if(state.page > totalPages) state.page = totalPages;
        await load();
      }catch(err){
        const msg = (err && err.message) || '';
        if(msg.includes('로그인') || msg.includes('login') || msg.includes('401')){
          window.location.href = '/login';
        } else {
          console.error('[insight] 개별 삭제 실패:', msg);
        }
      }
    }"""

if old_handle in text:
    text = text.replace(old_handle, new_handle)
    print('handleDelete 교체 완료')
else:
    print('ERROR: handleDelete 원본을 찾을 수 없음')

# ── 4. load() 에러 핸들러 토스트 제거 ───────────────────────────────────
old_load_err = """\
        try{
          if(typeof showToast === 'function') showToast(err.message || '오류가 발생했습니다.', 'error');
        }catch(_e){
          alert(err.message || '오류가 발생했습니다.');
        }"""
new_load_err = "        console.error('[insight] 목록 로드 실패:', (err && err.message) || err);"

if old_load_err in text:
    text = text.replace(old_load_err, new_load_err)
    print('load() 에러 토스트 제거 완료')
else:
    print('ERROR: load() 에러 패턴을 찾을 수 없음')

# ── 5. exportCsv 토스트들 제거 ──────────────────────────────────────────
text = text.replace(
    "          try{ if(typeof showToast === 'function') showToast('선택된 행이 없습니다.', 'info'); }catch(_e){}\n          return;",
    "          return;"
)
text = text.replace(
    "          try{ if(typeof showToast === 'function') showToast('다운로드할 데이터가 없습니다.', 'info'); }catch(_e){}\n          return;",
    "          return;"
)

# ── 6. openDeleteConfirmModal 토스트 제거 ───────────────────────────────
old_odc = "        try{ if(typeof showToast === 'function') showToast('삭제처리할 행을 먼저 선택하세요.', 'info'); }catch(_e){ alert('삭제처리할 행을 먼저 선택하세요.'); }\n        return;"
new_odc = "        return;"
text = text.replace(old_odc, new_odc)

# ── 7. submitForm 토스트들 제거 ─────────────────────────────────────────
old_sub_warn = "        try{ if(typeof showToast === 'function') showToast('제목을 입력하세요.', 'warning'); }catch(_e){ alert('제목을 입력하세요.'); }\n        modalTitleInput.focus();"
new_sub_warn = "        modalTitleInput.focus();"
text = text.replace(old_sub_warn, new_sub_warn)

old_sub_suc = "        try{ if(typeof showToast === 'function') showToast(wasEdit ? '수정되었습니다.' : '등록되었습니다.', 'success'); }catch(_e){}"
text = text.replace(old_sub_suc, "        // 저장 완료 - 목록 자동 갱신")

old_sub_err = "        try{ if(typeof showToast === 'function') showToast(err.message || '등록 실패', 'error'); }catch(_e){ alert(err.message || '등록 실패'); }"
new_sub_err = "        console.error('[insight] 저장 실패:', (err && err.message) || err);"
text = text.replace(old_sub_err, new_sub_err)

# ── 8. deleteExistingAttachment 토스트들 제거 ───────────────────────────
old_att_suc = "        try{ if(typeof showToast === 'function') showToast('첨부파일이 삭제되었습니다.', 'success'); }catch(_e){}"
text = text.replace(old_att_suc, "        // 첨부파일 삭제 완료")

old_att_err = "        try{ if(typeof showToast === 'function') showToast(err.message || '첨부파일 삭제 실패', 'error'); }catch(_e){ alert(err.message || '첨부파일 삭제 실패'); }"
new_att_err = "        console.error('[insight] 첨부파일 삭제 실패:', (err && err.message) || err);"
text = text.replace(old_att_err, new_att_err)

# ── 9. downloadConfirm 에러 토스트 제거 ─────────────────────────────────
old_dl_err = "          try{ if(typeof showToast === 'function') showToast(err.message || 'CSV 다운로드 실패', 'error'); }catch(_e){ alert(err.message || 'CSV 다운로드 실패'); }"
new_dl_err = "          console.error('[insight] CSV 다운로드 실패:', (err && err.message) || err);"
text = text.replace(old_dl_err, new_dl_err)

# ── 최종 검증 ───────────────────────────────────────────────────────────
remaining = text.count('showToast')
print(f'남은 showToast 호출 수: {remaining}')
if remaining > 0:
    import re
    for m in re.finditer(r'showToast', text):
        start = max(0, m.start()-50)
        print(f'  line context: {repr(text[start:m.start()+80])}')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)
print('파일 저장 완료')
