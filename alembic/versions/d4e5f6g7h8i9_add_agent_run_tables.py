"""Add agent_runs and agent_tasks tables for GrowthPilot OS

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-05-16 10:00:00.000000

Creates two tables:
- agent_runs:  Tracks individual Supervity workflow execution runs
- agent_tasks: Tracks human-in-the-loop approval tasks per run
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d4e5f6g7h8i9"
down_revision: Union[str, None] = "c3d4e5f6g7h8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── agent_runs ────────────────────────────────────────────────────────────
    op.create_table(
        "agent_runs",
        sa.Column("id",         sa.String(),  primary_key=True, nullable=False),
        sa.Column("run_id",     sa.String(),  nullable=False),
        sa.Column("status",     sa.String(),  nullable=False, server_default="running"),
        sa.Column("logs",       sa.JSON(),    nullable=True),
        sa.Column("completed",  sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_run_id", "agent_runs", ["run_id"], unique=True)

    # ── agent_tasks ───────────────────────────────────────────────────────────
    op.create_table(
        "agent_tasks",
        sa.Column("id",             sa.String(), primary_key=True, nullable=False),
        sa.Column("run_id",         sa.String(), nullable=False),
        sa.Column("task_id",        sa.String(), nullable=False),
        sa.Column("agent",          sa.String(), nullable=False),
        sa.Column("priority",       sa.String(), nullable=False, server_default="MEDIUM"),
        sa.Column("priority_color", sa.String(), nullable=True),
        sa.Column("message",        sa.String(), nullable=False),
        sa.Column("icon_name",      sa.String(), nullable=True),
        sa.Column("status",         sa.String(), nullable=False, server_default="pending_human"),
        sa.Column("created_at",     sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at",     sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.run_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_tasks_task_id", "agent_tasks", ["task_id"], unique=True)
    op.create_index("ix_agent_tasks_run_id",  "agent_tasks", ["run_id"],  unique=False)
    op.create_index("ix_agent_tasks_status",  "agent_tasks", ["status"],  unique=False)


def downgrade() -> None:
    op.drop_index("ix_agent_tasks_status",  table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_run_id",  table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_task_id", table_name="agent_tasks")
    op.drop_table("agent_tasks")

    op.drop_index("ix_agent_runs_run_id", table_name="agent_runs")
    op.drop_table("agent_runs")
