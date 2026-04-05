/**
 * 공통 API 클라이언트 (api-client.js)
 * =====================================
 * 모든 fetch 호출에 일관된 에러 처리, 인증, 로깅을 적용한다.
 * blossom.js 에 이미 있는 apiJson() 과 호환되며,
 * 새 코드에서는 이 모듈의 BlossomAPI 를 사용한다.
 *
 * 사용법:
 *   BlossomAPI.get('/api/items')
 *     .then(function(data){ ... })
 *     .catch(function(err){ ... });
 *
 *   BlossomAPI.post('/api/items', { name: '서버1' })
 *     .then(function(data){ ... });
 *
 *   BlossomAPI.del('/api/items/bulk-delete', { ids: [1,2,3] })
 *     .then(function(data){ ... });
 *
 * v1.0.0  2026-03-15
 */
(function (root) {
  'use strict';

  /* ── 기본 설정 ── */
  var DEFAULT_HEADERS = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  var CREDENTIALS = 'same-origin';

  /**
   * 핵심 fetch 래퍼 — 모든 요청에 공통 헤더와 에러 처리를 적용한다.
   * @param {string} url    API 엔드포인트 경로
   * @param {Object} opts   fetch options (method, body, headers 등)
   * @returns {Promise<Object>} 파싱된 JSON 응답 (success: true 일 때)
   */
  function request(url, opts) {
    var options = Object.assign({}, { credentials: CREDENTIALS }, opts || {});

    // Content-Type 이 지정되지 않고 body 가 FormData 가 아닐 때만 JSON 헤더 추가
    if (!(options.body instanceof FormData)) {
      options.headers = Object.assign({}, DEFAULT_HEADERS, options.headers || {});
    } else {
      // FormData 전송 시 Content-Type 을 브라우저가 결정하도록 함
      var h = Object.assign({}, options.headers || {});
      delete h['Content-Type'];
      h.Accept = 'application/json';
      options.headers = h;
    }

    return fetch(url, options)
      .then(function (res) {
        // JSON 파싱 실패 시 null 반환 (500 HTML 응답 등)
        return res.json().catch(function () { return null; })
          .then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .then(function (result) {
        if (!result.ok || !result.data || result.data.success === false) {
          var msg = (result.data && (result.data.message || result.data.error))
            ? (result.data.message || result.data.error)
            : '요청 실패 (' + result.status + ')';
          var err = new Error(msg);
          err.status = result.status;
          err.response = result.data;
          throw err;
        }
        return result.data;
      });
  }

  /* ── 공개 API ── */
  var BlossomAPI = {
    /**
     * GET 요청
     * @param {string} url    API 경로 (쿼리스트링 포함 가능)
     * @param {Object} [opts] 추가 fetch 옵션
     */
    get: function (url, opts) {
      return request(url, Object.assign({ method: 'GET' }, opts || {}));
    },

    /**
     * POST 요청
     * @param {string} url    API 경로
     * @param {Object|FormData} body  요청 본문
     * @param {Object} [opts] 추가 fetch 옵션
     */
    post: function (url, body, opts) {
      var options = Object.assign({ method: 'POST' }, opts || {});
      if (body instanceof FormData) {
        options.body = body;
      } else {
        options.body = JSON.stringify(body || {});
      }
      return request(url, options);
    },

    /**
     * PUT 요청
     * @param {string} url    API 경로
     * @param {Object} body   요청 본문
     * @param {Object} [opts] 추가 fetch 옵션
     */
    put: function (url, body, opts) {
      return request(url, Object.assign({
        method: 'PUT',
        body: JSON.stringify(body || {})
      }, opts || {}));
    },

    /**
     * DELETE 요청 (키 이름: del — JS 예약어 회피)
     * @param {string} url    API 경로
     * @param {Object} [body] 요청 본문 (bulk-delete 시 ids 배열 등)
     * @param {Object} [opts] 추가 fetch 옵션
     */
    del: function (url, body, opts) {
      var options = Object.assign({ method: 'DELETE' }, opts || {});
      if (body) {
        options.body = JSON.stringify(body);
      }
      return request(url, options);
    },

    /**
     * POST (소프트 삭제) — 프로젝트 패턴에 맞춘 bulk-delete 헬퍼
     * @param {string} url    /api/xxx/bulk-delete 경로
     * @param {Array<number>} ids  삭제 대상 ID 배열
     */
    bulkDelete: function (url, ids) {
      return this.post(url, { ids: ids });
    },

    /**
     * 원시 fetch — 특수한 경우에 직접 사용
     */
    raw: request
  };

  /* ── 전역 등록 ── */
  root.BlossomAPI = BlossomAPI;

})(window);
