"""
add_cloudflare_r2_metadata

Revision ID: c22b10a4db0f
Revises: b9eccc5613f8
Create Date: 2026-07-18 09:47:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c22b10a4db0f'
down_revision: Union[str, None] = 'b9eccc5613f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to evidence table
    op.add_column('evidence', sa.Column('original_filename', sa.Text(), nullable=True))
    op.add_column('evidence', sa.Column('bucket_name', sa.Text(), nullable=True))
    op.add_column('evidence', sa.Column('object_key', sa.Text(), nullable=True))
    op.add_column('evidence', sa.Column('storage_provider', sa.Text(), nullable=True))
    op.add_column('evidence', sa.Column('upload_status', sa.Text(), server_default='Pending', nullable=False))
    op.add_column('evidence', sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Drop columns from evidence table
    op.drop_column('evidence', 'uploaded_at')
    op.drop_column('evidence', 'upload_status')
    op.drop_column('evidence', 'storage_provider')
    op.drop_column('evidence', 'object_key')
    op.drop_column('evidence', 'bucket_name')
    op.drop_column('evidence', 'original_filename')
