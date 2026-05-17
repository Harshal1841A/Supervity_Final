import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base

class AgentRun(Base):
    __tablename__ = "agent_runs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="running")
    logs = Column(JSON, default=list)
    completed = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    tasks = relationship("AgentTask", back_populates="run", cascade="all, delete-orphan")


class AgentTask(Base):
    __tablename__ = "agent_tasks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, ForeignKey("agent_runs.run_id"), nullable=False)
    task_id = Column(String, unique=True, index=True, nullable=False)
    
    agent = Column(String, nullable=False)
    priority = Column(String, default="MEDIUM")
    priority_color = Column(String, default="#f59e0b")
    message = Column(String, nullable=False)
    icon_name = Column(String, default="AlertTriangle")
    
    status = Column(String, default="pending_human")  # pending_human, approved, rejected
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    run = relationship("AgentRun", back_populates="tasks")
