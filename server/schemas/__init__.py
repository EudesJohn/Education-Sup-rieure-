"""Schémas Pydantic PEAN."""

from schemas.auth import (
    TeacherRegister,
    TeacherLogin,
    TokenResponse,
    TokenRefresh,
    TeacherResponse,
    TeacherUpdate,
    PasswordChange,
    EmailVerify,
    ForgotPassword,
    ResetPassword,
    TwoFASetup,
    TwoFAVerify,
)
from schemas.sessions import (
    ExamSessionCreate,
    ExamSessionUpdate,
    ExamSessionResponse,
    SessionLaunch,
)
from schemas.exercises import (
    ExerciseCreate,
    ExerciseResponse,
    VariantCreate,
    VariantResponse,
)
from schemas.student import (
    StudentJoin,
    StudentSubmit,
    StudentIncident,
)
from schemas.corrections import (
    CorrectionResponse,
    TeacherReview,
)
from schemas.judge import (
    CodeRunRequest,
    CodeRunResponse,
    CodeSubmitRequest,
    CodeSubmitResponse,
    LanguageInfo,
    TestCase,
    TestResult,
)

__all__ = [
    "TeacherRegister",
    "TeacherLogin",
    "TokenResponse",
    "TokenRefresh",
    "TeacherResponse",
    "TeacherUpdate",
    "PasswordChange",
    "EmailVerify",
    "ForgotPassword",
    "ResetPassword",
    "TwoFASetup",
    "TwoFAVerify",
    "ExamSessionCreate",
    "ExamSessionUpdate",
    "ExamSessionResponse",
    "SessionLaunch",
    "ExerciseCreate",
    "ExerciseResponse",
    "VariantCreate",
    "VariantResponse",
    "StudentJoin",
    "StudentSubmit",
    "StudentIncident",
    "CorrectionResponse",
    "TeacherReview",
    "CodeRunRequest",
    "CodeRunResponse",
    "CodeSubmitRequest",
    "CodeSubmitResponse",
    "LanguageInfo",
    "TestCase",
    "TestResult",
]
