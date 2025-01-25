"""Ensure the `mail_address` column exists in the `users` table.

Revision ID: e4e91a4b6dd5
Revises: 4621fec11365
Create Date: 2025-01-25 11:43:15.726590

"""

# revision identifiers, used by Alembic.
revision = 'e4e91a4b6dd5'
down_revision = '4621fec11365'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


def upgrade():
    # If the column `mail_address` does not exist in the `users` table, then add it.
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    columns = inspector.get_columns('users')
    if 'mail_address' not in [c['name'] for c in columns]:
        op.add_column(
            'users', sa.Column('mail_address', sa.Unicode(length=320), nullable=True)
        )

def downgrade():
    # no need to downgrade because the column `mail_address` should be removed
    # in the 1c1c8e328766_mail_address.py
    pass
