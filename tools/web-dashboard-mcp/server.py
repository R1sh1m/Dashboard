#!/usr/bin/env python3
"""
Web Dashboard MCP Server for Team Artemis
Provides automated linting (oxlint), TypeScript typechecking, Vite production building, and Vitest testing.
"""

import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, Any

from mcp.server.mcpserver import MCPServer, Context
mcp = MCPServer("web-dashboard-mcp")

WORKSPACE_DIR = Path(__file__).resolve().parents[2]


def _run_npm(args: list[str], timeout: int = 60) -> Dict[str, Any]:
    cmd = ["npm.cmd"] + args if sys.platform == "win32" else ["npm"] + args
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(WORKSPACE_DIR),
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return {
            "status": "success" if proc.returncode == 0 else "failed",
            "exit_code": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip()
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def dashboard_lint() -> Dict[str, Any]:
    """
    Run oxlint on the React dashboard codebase to catch styling, accessibility, and syntax issues.
    """
    return _run_npm(["run", "lint"], timeout=30)


@mcp.tool()
def dashboard_typecheck() -> Dict[str, Any]:
    """
    Run TypeScript typechecker (tsc -b) without building to verify type safety across all React components.
    """
    cmd = ["npx.cmd", "tsc", "-b"] if sys.platform == "win32" else ["npx", "tsc", "-b"]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(WORKSPACE_DIR),
            capture_output=True,
            text=True,
            timeout=45
        )
        return {
            "status": "success" if proc.returncode == 0 else "failed",
            "exit_code": proc.returncode,
            "output": proc.stdout.strip() or proc.stderr.strip() or "No TypeScript errors."
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def dashboard_build() -> Dict[str, Any]:
    """
    Execute full production build (tsc -b && vite build).
    Verifies that bundle assets and WebAssembly binaries in dist/ are production ready.
    """
    return _run_npm(["run", "build"], timeout=90)


@mcp.tool()
def dashboard_test() -> Dict[str, Any]:
    """
    Run automated unit tests using Vitest (gpsParser, telemetry, simulators).
    """
    return _run_npm(["test", "--", "--run"], timeout=45)


@mcp.tool()
def dashboard_status() -> Dict[str, Any]:
    """
    Inspect the dashboard build deliverables, dependencies, and bundle stats.
    """
    dist_dir = WORKSPACE_DIR / "dist"
    has_dist = dist_dir.is_dir()
    dist_files = []
    if has_dist:
        for f in dist_dir.rglob("*"):
            if f.is_file():
                dist_files.append({
                    "name": f.name,
                    "size_kb": round(f.stat().st_size / 1024, 1)
                })

    return {
        "workspace": str(WORKSPACE_DIR),
        "has_dist": has_dist,
        "dist_file_count": len(dist_files),
        "dist_files": dist_files[:10],
        "framework": "React 19 + TypeScript 6 + Vite 8 + Leaflet"
    }


if __name__ == "__main__":
    mcp.run()

