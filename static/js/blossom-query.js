/* ============================================================
 *  Blossom Query Client  —  엔터프라이즈 데이터 동기화 엔진
 *  ============================================================
 *  TanStack Query 패턴을 ES5 바닐라 JS 로 구현.
 *  build 도구 없이 <script> 로드만으로 동작.
 *
 *  전역 객체:  window.BlossomQuery  (이하 BQ)
 *
 *  §1  Core QueryClient
 *  §2  Query Keys
 *  §3  API Layer
 *  §4  Mutation + Invalidation
 *  §5  Entity CRUD Factory
 *  §6  SSE (Server-Sent Events) 실시간 동기화
 *  §7  Loading / Error UI
 *  §8  SPA Integration Hooks
 *  §9  Devtools (디버그 헬퍼)
 * ============================================================ */
;(function (win) {
  'use strict';

  /* 이미 로드 방지 */
  if (win.BlossomQuery) return;

  /* ──────────────────────────────────────────────────────────
   *  §1  Core QueryClient
   * ────────────────────────────────────────────────────────── */

  /**
   * 기본 설정
   */
  var DEFAULTS = {
    staleTime:      30 * 1000,       // 30초 — 이 기간 내 동일 쿼리 재요청 안 함
    cacheTime:      5 * 60 * 1000,   // 5분  — 미사용 캐시 GC
    retryCount:     2,               // 실패 시 재시도 횟수
    retryDelay:     1000,            // 1초   — 재시도 간격 (exponential backoff)
    refetchOnMount:        true,     // 마운트 시 stale 이면 refetch
    refetchOnWindowFocus:  true,     // 포커스 복귀 시 stale 이면 refetch
    refetchOnReconnect:    true,     // 네트워크 복구 시 refetch
    keepPreviousData:      true,     // 새 데이터 도착 전까지 이전 데이터 유지
    dedupeInterval:        2000      // 같은 키 요청 중복 방지 (ms)
  };

  /**
   * 쿼리 상태 enum
   */
  var QState = {
    IDLE:     'idle',
    LOADING:  'loading',
    SUCCESS:  'success',
    ERROR:    'error'
  };

  /**
   * 키를 직렬화 (배열 → 문자열)
   */
  function serializeKey(key) {
    if (typeof key === 'string') return key;
    return JSON.stringify(key);
  }

  /**
   * 키 매칭: prefix 가 target 의 앞부분인지 확인 (cascade invalidation 용)
   * matchKey(['project'], ['project','list',{page:1}])  →  true
   * matchKey(['project','detail',5], ['project','list']) →  false
   */
  function matchKey(prefix, target) {
    if (typeof prefix === 'string') prefix = [prefix];
    if (typeof target === 'string') target = [target];
    if (prefix.length > target.length) return false;
    for (var i = 0; i < prefix.length; i++) {
      var a = typeof prefix[i] === 'object' ? JSON.stringify(prefix[i]) : String(prefix[i]);
      var b = typeof target[i] === 'object' ? JSON.stringify(target[i]) : String(target[i]);
      if (a !== b) return false;
    }
    return true;
  }

  /* ─── 이벤트 버스 (간단한 pub/sub) ─── */
  var _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return function off() {
      _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
    };
  }

  function emit(event, payload) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (e) { console.error('[BQ] listener error:', e); }
    }
  }

  /* ─── 캐시 저장소 ─── */
  var _cache = {};       // key(string) → QueryEntry
  var _gcTimer = null;
  var _observers = {};   // key(string) → [{ callback, id }]
  var _obsIdSeq = 0;
  var _inflight = {};    // key(string) → Promise  (dedup)

  /**
   * QueryEntry 구조
   */
  function createEntry(key) {
    return {
      key:        key,
      keyStr:     serializeKey(key),
      state:      QState.IDLE,
      data:       undefined,
      error:      null,
      dataUpdatedAt: 0,
      fetchedAt:  0,
      isFetching: false,
      isStale:    true,
      fetchFn:    null,      // () => Promise<data>
      options:    {}
    };
  }

  function getEntry(key) {
    var ks = serializeKey(key);
    return _cache[ks] || null;
  }

  function getOrCreateEntry(key) {
    var ks = serializeKey(key);
    if (!_cache[ks]) {
      _cache[ks] = createEntry(key);
    }
    return _cache[ks];
  }

  /* ─── Observer 관리 ─── */
  function subscribe(key, callback) {
    var ks = serializeKey(key);
    if (!_observers[ks]) _observers[ks] = [];
    var id = ++_obsIdSeq;
    _observers[ks].push({ callback: callback, id: id });
    return function unsubscribe() {
      if (!_observers[ks]) return;
      _observers[ks] = _observers[ks].filter(function (o) { return o.id !== id; });
      if (_observers[ks].length === 0) delete _observers[ks];
    };
  }

  function notifyObservers(key, entry) {
    var ks = serializeKey(key);
    var list = _observers[ks];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i].callback(entry); } catch (e) { console.error('[BQ] observer error:', e); }
    }
    emit('queryUpdated', { key: key, entry: entry });
  }

  /* ─── stale 판정 ─── */
  function isStale(entry) {
    if (!entry || entry.state === QState.IDLE) return true;
    var st = (entry.options && entry.options.staleTime != null) ? entry.options.staleTime : DEFAULTS.staleTime;
    return (Date.now() - entry.dataUpdatedAt) > st;
  }

  /* ─── 핵심: fetchQuery ─── */
  function fetchQuery(key, fetchFn, opts) {
    var ks = serializeKey(key);
    var entry = getOrCreateEntry(key);

    if (fetchFn) entry.fetchFn = fetchFn;
    if (opts)    entry.options = Object.assign({}, entry.options, opts);

    /* dedup: 이미 같은 키로 in-flight 요청이 있으면 그 Promise 재사용 */
    if (_inflight[ks]) return _inflight[ks];

    /* stale 체크: fresh 데이터면 바로 반환 */
    if (!isStale(entry) && entry.data !== undefined) {
      return Promise.resolve(entry.data);
    }

    if (!entry.fetchFn) {
      return Promise.reject(new Error('[BQ] No fetchFn for key: ' + ks));
    }

    entry.isFetching = true;
    entry.state = entry.data !== undefined ? QState.SUCCESS : QState.LOADING;
    notifyObservers(key, entry);

    var retryCount = (entry.options.retryCount != null) ? entry.options.retryCount : DEFAULTS.retryCount;
    var retryDelay = (entry.options.retryDelay != null) ? entry.options.retryDelay : DEFAULTS.retryDelay;

    function attempt(n) {
      return entry.fetchFn().then(function (data) {
        entry.data = data;
        entry.error = null;
        entry.state = QState.SUCCESS;
        entry.dataUpdatedAt = Date.now();
        entry.fetchedAt = Date.now();
        entry.isFetching = false;
        entry.isStale = false;
        delete _inflight[ks];
        notifyObservers(key, entry);
        emit('querySuccess', { key: key, data: data });
        return data;
      }).catch(function (err) {
        if (n < retryCount) {
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(attempt(n + 1)); }, retryDelay * Math.pow(2, n));
          });
        }
        entry.error = err;
        entry.state = QState.ERROR;
        entry.isFetching = false;
        delete _inflight[ks];
        notifyObservers(key, entry);
        emit('queryError', { key: key, error: err });
        return Promise.reject(err);
      });
    }

    _inflight[ks] = attempt(0);
    return _inflight[ks];
  }

  /* ─── setQueryData: 캐시 직접 수정 (optimistic update) ─── */
  function setQueryData(key, updater) {
    var entry = getOrCreateEntry(key);
    var prev = entry.data;
    entry.data = typeof updater === 'function' ? updater(prev) : updater;
    entry.dataUpdatedAt = Date.now();
    entry.state = QState.SUCCESS;
    entry.isStale = false;
    notifyObservers(key, entry);
    emit('queryUpdated', { key: key, entry: entry });
    return prev;
  }

  /* ─── getQueryData: 캐시에서 읽기 ─── */
  function getQueryData(key) {
    var entry = getEntry(key);
    return entry ? entry.data : undefined;
  }

  /* ──────────────────────────────────────────────────────────
   *  Invalidation Engine — cascade 지원
   * ────────────────────────────────────────────────────────── */

  /**
   * invalidateQueries(keyFilter, opts)
   *   keyFilter: 배열 prefix → 이 prefix 로 시작하는 모든 쿼리 무효화
   *              함수     → entry 를 받아 true/false
   *   opts.refetch: true(기본값) — invalidate 후 즉시 refetch
   *   opts.exact: false(기본값) — prefix 매칭
   */
  function invalidateQueries(keyFilter, opts) {
    opts = opts || {};
    var shouldRefetch = opts.refetch !== false;
    var exact = opts.exact === true;
    var matched = [];

    Object.keys(_cache).forEach(function (ks) {
      var entry = _cache[ks];
      var isMatch = false;

      if (typeof keyFilter === 'function') {
        isMatch = keyFilter(entry);
      } else if (exact) {
        isMatch = serializeKey(keyFilter) === ks;
      } else {
        /* prefix 매칭 */
        isMatch = matchKey(keyFilter, entry.key);
      }

      if (isMatch) {
        entry.isStale = true;
        entry.dataUpdatedAt = 0;
        matched.push(entry);
      }
    });

    if (shouldRefetch) {
      matched.forEach(function (entry) {
        if (entry.fetchFn && _observers[entry.keyStr] && _observers[entry.keyStr].length > 0) {
          fetchQuery(entry.key);
        }
      });
    }

    emit('queriesInvalidated', { filter: keyFilter, count: matched.length });
    return matched.length;
  }

  /* ─── removeQueries: 캐시에서 완전 제거 ─── */
  function removeQueries(keyFilter) {
    Object.keys(_cache).forEach(function (ks) {
      var entry = _cache[ks];
      var isMatch = typeof keyFilter === 'function'
        ? keyFilter(entry)
        : matchKey(keyFilter, entry.key);
      if (isMatch) {
        delete _cache[ks];
        delete _observers[ks];
        delete _inflight[ks];
      }
    });
  }

  /* ─── GC: 사용되지 않는 캐시 정리 ─── */
  function startGC() {
    if (_gcTimer) return;
    _gcTimer = setInterval(function () {
      var now = Date.now();
      Object.keys(_cache).forEach(function (ks) {
        var entry = _cache[ks];
        var ct = (entry.options && entry.options.cacheTime != null)
          ? entry.options.cacheTime : DEFAULTS.cacheTime;
        var hasObservers = _observers[ks] && _observers[ks].length > 0;
        if (!hasObservers && entry.fetchedAt && (now - entry.fetchedAt) > ct) {
          delete _cache[ks];
          delete _inflight[ks];
        }
      });
    }, 60 * 1000);
  }

  /* ──────────────────────────────────────────────────────────
   *  §2  Query Keys — 중앙 관리 레지스트리
   * ────────────────────────────────────────────────────────── */

  var QueryKeys = {
    /* === 하드웨어 === */
    hardware: {
      all:        function ()     { return ['hardware']; },
      lists:      function ()     { return ['hardware', 'list']; },
      list:       function (p)    { return ['hardware', 'list', p || {}]; },
      detail:     function (id)   { return ['hardware', 'detail', id]; },
      stats:      function ()     { return ['hardware', 'stats']; }
    },
    /* === 서버 === */
    server: {
      all:        function ()     { return ['server']; },
      lists:      function ()     { return ['server', 'list']; },
      list:       function (p)    { return ['server', 'list', p || {}]; },
      detail:     function (id)   { return ['server', 'detail', id]; },
      stats:      function ()     { return ['server', 'stats']; }
    },
    /* === 네트워크 장비 === */
    network: {
      all:        function ()     { return ['network']; },
      lists:      function ()     { return ['network', 'list']; },
      list:       function (p)    { return ['network', 'list', p || {}]; },
      detail:     function (id)   { return ['network', 'detail', id]; },
      stats:      function ()     { return ['network', 'stats']; }
    },
    /* === 프로젝트 === */
    project: {
      all:        function ()     { return ['project']; },
      lists:      function ()     { return ['project', 'list']; },
      list:       function (p)    { return ['project', 'list', p || {}]; },
      detail:     function (id)   { return ['project', 'detail', id]; },
      tabs:       function (id)   { return ['project', 'tabs', id]; },
      tab:        function (id, t){ return ['project', 'tab', id, t]; },
      stats:      function ()     { return ['project', 'stats']; }
    },
    /* === 소프트웨어 === */
    software: {
      all:        function ()     { return ['software']; },
      lists:      function ()     { return ['software', 'list']; },
      list:       function (p)    { return ['software', 'list', p || {}]; },
      detail:     function (id)   { return ['software', 'detail', id]; },
      stats:      function ()     { return ['software', 'stats']; }
    },
    /* === 벤더 === */
    vendor: {
      all:        function ()     { return ['vendor']; },
      lists:      function ()     { return ['vendor', 'list']; },
      list:       function (p)    { return ['vendor', 'list', p || {}]; },
      detail:     function (id)   { return ['vendor', 'detail', id]; },
      manufacturers: function () { return ['vendor', 'manufacturers']; }
    },
    /* === 사용자 === */
    user: {
      all:        function ()     { return ['user']; },
      lists:      function ()     { return ['user', 'list']; },
      list:       function (p)    { return ['user', 'list', p || {}]; },
      detail:     function (id)   { return ['user', 'detail', id]; }
    },
    /* === 부서 === */
    department: {
      all:        function ()     { return ['department']; },
      lists:      function ()     { return ['department', 'list']; },
      list:       function (p)    { return ['department', 'list', p || {}]; }
    },
    /* === 대시보드 === */
    dashboard: {
      all:        function ()     { return ['dashboard']; },
      summary:    function ()     { return ['dashboard', 'summary']; },
      charts:     function ()     { return ['dashboard', 'charts']; },
      stats:      function ()     { return ['dashboard', 'stats']; }
    },
    /* === 정책 === */
    policy: {
      all:        function ()     { return ['policy']; },
      lists:      function ()     { return ['policy', 'list']; },
      list:       function (p)    { return ['policy', 'list', p || {}]; },
      detail:     function (id)   { return ['policy', 'detail', id]; },
      stats:      function ()     { return ['policy', 'stats']; }
    },
    /* === 유지보수 === */
    maintenance: {
      all:        function ()     { return ['maintenance']; },
      lists:      function ()     { return ['maintenance', 'list']; },
      list:       function (p)    { return ['maintenance', 'list', p || {}]; },
      detail:     function (id)   { return ['maintenance', 'detail', id]; }
    },
    /* === 공통/코드 === */
    code: {
      all:        function ()     { return ['code']; },
      list:       function (group){ return ['code', group]; }
    },
    /* === IP 관리 === */
    ip: {
      all:        function ()     { return ['ip']; },
      lists:      function ()     { return ['ip', 'list']; },
      list:       function (p)    { return ['ip', 'list', p || {}]; },
      subnets:    function ()     { return ['ip', 'subnets']; }
    },
    /* === 보안 === */
    security: {
      all:        function ()     { return ['security']; },
      lists:      function ()     { return ['security', 'list']; },
      list:       function (p)    { return ['security', 'list', p || {}]; },
      detail:     function (id)   { return ['security', 'detail', id]; }
    },

    /* ─── 동적 키 생성 ─── */
    custom: function (entity, type, params) {
      var key = [entity];
      if (type) key.push(type);
      if (params !== undefined) key.push(params);
      return key;
    }
  };

  /* ──────────────────────────────────────────────────────────
   *  §3  API Layer — 중앙화된 fetch 함수
   * ────────────────────────────────────────────────────────── */

  var _apiDefaults = {
    baseURL: '',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'BlossomQuery'
    },
    timeout: 30000
  };

  /**
   * 중앙 API 호출 함수
   * @param {string} url
   * @param {object} opts  { method, body, params, headers, signal, timeout }
   * @returns {Promise<{ok, status, data}>}
   */
  function apiRequest(url, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();

    /* 쿼리 파라미터 직렬화 */
    if (opts.params) {
      var qs = [];
      Object.keys(opts.params).forEach(function (k) {
        var v = opts.params[k];
        if (v !== undefined && v !== null && v !== '') {
          qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        }
      });
      if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
    }

    var headers = Object.assign({}, _apiDefaults.headers, opts.headers || {});

    /* FormData 면 Content-Type 제거 (브라우저가 자동 설정) */
    var body = opts.body;
    if (body && typeof FormData !== 'undefined' && body instanceof FormData) {
      delete headers['Content-Type'];
    } else if (body && typeof body === 'object' && !(body instanceof Blob)) {
      body = JSON.stringify(body);
    }

    var fetchOpts = {
      method:      method,
      headers:     headers,
      credentials: _apiDefaults.credentials,
      body:        method !== 'GET' && method !== 'HEAD' ? body : undefined
    };

    /* AbortController + timeout */
    var controller = null;
    var timeoutId = null;
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      fetchOpts.signal = opts.signal || controller.signal;
      var timeout = opts.timeout || _apiDefaults.timeout;
      if (timeout > 0) {
        timeoutId = setTimeout(function () { controller.abort(); }, timeout);
      }
    }

    return fetch(_apiDefaults.baseURL + url, fetchOpts)
      .then(function (resp) {
        if (timeoutId) clearTimeout(timeoutId);
        return resp.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
          if (!resp.ok) {
            var error = new Error(
              (data && data.error) || resp.statusText || 'API Error'
            );
            error.status = resp.status;
            error.data = data;
            throw error;
          }
          return { ok: true, status: resp.status, data: data };
        });
      })
      .catch(function (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          err.message = '요청 시간 초과';
        }
        throw err;
      });
  }

  /* 편의 래퍼 */
  var api = {
    get:    function (url, opts) { return apiRequest(url, Object.assign({}, opts, { method: 'GET' })); },
    post:   function (url, body, opts) { return apiRequest(url, Object.assign({}, opts, { method: 'POST', body: body })); },
    put:    function (url, body, opts) { return apiRequest(url, Object.assign({}, opts, { method: 'PUT', body: body })); },
    patch:  function (url, body, opts) { return apiRequest(url, Object.assign({}, opts, { method: 'PATCH', body: body })); },
    del:    function (url, body, opts) { return apiRequest(url, Object.assign({}, opts, { method: 'DELETE', body: body })); }
  };

  /* ──────────────────────────────────────────────────────────
   *  §4  Mutation + Invalidation
   * ────────────────────────────────────────────────────────── */

  /**
   * 데이터 의존성 그래프 — cascade invalidation 설계
   * 키: 변경된 엔터티, 값: 연관되어 무효화할 키 prefixes
   */
  var _dependencyGraph = {
    hardware:    [['hardware'], ['dashboard'], ['server']],
    server:      [['server'], ['hardware'], ['dashboard']],
    network:     [['network'], ['dashboard']],
    software:    [['software'], ['dashboard']],
    project:     [['project'], ['dashboard']],
    vendor:      [['vendor'], ['hardware'], ['software'], ['network']],
    user:        [['user'], ['department']],
    department:  [['department'], ['user']],
    policy:      [['policy'], ['dashboard']],
    maintenance: [['maintenance'], ['dashboard'], ['hardware'], ['server']],
    ip:          [['ip'], ['network']],
    security:    [['security'], ['dashboard']],
    dashboard:   [['dashboard']]
  };

  /**
   * 의존성 그래프 확장/커스터마이즈
   */
  function addDependency(entity, deps) {
    if (!_dependencyGraph[entity]) _dependencyGraph[entity] = [[entity]];
    deps.forEach(function (d) {
      _dependencyGraph[entity].push(typeof d === 'string' ? [d] : d);
    });
  }

  /**
   * mutate — CRUD 뮤테이션 실행 + 자동 invalidation
   *
   * @param {object} config
   *   config.mutationFn   (variables) => Promise<result>
   *   config.entity        string — 엔터티명 (dependency graph 키)
   *   config.invalidate    [key, ...] — 추가 무효화 키 (선택)
   *   config.onMutate      (variables) => context — optimistic update
   *   config.onSuccess     (data, variables, context)
   *   config.onError       (error, variables, context)
   *   config.onSettled     (data, error, variables, context)
   *
   * @returns {function(variables): Promise}
   */
  function createMutation(config) {
    return function mutate(variables) {
      var context = null;

      /* onMutate (optimistic update) */
      if (config.onMutate) {
        try { context = config.onMutate(variables); } catch (e) { /* skip */ }
      }

      return config.mutationFn(variables)
        .then(function (data) {
          /* cascade invalidation */
          var entity = config.entity;
          if (entity && _dependencyGraph[entity]) {
            _dependencyGraph[entity].forEach(function (prefix) {
              invalidateQueries(prefix);
            });
          }

          /* 추가 invalidation */
          if (config.invalidate) {
            config.invalidate.forEach(function (key) {
              invalidateQueries(key);
            });
          }

          if (config.onSuccess) config.onSuccess(data, variables, context);
          if (config.onSettled) config.onSettled(data, null, variables, context);

          emit('mutationSuccess', { entity: entity, data: data, variables: variables });
          return data;
        })
        .catch(function (error) {
          /* optimistic rollback */
          if (context && context._rollback) {
            try { context._rollback(); } catch (e) { /* skip */ }
          }

          if (config.onError) config.onError(error, variables, context);
          if (config.onSettled) config.onSettled(null, error, variables, context);

          emit('mutationError', { entity: entity, error: error, variables: variables });
          return Promise.reject(error);
        });
    };
  }

  /* ──────────────────────────────────────────────────────────
   *  §5  Entity CRUD Factory
   *  ────────────────────────────────────────────────────────
   *  한 엔터티에 대한 list/detail/create/update/delete 를
   *  일관된 패턴으로 한 줄에 생성.
   * ────────────────────────────────────────────────────────── */

  /**
   * createEntityQueries(cfg) — 도메인 CRUD 쿼리/뮤테이션 팩토리
   *
   * @param {object} cfg
   *   cfg.entity    string      'hardware', 'server', …
   *   cfg.baseUrl   string      '/api/hw/assets'
   *   cfg.keys      QueryKeys의 하위 객체 (e.g. QueryKeys.hardware)
   *   cfg.parseList function(data) => { rows, total }   응답 파싱
   *   cfg.parseItem function(data) => item              응답 파싱
   *   cfg.staleTime number (선택)
   *
   * @returns {object}
   *   .fetchList(params)          → Promise<{rows,total}>
   *   .fetchDetail(id)            → Promise<item>
   *   .create(body)               → Promise (+ auto invalidate)
   *   .update(id, body)           → Promise (+ auto invalidate)
   *   .remove(id)                 → Promise (+ auto invalidate)
   *   .bulkDelete(ids)            → Promise (+ auto invalidate)
   *   .prefetchList(params)       → void (background fetch)
   *   .subscribeList(params, cb)  → unsubscribe()
   *   .subscribeDetail(id, cb)    → unsubscribe()
   */
  function createEntityQueries(cfg) {
    var entity  = cfg.entity;
    var baseUrl = cfg.baseUrl;
    var keys    = cfg.keys || QueryKeys[entity] || QueryKeys.custom.bind(null, entity);
    var parseList = cfg.parseList || function (d) {
      var data = d && d.data ? d.data : d;
      return { rows: data.rows || data.items || [], total: data.total || 0 };
    };
    var parseItem = cfg.parseItem || function (d) {
      var data = d && d.data ? d.data : d;
      return data.item || data;
    };
    var staleTime = cfg.staleTime;

    function qOpts() {
      var o = {};
      if (staleTime != null) o.staleTime = staleTime;
      return o;
    }

    return {
      /* ── 조회 ── */
      fetchList: function (params) {
        var key = typeof keys.list === 'function' ? keys.list(params) : [entity, 'list', params || {}];
        return fetchQuery(key, function () {
          return api.get(baseUrl, { params: params }).then(function (res) { return parseList(res); });
        }, qOpts());
      },

      fetchDetail: function (id) {
        var key = typeof keys.detail === 'function' ? keys.detail(id) : [entity, 'detail', id];
        return fetchQuery(key, function () {
          return api.get(baseUrl + '/' + id).then(function (res) { return parseItem(res); });
        }, qOpts());
      },

      /* ── 미리 로드 ── */
      prefetchList: function (params) {
        var key = typeof keys.list === 'function' ? keys.list(params) : [entity, 'list', params || {}];
        fetchQuery(key, function () {
          return api.get(baseUrl, { params: params }).then(function (res) { return parseList(res); });
        }, qOpts()).catch(function () { /* background, ignore */ });
      },

      /* ── 구독 ── */
      subscribeList: function (params, callback) {
        var key = typeof keys.list === 'function' ? keys.list(params) : [entity, 'list', params || {}];
        /* 최초 fetch */
        fetchQuery(key, function () {
          return api.get(baseUrl, { params: params }).then(function (res) { return parseList(res); });
        }, qOpts()).catch(function () { /* handled by observer */ });
        return subscribe(key, function (entry) { callback(entry); });
      },

      subscribeDetail: function (id, callback) {
        var key = typeof keys.detail === 'function' ? keys.detail(id) : [entity, 'detail', id];
        fetchQuery(key, function () {
          return api.get(baseUrl + '/' + id).then(function (res) { return parseItem(res); });
        }, qOpts()).catch(function () { /* handled by observer */ });
        return subscribe(key, function (entry) { callback(entry); });
      },

      /* ── 뮤테이션 ── */
      create: createMutation({
        entity: entity,
        mutationFn: function (body) {
          return api.post(baseUrl, body).then(function (r) { return r.data; });
        }
      }),

      update: createMutation({
        entity: entity,
        mutationFn: function (args) {
          var id   = args.id;
          var body = args.body || args;
          return api.put(baseUrl + '/' + id, body).then(function (r) { return r.data; });
        }
      }),

      remove: createMutation({
        entity: entity,
        mutationFn: function (id) {
          return api.del(baseUrl + '/' + id).then(function (r) { return r.data; });
        }
      }),

      bulkDelete: createMutation({
        entity: entity,
        mutationFn: function (ids) {
          return api.post(baseUrl + '/bulk-delete', { ids: ids }).then(function (r) { return r.data; });
        }
      }),

      /* ── 유틸 ── */
      invalidateAll: function () {
        var allKey = typeof keys.all === 'function' ? keys.all() : [entity];
        return invalidateQueries(allKey);
      },

      getListCache: function (params) {
        var key = typeof keys.list === 'function' ? keys.list(params) : [entity, 'list', params || {}];
        return getQueryData(key);
      },

      setListCache: function (params, data) {
        var key = typeof keys.list === 'function' ? keys.list(params) : [entity, 'list', params || {}];
        return setQueryData(key, data);
      }
    };
  }

  /* ──────────────────────────────────────────────────────────
   *  §6  SSE (Server-Sent Events) 실시간 동기화
   * ────────────────────────────────────────────────────────── */

  var _sse = null;
  var _sseReconnectTimer = null;
  var _sseReconnectDelay = 1000;
  var _sseMaxReconnectDelay = 30000;
  var _sseEnabled = false;

  function connectSSE(url) {
    if (!win.EventSource) {
      console.warn('[BQ] SSE not supported in this browser');
      return;
    }

    url = url || '/api/sse/events';
    _sseEnabled = true;

    if (_sse) {
      _sse.close();
      _sse = null;
    }

    try {
      _sse = new EventSource(url, { withCredentials: true });
    } catch (e) {
      console.warn('[BQ] SSE connection failed:', e);
      scheduleSSEReconnect(url);
      return;
    }

    _sse.onopen = function () {
      _sseReconnectDelay = 1000;
      emit('sse:connected', {});
    };

    _sse.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        handleSSEMessage(msg);
      } catch (e) {
        console.warn('[BQ] SSE parse error:', e);
      }
    };

    /* 이벤트 유형별 리스너 */
    _sse.addEventListener('invalidate', function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.keys) {
          msg.keys.forEach(function (k) { invalidateQueries(k); });
        }
        if (msg.entity) {
          invalidateQueries([msg.entity]);
        }
      } catch (e) { /* ignore */ }
    });

    _sse.addEventListener('update', function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.key && msg.data !== undefined) {
          setQueryData(msg.key, msg.data);
        }
      } catch (e) { /* ignore */ }
    });

    _sse.onerror = function () {
      if (_sse) _sse.close();
      _sse = null;
      emit('sse:disconnected', {});
      if (_sseEnabled) scheduleSSEReconnect(url);
    };
  }

  function scheduleSSEReconnect(url) {
    if (_sseReconnectTimer) clearTimeout(_sseReconnectTimer);
    _sseReconnectTimer = setTimeout(function () {
      _sseReconnectDelay = Math.min(_sseReconnectDelay * 2, _sseMaxReconnectDelay);
      connectSSE(url);
    }, _sseReconnectDelay);
  }

  function disconnectSSE() {
    _sseEnabled = false;
    if (_sseReconnectTimer) clearTimeout(_sseReconnectTimer);
    if (_sse) { _sse.close(); _sse = null; }
  }

  function handleSSEMessage(msg) {
    /* msg 형식: { type: 'invalidate'|'update', entity: 'hardware', ... } */
    if (msg.type === 'invalidate' && msg.entity) {
      invalidateQueries([msg.entity]);
    } else if (msg.type === 'update' && msg.key) {
      setQueryData(msg.key, msg.data);
    }
    emit('sse:message', msg);
  }

  /* ──────────────────────────────────────────────────────────
   *  §7  Loading / Error UI — 일관된 상태 표시
   * ────────────────────────────────────────────────────────── */

  var _toastContainer = null;

  function ensureToastContainer() {
    if (_toastContainer && document.body.contains(_toastContainer)) return;
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'bq-toast-container';
    _toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(_toastContainer);
  }

  /**
   * 토스트 알림 표시
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {number} duration  ms (0 = 수동닫기)
   */
  function showToast(message, type, duration) {
    ensureToastContainer();
    type = type || 'info';
    duration = duration != null ? duration : 3000;

    var colors = {
      success: 'rgba(16,185,129,.92)',
      error:   'rgba(239,68,68,.92)',
      info:    'rgba(59,130,246,.92)',
      warning: 'rgba(245,158,11,.92)'
    };
    var icons = {
      success: '\u2714',
      error:   '\u2718',
      info:    '\u24D8',
      warning: '\u26A0'
    };

    var el = document.createElement('div');
    el.style.cssText = 'pointer-events:auto;padding:12px 20px;border-radius:10px;color:#fff;' +
      'font-size:14px;backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,0.18);' +
      'display:flex;align-items:center;gap:8px;opacity:0;transform:translateX(40px);' +
      'transition:opacity .3s,transform .3s;max-width:380px;background:' + (colors[type] || colors.info);
    el.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' +
      message.replace(/</g, '&lt;') + '</span>';

    _toastContainer.appendChild(el);

    /* 진입 애니메이션 */
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    /* 자동 제거 */
    if (duration > 0) {
      setTimeout(function () { removeToast(el); }, duration);
    }
    return el;
  }

  function removeToast(el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  /**
   * 컨테이너에 로딩 오버레이 표시
   * @param {Element} container
   * @param {boolean} show
   */
  function setLoading(container, show) {
    if (!container) return;
    var overlay = container.querySelector('.bq-loading-overlay');
    if (show) {
      if (overlay) return; /* 이미 있음 */
      overlay = document.createElement('div');
      overlay.className = 'bq-loading-overlay';
      overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(255,255,255,0.6);backdrop-filter:blur(2px);' +
        'z-index:100;border-radius:inherit;transition:opacity .2s;';
      overlay.innerHTML = '<div class="bq-spinner" style="width:32px;height:32px;' +
        'border:3px solid rgba(0,0,0,0.1);border-top-color:var(--bls-primary,#6366f1);' +
        'border-radius:50%;animation:bqSpin .8s linear infinite;"></div>';
      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      container.appendChild(overlay);
    } else {
      if (!overlay) return;
      overlay.style.opacity = '0';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }
  }

  /**
   * 에러 상태 표시
   * @param {Element} container
   * @param {string|null} message  null 이면 제거
   * @param {function} retryFn     재시도 함수 (선택)
   */
  function setError(container, message, retryFn) {
    if (!container) return;
    var overlay = container.querySelector('.bq-error-overlay');
    if (overlay) overlay.parentNode.removeChild(overlay);
    if (!message) return;

    overlay = document.createElement('div');
    overlay.className = 'bq-error-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;background:rgba(255,255,255,0.85);' +
      'backdrop-filter:blur(4px);z-index:100;border-radius:inherit;gap:12px;padding:24px;';
    var html = '<div style="color:#ef4444;font-size:14px;text-align:center;">' +
      '<div style="font-size:24px;margin-bottom:8px;">\u26A0</div>' +
      message.replace(/</g, '&lt;') + '</div>';
    if (retryFn) {
      html += '<button class="bq-retry-btn" style="padding:6px 16px;border:1px solid #d1d5db;' +
        'border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">' +
        '\uD83D\uDD04 다시 시도</button>';
    }
    overlay.innerHTML = html;
    if (retryFn) {
      overlay.querySelector('.bq-retry-btn').addEventListener('click', function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        retryFn();
      });
    }
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(overlay);
  }

  /* 스피너 @keyframes 주입 */
  (function injectSpinnerCSS() {
    if (document.getElementById('bq-spinner-css')) return;
    var style = document.createElement('style');
    style.id = 'bq-spinner-css';
    style.textContent = '@keyframes bqSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  })();


  /* ──────────────────────────────────────────────────────────
   *  §8  SPA Integration Hooks
   *  ────────────────────────────────────────────────────────
   *  blossom.js 의 SPA 그리고 사용자 행동 이벤트와 연동
   * ────────────────────────────────────────────────────────── */

  function initSPAHooks() {
    /* (a) 윈도우 포커스 시 stale 쿼리 refetch */
    if (DEFAULTS.refetchOnWindowFocus) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          refetchStaleQueries();
        }
      });
      window.addEventListener('focus', function () {
        refetchStaleQueries();
      });
    }

    /* (b) 네트워크 복구 시 refetch */
    if (DEFAULTS.refetchOnReconnect) {
      window.addEventListener('online', function () {
        showToast('네트워크 연결 복구 — 데이터 갱신 중', 'info', 2000);
        refetchStaleQueries();
      });
    }

    /* (c) SPA 페이지 전환 이벤트 — stale 쿼리 refetch */
    window.addEventListener('blossom:pageLoaded', function () {
      if (DEFAULTS.refetchOnMount) {
        refetchStaleQueries();
      }
    });

    /* (d) SPA 네비게이션 완료 — 사용중이지 않은 캐시 gc 힌트 */
    window.addEventListener('blossom:spa:navigated', function () {
      /* SPA 캐시와 Query 캐시의 page HTML 캐시는 분리 관리 */
    });
  }

  /**
   * 현재 observer 가 있는 stale 쿼리들을 모두 refetch
   */
  function refetchStaleQueries() {
    Object.keys(_cache).forEach(function (ks) {
      var entry = _cache[ks];
      if (isStale(entry) && entry.fetchFn) {
        /* observer 가 있거나, 최근에 접근(5분 이내)된 쿼리만 */
        var hasObs = _observers[ks] && _observers[ks].length > 0;
        var recent = entry.fetchedAt && (Date.now() - entry.fetchedAt) < DEFAULTS.cacheTime;
        if (hasObs || recent) {
          fetchQuery(entry.key).catch(function () { /* background */ });
        }
      }
    });
  }


  /* ──────────────────────────────────────────────────────────
   *  §9  Devtools (디버그 헬퍼)
   * ────────────────────────────────────────────────────────── */

  function getDevtools() {
    return {
      getCache: function ()     { return JSON.parse(JSON.stringify(_cache)); },
      getObservers: function () {
        var r = {};
        Object.keys(_observers).forEach(function (k) { r[k] = _observers[k].length; });
        return r;
      },
      getInflight: function ()  { return Object.keys(_inflight); },
      getDependencyGraph: function () { return JSON.parse(JSON.stringify(_dependencyGraph)); },
      isSSEConnected: function ()     { return _sse && _sse.readyState === EventSource.OPEN; },
      stats: function () {
        var total = Object.keys(_cache).length;
        var stale = 0, fresh = 0, loading = 0, errored = 0;
        Object.keys(_cache).forEach(function (k) {
          var e = _cache[k];
          if (e.isFetching) loading++;
          else if (e.state === QState.ERROR) errored++;
          else if (isStale(e)) stale++;
          else fresh++;
        });
        return { total: total, fresh: fresh, stale: stale, loading: loading, errored: errored };
      }
    };
  }

  /* ──────────────────────────────────────────────────────────
   *  초기화
   * ────────────────────────────────────────────────────────── */

  startGC();

  /* DOM 준비 후 SPA 훅 연결 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSPAHooks);
  } else {
    initSPAHooks();
  }

  /* ──────────────────────────────────────────────────────────
   *  Public API 노출
   * ────────────────────────────────────────────────────────── */

  win.BlossomQuery = {
    /* 상수 */
    QState:   QState,
    DEFAULTS: DEFAULTS,

    /* 키 레지스트리 */
    keys: QueryKeys,

    /* 코어 */
    fetchQuery:         fetchQuery,
    getQueryData:       getQueryData,
    setQueryData:       setQueryData,
    invalidateQueries:  invalidateQueries,
    removeQueries:      removeQueries,
    refetchStaleQueries: refetchStaleQueries,
    subscribe:          subscribe,

    /* API 레이어 */
    api:     api,
    apiRequest: apiRequest,

    /* 뮤테이션 */
    createMutation:  createMutation,

    /* 엔터티 팩토리 */
    createEntityQueries: createEntityQueries,

    /* 의존성 그래프 */
    addDependency: addDependency,

    /* 이벤트 */
    on:   on,
    emit: emit,

    /* SSE */
    connectSSE:    connectSSE,
    disconnectSSE: disconnectSSE,

    /* UI */
    showToast:  showToast,
    setLoading: setLoading,
    setError:   setError,

    /* 디버그 */
    devtools: getDevtools(),

    /* 설정 조정 */
    configure: function (opts) {
      Object.assign(DEFAULTS, opts);
    }
  };

})(window);
