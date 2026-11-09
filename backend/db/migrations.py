import os
from alembic.config import Config
from alembic import command
from .session import is_db_enabled, DATABASE_URL

def run_migrations():
    """
    Applies all pending Alembic migrations up to head.
    Never uses create_all() in production paths.
    """
    if not is_db_enabled():
        return False

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_ini = os.path.join(backend_dir, "alembic.ini")
    alembic_cfg = Config(alembic_ini)
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)

    try:
        command.upgrade(alembic_cfg, "head")
        print("✅ Alembic migrations applied successfully to head.")
        return True
    except Exception as e:
        print(f"❌ Failed to run alembic migrations: {e}")
        raise

