"""mail_address

Revision ID: 1c1c8e328766
Revises: 4dc2d5a8c53c
Create Date: 2020-05-02 16:37:07.856516

"""
# revision identifiers, used by Alembic.
revision = '1c1c8e328766'
down_revision = '833da8570507'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column(
        'users', sa.Column('mail_address', sa.Unicode(length=320), nullable=True)
    )


def downgrade():
    op.drop_column('users', 'mail_address')
