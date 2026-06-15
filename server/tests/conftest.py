"""Configuration des fixtures pour les tests."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.database import Base
from core.security import hash_password
from models.teacher import Teacher
from models.exercise import Exercise
from models.variant import Variant
from models.exam_session import ExamSession


@pytest.fixture
def db_session():
    """Fixture de session DB en mémoire."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)
    session = TestSession()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def sample_teacher(db_session):
    """Crée un enseignant de test."""
    teacher = Teacher(
        email="test@universite.edu",
        password_hash=hash_password("password123"),
        full_name="Dr. Test",
        institution="Université de Test",
        discipline="Mathématiques",
        is_verified=True,
    )
    db_session.add(teacher)
    db_session.commit()
    db_session.refresh(teacher)
    return teacher


@pytest.fixture
def sample_session(db_session, sample_teacher):
    """Crée une session d'examen de test."""
    session = ExamSession(
        teacher_id=sample_teacher.id,
        title="Test Session",
        subject="Mathématiques",
        duration_seconds=3600,
        student_count=10,
        grading_system="20",
        correction_mode="ai_assisted",
        access_code="TEST1234",
        status="active",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


@pytest.fixture
def sample_session_small(db_session, sample_teacher):
    """Crée une session d'examen avec peu d'étudiants (compatible avec le nombre de variantes)."""
    session = ExamSession(
        teacher_id=sample_teacher.id,
        title="Small Test Session",
        subject="Mathématiques",
        duration_seconds=3600,
        student_count=3,
        grading_system="20",
        correction_mode="ai_assisted",
        access_code="SMALL01",
        status="active",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


@pytest.fixture
def sample_exercises(db_session, sample_teacher):
    """Crée des exercices avec variantes pour les tests."""
    exercises = []
    for i in range(2):
        ex = Exercise(
            teacher_id=sample_teacher.id,
            title=f"Exercice {i + 1}",
            subject="Mathématiques",
            difficulty="medium",
            instructions=f"Résolvez le problème {i + 1}",
            points=10,
            exercise_type="open",
        )
        db_session.add(ex)
        db_session.flush()
        db_session.refresh(ex)

        # Ajouter des variantes
        for v in range(3):
            variant = Variant(
                exercise_id=ex.id,
                variant_order=v + 1,
                content=f"Variante {v + 1} de l'exercice {i + 1}",
            )
            db_session.add(variant)

        exercises.append(ex)

    db_session.commit()
    for ex in exercises:
        db_session.refresh(ex)
    return exercises
