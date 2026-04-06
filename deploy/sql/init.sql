-- =============================================================================
-- Blossom Lumina — MariaDB 초기화 SQL
-- 파일: /opt/blossom/lumina/sql/init.sql
--
-- ★★★ 실행 전 반드시 비밀번호를 변경하세요! ★★★
--    IDENTIFIED BY 'CHANGE_ME_...' 부분을 실제 강력한 비밀번호로 교체
--
-- 실행 방법:
--   mysql -u root -p < /opt/blossom/lumina/sql/init.sql
--
-- 포함 내용:
--   1. 데이터베이스 생성
--   2. 서비스 계정 생성 (writer / reader / admin)
--   3. 최소 권한 부여 (TLS 접속 강제)
--   4. 스키마 (테이블/인덱스)
--   5. 개인정보 보호 설계
--   6. Retention 이벤트 스케줄러
--   7. 보안 강화 설정
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 데이터베이스 생성
-- -----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `lumina`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `lumina`;

-- -----------------------------------------------------------------------------
-- 2. 서비스 계정 생성
-- -----------------------------------------------------------------------------

-- 2-1. AP Writer — INSERT/UPDATE/SELECT/DELETE 권한
--      AP 서버 IP에서만 접속 허용, TLS 필수
CREATE USER IF NOT EXISTS 'lumina_ap_writer'@'%'
    IDENTIFIED BY 'CHANGE_ME_AP_WRITER_PASSWORD'
    REQUIRE SSL;

-- 2-2. WEB Reader — SELECT 전용 (READ-ONLY)
--      WEB 서버 IP에서만 접속 허용, TLS 필수
CREATE USER IF NOT EXISTS 'lumina_web_reader'@'%'
    IDENTIFIED BY 'CHANGE_ME_WEB_READER_PASSWORD'
    REQUIRE SSL;

-- 2-3. Admin — 관리/마이그레이션 전용
--      localhost에서만 접속 허용
CREATE USER IF NOT EXISTS 'lumina_admin'@'localhost'
    IDENTIFIED BY 'CHANGE_ME_ADMIN_PASSWORD'
    REQUIRE SSL;

-- -----------------------------------------------------------------------------
-- 3. 권한 부여 (최소 권한 원칙)
-- -----------------------------------------------------------------------------

-- AP Writer: 데이터 적재에 필요한 최소 권한
GRANT SELECT, INSERT, UPDATE, DELETE ON `lumina`.* TO 'lumina_ap_writer'@'%';

-- WEB Reader: 조회 전용 (write 절대 불가)
GRANT SELECT ON `lumina`.* TO 'lumina_web_reader'@'%';

-- Admin: 전체 권한 (localhost only)
GRANT ALL PRIVILEGES ON `lumina`.* TO 'lumina_admin'@'localhost';
GRANT EVENT ON `lumina`.* TO 'lumina_admin'@'localhost';

-- 권한 즉시 적용
FLUSH PRIVILEGES;

-- -----------------------------------------------------------------------------
-- 4. root 원격 접속 비활성화 (보안 강화)
-- -----------------------------------------------------------------------------
-- ★ 아래 명령은 root 원격 접속이 설정되어 있을 경우에만 실행
-- DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
-- DROP USER IF EXISTS ''@'localhost';   -- 익명 사용자 제거
-- DROP USER IF EXISTS ''@'%';           -- 익명 사용자 제거
-- FLUSH PRIVILEGES;

-- -----------------------------------------------------------------------------
-- 5. 스키마 — 자산 수집 메인 테이블
-- -----------------------------------------------------------------------------

-- 5-1. 수집 호스트 마스터
CREATE TABLE IF NOT EXISTS `collected_hosts` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `hostname`      VARCHAR(255)    NOT NULL,
    `os_type`       VARCHAR(50)     NOT NULL COMMENT 'Linux, Windows, HPUX, AIX 등',
    `os_version`    VARCHAR(255)    DEFAULT NULL,
    `agent_version` VARCHAR(50)     DEFAULT NULL,
    `first_seen`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_seen`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_hostname` (`hostname`),
    KEY `idx_os_type` (`os_type`),
    KEY `idx_last_seen` (`last_seen`),
    KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='수집 대상 호스트 마스터';

-- 5-2. 네트워크 인터페이스 수집
CREATE TABLE IF NOT EXISTS `collected_interfaces` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `host_id`       BIGINT UNSIGNED NOT NULL,
    `name`          VARCHAR(100)    NOT NULL COMMENT 'eth0, ens192 등',
    `ip_address`    VARCHAR(45)     DEFAULT NULL COMMENT 'IPv4/IPv6',
    `mac_address`   VARCHAR(17)     DEFAULT NULL COMMENT '마스킹 가능',
    `netmask`       VARCHAR(45)     DEFAULT NULL,
    `gateway`       VARCHAR(45)     DEFAULT NULL,
    `slot`          VARCHAR(100)    DEFAULT NULL,
    `status`        VARCHAR(20)     DEFAULT 'unknown',
    `collected_at`  DATETIME        NOT NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_host_id` (`host_id`),
    KEY `idx_collected_at` (`collected_at`),
    CONSTRAINT `fk_iface_host` FOREIGN KEY (`host_id`)
        REFERENCES `collected_hosts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='네트워크 인터페이스 수집 데이터';

-- 5-3. 계정 수집
--   ★ 개인정보 보호: 비밀번호 절대 수집 금지
--   ★ 계정명은 운영 필수이므로 저장, 접근 권한 분리로 보호
CREATE TABLE IF NOT EXISTS `collected_accounts` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `host_id`       BIGINT UNSIGNED NOT NULL,
    `username`      VARCHAR(255)    NOT NULL,
    `uid`           INT             DEFAULT NULL,
    `gid`           INT             DEFAULT NULL,
    `home_dir`      VARCHAR(500)    DEFAULT NULL,
    `shell`         VARCHAR(255)    DEFAULT NULL,
    `is_system`     TINYINT(1)      DEFAULT 0,
    `is_locked`     TINYINT(1)      DEFAULT 0,
    `last_login`    DATETIME        DEFAULT NULL,
    `collected_at`  DATETIME        NOT NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_host_id` (`host_id`),
    KEY `idx_collected_at` (`collected_at`),
    CONSTRAINT `fk_acct_host` FOREIGN KEY (`host_id`)
        REFERENCES `collected_hosts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='호스트 계정 수집 (비밀번호 수집 금지)';

-- 5-4. 패키지 수집
CREATE TABLE IF NOT EXISTS `collected_packages` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `host_id`       BIGINT UNSIGNED NOT NULL,
    `name`          VARCHAR(500)    NOT NULL,
    `version`       VARCHAR(255)    DEFAULT NULL,
    `arch`          VARCHAR(50)     DEFAULT NULL,
    `source`        VARCHAR(100)    DEFAULT NULL COMMENT 'rpm, dpkg, msi 등',
    `install_date`  DATE            DEFAULT NULL,
    `collected_at`  DATETIME        NOT NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_host_id` (`host_id`),
    KEY `idx_pkg_name` (`name`(191)),
    KEY `idx_collected_at` (`collected_at`),
    CONSTRAINT `fk_pkg_host` FOREIGN KEY (`host_id`)
        REFERENCES `collected_hosts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='설치된 패키지/프로그램 수집';

-- 5-5. 수집 이력 (수집 건별 메타데이터)
CREATE TABLE IF NOT EXISTS `collection_log` (
    `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `host_id`           BIGINT UNSIGNED NOT NULL,
    `agent_version`     VARCHAR(50)     DEFAULT NULL,
    `collected_at`      DATETIME        NOT NULL,
    `received_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `interface_count`   INT UNSIGNED    DEFAULT 0,
    `account_count`     INT UNSIGNED    DEFAULT 0,
    `package_count`     INT UNSIGNED    DEFAULT 0,
    `payload_size`      INT UNSIGNED    DEFAULT 0 COMMENT '바이트',
    `status`            ENUM('success','partial','failed') DEFAULT 'success',
    `error_message`     TEXT            DEFAULT NULL,
    `source_ip`         VARCHAR(45)     DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_host_id` (`host_id`),
    KEY `idx_collected_at` (`collected_at`),
    KEY `idx_status` (`status`),
    CONSTRAINT `fk_log_host` FOREIGN KEY (`host_id`)
        REFERENCES `collected_hosts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='수집 이력 (감사 추적)';

-- 5-6. Agent 인증 토큰 관리
CREATE TABLE IF NOT EXISTS `agent_tokens` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `agent_id`      VARCHAR(255)    NOT NULL COMMENT '에이전트 고유 식별자',
    `token_hash`    CHAR(64)        NOT NULL COMMENT 'SHA-256 해시 (원본 저장 금지)',
    `description`   VARCHAR(500)    DEFAULT NULL,
    `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
    `issued_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expires_at`    DATETIME        DEFAULT NULL,
    `last_used_at`  DATETIME        DEFAULT NULL,
    `last_used_ip`  VARCHAR(45)     DEFAULT NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_agent_id` (`agent_id`),
    KEY `idx_token_hash` (`token_hash`),
    KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='에이전트 인증 토큰 (해시만 저장)';

-- 5-7. 감사 로그 테이블
CREATE TABLE IF NOT EXISTS `audit_log` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_type`    VARCHAR(50)     NOT NULL COMMENT 'LOGIN, LOGOUT, QUERY, CONFIG_CHANGE 등',
    `actor`         VARCHAR(255)    NOT NULL COMMENT '수행자 (계정 또는 서비스명)',
    `target`        VARCHAR(500)    DEFAULT NULL COMMENT '대상 (테이블, 설정, 호스트 등)',
    `action`        TEXT            DEFAULT NULL COMMENT '상세 행위 설명',
    `source_ip`     VARCHAR(45)     DEFAULT NULL,
    `result`        ENUM('success','failure','denied') DEFAULT 'success',
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_event_type` (`event_type`),
    KEY `idx_actor` (`actor`(191)),
    KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='감사 로그 (조회/변경/접근 기록)';

-- 5-8. 민감정보 암호화 키 관리 (선택적 컬럼 암호화용)
CREATE TABLE IF NOT EXISTS `encryption_keys` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `key_alias`     VARCHAR(100)    NOT NULL,
    `key_version`   INT UNSIGNED    NOT NULL DEFAULT 1,
    `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `rotated_at`    DATETIME        DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_alias_version` (`key_alias`, `key_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='컬럼 암호화 키 메타데이터 (키 자체는 외부 보관)';


-- -----------------------------------------------------------------------------
-- 6. Retention (보존주기) 이벤트 스케줄러
-- -----------------------------------------------------------------------------

-- 이벤트 스케줄러 활성화 확인
-- SET GLOBAL event_scheduler = ON;  -- my.cnf.d/lumina-security.cnf에서 설정됨

DELIMITER $$

-- 6-1. 수집 데이터 정리 (365일 경과)
CREATE EVENT IF NOT EXISTS `evt_retention_collected_data`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP + INTERVAL 1 HOUR
COMMENT '수집 데이터 365일 보존 후 삭제'
DO
BEGIN
    DECLARE cutoff DATETIME;
    SET cutoff = DATE_SUB(NOW(), INTERVAL 365 DAY);

    DELETE FROM `collected_interfaces` WHERE `collected_at` < cutoff LIMIT 50000;
    DELETE FROM `collected_accounts`   WHERE `collected_at` < cutoff LIMIT 50000;
    DELETE FROM `collected_packages`   WHERE `collected_at` < cutoff LIMIT 50000;
    DELETE FROM `collection_log`       WHERE `collected_at` < cutoff LIMIT 50000;
END$$

-- 6-2. 감사 로그 정리 (730일 경과)
CREATE EVENT IF NOT EXISTS `evt_retention_audit_log`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP + INTERVAL 2 HOUR
COMMENT '감사 로그 730일 보존 후 삭제'
DO
BEGIN
    DELETE FROM `audit_log`
    WHERE `created_at` < DATE_SUB(NOW(), INTERVAL 730 DAY)
    LIMIT 50000;
END$$

-- 6-3. 만료된 에이전트 토큰 비활성화
CREATE EVENT IF NOT EXISTS `evt_expire_agent_tokens`
ON SCHEDULE EVERY 1 HOUR
COMMENT '만료된 에이전트 토큰 자동 비활성화'
DO
BEGIN
    UPDATE `agent_tokens`
    SET `is_active` = 0
    WHERE `expires_at` IS NOT NULL
      AND `expires_at` < NOW()
      AND `is_active` = 1;
END$$

-- 6-4. 비활성 호스트 마킹 (90일 미수집)
CREATE EVENT IF NOT EXISTS `evt_mark_inactive_hosts`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP + INTERVAL 3 HOUR
COMMENT '90일간 수집 없는 호스트 비활성 마킹'
DO
BEGIN
    UPDATE `collected_hosts`
    SET `is_active` = 0
    WHERE `last_seen` < DATE_SUB(NOW(), INTERVAL 90 DAY)
      AND `is_active` = 1;
END$$

DELIMITER ;

-- -----------------------------------------------------------------------------
-- 7. 뷰 — 민감정보 마스킹 조회용
-- -----------------------------------------------------------------------------

-- WEB 서비스에서 사용할 마스킹된 뷰
CREATE OR REPLACE VIEW `v_interfaces_masked` AS
SELECT
    ci.id,
    ci.host_id,
    ch.hostname,
    ci.name,
    ci.ip_address,
    -- MAC 주소 부분 마스킹 (뒤 6자리)
    CONCAT(LEFT(ci.mac_address, 8), ':XX:XX:XX') AS mac_address_masked,
    ci.netmask,
    ci.status,
    ci.collected_at
FROM `collected_interfaces` ci
JOIN `collected_hosts` ch ON ci.host_id = ch.id;

CREATE OR REPLACE VIEW `v_accounts_masked` AS
SELECT
    ca.id,
    ca.host_id,
    ch.hostname,
    ca.username,
    ca.uid,
    ca.is_system,
    ca.is_locked,
    ca.collected_at
FROM `collected_accounts` ca
JOIN `collected_hosts` ch ON ca.host_id = ch.id;

-- -----------------------------------------------------------------------------
-- 8. 초기 데이터 (선택적)
-- -----------------------------------------------------------------------------

-- 감사 로그: DB 초기화 기록
INSERT INTO `audit_log` (`event_type`, `actor`, `target`, `action`, `result`)
VALUES ('SYSTEM', 'lumina_admin', 'lumina.*', 'Database initialized via init.sql', 'success');

-- -----------------------------------------------------------------------------
-- 완료 메시지
-- -----------------------------------------------------------------------------
SELECT '================================================================' AS '';
SELECT ' Blossom Lumina DB 초기화 완료' AS '';
SELECT '================================================================' AS '';
SELECT ' 데이터베이스: lumina' AS '';
SELECT ' 계정: lumina_ap_writer (writer), lumina_web_reader (reader), lumina_admin (admin)' AS '';
SELECT ' 테이블: collected_hosts, collected_interfaces, collected_accounts,' AS '';
SELECT '         collected_packages, collection_log, agent_tokens, audit_log' AS '';
SELECT ' 이벤트: 4개 retention 스케줄러 등록' AS '';
SELECT '================================================================' AS '';
SELECT ' ★ 운영 시 반드시 방화벽으로 AP/WEB 서버 IP만 3306 허용하세요!' AS '';
SELECT '================================================================' AS '';
