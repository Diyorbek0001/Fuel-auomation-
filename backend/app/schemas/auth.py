from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    display_name: Optional[str]
    role: UserRole
    active: bool
    last_login_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    user: UserOut


class UserCreateIn(BaseModel):
    username: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=255)
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: UserRole = UserRole.viewer
    active: bool = True


class UserUpdateIn(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=255)
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[UserRole] = None
    active: Optional[bool] = None


class UserListOut(BaseModel):
    total: int
    items: list[UserOut]
