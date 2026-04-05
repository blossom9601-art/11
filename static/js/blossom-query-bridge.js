/* ============================================================
 *  Blossom Query Bridge  —  기존 코드 ↔ 새 쿼리 시스템 연결
 *  ============================================================
 *  기존 바닐라 JS 페이지 코드에서 BlossomQuery 를 쉽게 사용할 수
 *  있도록 하는 고수준 바인딩.
 *
 *  §1  페이지 바인딩 (DOM 컨테이너 ↔ 쿼리)
 *  §2  테이블 렌더러 팩토리
 *  §3  폼 뮤테이션 헬퍼
 *  §4  Cascade Select 연동
 *  §5  Polling 매니저
 *  §6  blsMakeTabCrud 확장 포인트
 * ============================================================ */
;(function (win) {
  'use strict';

  var BQ = win.BlossomQuery;
  if (!BQ) { console.error('[BQ-Bridge] BlossomQuery not loaded'); return; }

  /* 페이지 단위 구독 해제 추적 */
  var _pageCleanups = [];

  /**
   * SPA 전환 시 이전 페이지 구독 모두 해제
   */
  function cleanupPage() {
    _pageCleanups.forEach(function (fn) {
      try { fn(); } catch (e) { /* skip */ }
    });
    _pageCleanups = [];
  }

  /* SPA 전환 이벤트에 연결 */
  window.addEventListener('blossom:spa:navigated', cleanupPage);

  /**
   * 구독 해제 추적에 등록
   */
  function trackCleanup(fn) {
    _pageCleanups.push(fn);
    return fn;
  }


  /* ──────────────────────────────────────────────────────────
   *  §1  페이지 바인딩 — DOM 컨테이너에 쿼리 결과 자동 렌더링
   * ────────────────────────────────────────────────────────── */

  /**
   * bindQuery(config) — 컨테이너 DOM 에 쿼리를 바인딩하여 자동 렌더링
   *
   * @param {object} config
   *   config.key        query key (배열)
   *   config.fetchFn    () => Promise<data>
   *   config.container  DOM element 또는 셀렉터 문자열
   *   config.render     (data, container) => void
   *   config.onLoading  (container) => void   (선택)
   *   config.onError    (error, container) => void (선택)
   *   config.staleTime  number (선택)
   *
   * @returns {object} { unsubscribe(), refetch(), getData() }
   */
  function bindQuery(config) {
    var container = typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;

    if (!container) {
      console.warn('[BQ-Bridge] Container not found:', config.container);
      return { unsubscribe: function(){}, refetch: function(){}, getData: function(){ return null; } };
    }

    var key = config.key;
    var opts = {};
    if (config.staleTime != null) opts.staleTime = config.staleTime;

    /* 초기 fetch */
    BQ.fetchQuery(key, config.fetchFn, opts).catch(function () { /* handled by observer */ });

    /* observer 등록 */
    var unsub = BQ.subscribe(key, function (entry) {
      /* loading */
      if (entry.isFetching && !entry.data) {
        if (config.onLoading) {
          config.onLoading(container);
        } else {
          BQ.setLoading(container, true);
        }
        return;
      }

      BQ.setLoading(container, false);

      /* error */
      if (entry.state === BQ.QState.ERROR && !entry.data) {
        if (config.onError) {
          config.onError(entry.error, container);
        } else {
          BQ.setError(container, entry.error ? entry.error.message : '데이터 로드 실패', function () {
            BQ.fetchQuery(key);
          });
        }
        return;
      }

      /* success */
      BQ.setError(container, null);
      if (config.render && entry.data !== undefined) {
        config.render(entry.data, container);
      }
    });

    trackCleanup(unsub);

    return {
      unsubscribe: unsub,
      refetch: function () { return BQ.fetchQuery(key, config.fetchFn, opts); },
      getData: function () { return BQ.getQueryData(key); }
    };
  }


  /* ──────────────────────────────────────────────────────────
   *  §2  테이블 렌더러 팩토리
   * ────────────────────────────────────────────────────────── */

  /**
   * bindTable(config) — 데이터 목록을 <table> 에 자동 렌더링
   *
   * @param {object} config
   *   config.entity     엔터티명 (BQ.entities 에 등록된)
   *   config.tableEl    <table> 또는 <tbody> 요소/셀렉터
   *   config.params     API 쿼리 파라미터
   *   config.columns    [{key, label, render(val,row)}]
   *   config.emptyText  빈 상태 메시지 (선택)
   *   config.onData     (data) => void  커스텀 후처리 (선택)
   *   config.pageSize   숫자 (선택, 기본 20)
   *
   * @returns {object} { setParams(p), getRows(), unsubscribe() }
   */
  function bindTable(config) {
    var entityQ = BQ.entities && BQ.entities[config.entity];
    if (!entityQ) {
      console.warn('[BQ-Bridge] Entity not found:', config.entity);
      return {};
    }

    var tableEl = typeof config.tableEl === 'string'
      ? document.querySelector(config.tableEl)
      : config.tableEl;
    var tbody = tableEl && tableEl.tagName === 'TBODY' ? tableEl : (tableEl && tableEl.querySelector('tbody'));
    var columns = config.columns || [];
    var emptyText = config.emptyText || '데이터가 없습니다.';
    var currentParams = config.params || {};
    var currentData = null;

    function renderRows(data) {
      currentData = data;
      if (!tbody) return;

      var rows = data.rows || data.items || data || [];
      tbody.innerHTML = '';

      if (!rows.length) {
        var emptyTr = document.createElement('tr');
        var emptyTd = document.createElement('td');
        emptyTd.setAttribute('colspan', columns.length || 99);
        emptyTd.style.cssText = 'text-align:center;padding:40px 0;color:#9ca3af;font-size:14px;';
        emptyTd.textContent = emptyText;
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        return;
      }

      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        columns.forEach(function (col) {
          var td = document.createElement('td');
          if (col.render) {
            var result = col.render(row[col.key], row);
            if (typeof result === 'string') {
              td.innerHTML = result;
            } else if (result instanceof HTMLElement) {
              td.appendChild(result);
            } else {
              td.textContent = result != null ? String(result) : '';
            }
          } else {
            td.textContent = row[col.key] != null ? String(row[col.key]) : '';
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      if (config.onData) config.onData(data);
    }

    /* 구독 */
    var unsub = entityQ.subscribeList(currentParams, function (entry) {
      if (tableEl) {
        BQ.setLoading(tableEl, entry.isFetching && !entry.data);
      }
      if (entry.data) renderRows(entry.data);
      if (entry.state === BQ.QState.ERROR && !entry.data) {
        BQ.setError(tableEl, '목록 로드 실패', function () {
          entityQ.fetchList(currentParams);
        });
      }
    });

    trackCleanup(unsub);

    return {
      setParams: function (p) {
        currentParams = Object.assign(currentParams, p);
        return entityQ.fetchList(currentParams);
      },
      getRows: function () { return currentData; },
      unsubscribe: unsub,
      refresh: function () { return entityQ.fetchList(currentParams); }
    };
  }


  /* ──────────────────────────────────────────────────────────
   *  §3  폼 뮤테이션 헬퍼
   * ────────────────────────────────────────────────────────── */

  /**
   * bindForm(config) — <form> submit 을 mutation 에 연결
   *
   * @param {object} config
   *   config.formEl    <form> 요소/셀렉터
   *   config.entity    엔터티명
   *   config.mode      'create' | 'update'
   *   config.getId     () => id (update 모드일 때)
   *   config.serialize (formEl) => body (선택, 기본: FormData → JSON)
   *   config.onSuccess (data) => void
   *   config.onError   (error) => void
   *   config.optimistic boolean (선택)
   *   config.successMessage string (선택)
   */
  function bindForm(config) {
    var formEl = typeof config.formEl === 'string'
      ? document.querySelector(config.formEl)
      : config.formEl;
    if (!formEl) return;

    var entityQ = BQ.entities && BQ.entities[config.entity];
    if (!entityQ) return;

    var serialize = config.serialize || function (form) {
      var fd = new FormData(form);
      var obj = {};
      fd.forEach(function (v, k) { obj[k] = v; });
      return obj;
    };

    function handleSubmit(e) {
      e.preventDefault();
      var body = serialize(formEl);
      var submitBtn = formEl.querySelector('[type="submit"], button:not([type="button"])');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.bqOrigText = submitBtn.textContent; submitBtn.textContent = '처리 중...'; }

      var promise;
      if (config.mode === 'update') {
        var id = config.getId ? config.getId() : body.id;
        promise = entityQ.update({ id: id, body: body });
      } else {
        promise = entityQ.create(body);
      }

      promise
        .then(function (data) {
          BQ.showToast(config.successMessage || '저장 완료', 'success');
          if (config.onSuccess) config.onSuccess(data);
        })
        .catch(function (err) {
          BQ.showToast(err.message || '저장 실패', 'error');
          if (config.onError) config.onError(err);
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.bqOrigText || '저장'; }
        });
    }

    formEl.addEventListener('submit', handleSubmit);
    trackCleanup(function () { formEl.removeEventListener('submit', handleSubmit); });
  }


  /* ──────────────────────────────────────────────────────────
   *  §4  Cascade Select 연동
   * ────────────────────────────────────────────────────────── */

  /**
   * bindCascadeSelect(config) — 연쇄 셀렉트를 쿼리 캐시로 관리
   *
   * @param {object} config
   *   config.selects  [{
   *     el:     <select> 요소/셀렉터,
   *     key:    query key,
   *     fetchFn: (parentValue) => Promise<options>,
   *     dependsOn: 상위 select 인덱스 (0-based, 선택),
   *     valueProp: 'id',
   *     labelProp: 'name'
   *   }]
   *   config.staleTime  number (선택, 기본 60초)
   */
  function bindCascadeSelect(config) {
    var selectDefs = config.selects || [];
    var staleTime = config.staleTime || 60000;

    selectDefs.forEach(function (def, idx) {
      var el = typeof def.el === 'string' ? document.querySelector(def.el) : def.el;
      if (!el) return;

      function loadOptions(parentValue) {
        var key = typeof def.key === 'function' ? def.key(parentValue) : def.key;
        BQ.fetchQuery(key, function () {
          return def.fetchFn(parentValue);
        }, { staleTime: staleTime })
          .then(function (options) {
            var current = el.value;
            el.innerHTML = '<option value="">선택</option>';
            (options || []).forEach(function (opt) {
              var o = document.createElement('option');
              o.value = opt[def.valueProp || 'id'];
              o.textContent = opt[def.labelProp || 'name'];
              el.appendChild(o);
            });
            /* 이전 값 유지 시도 */
            if (current && el.querySelector('option[value="' + current + '"]')) {
              el.value = current;
            }
          })
          .catch(function () { /* background */ });
      }

      /* 부모 의존 */
      if (def.dependsOn != null) {
        var parentDef = selectDefs[def.dependsOn];
        var parentEl = typeof parentDef.el === 'string' ? document.querySelector(parentDef.el) : parentDef.el;
        if (parentEl) {
          parentEl.addEventListener('change', function () {
            loadOptions(parentEl.value);
          });
        }
      } else {
        loadOptions();
      }
    });
  }


  /* ──────────────────────────────────────────────────────────
   *  §5  Polling 매니저 — 대시보드/차트용 주기적 갱신
   * ────────────────────────────────────────────────────────── */

  var _pollingTimers = {};

  /**
   * startPolling(key, fetchFn, intervalMs, opts)
   * 주기적으로 쿼리를 refetch.
   * visibilitychange 자동 중지/재개
   */
  function startPolling(key, fetchFn, intervalMs, opts) {
    var ks = JSON.stringify(key);
    stopPolling(key);

    opts = opts || {};
    var interval = intervalMs || 30000;

    function poll() {
      /* 탭 비활성이면 스킵 */
      if (document.hidden) return;
      BQ.fetchQuery(key, fetchFn, Object.assign({}, opts, { staleTime: 0 }))
        .catch(function () { /* background */ });
    }

    _pollingTimers[ks] = setInterval(poll, interval);
    trackCleanup(function () { stopPolling(key); });

    /* 즉시 1회 */
    poll();
  }

  function stopPolling(key) {
    var ks = JSON.stringify(key);
    if (_pollingTimers[ks]) {
      clearInterval(_pollingTimers[ks]);
      delete _pollingTimers[ks];
    }
  }


  /* ──────────────────────────────────────────────────────────
   *  §6  blsMakeTabCrud 확장 포인트
   * ────────────────────────────────────────────────────────── */

  /**
   * wrapTabCrudSave(tabKey, projectId, saveFn) — 탭 저장을 mutation 화
   * 기존 scheduleSave() 를 감싸서, 저장 성공 시 project 관련 쿼리 invalidate
   *
   * @param {string} tabKey   e.g. 'tab71'
   * @param {number} projectId
   * @param {function} saveFn  원래 저장 함수 () => Promise
   */
  function wrapTabCrudSave(tabKey, projectId, saveFn) {
    return function wrappedSave() {
      return saveFn().then(function (result) {
        /* 프로젝트 탭 데이터 캐시 무효화 */
        BQ.invalidateQueries(['project', 'tab', projectId, tabKey]);
        BQ.invalidateQueries(['project', 'detail', projectId]);
        BQ.invalidateQueries(['project', 'stats']);
        BQ.invalidateQueries(['dashboard']);
        return result;
      });
    };
  }

  /**
   * createTabQuery(tabKey, projectId, fetchFn)
   * 탭 데이터를 쿼리 캐시로 관리
   */
  function createTabQuery(tabKey, projectId, fetchFn) {
    var key = ['project', 'tab', projectId, tabKey];
    return {
      fetch: function () { return BQ.fetchQuery(key, fetchFn); },
      getData: function () { return BQ.getQueryData(key); },
      setData: function (data) { return BQ.setQueryData(key, data); },
      invalidate: function () { return BQ.invalidateQueries(key, { exact: true }); },
      subscribe: function (cb) {
        var unsub = BQ.subscribe(key, cb);
        trackCleanup(unsub);
        return unsub;
      }
    };
  }


  /* ──────────────────────────────────────────────────────────
   *  Public API 확장
   * ────────────────────────────────────────────────────────── */

  BQ.bridge = {
    bindQuery:          bindQuery,
    bindTable:          bindTable,
    bindForm:           bindForm,
    bindCascadeSelect:  bindCascadeSelect,
    startPolling:       startPolling,
    stopPolling:        stopPolling,
    cleanupPage:        cleanupPage,
    trackCleanup:       trackCleanup,
    wrapTabCrudSave:    wrapTabCrudSave,
    createTabQuery:     createTabQuery
  };

})(window);
