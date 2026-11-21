import os
from contextlib import contextmanager
from typing import Generator, Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

# Normalize postgres:// to postgresql+psycopg2:// for SQLAlchemy
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = None
SessionLocal = None

if DATABASE_URL:
    try:
        # SQLite needs check_same_thread=False
        connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
        engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    except Exception as e:
        print(f"Warning: Failed to initialize database engine for {DATABASE_URL}: {e}")
        engine = None
        SessionLocal = None

def is_db_enabled() -> bool:
    return engine is not None and SessionLocal is not None

def get_session() -> Optional[Session]:
    if not is_db_enabled():
        return None
    return SessionLocal()

@contextmanager
def db_context() -> Generator[Optional[Session], None, None]:
    if not is_db_enabled():
        yield None
        return
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

def get_db() -> Generator[Optional[Session], None, None]:
    """FastAPI dependency for DB sessions"""
    if not is_db_enabled():
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

