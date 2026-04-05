// Shared budget population logic for project tabs (details, integrity, scope, schedule)
// Supports optional data-fixed-budget to force a specific value (bypasses aggregation).
// Aggregates total budget from localStorage cost.snapshot and updates #project-budget when no fixed value.
(function(){
  function parseMoney(s){
    const t = String(s||'').replace(/원/g,'').replace(/,/g,'').trim();
    const n = Number(t.replace(/[^0-9\-]/g,''));
    return Number.isFinite(n) ? n : 0;
  }
  function formatMoneyKRW(n){
    try { return new Intl.NumberFormat('ko-KR',{ maximumFractionDigits:0 }).format(n) + '원'; }
    catch(_){ const sign = n<0?'-':''; const abs=Math.abs(n); return sign+String(abs).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원'; }
  }
  function applyBudget(){
    const budgetEl = document.getElementById('project-budget');
    if(!budgetEl) return;
    // If a fixed budget is explicitly provided via data-fixed-budget (page-specific override), honor it and skip snapshot aggregation.
    const fixed = budgetEl.getAttribute('data-fixed-budget');
    if(fixed){
      const row = budgetEl.closest('.meta-row');
      if(row) row.style.display='';
      budgetEl.textContent = formatMoneyKRW(parseMoney(fixed));
      return;
    }
    let total = 0;
    try {
      const raw = localStorage.getItem('cost.snapshot');
      if(raw){
        const rows = JSON.parse(raw);
        if(Array.isArray(rows)){
          rows.forEach(r=>{ total += parseMoney(r.budget); });
        }
      }
    } catch(_) { /* ignore parse errors */ }
    // Always show the row (cost page keeps the budget line visible even if 0)
    const row = budgetEl.closest('.meta-row');
    if(row) row.style.display='';
    budgetEl.textContent = total > 0 ? formatMoneyKRW(total) : '0원';
  }
  window.addEventListener('DOMContentLoaded', applyBudget);
})();
