"""Service de stockage de fichiers via Supabase Storage.

Remplace MinIO (S3-compatible) par Supabase Storage.
Buckets : examens, copies, avatars (créés dans Supabase dashboard).
"""

import io
import logging
from typing import BinaryIO, Optional

from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Buckets Supabase (créés manuellement dans Supabase Dashboard > Storage)
BUCKET_EXAMS = "examens"
BUCKET_SUBMISSIONS = "copies"
BUCKET_AVATARS = "avatars"


class StorageService:
    """Gestion du stockage de fichiers via Supabase Storage."""

    def upload_file(
        self,
        bucket: str,
        object_name: str,
        data: BinaryIO,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload un fichier vers Supabase Storage.

        Retourne l'URL publique du fichier.
        """
        supabase = get_supabase()
        try:
            supabase.storage.from_(bucket).upload(
                path=object_name,
                file=data,
                file_options={"content-type": content_type},
            )
            # Retourner l'URL publique
            public_url = supabase.storage.from_(bucket).get_public_url(object_name)
            return public_url
        except Exception as e:
            logger.error(f"Erreur upload Supabase Storage: {e}")
            raise

    def get_file(self, bucket: str, object_name: str) -> Optional[bytes]:
        """Récupère le contenu d'un fichier depuis Supabase Storage."""
        supabase = get_supabase()
        try:
            result = supabase.storage.from_(bucket).download(object_name)
            return result
        except Exception as e:
            logger.error(f"Erreur lecture Supabase Storage: {e}")
            return None

    def delete_file(self, bucket: str, object_name: str) -> bool:
        """Supprime un fichier de Supabase Storage."""
        supabase = get_supabase()
        try:
            supabase.storage.from_(bucket).remove([object_name])
            return True
        except Exception as e:
            logger.error(f"Erreur suppression Supabase Storage: {e}")
            return False

    def get_public_url(self, bucket: str, object_name: str) -> Optional[str]:
        """Retourne l'URL publique d'un fichier."""
        supabase = get_supabase()
        try:
            return supabase.storage.from_(bucket).get_public_url(object_name)
        except Exception as e:
            logger.error(f"Erreur génération URL: {e}")
            return None

    def list_files(self, bucket: str, prefix: str = "") -> list[dict]:
        """Liste les fichiers dans un bucket."""
        supabase = get_supabase()
        try:
            objects = supabase.storage.from_(bucket).list(path=prefix)
            return [
                {
                    "name": obj.get("name", ""),
                    "size": obj.get("size", 0),
                    "last_modified": obj.get("updated_at", obj.get("created_at")),
                }
                for obj in objects
            ]
        except Exception as e:
            logger.error(f"Erreur listage Supabase Storage: {e}")
            return []

    # === Méthodes métier ===

    def upload_exam_file(
        self,
        exam_id: int,
        filename: str,
        file_data: BinaryIO,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload un fichier d'épreuve vers Supabase Storage (bucket examens)."""
        import uuid
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        object_name = f"exam_{exam_id}/{uuid.uuid4().hex}.{ext}"
        return self.upload_file(BUCKET_EXAMS, object_name, file_data, content_type)

    async def upload_submission_file(
        self,
        exam_id: int,
        student_number: str,
        file,
        content_type: str = None,
    ) -> str:
        """Upload un fichier joint à une soumission (bucket copies)."""
        import uuid
        from fastapi import UploadFile

        if content_type is None:
            content_type = getattr(file, "content_type", None) or "application/octet-stream"

        ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename else "bin"
        safe_student = "".join(c for c in student_number if c.isalnum() or c in "_-")[:20]
        object_name = f"submission_{exam_id}/{safe_student}_{uuid.uuid4().hex}.{ext}"

        data = await file.read()
        file_stream = io.BytesIO(data)

        return self.upload_file(BUCKET_SUBMISSIONS, object_name, file_stream, content_type)
