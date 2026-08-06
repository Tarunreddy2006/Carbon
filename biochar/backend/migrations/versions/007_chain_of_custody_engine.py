"""
add_chain_of_custody_engine

Revision ID: 007_chain_of_custody_engine
Revises: 006_feedstock_intelligence_engine
Create Date: 2026-08-06 08:50:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '007_chain_of_custody_engine'
down_revision: Union[str, None] = '006_feedstock_intelligence_engine'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chain_of_custody_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('parent_entity_type', sa.String(length=50), nullable=True),
        sa.Column('parent_entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('child_entity_type', sa.String(length=50), nullable=True),
        sa.Column('child_entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=True),
        sa.Column('quantity_unit', sa.String(length=20), server_default='kg', nullable=False),
        sa.Column('operator_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('profiles.id', ondelete='SET NULL'), nullable=True),
        sa.Column('site_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='Verified', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
    )

    op.create_index('idx_coc_events_parent', 'chain_of_custody_events', ['parent_entity_type', 'parent_entity_id'])
    op.create_index('idx_coc_events_child', 'chain_of_custody_events', ['child_entity_type', 'child_entity_id'])
    op.create_index('idx_coc_events_event_type', 'chain_of_custody_events', ['event_type'])


def downgrade() -> None:
    op.drop_index('idx_coc_events_event_type', table_name='chain_of_custody_events')
    op.drop_index('idx_coc_events_child', table_name='chain_of_custody_events')
    op.drop_index('idx_coc_events_parent', table_name='chain_of_custody_events')
    op.drop_table('chain_of_custody_events')
