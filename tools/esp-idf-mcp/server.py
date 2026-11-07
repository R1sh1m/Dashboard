#!/usr/bin/env python3
"""
ESP-IDF Ground Bridge MCP Server for Team Artemis Dashboard
Provides build, flash, size profiling, and serial monitor tools for esp_receiver.
"""

import os
import sys
import subprocess
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
import serial
import serial.tools.list_ports

try:
    from mcp.server.mcpserver import MCPServer
    mcp = MCPServer("esp-idf-mcp")
except (ImportError, ModuleNotFoundError):
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("esp-idf-mcp")

WORKSPACE_DIR = Path(__file__).resolve().parents[2]
BUILD_DIR = WORKSPACE_DIR / "build" if (WORKSPACE_DIR / "build").exists() else WORKSPACE_DIR / "esp_receiver" / "build"
ESPRESSIF_HOME = Path.home() / ".espressif"
NINJA_PATH = ESPRESSIF_HOME / "tools" / "ninja" / "1.12.1" / "ninja.exe"
PYTHON_IDF = ESPRESSIF_HOME / "python_env" / "idf6.0_py3.13_env" / "Scripts" / "python.exe"
ESPTOOL_PATH = ESPRESSIF_HOME / "python_env" / "idf6.0_py3.13_env" / "Scripts" / "esptool.py"


@mcp.tool()
def list_esp_devices() -> List[Dict[str, Any]]:
    """
    List all detected serial COM ports that could be ESP32 or USB-UART bridges.
    """
    ports = serial.tools.list_ports.comports()
    results = []
    for p in ports:
        desc = (p.description or "").lower()
        mfg = (p.manufacturer or "").lower()
        is_esp = any(k in desc or k in mfg for k in ["cp210", "ch340", "ftdi", "espressif", "usb-serial", "uart"])
        results.append({
            "port": p.device,
            "description": p.description,
            "manufacturer": p.manufacturer,
            "hwid": p.hwid,
            "is_likely_esp": is_esp
        })
    return results


@mcp.tool()
def esp_build() -> Dict[str, Any]:
    """
    Compile the ESP32-S3 ground receiver firmware (esp_receiver) using Ninja.
    """
    if not NINJA_PATH.exists():
        return {"status": "error", "message": f"Ninja not found at {NINJA_PATH}"}
    if not BUILD_DIR.exists():
        return {"status": "error", "message": f"Build directory not found at {BUILD_DIR}"}

    try:
        proc = subprocess.run(
            [str(NINJA_PATH), "-C", str(BUILD_DIR)],
            capture_output=True,
            text=True,
            timeout=180
        )
        return {
            "status": "success" if proc.returncode == 0 else "failed",
            "exit_code": proc.returncode,
            "stdout": proc.stdout[-2000:] if proc.stdout else "",
            "stderr": proc.stderr[-2000:] if proc.stderr else ""
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def esp_size() -> Dict[str, Any]:
    """
    Get the size of compiled ESP32 firmware binaries.
    """
    bin_file = BUILD_DIR / "esp_receiver.bin"
    elf_file = BUILD_DIR / "esp_receiver.elf"
    map_file = BUILD_DIR / "esp_receiver.map"

    if not bin_file.exists():
        return {"status": "not_built", "message": "esp_receiver.bin does not exist. Run esp_build first."}

    return {
        "status": "ok",
        "bin_size_bytes": bin_file.stat().st_size,
        "bin_size_kb": round(bin_file.stat().st_size / 1024, 1),
        "elf_size_kb": round(elf_file.stat().st_size / 1024, 1) if elf_file.exists() else None,
        "has_map": map_file.exists()
    }


@mcp.tool()
def esp_flash(port: Optional[str] = None, baudrate: int = 460800) -> Dict[str, Any]:
    """
    Flash esp_receiver firmware to the ESP32 board using esptool.
    Target files: bootloader.bin (0x1000), partition-table.bin (0x8000), esp_receiver.bin (0x10000).
    """
    bootloader = BUILD_DIR / "bootloader" / "bootloader.bin"
    partitions = BUILD_DIR / "partition_table" / "partition-table.bin"
    app_bin = BUILD_DIR / "esp_receiver.bin"

    if not app_bin.exists():
        return {"status": "error", "message": "esp_receiver.bin not found. Run esp_build first."}

    if not port:
        # Detect first likely ESP port
        devices = list_esp_devices()
        likely = [d["port"] for d in devices if d.get("is_likely_esp")]
        if not likely:
            return {"status": "error", "message": "No ESP32 serial port detected. Please specify port parameter."}
        port = likely[0]

    cmd = [
        str(PYTHON_IDF),
        "-m", "esptool",
        "--chip", "esp32",
        "--port", port,
        "--baud", str(baudrate),
        "--before", "default_reset",
        "--after", "hard_reset",
        "write_flash",
        "-z",
        "--flash_mode", "dio",
        "--flash_freq", "40m",
        "--flash_size", "detect",
        "0x1000", str(bootloader),
        "0x8000", str(partitions),
        "0x10000", str(app_bin)
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return {
            "status": "success" if proc.returncode == 0 else "failed",
            "port": port,
            "exit_code": proc.returncode,
            "output": proc.stdout[-1500:] if proc.stdout else proc.stderr[-1500:]
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def esp_monitor(port: Optional[str] = None, baudrate: int = 115200, duration_sec: float = 3.0) -> Dict[str, Any]:
    """
    Read serial output from the ESP32 ground bridge for a short duration.
    """
    if not port:
        devices = list_esp_devices()
        likely = [d["port"] for d in devices if d.get("is_likely_esp")]
        if not likely:
            return {"status": "error", "message": "No serial port detected."}
        port = likely[0]

    try:
        ser = serial.Serial(port=port, baudrate=baudrate, timeout=0.2)
        start = time.time()
        lines = []
        while time.time() - start < duration_sec:
            line = ser.readline().decode("utf-8", errors="replace").strip()
            if line:
                lines.append(line)
        ser.close()
        return {
            "status": "ok",
            "port": port,
            "lines_read": len(lines),
            "output": "\n".join(lines)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    mcp.run()

