"""Schémas Pydantic pour l'authentification."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class TeacherRegister(BaseModel):
    email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)
    # Anciens champs (compatibilité)
    institution: str = Field("", min_length=1, max_length=255)
    discipline: str = Field("", min_length=1, max_length=255)
    institution_id: int | None = None
    subject_id: int | None = None
    # Nouveaux champs multi-sélection
    institution_ids: list[int] = []
    subject_ids: list[int] = []


class TeacherLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    teacher: "TeacherResponse | None" = None
    verify_token: str | None = None
    twofa_required: bool = False
    temp_token: str | None = None


class TokenRefresh(BaseModel):
    refresh_token: str


class TeacherResponse(BaseModel):
    id: int
    email: str
    full_name: str
    institution: str
    discipline: str
    institution_ids: list[int] = []
    subject_ids: list[int] = []
    avatar_url: str | None = None
    is_verified: bool
    is_2fa_enabled: bool
    role: str = "teacher"
    created_at: datetime

    model_config = {"from_attributes": True}


class TeacherUpdate(BaseModel):
    full_name: str | None = None
    institution: str | None = None
    discipline: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    institution_ids: list[int] | None = None
    subject_ids: list[int] | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class EmailVerify(BaseModel):
    token: str


class ForgotPassword(BaseModel):
    email: str


class ResetPassword(BaseModel):
    token: str
    password: str = Field(..., min_length=8)


class TwoFASetup(BaseModel):
    pass


class TwoFAVerify(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TwoFAVerifyLogin(BaseModel):
    temp_token: str
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
