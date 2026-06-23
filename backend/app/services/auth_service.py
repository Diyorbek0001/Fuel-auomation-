from __future__ import annotations

from datetime import timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_session
from app.models import User, UserRole, UserSession
from app.models.common import utcnow

HASH_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), HASH_ITERATIONS)
    return f"pbkdf2_sha256${HASH_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    if not password_hash:
        return False
    try:
        scheme, iterations, salt, digest = password_hash.split("$", 3)
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)).hex()
    return hmac.compare_digest(candidate, digest)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def ensure_creator_user(session: AsyncSession) -> None:
    creator = await session.scalar(select(User).where(User.role == UserRole.creator))
    if creator is not None:
        return
    settings = get_settings()
    session.add(
        User(
            username=settings.creator_username,
            display_name="Creator",
            role=UserRole.creator,
            active=True,
            password_hash=hash_password(settings.creator_password),
        )
    )
    await session.commit()


async def authenticate_user(session: AsyncSession, username: str, password: str) -> Optional[User]:
    await ensure_creator_user(session)
    user = await session.scalar(select(User).where(User.username == username))
    if user is None or not user.active or not verify_password(password, user.password_hash):
        return None
    user.last_login_at = utcnow()
    await session.commit()
    await session.refresh(user)
    return user


async def create_session(session: AsyncSession, user: User) -> str:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=token_hash(token),
            expires_at=utcnow() + timedelta(hours=settings.auth_session_hours),
        )
    )
    await session.commit()
    return token


async def delete_session(session: AsyncSession, token: str) -> None:
    user_session = await session.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token)))
    if user_session is not None:
        await session.delete(user_session)
        await session.commit()


async def current_user_from_token(session: AsyncSession, token: str) -> Optional[User]:
    user_session = await session.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token)))
    if user_session is None:
        return None
    expires_at = user_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utcnow():
        return None
    user = await session.get(User, user_session.user_id)
    if user is None or not user.active:
        return None
    return user


def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return authorization.split(" ", 1)[1].strip()


async def require_current_user(
    authorization: Optional[str] = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    token = _bearer_token(authorization)
    user = await current_user_from_token(session, token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return user


async def require_admin_user(user: User = Depends(require_current_user)) -> User:
    if user.role not in {UserRole.creator, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin permission required")
    return user


async def require_creator_user(user: User = Depends(require_current_user)) -> User:
    if user.role != UserRole.creator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Creator permission required")
    return user
