"""
add_mass_balance_and_anomalies

Revision ID: 004_mass_balance_anomalies
Revises: c22b10a4db0f
Create Date: 2026-08-06 08:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '004_mass_balance_anomalies'
down_revision: Union[str, None] = 'c22b10a4db0f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add mass balance fields to feedstock_batches
    op.add_column('feedstock_batches', sa.Column('wet_weight_kg', sa.Float(), nullable=True))
    op.add_column('feedstock_batches', sa.Column('dry_weight_kg', sa.Float(), nullable=True))
    op.add_column('feedstock_batches', sa.Column('water_weight_kg', sa.Float(), nullable=True))
    op.add_column('feedstock_batches', sa.Column('expected_yield_percent', sa.Float(), server_default='30.0', nullable=True))
    op.add_column('feedstock_batches', sa.Column('moisture_measurement_method', sa.String(length=100), nullable=True))

    # Add mass balance fields to biochar_batches
    op.add_column('biochar_batches', sa.Column('produced_weight_kg', sa.Float(), nullable=True))
    op.add_column('biochar_batches', sa.Column('calculated_yield_percent', sa.Float(), nullable=True))
    op.add_column('biochar_batches', sa.Column('mass_balance_status', sa.String(length=50), server_default='Pending', nullable=False))
    op.add_column('biochar_batches', sa.Column('anomaly_status', sa.String(length=50), server_default='Normal', nullable=False))
    op.add_column('biochar_batches', sa.Column('anomaly_reason', sa.Text(), nullable=True))

    # Create mass_balance_configs table
    op.create_table(
        'mass_balance_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True, unique=True),
        sa.Column('min_yield_percent', sa.Float(), server_default='15.0', nullable=False),
        sa.Column('max_yield_percent', sa.Float(), server_default='50.0', nullable=False),
        sa.Column('max_moisture_percent', sa.Float(), server_default='65.0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Create mass_balance_anomalies table
    op.create_table(
        'mass_balance_anomalies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('human_readable_explanation', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='Active', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('profiles.id', ondelete='SET NULL'), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('mass_balance_anomalies')
    op.drop_table('mass_balance_configs')

    op.drop_column('biochar_batches', 'anomaly_reason')
    op.drop_column('biochar_batches', 'anomaly_status')
    op.drop_column('biochar_batches', 'mass_balance_status')
    op.drop_column('biochar_batches', 'calculated_yield_percent')
    op.drop_column('biochar_batches', 'produced_weight_kg')

    op.drop_column('feedstock_batches', 'moisture_measurement_method')
    op.drop_column('feedstock_batches', 'expected_yield_percent')
    op.drop_column('feedstock_batches', 'water_weight_kg')
    op.drop_column('feedstock_batches', 'dry_weight_kg')
    op.drop_column('feedstock_batches', 'wet_weight_kg')
