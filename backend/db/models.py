import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    func
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    scans = relationship("Scan", back_populates="project", cascade="all, delete-orphan", order_by="desc(Scan.created_at)")

    def to_dict(self):
        latest = self.scans[0] if self.scans else None
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "scan_count": len(self.scans),
            "latest_scan": latest.to_summary_dict() if latest else None
        }

class Scan(Base):
    __tablename__ = "scans"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    scan_type = Column(String(50), default="full", nullable=False)  # "full", "sandbox"
    status = Column(String(50), default="pending", nullable=False)  # "pending", "running", "completed", "failed"
    ecosystem = Column(String(50), nullable=True)  # "npm", "pypi", "generic"
    target_name = Column(String(255), nullable=True)  # Package name or repo name
    version = Column(String(100), nullable=True)
    scanned_count = Column(Integer, default=0, nullable=False)
    overall_risk = Column(String(50), default="SAFE", nullable=False)
    risk_score = Column(Float, default=0.0, nullable=False)
    dependencies = Column(JSON, nullable=True)
    result_summary = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="scans")
    findings = relationship("Finding", back_populates="scan", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="scan", cascade="all, delete-orphan")

    def to_summary_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "scan_type": self.scan_type,
            "status": self.status,
            "ecosystem": self.ecosystem,
            "target_name": self.target_name,
            "version": self.version,
            "scanned_count": self.scanned_count,
            "overall_risk": self.overall_risk,
            "risk_score": self.risk_score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }

    def to_dict(self):
        data = self.to_summary_dict()
        data["dependencies"] = self.dependencies or {}
        data["result"] = self.result_summary or []
        data["error"] = self.error
        return data

class Finding(Base):
    __tablename__ = "findings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scan_id = Column(String(36), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    package_name = Column(String(255), nullable=False, index=True)
    version = Column(String(100), nullable=True)
    overall_risk = Column(String(50), default="SAFE", nullable=False)
    risk_level = Column(String(50), default="safe", nullable=False)
    finding_type = Column(String(50), nullable=True)  # e.g. "unified", "typosquat", "cve", "sandbox", "license"
    typosquat = Column(JSON, nullable=True)
    cves = Column(JSON, nullable=True)
    sandbox = Column(JSON, nullable=True)
    license = Column(JSON, nullable=True)
    fingerprint = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    scan = relationship("Scan", back_populates="findings")

    def to_dict(self):
        return {
            "id": self.id,
            "package_name": self.package_name,
            "version": self.version,
            "overall_risk": self.overall_risk,
            "risk_level": self.risk_level,
            "finding_type": self.finding_type,
            "typosquat": self.typosquat,
            "cves": self.cves or [],
            "sandbox": self.sandbox,
            "license": self.license,
            "fingerprint": self.fingerprint
        }

class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    scan_id = Column(String(36), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    artifact_type = Column(String(50), nullable=False, index=True)  # "cyclonedx", "spdx", "vex", "attestation"
    format = Column(String(50), default="json", nullable=False)
    content = Column(JSON, nullable=False)
    signature = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    scan = relationship("Scan", back_populates="artifacts")

    def to_dict(self):
        return {
            "id": self.id,
            "scan_id": self.scan_id,
            "artifact_type": self.artifact_type,
            "format": self.format,
            "content": self.content,
            "signature": self.signature,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

