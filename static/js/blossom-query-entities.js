/* ============================================================
 *  Blossom Query Entities  —  도메인별 사전 설정 엔터티 쿼리
 *  ============================================================
 *  blossom-query.js 를 로드한 후 이 파일을 로드하면
 *  window.BQ.entities 에 모든 도메인 CRUD 가 등록됨
 *
 *  사용법:
 *    var hw = BQ.entities.hardware;
 *    hw.fetchList({page:1, limit:20}).then(...)
 *    hw.create({name:'서버A'}).then(...)
 *    hw.subscribeList({}, function(entry){ renderTable(entry.data); })
 * ============================================================ */
;(function (win) {
  'use strict';

  var BQ = win.BlossomQuery;
  if (!BQ) { console.error('[BQ-Entities] BlossomQuery not loaded'); return; }

  var K = BQ.keys;
  var create = BQ.createEntityQueries;

  /* ──────────────────────────────────────────────────────────
   *  엔터티 정의
   *  각 엔터티는 { entity, baseUrl, keys, parseList?, parseItem? }
   * ────────────────────────────────────────────────────────── */

  var entities = {};

  /* === 하드웨어 자산 === */
  entities.hardware = create({
    entity:  'hardware',
    baseUrl: '/api/hw/assets',
    keys:    K.hardware
  });

  /* === 서버 (온프레미스) === */
  entities.server = create({
    entity:  'server',
    baseUrl: '/api/hw/servers',
    keys:    K.server
  });

  /* === 네트워크 장비 === */
  entities.network = create({
    entity:  'network',
    baseUrl: '/api/net/devices',
    keys:    K.network
  });

  /* === 소프트웨어 === */
  entities.software = create({
    entity:  'software',
    baseUrl: '/api/sw/assets',
    keys:    K.software
  });

  /* === 프로젝트 === */
  entities.project = create({
    entity:  'project',
    baseUrl: '/api/prj/projects',
    keys:    K.project,
    staleTime: 60000   /* 프로젝트는 1분 */
  });

  /* === 벤더 === */
  entities.vendor = create({
    entity:  'vendor',
    baseUrl: '/api/vendors',
    keys:    K.vendor,
    staleTime: 120000  /* 벤더는 잘 안 바뀜 — 2분 */
  });

  /* === 사용자 === */
  entities.user = create({
    entity:  'user',
    baseUrl: '/api/users',
    keys:    K.user,
    staleTime: 120000
  });

  /* === 부서 === */
  entities.department = create({
    entity:  'department',
    baseUrl: '/api/departments',
    keys:    K.department,
    staleTime: 300000  /* 부서는 거의 변경 없음 — 5분 */
  });

  /* === 대시보드 === */
  entities.dashboard = create({
    entity:  'dashboard',
    baseUrl: '/api/dashboard',
    keys:    K.dashboard,
    staleTime: 30000
  });

  /* === 정책(백업 정책 외) === */
  entities.policy = create({
    entity:  'policy',
    baseUrl: '/api/policies',
    keys:    K.policy
  });

  /* === 유지보수 === */
  entities.maintenance = create({
    entity:  'maintenance',
    baseUrl: '/api/maintenance',
    keys:    K.maintenance
  });

  /* === IP 관리 === */
  entities.ip = create({
    entity:  'ip',
    baseUrl: '/api/ip',
    keys:    K.ip
  });

  /* === 보안 === */
  entities.security = create({
    entity:  'security',
    baseUrl: '/api/security',
    keys:    K.security
  });


  /* ──────────────────────────────────────────────────────────
   *  의존성 그래프 확장 — 도메인 간 연쇄 무효화
   * ────────────────────────────────────────────────────────── */

  /* 벤더가 변경되면 하드웨어/소프트웨어/네트워크 제조사 목록도 무효화 */
  BQ.addDependency('vendor', [['hardware'], ['software'], ['network']]);

  /* 부서 변경 시 사용자 목록도 무효화 (부서소속 변경) */
  BQ.addDependency('department', [['user']]);

  /* IP 변경 시 네트워크 장비 연관 갱신 */
  BQ.addDependency('ip', [['network'], ['server']]);


  /* ──────────────────────────────────────────────────────────
   *  동적 엔터티 등록 함수
   * ────────────────────────────────────────────────────────── */

  /**
   * 런타임에 새로운 엔터티 등록
   * @param {string} name
   * @param {object} cfg  createEntityQueries 설정
   */
  function registerEntity(name, cfg) {
    entities[name] = create(cfg);
    return entities[name];
  }


  /* ──────────────────────────────────────────────────────────
   *  Public API 확장
   * ────────────────────────────────────────────────────────── */

  BQ.entities = entities;
  BQ.registerEntity = registerEntity;

  /* 편의 별칭 */
  win.BQ = BQ;

})(window);
