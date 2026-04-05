/**
 * 공통 테이블 유틸리티 (table-utils.js)
 * ======================================
 * 리스트 페이지에서 반복되는 테이블 조작 패턴을 통합한다:
 * - 페이지네이션
 * - 정렬
 * - 전체선택 / 개별선택
 * - 컬럼 표시/숨김
 * - 빈 상태 표시
 *
 * 사용법:
 *   var table = BlossomTable.create({
 *     tableId: 'asset-table',
 *     emptyId: 'empty-state',
 *     countId: 'system-count',
 *     pageSize: 20,
 *     onLoad: function(page, size, query) { ... return Promise<{items, total}> }
 *   });
 *   table.load();  // 초기 로드
 *
 * v1.0.0  2026-03-15
 */
(function (root) {
  'use strict';

  /**
   * 테이블 컨트롤러 생성 팩토리
   * @param {Object} config 설정 객체
   */
  function create(config) {
    var state = {
      page: 1,
      size: config.pageSize || 20,
      total: 0,
      query: '',
      sortKey: config.defaultSort || '',
      sortDir: 'asc',
      selectedIds: [],
      items: []
    };

    var els = {};

    function init() {
      els.table = document.getElementById(config.tableId);
      els.tbody = els.table ? els.table.querySelector('tbody') : null;
      els.empty = config.emptyId ? document.getElementById(config.emptyId) : null;
      els.count = config.countId ? document.getElementById(config.countId) : null;
      els.pager = config.pagerId ? document.getElementById(config.pagerId) : null;
      els.selectAll = els.table ? els.table.querySelector('thead input[type="checkbox"]') : null;

      // 전체 선택 체크박스
      if (els.selectAll) {
        els.selectAll.addEventListener('change', function () {
          var checked = this.checked;
          var boxes = els.tbody ? els.tbody.querySelectorAll('input[type="checkbox"]') : [];
          state.selectedIds = [];
          for (var i = 0; i < boxes.length; i++) {
            boxes[i].checked = checked;
            if (checked) {
              var id = boxes[i].getAttribute('data-id');
              if (id) state.selectedIds.push(id);
            }
          }
          if (typeof config.onSelectionChange === 'function') {
            config.onSelectionChange(state.selectedIds);
          }
        });
      }

      // 검색 디바운스
      if (config.searchId) {
        var searchEl = document.getElementById(config.searchId);
        if (searchEl) {
          searchEl.addEventListener('input', root.BlossomDOM
            ? root.BlossomDOM.debounce(function () {
                state.query = this.value.trim();
                state.page = 1;
                load();
              }, 300)
            : (function () {
                var timer;
                return function () {
                  var self = this;
                  clearTimeout(timer);
                  timer = setTimeout(function () {
                    state.query = self.value.trim();
                    state.page = 1;
                    load();
                  }, 300);
                };
              })()
          );
        }
      }

      // 페이지 사이즈 셀렉터
      if (config.pageSizeId) {
        var sizeEl = document.getElementById(config.pageSizeId);
        if (sizeEl) {
          sizeEl.addEventListener('change', function () {
            state.size = parseInt(this.value, 10) || 20;
            state.page = 1;
            load();
          });
        }
      }
    }

    /** 데이터 로드 */
    function load(page) {
      if (typeof page === 'number') state.page = page;

      if (typeof config.onLoad !== 'function') return;

      var result = config.onLoad(state.page, state.size, state.query, state.sortKey, state.sortDir);

      // Promise 반환 시 자동 렌더링
      if (result && typeof result.then === 'function') {
        result.then(function (data) {
          if (data) {
            state.items = data.items || data.rows || [];
            state.total = data.total || state.items.length;
            render();
          }
        }).catch(function (err) {
          console.error('테이블 데이터 로드 실패:', err);
          if (root.showToast) {
            root.showToast('데이터를 불러오는 중 오류가 발생했습니다.', 'error');
          }
        });
      }
    }

    /** 렌더링 */
    function render() {
      // 카운트 업데이트
      if (els.count) {
        els.count.textContent = formatCount(state.total);
      }

      // 빈 상태 표시
      if (els.empty) {
        els.empty.style.display = state.items.length === 0 ? '' : 'none';
      }
      if (els.table) {
        els.table.style.display = state.items.length === 0 ? 'none' : '';
      }

      // 체크박스 초기화
      if (els.selectAll) els.selectAll.checked = false;
      state.selectedIds = [];

      // 페이지네이션 렌더링
      if (els.pager) renderPagination();

      // 커스텀 렌더 콜백
      if (typeof config.onRender === 'function') {
        config.onRender(state.items, state);
      }
    }

    /** K-단위 카운트 포맷팅 */
    function formatCount(n) {
      if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }

    /** 페이지네이션 렌더링 */
    function renderPagination() {
      if (!els.pager) return;
      var totalPages = Math.max(1, Math.ceil(state.total / state.size));
      var html = '';

      // 이전
      html += '<button class="page-btn" data-page="1" ' + (state.page <= 1 ? 'disabled' : '') + '>&laquo;</button>';
      html += '<button class="page-btn" data-page="' + Math.max(1, state.page - 1) + '" ' + (state.page <= 1 ? 'disabled' : '') + '>&lsaquo;</button>';

      // 번호
      var start = Math.max(1, state.page - 2);
      var end = Math.min(totalPages, start + 4);
      start = Math.max(1, end - 4);

      for (var i = start; i <= end; i++) {
        html += '<button class="page-btn' + (i === state.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
      }

      // 다음
      html += '<button class="page-btn" data-page="' + Math.min(totalPages, state.page + 1) + '" ' + (state.page >= totalPages ? 'disabled' : '') + '>&rsaquo;</button>';
      html += '<button class="page-btn" data-page="' + totalPages + '" ' + (state.page >= totalPages ? 'disabled' : '') + '>&raquo;</button>';

      els.pager.innerHTML = html;

      // 클릭 이벤트 위임
      els.pager.onclick = function (e) {
        var btn = e.target.closest('[data-page]');
        if (btn && !btn.disabled) {
          load(parseInt(btn.getAttribute('data-page'), 10));
        }
      };
    }

    /** 정렬 */
    function sort(key) {
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      state.page = 1;
      load();
    }

    /** 선택된 ID 목록 반환 */
    function getSelectedIds() {
      return state.selectedIds.slice();
    }

    /** 현재 상태 반환 */
    function getState() {
      return Object.assign({}, state);
    }

    // 초기화
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    return {
      load: load,
      sort: sort,
      render: render,
      getSelectedIds: getSelectedIds,
      getState: getState
    };
  }

  root.BlossomTable = { create: create };

})(window);
