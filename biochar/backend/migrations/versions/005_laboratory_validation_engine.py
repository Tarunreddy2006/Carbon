"""
add_laboratory_validation_engine

Revision ID: 005_laboratory_validation_engine
Revises: 004_mass_balance_anomalies
Create Date: 2026-08-06 08:24:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '005_laboratory_validation_engine'
down_revision: Union[str, None] = '004_mass_balance_anomalies'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add Laboratory Validation fields to biochar_batches
    op.add_column('biochar_batches', sa.Column('peak_temperature', sa.Float(), nullable=True))
    op.add_column('biochar_batches', sa.Column('average_temperature', sa.Float(), nullable=True))
    op.add_column('biochar_batches', sa.Column('residence_time_minutes', sa.Integer(), nullable=True))
    op.add_column('biochar_batches', sa.Column('cooling_duration', sa.Integer(), nullable=True))
    op.add_column('biochar_batches', sa.Column('quality_status', sa.String(length=50), server_default='Pending', nullable=False))
    op.add_column('biochar_batches', sa.Column('validation_status', sa.String(length=50), server_default='Pending', nullable=False))
    op.add_column('biochar_batches', sa.Column('laboratory_ready', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('biochar_batches', sa.Column('anomaly_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('biochar_batches', sa.Column('validation_score', sa.Float(), nullable=True))

    # Add Laboratory Validation fields to biochar_samples
    op.add_column('biochar_samples', sa.Column('sample_collection_date', sa.Date(), nullable=True))
    op.add_column('biochar_samples', sa.Column('sample_collected_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('profiles.id', ondelete='SET NULL'), nullable=True))
    op.add_column('biochar_samples', sa.Column('laboratory_status', sa.String(length=50), server_default='Pending', nullable=False))
    op.add_column('biochar_samples', sa.Column('validation_status', sa.String(length=50), server_default='Pending', nullable=False))
    op.add_column('biochar_samples', sa.Column('risk_level', sa.String(length=20), server_default='Low', nullable=False))
    op.add_column('biochar_samples', sa.Column('validation_score', sa.Float(), nullable=True))
    op.add_column('biochar_samples', sa.Column('laboratory_notes', sa.Text(), nullable=True))

    # Add validation_status to laboratory_tests
    op.add_column('laboratory_tests', sa.Column('validation_status', sa.String(length=50), server_default='Pending', nullable=False))

    # Create laboratory_validation_configs table
    op.create_table(
        'laboratory_validation_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True, unique=True),
        sa.Column('min_peak_temperature', sa.Float(), server_default='450.0', nullable=False),
        sa.Column('min_residence_time_minutes', sa.Integer(), server_default='30', nullable=False),
        sa.Column('max_moisture_percent', sa.Float(), server_default='65.0', nullable=False),
        sa.Column('required_evidence_types', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('required_laboratory_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Create laboratory_validation_logs table
    op.create_table(
        'laboratory_validation_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('batch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('biochar_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('rule_triggered', sa.String(length=100), nullable=False),
        sa.Column('previous_status', sa.String(length=50), nullable=True),
        sa.Column('new_status', sa.String(length=50), nullable=False),
        sa.Column('validation_score', sa.Float(), nullable=False),
        sa.Column('risk_level', sa.String(length=20), nullable=False),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('evaluated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('profiles.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('laboratory_validation_logs')
    op.drop_table('laboratory_validation_configs')

    op.drop_column('laboratory_tests', 'validation_status')

    op.drop_column('biochar_samples', 'laboratory_notes')
    op.drop_column('biochar_samples', 'validation_score')
    op.drop_column('biochar_samples', 'risk_level')
    op.drop_column('biochar_samples', 'validation_status')
    op.drop_column('biochar_samples', 'laboratory_status')
    op.drop_column('biochar_samples', 'sample_collected_by')
    op.drop_column('biochar_samples', 'sample_collection_date')

    op.drop_column('biochar_batches', 'validation_score')
    op.drop_column('biochar_batches', 'anomaly_count')
    op.drop_column('biochar_batches', 'laboratory_ready')
    op.drop_column('biochar_batches', 'validation_status')
    op.drop_column('biochar_batches', 'quality_status')
    op.drop_column('biochar_batches', 'cooling_duration')
    op.drop_column('biochar_batches', 'residence_time_minutes')
    op.drop_column('biochar_batches', 'average_temperature')
    op.drop_column('biochar_batches', 'peak_temperature')
