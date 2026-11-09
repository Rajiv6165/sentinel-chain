import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .session import is_db_enabled, db_context, SessionLocal
from .models import Project, Scan, Finding, Artifact, utc_now
from utils.diff import calculate_scan_risk_score, get_finding_fingerprint
from utils.sbom.generator import generate_cyclonedx, generate_spdx, generate_cyclonedx_vex

class JobStore:
    def __init__(self):
        # In-memory stores used when DATABASE_URL is not configured
        self._in_memory_sandbox = {}
        self._in_memory_full = {}
        self._in_memory_artifacts = {}  # {job_id: {type: content}}
        self._in_memory_projects = {}   # {name: project_dict}

    # ==========================
    # Project Operations
    # ==========================
    def get_or_create_project(self, project_name: str, description: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not project_name:
            return None

        project_name = project_name.strip()
        if not project_name:
            return None

        if not is_db_enabled():
            if project_name not in self._in_memory_projects:
                now_iso = datetime.now(timezone.utc).isoformat()
                self._in_memory_projects[project_name] = {
                    "id": f"proj-{project_name}",
                    "name": project_name,
                    "description": description,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                    "scan_count": 0,
                    "latest_scan": None
                }
            return self._in_memory_projects[project_name]

        with db_context() as session:
            project = session.query(Project).filter(Project.name == project_name).first()
            if not project:
                project = Project(name=project_name, description=description)
                session.add(project)
                session.commit()
                session.refresh(project)
            return project.to_dict()

    def get_project_by_id_or_name(self, id_or_name: str) -> Optional[Dict[str, Any]]:
        if not id_or_name:
            return None

        if not is_db_enabled():
            for p in self._in_memory_projects.values():
                if p["id"] == id_or_name or p["name"] == id_or_name:
                    return p
            return None

        with db_context() as session:
            project = session.query(Project).filter(
                (Project.id == id_or_name) | (Project.name == id_or_name)
            ).first()
            if not project:
                return None
            return project.to_dict()

    def list_projects(self) -> List[Dict[str, Any]]:
        if not is_db_enabled():
            return list(self._in_memory_projects.values())

        with db_context() as session:
            projects = session.query(Project).order_by(Project.updated_at.desc()).all()
            return [p.to_dict() for p in projects]

    def list_project_scans(self, project_id_or_name: str) -> List[Dict[str, Any]]:
        if not is_db_enabled():
            res = []
            for job in self._in_memory_full.values():
                if job.get("project_name") == project_id_or_name or job.get("project_id") == project_id_or_name:
                    res.append({
                        "id": job.get("id"),
                        "project_id": job.get("project_id"),
                        "scan_type": "full",
                        "status": job.get("status"),
                        "ecosystem": job.get("ecosystem"),
                        "scanned_count": len(job.get("dependencies", {})),
                        "overall_risk": job.get("overall_risk", "SAFE"),
                        "risk_score": job.get("risk_score", 0.0),
                        "created_at": job.get("created_at"),
                        "completed_at": job.get("completed_at")
                    })
            return sorted(res, key=lambda x: x.get("created_at") or "", reverse=True)

        with db_context() as session:
            project = session.query(Project).filter(
                (Project.id == project_id_or_name) | (Project.name == project_id_or_name)
            ).first()
            if not project:
                return []
            scans = session.query(Scan).filter(Scan.project_id == project.id).order_by(Scan.created_at.desc()).all()
            return [s.to_summary_dict() for s in scans]

    def get_latest_project_scan(self, project_id_or_name: str, exclude_scan_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        scans = self.list_project_scans(project_id_or_name)
        for s in scans:
            if s.get("status") == "completed":
                if not exclude_scan_id or s.get("id") != exclude_scan_id:
                    return self.get_full_scan_job(s["id"])
        return None

    # ==========================
    # Sandbox Scan Operations
    # ==========================
    def create_sandbox_job(self, job_id: str, ecosystem: str, package_name: str, version: Optional[str]) -> dict:
        job_data = {
            "id": job_id,
            "status": "pending",
            "package": package_name,
            "version": version,
            "ecosystem": ecosystem,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        if not is_db_enabled():
            self._in_memory_sandbox[job_id] = job_data
            return job_data

        with db_context() as session:
            scan = Scan(
                id=job_id,
                scan_type="sandbox",
                status="pending",
                ecosystem=ecosystem,
                target_name=package_name,
                version=version
            )
            session.add(scan)
        return job_data

    def update_sandbox_job_running(self, job_id: str):
        if not is_db_enabled():
            if job_id in self._in_memory_sandbox:
                self._in_memory_sandbox[job_id]["status"] = "running"
            return

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if scan:
                scan.status = "running"

    def complete_sandbox_job(self, job_id: str, result: dict, raw: dict):
        if not is_db_enabled():
            if job_id in self._in_memory_sandbox:
                self._in_memory_sandbox[job_id]["status"] = "completed"
                self._in_memory_sandbox[job_id]["result"] = result
                self._in_memory_sandbox[job_id]["raw"] = raw
                self._in_memory_sandbox[job_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
            return

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if scan:
                scan.status = "completed"
                scan.result_summary = {"result": result, "raw": raw}
                scan.completed_at = utc_now()
                score = result.get("score", 0) if isinstance(result, dict) else 0
                scan.risk_score = float(score)
                scan.overall_risk = result.get("risk_level", "low").upper() if isinstance(result, dict) else "LOW"

    def fail_sandbox_job(self, job_id: str, error: str):
        if not is_db_enabled():
            if job_id in self._in_memory_sandbox:
                self._in_memory_sandbox[job_id]["status"] = "failed"
                self._in_memory_sandbox[job_id]["error"] = str(error)
            return

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if scan:
                scan.status = "failed"
                scan.error = str(error)
                scan.completed_at = utc_now()

    def get_sandbox_job(self, job_id: str) -> Optional[dict]:
        if not is_db_enabled():
            return self._in_memory_sandbox.get(job_id)

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if not scan:
                return None
            res_summary = scan.result_summary or {}
            return {
                "id": scan.id,
                "status": scan.status,
                "package": scan.target_name,
                "version": scan.version,
                "ecosystem": scan.ecosystem,
                "result": res_summary.get("result"),
                "raw": res_summary.get("raw"),
                "error": scan.error,
                "created_at": scan.created_at.isoformat() if scan.created_at else None,
                "completed_at": scan.completed_at.isoformat() if scan.completed_at else None
            }

    # ==========================
    # Full Scan Operations
    # ==========================
    def create_full_scan_job(self, job_id: str, project_name: Optional[str] = None) -> dict:
        now_iso = datetime.now(timezone.utc).isoformat()
        job_data = {
            "id": job_id,
            "status": "pending",
            "project_name": project_name,
            "project_id": None,
            "created_at": now_iso
        }

        if not is_db_enabled():
            if project_name:
                proj = self.get_or_create_project(project_name)
                job_data["project_id"] = proj["id"]
            self._in_memory_full[job_id] = job_data
            return job_data

        with db_context() as session:
            project_id = None
            if project_name:
                p = session.query(Project).filter(Project.name == project_name).first()
                if not p:
                    p = Project(name=project_name)
                    session.add(p)
                    session.commit()
                    session.refresh(p)
                project_id = p.id
                job_data["project_id"] = project_id

            scan = Scan(
                id=job_id,
                project_id=project_id,
                scan_type="full",
                status="pending"
            )
            session.add(scan)
        return job_data

    def update_full_scan_job_running(self, job_id: str, dependencies: dict, ecosystem: str):
        if not is_db_enabled():
            if job_id in self._in_memory_full:
                self._in_memory_full[job_id]["status"] = "running"
                self._in_memory_full[job_id]["dependencies"] = dependencies
                self._in_memory_full[job_id]["ecosystem"] = ecosystem
            return

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if scan:
                scan.status = "running"
                scan.dependencies = dependencies
                scan.ecosystem = ecosystem
                scan.scanned_count = len(dependencies)

    def complete_full_scan_job(
        self,
        job_id: str,
        results: list,
        dependencies: dict,
        ecosystem: str
    ):
        risk_score, overall_risk = calculate_scan_risk_score(results)
        now_iso = datetime.now(timezone.utc).isoformat()

        if not is_db_enabled():
            if job_id in self._in_memory_full:
                self._in_memory_full[job_id]["status"] = "completed"
                self._in_memory_full[job_id]["result"] = results
                self._in_memory_full[job_id]["dependencies"] = dependencies
                self._in_memory_full[job_id]["ecosystem"] = ecosystem
                self._in_memory_full[job_id]["overall_risk"] = overall_risk
                self._in_memory_full[job_id]["risk_score"] = risk_score
                self._in_memory_full[job_id]["completed_at"] = now_iso

                # Update in-memory project summary
                proj_name = self._in_memory_full[job_id].get("project_name")
                if proj_name and proj_name in self._in_memory_projects:
                    self._in_memory_projects[proj_name]["scan_count"] += 1
                    self._in_memory_projects[proj_name]["updated_at"] = now_iso
                    self._in_memory_projects[proj_name]["latest_scan"] = {
                        "id": job_id,
                        "overall_risk": overall_risk,
                        "risk_score": risk_score,
                        "scanned_count": len(dependencies),
                        "created_at": self._in_memory_full[job_id].get("created_at"),
                        "completed_at": now_iso
                    }
            return

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if not scan:
                return

            scan.status = "completed"
            scan.result_summary = results
            scan.dependencies = dependencies
            scan.ecosystem = ecosystem
            scan.scanned_count = len(dependencies)
            scan.overall_risk = overall_risk
            scan.risk_score = risk_score
            scan.completed_at = utc_now()

            # Touch project updated_at
            if scan.project:
                scan.project.updated_at = utc_now()

            # Save individual Findings
            for r in results:
                f_obj = Finding(
                    scan_id=scan.id,
                    package_name=r.get("package_name", "unknown"),
                    version=dependencies.get(r.get("package_name")),
                    overall_risk=r.get("overall_risk", "SAFE"),
                    risk_level=r.get("risk_level", "safe"),
                    finding_type="package",
                    typosquat=r.get("typosquat"),
                    cves=r.get("cves"),
                    sandbox=r.get("sandbox"),
                    license=r.get("license"),
                    fingerprint=get_finding_fingerprint(r)
                )
                session.add(f_obj)

            # Generate and persist SBOM artifacts
            try:
                cdx = generate_cyclonedx(ecosystem, dependencies, results)
                spdx = generate_spdx(ecosystem, dependencies, results)
                vex = generate_cyclonedx_vex(ecosystem, dependencies, results)

                session.add(Artifact(scan_id=scan.id, artifact_type="cyclonedx", format="json", content=cdx))
                session.add(Artifact(scan_id=scan.id, artifact_type="spdx", format="json", content=spdx))
                session.add(Artifact(scan_id=scan.id, artifact_type="vex", format="json", content=vex))
            except Exception as ae:
                print(f"Warning: Failed to auto-generate artifacts in complete_full_scan_job: {ae}")

    def fail_full_scan_job(self, job_id: str, error: str):
        if not is_db_enabled():
            if job_id in self._in_memory_full:
                self._in_memory_full[job_id]["status"] = "failed"
                self._in_memory_full[job_id]["error"] = str(error)
            return

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if scan:
                scan.status = "failed"
                scan.error = str(error)
                scan.completed_at = utc_now()

    def get_full_scan_job(self, job_id: str) -> Optional[dict]:
        if not is_db_enabled():
            return self._in_memory_full.get(job_id)

        with db_context() as session:
            scan = session.query(Scan).filter(Scan.id == job_id).first()
            if not scan:
                return None
            return scan.to_dict()

    # ==========================
    # Artifact Operations
    # ==========================
    def get_artifact(self, job_id: str, artifact_type: str) -> Optional[dict]:
        if not is_db_enabled():
            if job_id in self._in_memory_artifacts and artifact_type in self._in_memory_artifacts[job_id]:
                return self._in_memory_artifacts[job_id][artifact_type]
            return None

        with db_context() as session:
            art = session.query(Artifact).filter(
                Artifact.scan_id == job_id,
                Artifact.artifact_type == artifact_type
            ).first()
            if art:
                return art.content
            return None

    def save_artifact(self, job_id: str, artifact_type: str, content: dict, signature: Optional[dict] = None):
        if not is_db_enabled():
            if job_id not in self._in_memory_artifacts:
                self._in_memory_artifacts[job_id] = {}
            self._in_memory_artifacts[job_id][artifact_type] = {
                "content": content,
                "signature": signature
            }
            return

        with db_context() as session:
            art = session.query(Artifact).filter(
                Artifact.scan_id == job_id,
                Artifact.artifact_type == artifact_type
            ).first()
            if art:
                art.content = content
                if signature is not None:
                    art.signature = signature
            else:
                art = Artifact(
                    scan_id=job_id,
                    artifact_type=artifact_type,
                    format="json",
                    content=content,
                    signature=signature
                )
                session.add(art)

    def get_attestation_artifact(self, job_id: str) -> Optional[dict]:
        if not is_db_enabled():
            if job_id in self._in_memory_artifacts and "attestation" in self._in_memory_artifacts[job_id]:
                return self._in_memory_artifacts[job_id]["attestation"]
            return None

        with db_context() as session:
            art = session.query(Artifact).filter(
                Artifact.scan_id == job_id,
                Artifact.artifact_type == "attestation"
            ).first()
            if art:
                return {
                    "attestation": art.content,
                    "signature": art.signature
                }
            return None

# Global singleton
job_store = JobStore()

