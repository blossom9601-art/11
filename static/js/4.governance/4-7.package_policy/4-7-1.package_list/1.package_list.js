(function(){
    'use strict';

    const API_URL = '/api/governance/packages';
    const VULN_API_URL = '/api/governance/package-vulnerabilities';

    const TABLE_BODY_ID = 'system-table-body';
    const COUNT_ID = 'system-count';
    const EMPTY_ID = 'system-empty';

    const SEARCH_ID = 'system-search';
    const SEARCH_CLEAR_ID = 'system-search-clear';
    const PAGE_SIZE_ID = 'system-page-size';

    const PAGINATION_INFO_ID = 'system-pagination-info';
    const PAGE_NUMBERS_ID = 'system-page-numbers';
    const FIRST_ID = 'system-first';
    const PREV_ID = 'system-prev';
    const NEXT_ID = 'system-next';
    const LAST_ID = 'system-last';

    const SELECT_ALL_ID = 'system-select-all';

    const DOWNLOAD_BTN_ID = 'system-download-btn';

    let state = {
        items: [],
        filtered: [],
        search: '',
        pageSize: 10,
        page: 1,
        isFetching: false,

        sortKey: '',
        sortDir: 'asc',

        selected: new Set(),

        vulns: [],
        vulnsById: new Map(),
        vulnsByPkg: new Map(),
        vulnsReady: false,
    };

    function qs(id){ return document.getElementById(id); }

    function escHtml(s){
        return String(s ?? '')
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    }

    async function apiFetch(url){
        const res = await fetch(url, { credentials:'same-origin', cache:'no-store' });
        const ct = res.headers.get('content-type') || '';
        if(!res.ok){
            const t = await res.text();
            throw new Error(`HTTP ${res.status} ${t.slice(0,200)}`);
        }
        if(!/application\/json/i.test(ct)){
            const t = await res.text();
            throw new Error(`Non-JSON ${ct} ${t.slice(0,200)}`);
        }
        return await res.json();
    }

    function normalizeForSearch(it){
        return (
            `${it.work_name||''} ${it.system_name||''} ${it.package||''} ${it.version||''} `+
            `${it.package_type||''} ${it.identifier||''} ${it.manufacturer||''} ${it.license||''} `+
            `${it.vulnerability_raw||''} ${it._vuln_summary||''} ${it.updated_at||''}`
        ).toLowerCase();
    }

    function normalizePkgName(s){
        return String(s ?? '').trim().toLowerCase();
    }

    function tokenizeVersion(v){
        const raw = String(v ?? '').trim();
        if(!raw) return [];
        return raw.split(/[^0-9A-Za-z]+/).filter(Boolean).map(tok => {
            if(/^[0-9]+$/.test(tok)) return {t:'n', v: Number(tok)};
            return {t:'s', v: tok.toLowerCase()};
        });
    }

    function compareVersions(a, b){
        const aa = tokenizeVersion(a);
        const bb = tokenizeVersion(b);
        const n = Math.max(aa.length, bb.length);
        for(let i=0;i<n;i++){
            const x = aa[i];
            const y = bb[i];
            if(!x && !y) return 0;
            if(!x) return -1;
            if(!y) return 1;
            if(x.t === y.t){
                if(x.v < y.v) return -1;
                if(x.v > y.v) return 1;
            }else{
                // numbers sort after strings (e.g., 1 > alpha)
                if(x.t === 'n' && y.t === 's') return 1;
                if(x.t === 's' && y.t === 'n') return -1;
            }
        }
        return 0;
    }

    function isEmptyVal(v){
        const s = String(v ?? '').trim();
        return !s || s === '-';
    }

    function parseTimestamp(v){
        const raw = String(v ?? '').trim();
        if(!raw || raw === '-') return null;

        if(/^[0-9]{10}$/.test(raw)){
            const d = new Date(Number(raw) * 1000);
            return Number.isNaN(d.getTime()) ? null : d.getTime();
        }
        if(/^[0-9]{13}$/.test(raw)){
            const d = new Date(Number(raw));
            return Number.isNaN(d.getTime()) ? null : d.getTime();
        }

        const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
        if(!Number.isNaN(d.getTime())) return d.getTime();
        return null;
    }

    function compareText(a, b){
        return String(a ?? '').localeCompare(String(b ?? ''), 'ko', {numeric:true, sensitivity:'base'});
    }

    function compareNullable(aEmpty, bEmpty, cmp, dir){
        // Always push empty values to the bottom.
        if(aEmpty && bEmpty) return 0;
        if(aEmpty) return 1;
        if(bEmpty) return -1;
        return dir * cmp;
    }

    function applySort(){
        const key = String(state.sortKey || '').trim();
        if(!key) return;
        const dir = (state.sortDir === 'desc') ? -1 : 1;

        const withIdx = state.filtered.map((it, idx) => ({it, idx}));
        withIdx.sort((a, b) => {
            const x = a.it;
            const y = b.it;
            let cmp = 0;

            if(key === 'vulnerability'){
                const ax = Array.isArray(x?._vuln_ids) ? x._vuln_ids.length : 0;
                const bx = Array.isArray(y?._vuln_ids) ? y._vuln_ids.length : 0;
                cmp = ax - bx;
                return dir * cmp || (a.idx - b.idx);
            }

            if(key === 'version'){
                const av = String(x?.version ?? '').trim();
                const bv = String(y?.version ?? '').trim();
                const ae = isEmptyVal(av);
                const be = isEmptyVal(bv);
                cmp = compareVersions(av, bv);
                const out = compareNullable(ae, be, cmp, dir);
                return out || (a.idx - b.idx);
            }

            if(key === 'updated_at'){
                const aRaw = x?.updated_at || x?.created_at || '';
                const bRaw = y?.updated_at || y?.created_at || '';
                const at = parseTimestamp(aRaw);
                const bt = parseTimestamp(bRaw);
                const ae = (at === null);
                const be = (bt === null);
                cmp = (Number(at || 0) - Number(bt || 0));
                const out = compareNullable(ae, be, cmp, dir);
                return out || (a.idx - b.idx);
            }

            const av = String(x?.[key] ?? '').trim();
            const bv = String(y?.[key] ?? '').trim();
            const ae = isEmptyVal(av);
            const be = isEmptyVal(bv);
            cmp = compareText(av, bv);
            const out = compareNullable(ae, be, cmp, dir);
            return out || (a.idx - b.idx);
        });
        state.filtered = withIdx.map(x => x.it);
    }

    function updateHeaderSortState(){
        const ths = document.querySelectorAll('#system-table thead th[data-col]');
        ths.forEach(th => {
            const k = th.getAttribute('data-col') || '';
            if(!k) return;
            if(String(state.sortKey) !== k){
                th.setAttribute('aria-sort', 'none');
                return;
            }
            th.setAttribute('aria-sort', state.sortDir === 'desc' ? 'descending' : 'ascending');
        });
    }

    function initTableSorting(){
        const table = document.getElementById('system-table');
        if(!table) return;

        const notSortable = new Set(['actions']);
        const ths = table.querySelectorAll('thead th[data-col]');
        ths.forEach(th => {
            const key = String(th.getAttribute('data-col') || '').trim();
            if(!key || notSortable.has(key)) return;

            th.classList.add('sortable');
            th.setAttribute('role', 'button');
            if(!th.hasAttribute('tabindex')) th.setAttribute('tabindex', '0');
            th.setAttribute('aria-sort', 'none');

            function activate(){
                if(state.sortKey === key){
                    state.sortDir = (state.sortDir === 'asc') ? 'desc' : 'asc';
                }else{
                    state.sortKey = key;
                    state.sortDir = 'asc';
                }
                state.page = 1;
                applyFilterAndRender();
            }

            th.addEventListener('click', activate);
            th.addEventListener('keydown', (e)=>{
                if(e.key === 'Enter' || e.key === ' '){
                    e.preventDefault();
                    activate();
                }
            });
        });
    }

    function parseExprGroups(expr){
        const s = String(expr ?? '').trim();
        if(!s) return [];

        // OR groups split by comma/semicolon
        const orParts = s.split(/[;,]+/).map(x=>x.trim()).filter(Boolean);
        const groups = [];

        for(const part of orParts){
            // Range syntax: a~b or a - b
            const rangeMatch = part.match(/^([^\s]+)\s*(?:~|\-|–|—)\s*([^\s]+)$/);
            if(rangeMatch){
                groups.push([{op:'range', a: rangeMatch[1], b: rangeMatch[2]}]);
                continue;
            }

            // AND tokens split by whitespace when they look like comparators
            const tokens = part.split(/\s+/).filter(Boolean);
            const clauses = [];
            let ok = true;
            for(const tok of tokens){
                const m = tok.match(/^(>=|<=|>|<|==|=|!=)(.+)$/);
                if(m){
                    clauses.push({op: m[1], v: m[2].trim()});
                    continue;
                }
                // If the whole part is a single version (e.g. 1.2.3)
                if(tokens.length === 1){
                    clauses.push({op:'=', v: tok});
                    continue;
                }
                ok = false;
                break;
            }
            if(ok && clauses.length){
                groups.push(clauses);
            }
        }
        return groups;
    }

    function groupMatches(version, clauses){
        const ver = String(version ?? '').trim();
        if(!ver) return false;
        for(const c of clauses){
            if(c.op === 'range'){
                const lo = compareVersions(ver, c.a);
                const hi = compareVersions(ver, c.b);
                if(!(lo >= 0 && hi <= 0)) return false;
                continue;
            }
            const cmp = compareVersions(ver, c.v);
            if(c.op === '>' && !(cmp > 0)) return false;
            if(c.op === '>=' && !(cmp >= 0)) return false;
            if(c.op === '<' && !(cmp < 0)) return false;
            if(c.op === '<=' && !(cmp <= 0)) return false;
            if((c.op === '=' || c.op === '==') && !(cmp === 0)) return false;
            if(c.op === '!=' && !(cmp !== 0)) return false;
        }
        return true;
    }

    function isVersionAffected(version, affectedExpr){
        const expr = String(affectedExpr ?? '').trim();
        if(!expr) return true; // if not specified, assume applies to all versions
        const groups = parseExprGroups(expr);
        if(!groups.length) return false;
        return groups.some(g => groupMatches(version, g));
    }

    // Interpret "영향 버전" as the impacted/affected versions expression.
    // If the version satisfies the expression, we treat it as impacted.
    function isVersionImpacted(version, affectedExpr){
        const expr = String(affectedExpr ?? '').trim();
        if(!expr) return true;
        return isVersionAffected(version, expr);
    }

    function getImpactExpr(vuln){
        const fixed = String(vuln?.fixed_versions ?? '').trim();
        if(fixed) return fixed;
        const affected = String(vuln?.affected_versions ?? '').trim();
        return affected;
    }

    function indexVulns(){
        state.vulnsById = new Map();
        state.vulnsByPkg = new Map();
        for(const v of (state.vulns || [])){
            if(!v) continue;
            const id = Number(v.id || 0);
            if(id) state.vulnsById.set(id, v);
            const key = normalizePkgName(v.package_name);
            if(!key) continue;
            if(!state.vulnsByPkg.has(key)) state.vulnsByPkg.set(key, []);
            state.vulnsByPkg.get(key).push(v);
        }
        state.vulnsReady = true;
    }

    function applyVulnMapping(){
        if(!state.vulnsReady || !Array.isArray(state.items)) return;
        for(const it of state.items){
            if(!it) continue;
            if(it.vulnerability_raw === undefined) it.vulnerability_raw = it.vulnerability || '';

            const key = normalizePkgName(it.package);
            const candidates = key ? (state.vulnsByPkg.get(key) || []) : [];
            const matches = candidates.filter(v => isVersionImpacted(it.version, getImpactExpr(v)));
            const ids = matches.map(v => Number(v.id || 0)).filter(Boolean);
            it._vuln_ids = ids;
            it._vuln_summary = matches.map(v => v.cve_id).filter(Boolean).join(' ');
        }
    }

    function applyFilterAndRender(){
        const raw = (state.search || '').trim().toLowerCase();
        if(!raw){
            state.filtered = state.items.slice();
        }else{
            const tokens = raw.split('%').map(s=>s.trim()).filter(Boolean);
            state.filtered = state.items.filter(it => {
                const hay = normalizeForSearch(it);
                return tokens.every(t => hay.includes(t));
            });
        }

        applySort();
        updateHeaderSortState();

        const countEl = qs(COUNT_ID);
        if(countEl) countEl.textContent = String(state.filtered.length);

        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        if(state.page > totalPages) state.page = totalPages;
        if(state.page < 1) state.page = 1;

        renderTable();
        renderPagination();
        renderEmpty();
    }

    function currentPageItems(){
        const start = (state.page - 1) * state.pageSize;
        const end = start + state.pageSize;
        return state.filtered.slice(start, end);
    }

    function syncSelectAll(){
        const selectAll = qs(SELECT_ALL_ID);
        if(!selectAll) return;

        const pageItems = currentPageItems();
        if(!pageItems.length){
            selectAll.checked = false;
            selectAll.indeterminate = false;
            return;
        }

        const ids = pageItems.map(it => String(it?.id ?? '')).filter(Boolean);
        const selectedCount = ids.reduce((acc, id) => acc + (state.selected.has(id) ? 1 : 0), 0);
        selectAll.checked = selectedCount === ids.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < ids.length;
    }

    function renderEmpty(){
        const empty = qs(EMPTY_ID);
        const tbody = qs(TABLE_BODY_ID);
        if(!empty || !tbody) return;
        const hasRows = (tbody.children?.length || 0) > 0;
        empty.hidden = hasRows;
    }

    function buildRow(it){
        const updated = it.updated_at || it.created_at || '-';

        const id = String(it?.id ?? '');
        const isSelected = id && state.selected.has(id);

                const vulnIds = Array.isArray(it._vuln_ids) ? it._vuln_ids : [];
                const vulnCount = vulnIds.length;
                const hasVuln = vulnCount > 0;
                const countText = vulnCount >= 3 ? '3+' : String(vulnCount);
                const toneClass = vulnCount >= 3 ? 'tone-3' : (vulnCount === 2 ? 'tone-2' : 'tone-1');
                const vulnCell = hasVuln
                        ? `<span class="cell-num">\
            <span class="num-badge ${escHtml(toneClass)}" aria-label="취약점 수">${escHtml(countText)}</span>\
            <button type="button" class="action-btn pkg-vuln-btn" title="취약점 ${escHtml(vulnCount)}건 보기" aria-label="취약점 보기" data-id="${escHtml(it.id)}">\
                <img src="/static/image/svg/list/free-icon-search.svg" alt="보기" class="action-icon">\
            </button>\
        </span>`
                        : '-';

                return `\
<tr${isSelected ? ' class="selected"' : ''} data-id="${escHtml(id)}">\
    <td><input type="checkbox" class="system-row-select" data-id="${escHtml(id)}" ${isSelected ? 'checked' : ''} aria-label="행 선택"></td>\
  <td data-col="work_name">${escHtml(it.work_name || '-')}</td>\
  <td data-col="system_name">${escHtml(it.system_name || '-')}</td>\
  <td data-col="package">${escHtml(it.package || '-')}</td>\
  <td data-col="version">${escHtml(it.version || '-')}</td>\
  <td data-col="package_type">${escHtml(it.package_type || '-')}</td>\
  <td data-col="identifier">${escHtml(it.identifier || '-')}</td>\
  <td data-col="manufacturer">${escHtml(it.manufacturer || '-')}</td>\
  <td data-col="license">${escHtml(it.license || '-')}</td>\
    <td data-col="vulnerability" class="system-actions">${vulnCell}</td>\
  <td data-col="updated_at">${escHtml(updated || '-')}</td>\
</tr>`;
    }

    function renderTable(){
        const tbody = qs(TABLE_BODY_ID);
        if(!tbody) return;
        const pageItems = currentPageItems();
        tbody.innerHTML = pageItems.map(buildRow).join('');

        tbody.querySelectorAll('.pkg-vuln-btn').forEach(btn => {
            btn.addEventListener('click', ()=>{
                const id = Number(btn.dataset.id || 0);
                const item = state.items.find(x => Number(x.id) === id);
                if(item) openVulnModal(item);
            });
        });

        syncSelectAll();
    }

    function renderPagination(){
        const total = state.filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

        const info = qs(PAGINATION_INFO_ID);
        if(info) info.textContent = `${total}개 항목`;

        const first = qs(FIRST_ID);
        const prev = qs(PREV_ID);
        const next = qs(NEXT_ID);
        const last = qs(LAST_ID);

        const disablePrev = state.page <= 1;
        const disableNext = state.page >= totalPages;
        if(first) first.disabled = disablePrev;
        if(prev) prev.disabled = disablePrev;
        if(next) next.disabled = disableNext;
        if(last) last.disabled = disableNext;

        if(first) first.onclick = () => { state.page = 1; renderTable(); renderPagination(); };
        if(prev) prev.onclick = () => { state.page = Math.max(1, state.page-1); renderTable(); renderPagination(); };
        if(next) next.onclick = () => { state.page = Math.min(totalPages, state.page+1); renderTable(); renderPagination(); };
        if(last) last.onclick = () => { state.page = totalPages; renderTable(); renderPagination(); };

        const pageNumbers = qs(PAGE_NUMBERS_ID);
        if(!pageNumbers) return;

        const windowSize = 7;
        let start = Math.max(1, state.page - Math.floor(windowSize/2));
        let end = Math.min(totalPages, start + windowSize - 1);
        start = Math.max(1, end - windowSize + 1);

        let html = '';
        for(let p=start; p<=end; p++){
            html += `<button class="page-btn ${p===state.page?'active':''}" data-page="${p}" type="button">${p}</button>`;
        }
        pageNumbers.innerHTML = html;
        pageNumbers.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', ()=>{
                const p = Number(btn.dataset.page || 1);
                state.page = p;
                renderTable();
                renderPagination();
            });
        });
    }

    function csvEscape(v){
        const s = String(v ?? '');
        if(/[\r\n",]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
        return s;
    }

    function downloadCsv(){
        const headers = [
            '업무명','시스템명','패키지 이름','버전','유형','식별자','제조사','라이선스','취약점','업데이트 일자'
        ];
        const lines = [headers.map(csvEscape).join(',')];
        state.filtered.forEach(it => {
            const vulnCount = Array.isArray(it._vuln_ids) ? it._vuln_ids.length : 0;
            lines.push([
                it.work_name || '',
                it.system_name || '',
                it.package || '',
                it.version || '',
                it.package_type || '',
                it.identifier || '',
                it.manufacturer || '',
                it.license || '',
                String(vulnCount || 0),
                it.updated_at || it.created_at || ''
            ].map(csvEscape).join(','));
        });

        const bom = '\uFEFF';
        const blob = new Blob([bom + lines.join('\n')], {type:'text/csv;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `packages_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

        function openModal(el){
                if(!el) return;
                el.setAttribute('aria-hidden','false');
                // App-wide modal visibility uses the 'show' class.
                el.classList.add('show');
                // Keep legacy class for safety (some pages may rely on it).
                el.classList.add('open');
                document.body.classList.add('modal-open');
        }

        function closeModal(el){
                if(!el) return;
                el.setAttribute('aria-hidden','true');
                el.classList.remove('show');
                el.classList.remove('open');
                document.body.classList.remove('modal-open');
        }

        function truncateText(s, n){
                const t = String(s ?? '').trim();
                if(!t) return '';
                return t.length > n ? (t.slice(0, n) + '…') : t;
        }

        function openVulnModal(item){
                const modal = qs('pkg-vuln-modal');
                const subtitle = qs('pkg-vuln-subtitle');
                const body = qs('pkg-vuln-body');
                if(!modal || !body) return;

                const pkg = item.package || '-';
                const ver = item.version || '-';
                const sys = item.system_name || '';
                const work = item.work_name || '';
                if(subtitle) subtitle.textContent = `${work}${work&&sys?' / ':''}${sys} · ${pkg} ${ver}`;

                const ids = Array.isArray(item._vuln_ids) ? item._vuln_ids : [];
                const vulns = ids.map(id => state.vulnsById.get(Number(id))).filter(Boolean);

                if(!vulns.length){
                        body.innerHTML = `<div class="empty-text"><p>매칭된 취약점이 없습니다.</p></div>`;
                        openModal(modal);
                        return;
                }

                function renderListView(){
                        const rows = vulns.map(v => {
                                const vid = Number(v?.id || 0);
                                const cvss = (v.cvss === null || v.cvss === undefined || v.cvss === '') ? '-' : String(v.cvss);
                                return `\
<tr>\
    <td>\
        <button type="button" class="pkg-vuln-cve-link pkg-vuln-cve-plain" data-vid="${escHtml(vid)}" title="개요 보기">${escHtml(v.cve_id || '-')}</button>\
    </td>\
    <td>${escHtml(v.severity || '-')}</td>\
    <td>${escHtml(cvss)}</td>\
    <td>${escHtml(v.status || '-')}</td>\
    <td>${escHtml(v.affected_versions || '-')}</td>\
    <td>${escHtml(v.published_at || '-')}</td>\
</tr>`;
                        }).join('');

                        body.innerHTML = `\
<div class="system-table-container server-table-container">\
    <table class="system-data-table server-data-table">\
        <thead>\
            <tr>\
                <th>CVE ID</th>\
                <th>심각도</th>\
                <th>CVSS</th>\
                <th>상태</th>\
                <th>영향 버전</th>\
                <th>공개일</th>\
            </tr>\
        </thead>\
        <tbody>${rows}</tbody>\
    </table>\
</div>`;

                        body.querySelectorAll('.pkg-vuln-cve-link').forEach(btn => {
                                btn.addEventListener('click', ()=>{
                                        const vid = Number(btn.dataset.vid || 0);
                                        const v = state.vulnsById.get(vid);
                                        if(v) renderOverviewView(v);
                                });
                        });
                }

                function renderOverviewView(v){
                        const cvss = (v.cvss === null || v.cvss === undefined || v.cvss === '') ? '-' : String(v.cvss);
                        body.innerHTML = `\
<div class="server-edit-actions" style="padding: 0 0 12px 0;">\
    <div class="action-buttons left">\
        <button type="button" class="btn-secondary pkg-vuln-back">목록으로</button>\
    </div>\
</div>\
<div class="detail-section">\
    <div class="basic-info-card pv-ov-card">\
        <div class="basic-info-card-content pv-ov-split">\
            <div class="pv-ov-col pv-ov-col-left" aria-label="취약점 개요">\
                <div class="pv-ov-section-title">취약점 개요</div>\
                <div class="info-row"><label>CVE ID</label><span class="info-value">${escHtml(v.cve_id || '-')}</span></div>\
                <div class="info-row"><label>패키지 이름</label><span class="info-value">${escHtml(v.package_name || '-')}</span></div>\
                <div class="info-row"><label>심각도</label><span class="info-value">${escHtml(v.severity || '-')}</span></div>\
                <div class="info-row"><label>CVSS</label><span class="info-value">${escHtml(cvss)}</span></div>\
                <div class="info-row"><label>상태</label><span class="info-value">${escHtml(v.status || '-')}</span></div>\
                <div class="info-row"><label>공개일</label><span class="info-value">${escHtml(v.published_at || '-')}</span></div>\
                <div class="info-row"><label>영향 버전</label><span class="info-value">${escHtml(v.affected_versions || '-')}</span></div>\
                <div class="info-row"><label>수정 버전</label><span class="info-value">${escHtml(v.fixed_versions || '-')}</span></div>\
                <div class="info-row"><label>비고</label><span class="info-value">${escHtml(v.remark || '-')}</span></div>\
            </div>\
            <div class="pv-ov-col pv-ov-col-right" aria-label="취약점 내용">\
                <div class="pv-ov-section-title">취약점 내용</div>\
                <div class="pv-ov-content pv-ov-pre">${escHtml(String(v.content || '').trim() || '-')}</div>\
            </div>\
        </div>\
    </div>\
</div>`;

                        body.querySelector('.pkg-vuln-back')?.addEventListener('click', renderListView);
                }

                renderListView();
                openModal(modal);
        }

        function initVulnModal(){
                const modal = qs('pkg-vuln-modal');
                const closeBtn = qs('pkg-vuln-close');
                if(!modal) return;
                closeBtn?.addEventListener('click', ()=> closeModal(modal));
                modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(modal); });
                document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeModal(modal); });
                closeModal(modal);
        }

    function initEvents(){
        const search = qs(SEARCH_ID);
        const clearBtn = qs(SEARCH_CLEAR_ID);
        const pageSize = qs(PAGE_SIZE_ID);
        const tbody = qs(TABLE_BODY_ID);

        search?.addEventListener('input', ()=>{
            state.search = (search.value || '');
            state.page = 1;
            applyFilterAndRender();
        });
        clearBtn?.addEventListener('click', ()=>{
            if(search) search.value = '';
            state.search = '';
            state.page = 1;
            applyFilterAndRender();
        });
        pageSize?.addEventListener('change', ()=>{
            const v = Number(pageSize.value || 10);
            state.pageSize = (v > 0 ? v : 10);
            state.page = 1;
            applyFilterAndRender();
        });

        qs(DOWNLOAD_BTN_ID)?.addEventListener('click', downloadCsv);

        // Table checkbox selection (backup-policy style)
        tbody?.addEventListener('click', (e)=>{
            // Ignore direct clicks on interactive controls.
            if(e.target?.closest?.('input.system-row-select')) return;

            const tr = e.target?.closest?.('tr[data-id]');
            if(!tr) return;
            const cb = tr.querySelector('input.system-row-select');
            if(!cb) return;
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        });

        tbody?.addEventListener('change', (e)=>{
            const cb = e.target?.closest?.('input.system-row-select');
            if(!cb) return;
            const id = String(cb.dataset.id || '');
            if(!id) return;

            if(cb.checked) state.selected.add(id);
            else state.selected.delete(id);

            const tr = cb.closest('tr');
            if(tr) tr.classList.toggle('selected', !!cb.checked);

            syncSelectAll();
        });

        qs(SELECT_ALL_ID)?.addEventListener('change', (e)=>{
            const checked = !!e.target.checked;
            currentPageItems().forEach(it => {
                const id = String(it?.id ?? '');
                if(!id) return;
                if(checked) state.selected.add(id);
                else state.selected.delete(id);
            });
            renderTable();
        });

        // Quick keys: '/' focus search, ESC clear
        document.addEventListener('keydown', (e)=>{
            if(e.key === '/' && document.activeElement !== search){
                e.preventDefault();
                search?.focus();
            }
            if(e.key === 'Escape'){
                if(search && document.activeElement === search){
                    search.value = '';
                    state.search = '';
                    state.page = 1;
                    applyFilterAndRender();
                }
            }
        });
    }

    async function fetchPackages(){
        if(state.isFetching) return;
        state.isFetching = true;
        try{
            const data = await apiFetch(`${API_URL}?_ts=${Date.now()}`);
            state.items = Array.isArray(data.items) ? data.items : [];
        }catch(e){
            console.error(e);
            alert('패키지 데이터를 불러오지 못했습니다.');
            state.items = [];
        }finally{
            state.isFetching = false;
        }
    }

    async function fetchVulns(){
        try{
            const data = await apiFetch(`${VULN_API_URL}?_ts=${Date.now()}`);
            state.vulns = Array.isArray(data.items) ? data.items : [];
            indexVulns();
        }catch(e){
            console.error(e);
            // Do not block package list if vuln fetch fails.
            state.vulns = [];
            indexVulns();
        }
    }

    function init(){
initVulnModal();
        initTableSorting();
        initEvents();
        Promise.all([fetchPackages(), fetchVulns()]).finally(()=>{
            applyVulnMapping();
            applyFilterAndRender();
        });
    }

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
