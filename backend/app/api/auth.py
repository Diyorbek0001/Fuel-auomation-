from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import User, UserRole
from app.schemas.auth import LoginIn, LoginOut, UserCreateIn, UserListOut, UserOut, UserUpdateIn
from app.services.auth_service import (
    authenticate_user,
    create_session,
    delete_session,
    ensure_creator_user,
    hash_password,
    require_creator_user,
    require_current_user,
)

router = APIRouter()


@router.post("/login", response_model=LoginOut)
async def api_login(payload: LoginIn, session: AsyncSession = Depends(get_session)) -> LoginOut:
    user = await authenticate_user(session, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = await create_session(session, user)
    return LoginOut(token=token, user=user)


@router.get("/me", response_model=UserOut)
async def api_me(user: User = Depends(require_current_user)) -> User:
    return user


@router.post("/logout")
async def api_logout(
    authorization: Optional[str] = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    if authorization and authorization.lower().startswith("bearer "):
        await delete_session(session, authorization.split(" ", 1)[1].strip())
    return {"status": "ok"}


@router.get("/users", response_model=UserListOut)
async def api_list_users(
    _: User = Depends(require_creator_user),
    session: AsyncSession = Depends(get_session),
) -> UserListOut:
    await ensure_creator_user(session)
    total = int((await session.execute(select(func.count()).select_from(User))).scalar_one())
    users = list((await session.scalars(select(User).order_by(User.role, User.username))).all())
    return UserListOut(total=total, items=users)


@router.post("/users", response_model=UserOut)
async def api_create_user(
    payload: UserCreateIn,
    _: User = Depends(require_creator_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    if payload.role == UserRole.creator:
        raise HTTPException(status_code=400, detail="Only one creator account is allowed")
    existing = await session.scalar(select(User).where(User.username == payload.username))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        username=payload.username,
        email=payload.email,
        display_name=payload.display_name,
        role=payload.role,
        active=payload.active,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
async def api_update_user(
    user_id: int,
    payload: UserUpdateIn,
    creator: User = Depends(require_creator_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.creator and user.id != creator.id:
        raise HTTPException(status_code=400, detail="Creator account cannot be edited here")
    if payload.username and payload.username != user.username:
        existing = await session.scalar(select(User).where(User.username == payload.username))
        if existing is not None:
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = payload.username
    if payload.email is not None:
        user.email = payload.email or None
    if payload.display_name is not None:
        user.display_name = payload.display_name or None
    if payload.role is not None:
        if payload.role == UserRole.creator and user.id != creator.id:
            raise HTTPException(status_code=400, detail="Only one creator account is allowed")
        if user.id == creator.id and payload.role != UserRole.creator:
            raise HTTPException(status_code=400, detail="Creator cannot remove own creator role")
        user.role = payload.role
    if payload.active is not None:
        if user.id == creator.id and not payload.active:
            raise HTTPException(status_code=400, detail="Creator cannot deactivate own account")
        user.active = payload.active
    if payload.password:
        user.password_hash = hash_password(payload.password)
    await session.commit()
    await session.refresh(user)
    return user
