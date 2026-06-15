"""Client Supabase centralisé pour PEAN.

Remplace SQLAlchemy + MinIO + Redis :
  - Base de données : supabase.table("...").select/insert/update/delete
  - Stockage fichiers : supabase.storage.from_("bucket")
  - Cache simple : table ``app_cache`` dans Supabase (TTL géré par l'app)
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client, create_client

from core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_supabase: Optional[Client] = None


def get_supabase() -> Client:
    """Retourne l'instance singleton du client Supabase."""
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY,
        )
        logger.info("✅ Client Supabase initialisé")
    return _supabase


class SupabaseCache:
    """Cache simple via une table ``app_cache`` dans Supabase.

    Remplace Redis pour :
      - Cache de session (5 min)
      - Cache d'épreuve (30 min)
      - Verrous d'examen
      - Tokens étudiants
    """

    async def get(self, key: str) -> Optional[str]:
        supabase = get_supabase()
        result = supabase.table("app_cache").select("value").eq("key", key).gte("expires_at", datetime.now(timezone.utc).isoformat()).maybe_single().execute()
        if result and result.data:
            return result.data["value"]
        return None

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        supabase = get_supabase()
        expires_at = None
        if ttl is not None:
            from datetime import timedelta
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()
        # Upsert : insert or update
        data = {"key": key, "value": value, "expires_at": expires_at}
        supabase.table("app_cache").upsert(data, on_conflict="key").execute()
        return True

    async def delete(self, key: str) -> bool:
        supabase = get_supabase()
        supabase.table("app_cache").delete().eq("key", key).execute()
        return True

    async def exists(self, key: str) -> bool:
        val = await self.get(key)
        return val is not None

    async def incr(self, key: str) -> int:
        supabase = get_supabase()
        # Atomic increment via RPC
        try:
            result = supabase.rpc("increment_cache", {"key_name": key}).execute()
            return result.data if result.data else 0
        except Exception:
            # Fallback : read + increment
            val = await self.get(key)
            count = (int(val) if val else 0) + 1
            await self.set(key, str(count), ttl=60)
            return count

    async def set_json(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        return await self.set(key, json.dumps(value, default=str), ttl=ttl)

    async def get_json(self, key: str) -> Optional[Any]:
        val = await self.get(key)
        if val is None:
            return None
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return val

    # === Helpers métier ===

    async def cache_session(self, code: str, session_data: dict, ttl: int = 300):
        await self.set_json(f"session:{code}", session_data, ttl=ttl)

    async def get_cached_session(self, code: str) -> Optional[dict]:
        return await self.get_json(f"session:{code}")

    async def invalidate_session(self, code: str):
        await self.delete(f"session:{code}")

    async def cache_exam(self, student_hash: str, exam_data: dict, ttl: int = 1800):
        await self.set_json(f"exam:{student_hash}", exam_data, ttl=ttl)

    async def get_cached_exam(self, student_hash: str) -> Optional[dict]:
        return await self.get_json(f"exam:{student_hash}")

    async def set_exam_lock(self, student_hash: str, ttl: int) -> bool:
        return await self.set(f"exam_lock:{student_hash}", "locked", ttl=ttl)

    async def has_exam_lock(self, student_hash: str) -> bool:
        return await self.exists(f"exam_lock:{student_hash}")

    async def release_exam_lock(self, student_hash: str):
        await self.delete(f"exam_lock:{student_hash}")

    async def set_student_token(self, student_hash: str, session_code: str, student_number: str, ttl: int) -> str:
        import secrets
        token = secrets.token_urlsafe(32)
        payload = json.dumps({
            "token": token,
            "session_code": session_code,
            "student_number": student_number,
            "student_hash": student_hash,
        })
        await self.set(f"student_token:{student_hash}", payload, ttl=ttl)
        await self.set(f"student_token_val:{token}", student_hash, ttl=ttl)
        return token

    async def verify_student_token(self, student_hash: str, token: str) -> bool:
        payload = await self.get_json(f"student_token:{student_hash}")
        if not payload:
            return False
        return payload.get("token") == token

    async def get_student_hash_by_token(self, token: str) -> Optional[str]:
        return await self.get(f"student_token_val:{token}")

    async def release_student_token(self, student_hash: str):
        payload = await self.get_json(f"student_token:{student_hash}")
        if payload and payload.get("token"):
            await self.delete(f"student_token_val:{payload['token']}")
        await self.delete(f"student_token:{student_hash}")


# Instance singleton
cache = SupabaseCache()
