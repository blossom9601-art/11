import os
from abc import ABC, abstractmethod
from typing import Any, Dict


class FileStorageService(ABC):
    """첨부파일 저장소 추상화 계층.

    메타데이터/정책/로그와 저장소 구현을 분리하기 위해 사용한다.
    """

    @abstractmethod
    def save(self, app, stored_name: str, content: bytes) -> Dict[str, Any]:
        """파일 내용을 저장하고 저장 메타를 반환한다."""
        raise NotImplementedError

    @abstractmethod
    def load(self, app, row: Dict[str, Any]) -> bytes:
        """저장된 파일 내용을 로드한다."""
        raise NotImplementedError


class DatabaseFileStorageService(FileStorageService):
    """RDBMS(BLOB) 저장 구현."""

    def save(self, app, stored_name: str, content: bytes) -> Dict[str, Any]:
        return {
            'storage_backend': 'DB',
            'storage_path': '',
            'file_blob': content,
        }

    def load(self, app, row: Dict[str, Any]) -> bytes:
        blob = row.get('file_blob')
        if blob is None:
            return b''
        if isinstance(blob, memoryview):
            return blob.tobytes()
        return bytes(blob)


class LocalPathFileStorageService(FileStorageService):
    """로컬 경로 저장 구현 (향후 Object Storage 전환 전 단계)."""

    def save(self, app, stored_name: str, content: bytes) -> Dict[str, Any]:
        folder = os.path.join(app.instance_path, 'uploads', 'attachments')
        os.makedirs(folder, exist_ok=True)
        abs_path = os.path.join(folder, stored_name)
        with open(abs_path, 'wb') as fh:
            fh.write(content)
        rel_path = os.path.join('uploads', 'attachments', stored_name).replace('\\', '/')
        return {
            'storage_backend': 'PATH',
            'storage_path': rel_path,
            'file_blob': None,
        }

    def load(self, app, row: Dict[str, Any]) -> bytes:
        rel = (row.get('storage_path') or '').replace('\\', '/')
        if not rel:
            return b''
        abs_path = os.path.join(app.instance_path, rel)
        if not os.path.isfile(abs_path):
            return b''
        with open(abs_path, 'rb') as fh:
            return fh.read()


def get_file_storage_service(backend_name: str) -> FileStorageService:
    """정책에 따라 저장소 구현체를 선택한다."""
    key = (backend_name or 'DB').strip().upper()
    if key in ('PATH', 'LOCAL', 'LOCAL_PATH'):
        return LocalPathFileStorageService()
    return DatabaseFileStorageService()
