"""Initial schema with projects, scans, findings, and artifacts

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-09 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_projects_name'), 'projects', ['name'], unique=True)

    # 2. Scans table
    op.create_table(
        'scans',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=True),
        sa.Column('scan_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('ecosystem', sa.String(length=50), nullable=True),
        sa.Column('target_name', sa.String(length=255), nullable=True),
        sa.Column('version', sa.String(length=100), nullable=True),
        sa.Column('scanned_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('overall_risk', sa.String(length=50), nullable=False, server_default='SAFE'),
        sa.Column('risk_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('dependencies', sa.JSON(), nullable=True),
        sa.Column('result_summary', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scans_project_id'), 'scans', ['project_id'], unique=False)

    # 3. Findings table
    op.create_table(
        'findings',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('scan_id', sa.String(length=36), nullable=False),
        sa.Column('package_name', sa.String(length=255), nullable=False),
        sa.Column('version', sa.String(length=100), nullable=True),
        sa.Column('overall_risk', sa.String(length=50), nullable=False, server_default='SAFE'),
        sa.Column('risk_level', sa.String(length=50), nullable=False, server_default='safe'),
        sa.Column('finding_type', sa.String(length=50), nullable=True),
        sa.Column('typosquat', sa.JSON(), nullable=True),
        sa.Column('cves', sa.JSON(), nullable=True),
        sa.Column('sandbox', sa.JSON(), nullable=True),
        sa.Column('license', sa.JSON(), nullable=True),
        sa.Column('fingerprint', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['scan_id'], ['scans.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_findings_scan_id'), 'findings', ['scan_id'], unique=False)
    op.create_index(op.f('ix_findings_package_name'), 'findings', ['package_name'], unique=False)
    op.create_index(op.f('ix_findings_fingerprint'), 'findings', ['fingerprint'], unique=False)

    # 4. Artifacts table
    op.create_table(
        'artifacts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('scan_id', sa.String(length=36), nullable=False),
        sa.Column('artifact_type', sa.String(length=50), nullable=False),
        sa.Column('format', sa.String(length=50), nullable=False, server_default='json'),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('signature', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['scan_id'], ['scans.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_artifacts_scan_id'), 'artifacts', ['scan_id'], unique=False)
    op.create_index(op.f('ix_artifacts_artifact_type'), 'artifacts', ['artifact_type'], unique=False)

def downgrade() -> None:
    op.drop_index(op.f('ix_artifacts_artifact_type'), table_name='artifacts')
    op.drop_index(op.f('ix_artifacts_scan_id'), table_name='artifacts')
    op.drop_table('artifacts')

    op.drop_index(op.f('ix_findings_fingerprint'), table_name='findings')
    op.drop_index(op.f('ix_findings_package_name'), table_name='findings')
    op.drop_index(op.f('ix_findings_scan_id'), table_name='findings')
    op.drop_table('findings')

    op.drop_index(op.f('ix_scans_project_id'), table_name='scans')
    op.drop_table('scans')

    op.drop_index(op.f('ix_projects_name'), table_name='projects')
    op.drop_table('projects')

