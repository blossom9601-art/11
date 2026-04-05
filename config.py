import os
from datetime import timedelta

class Config:
    # 기본 설정
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # SQLite 데이터베이스 설정 (개발용)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///blossom.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # MySQL 데이터베이스 설정 (프로덕션용)
    MYSQL_HOST = os.environ.get('MYSQL_HOST') or 'localhost'
    MYSQL_PORT = int(os.environ.get('MYSQL_PORT') or 3306)
    MYSQL_USER = os.environ.get('MYSQL_USER') or 'root'
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD') or ''
    MYSQL_DB = os.environ.get('MYSQL_DB') or 'blossom_db'
    
    # 세션 설정
    PERMANENT_SESSION_LIFETIME = timedelta(hours=12)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # 파일 업로드 설정
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    UPLOAD_FOLDER = 'uploads'
    
    # 로깅 설정
    LOG_LEVEL = 'INFO'

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_ECHO = True
    # 개발 환경에서는 명시 env 우선순위:
    # 1) DATABASE_URL 환경변수
    # 2) BLOSSOM_SQLITE_FILE (상대경로 파일명)
    # 3) 기본 dev_blossom.db
    _sqlite_name = os.environ.get('BLOSSOM_SQLITE_FILE') or 'dev_blossom.db'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or f'sqlite:///{_sqlite_name}'
    # 개발 시 정적 파일/템플릿 캐시 비활성화
    SEND_FILE_MAX_AGE_DEFAULT = 0
    TEMPLATES_AUTO_RELOAD = True

class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_ECHO = False
    # 프로덕션: SECRET_KEY 환경변수 필수
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(64).hex()
    # 프로덕션 환경에서는 MySQL 사용
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or f'mysql+pymysql://{Config.MYSQL_USER}:{Config.MYSQL_PASSWORD}@{Config.MYSQL_HOST}:{Config.MYSQL_PORT}/{Config.MYSQL_DB}?charset=utf8mb4'
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True
    }
    # 프로덕션 세션 쿠키 보안 강화
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'
    # HTTPS 강제
    PREFERRED_URL_SCHEME = 'https'

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'

# 설정 매핑
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
