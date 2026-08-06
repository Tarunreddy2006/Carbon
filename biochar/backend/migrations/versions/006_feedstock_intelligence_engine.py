"""
add_feedstock_intelligence_engine

Revision ID: 006_feedstock_intelligence_engine
Revises: 005_laboratory_validation_engine
Create Date: 2026-08-06 08:36:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '006_feedstock_intelligence_engine'
down_revision: Union[str, None] = '005_laboratory_validation_engine'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add Phase 3 Feedstock Intelligence fields to feedstock_batches
    op.add_column('feedstock_batches', sa.Column('feedstock_lot_number', sa.String(length=128), nullable=True))
    op.create_index('idx_fs_batches_lot_num', 'feedstock_batches', ['feedstock_lot_number'])
    op.add_column('feedstock_batches', sa.Column('feedstock_category', sa.String(length=100), nullable=True))
    op.add_column('feedstock_batches', sa.Column('biomass_species', sa.String(length=100), nullable=True))
    op.add_column('feedstock_batches', sa.Column('biomass_source_type', sa.String(length=100), nullable=True))
    op.add_column('feedstock_batches', sa.Column('harvest_date', sa.Date(), nullable=True))
    op.add_column('feedstock_batches', sa.Column('collection_date', sa.Date(), nullable=True))
    op.add_column('feedstock_batches', sa.Column('storage_days', sa.Integer(), server_default='0', nullable=False))
    op.add_column('feedstock_batches', sa.Column('storage_location', sa.String(length=255), nullable=True))
    op.add_column('feedstock_batches', sa.Column('contamination_status', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('feedstock_batches', sa.Column('contamination_notes', sa.Text(), nullable=True))
    op.add_column('feedstock_batches', sa.Column('visual_quality_grade', sa.String(length=50), server_default='Grade A', nullable=False))
    op.add_column('feedstock_batches', sa.Column('quality_status', sa.String(length=50), server_default='Optimal', nullable=False))
    op.add_column('feedstock_batches', sa.Column('quality_score', sa.Float(), nullable=True))

    # Create feedstock_suppliers table if not exists
    op.create_table(
        'feedstock_suppliers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('supplier_name', sa.String(length=255), nullable=False),
        sa.Column('supplier_type', sa.String(length=100), server_default='Biomass Aggregator', nullable=False),
        sa.Column('contact_information', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('operating_region', sa.String(length=100), nullable=True),
        sa.Column('gps_location', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('sustainability_documents', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('certification_status', sa.String(length=100), server_default='Self-Attested', nullable=False),
        sa.Column('active_status', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('overall_quality_score', sa.Float(), server_default='100.0', nullable=False),
        sa.Column('reliability_rating', sa.String(length=50), server_default='Excellent', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Create feedstock_intelligence_configs table
    op.create_table(
        'feedstock_intelligence_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True, unique=True),
        sa.Column('max_moisture_percent', sa.Float(), server_default='25.0', nullable=False),
        sa.Column('max_storage_days', sa.Integer(), server_default='60', nullable=False),
        sa.Column('min_supplier_score', sa.Float(), server_default='70.0', nullable=False),
        sa.Column('contamination_strict', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('quality_weights', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Create feedstock_intelligence_logs table
    op.create_table(
        'feedstock_intelligence_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('feedstock_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('feedstock_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('feedstock_suppliers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('rule_triggered', sa.String(length=100), nullable=False),
        sa.Column('quality_score', sa.Float(), nullable=False),
        sa.Column('quality_status', sa.String(length=50), nullable=False),
        sa.Column('recommendation', sa.Text(), nullable=True),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('evaluated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('profiles.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('feedstock_intelligence_logs')
    op.drop_table('feedstock_intelligence_configs')
    op.drop_table('feedstock_suppliers')

    op.drop_index('idx_fs_batches_lot_num', table_name='feedstock_batches')
    op.drop_column('feedstock_batches', 'quality_score')
    op.drop_column('feedstock_batches', 'quality_status')
    op.drop_column('feedstock_batches', 'visual_quality_grade')
    op.drop_column('feedstock_batches', 'contamination_notes')
    op.drop_column('feedstock_batches', 'contamination_status')
    op.drop_column('feedstock_batches', 'storage_location')
    op.drop_column('feedstock_batches', 'storage_days')
    op.drop_column('feedstock_batches', 'collection_date')
    op.drop_column('feedstock_batches', 'harvest_date')
    op.drop_column('feedstock_batches', 'biomass_source_type')
    op.drop_column('feedstock_batches', 'biomass_species')
    op.drop_column('feedstock_batches', 'feedstock_category')
    op.drop_column('feedstock_batches', 'feedstock_lot_number')
