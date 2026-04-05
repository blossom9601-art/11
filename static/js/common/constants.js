/**
 * 공통 상수 정의 (constants.js)
 * =============================
 * 하드코딩 문자열, URL 경로, 설정값 등을
 * 한 곳에서 관리하여 일관성을 유지한다.
 *
 * 사용법:
 *   var url = BLS_CONST.API.ITEMS;           // '/api/items'
 *   var label = BLS_CONST.STATUS.ACTIVE;     // '운영중'
 *
 * v1.0.0  2026-03-15
 */
(function (root) {
  'use strict';

  var BLS_CONST = {

    /* ── API 경로 ── */
    API: {
      // 인증
      LOGIN:              '/api/auth/login',
      LOGOUT:             '/api/auth/logout',
      SESSION:            '/api/session/user',
      PERMISSIONS:        '/api/session/permissions',

      // 하드웨어 자산
      HW_ASSETS:          '/api/hardware-assets',
      HW_TYPES:           '/api/hw-server-types',
      HW_SECURITY_TYPES:  '/api/hw-security-types',

      // 소프트웨어
      SW_ASSETS:          '/api/software-assets',
      SW_NAMES:           '/api/software-asset-names',
      SERVER_SOFTWARE:    '/api/server-software',

      // 네트워크
      VPN_PARTNERS:       '/api/vpn-partners',
      VPN_LINES:          '/api/vpn-lines',
      LEASED_LINES:       '/api/leased-lines',
      IP_POLICIES:        '/api/network/ip-policies',
      DNS_POLICIES:       '/api/network/dns-policies',

      // 프로젝트
      PROJECTS:           '/api/prj/projects',
      TASKS:              '/api/tasks',

      // 벤더
      VENDORS:            '/api/vendor-manufacturers',
      VENDOR_MAINTENANCE: '/api/vendor-maintenance',

      // 거버넌스
      DR_TRAININGS:       '/api/governance/dr-trainings',
      BACKUP_LIBRARIES:   '/api/governance/bk-libraries',
      BACKUP_TAPES:       '/api/governance/bk-tapes',

      // 업무보고
      WRK_REPORTS:        '/api/wrk/reports',

      // 조직
      DEPARTMENTS:        '/api/org/departments',
      CENTERS:            '/api/org/centers',
      RACKS:              '/api/org/racks',

      // 채팅
      CHAT_ROOMS:         '/api/chat/rooms',

      // 캘린더
      CALENDAR:           '/api/calendar/schedules',

      // 파일
      UPLOADS:            '/api/uploads',

      // 티켓
      TICKETS:            '/api/tickets',

      // 대시보드
      DASHBOARD:          '/api/dashboard'
    },

    /* ── 상태값 ── */
    STATUS: {
      ACTIVE:    '운영중',
      INACTIVE:  '미사용',
      DISPOSED:  '폐기',
      PLANNED:   '예정',
      COMPLETED: '완료',
      IN_PROGRESS: '진행중',
      DELAYED:   '지연',
      CANCELED:  '취소'
    },

    /* ── 자산 분류 ── */
    ASSET_TYPE: {
      SERVER:    '서버',
      STORAGE:   '스토리지',
      SAN:       'SAN 스위치',
      NETWORK:   '네트워크',
      SECURITY:  '보안장비'
    },

    /* ── UI 설정 ── */
    UI: {
      DEFAULT_PAGE_SIZE:  20,
      MAX_PAGE_SIZE:      500,
      TOAST_DURATION:     3500,
      DEBOUNCE_DELAY:     300,
      MODAL_TRANSITION:   200,
      DATE_FORMAT:        'YYYY-MM-DD',
      DATETIME_FORMAT:    'YYYY-MM-DD HH:mm'
    },

    /* ── 메시지 (에러/알림) ── */
    MSG: {
      LOGIN_REQUIRED:   '로그인이 필요합니다.',
      SESSION_EXPIRED:  '세션이 만료되었습니다.',
      SAVE_SUCCESS:     '저장되었습니다.',
      DELETE_SUCCESS:   '삭제되었습니다.',
      DELETE_CONFIRM:   '정말 삭제하시겠습니까?',
      LOAD_ERROR:       '데이터를 불러오는 중 오류가 발생했습니다.',
      SAVE_ERROR:       '저장 중 오류가 발생했습니다.',
      NETWORK_ERROR:    '네트워크 오류가 발생했습니다.',
      REQUIRED_FIELD:   '필수 항목을 입력해 주세요.',
      INVALID_FORMAT:   '형식이 올바르지 않습니다.'
    },

    /* ── 키보드 단축키 ── */
    KEY: {
      ESCAPE: 'Escape',
      ENTER:  'Enter',
      SEARCH: '/'
    }
  };

  /* ── Object.freeze 로 불변 보장 ── */
  if (Object.freeze) {
    Object.keys(BLS_CONST).forEach(function (k) {
      Object.freeze(BLS_CONST[k]);
    });
    Object.freeze(BLS_CONST);
  }

  root.BLS_CONST = BLS_CONST;

})(window);
