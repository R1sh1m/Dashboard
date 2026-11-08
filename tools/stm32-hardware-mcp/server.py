#!/usr/bin/env python3
"""
STM32 Hardware Test MCP Server
Provides real-time UART testing, automated diagnostic suites, and HIL verification for STM32 targets.
"""

import sys
import time
import json
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
import serial
import serial.tools.list_ports

# Import FastMCP from the correct module path (mcp v1.30.0 compatibility)
# Do not change to 'from mcp.server.fastmcp import FastMCP' — that shim raises ModuleNotFoundError in v2
from mcp.server.fastmcp.server import FastMCP as MCPServer
mcp = MCPServer("stm32-hardware-mcp")

# Active connection state
active_conn: Optional[serial.Serial] = None
active_port_name: Optional[str] = None
active_baudrate: int = 115200


@mcp.tool()
def list_serial_ports() -> List[Dict[str, Any]]:
    """
    List all available serial COM ports on the system.
    Detects ST-LINK Virtual COM Ports, CH340, FTDI, and other USB-to-UART bridges.
    """
    ports = serial.tools.list_ports.comports()
    results = []
    for p in ports:
        is_stlink = False
        desc_lower = (p.description or "").lower()
        mfg_lower = (p.manufacturer or "").lower()
        # ST-LINK USB VID is 0x0483 (1155 in decimal)
        if p.vid == 0x0483 or "stlink" in desc_lower or "stmicroelectronics" in mfg_lower:
            is_stlink = True
        
        results.append({
            "port": p.device,
            "description": p.description,
            "manufacturer": p.manufacturer,
            "hwid": p.hwid,
            "vid": f"0x{p.vid:04X}" if p.vid else None,
            "pid": f"0x{p.pid:04X}" if p.pid else None,
            "serial_number": p.serial_number,
            "is_stlink": is_stlink
        })
    return results


@mcp.tool()
def uart_connect(port: str, baudrate: int = 115200, timeout_sec: float = 2.0) -> Dict[str, Any]:
    """
    Open a serial connection to the specified COM port (e.g. COM3 or COM4).
    """
    global active_conn, active_port_name, active_baudrate
    if active_conn and active_conn.is_open:
        active_conn.close()
    
    try:
        active_conn = serial.Serial(
            port=port,
            baudrate=baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=timeout_sec
        )
        active_port_name = port
        active_baudrate = baudrate
        # Flush buffers
        active_conn.reset_input_buffer()
        active_conn.reset_output_buffer()
        return {
            "status": "connected",
            "port": port,
            "baudrate": baudrate,
            "timeout_sec": timeout_sec
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


@mcp.tool()
def uart_disconnect() -> Dict[str, Any]:
    """
    Close the active serial connection.
    """
    global active_conn, active_port_name
    if active_conn and active_conn.is_open:
        active_conn.close()
        port = active_port_name
        active_conn = None
        active_port_name = None
        return {"status": "disconnected", "port": port}
    return {"status": "not_connected"}


@mcp.tool()
def uart_send(text: str = "", append_newline: bool = True, hex_bytes: str = "") -> Dict[str, Any]:
    """
    Send text (with optional \\r\\n) or raw hex bytes to the active UART connection.
    """
    global active_conn
    if not active_conn or not active_conn.is_open:
        return {"status": "error", "message": "No active UART connection. Call uart_connect first."}
    
    try:
        if hex_bytes:
            clean_hex = hex_bytes.replace(" ", "").replace("0x", "")
            payload = bytes.fromhex(clean_hex)
        else:
            payload = text.encode("utf-8")
            if append_newline:
                payload += b"\r\n"
        
        bytes_written = active_conn.write(payload)
        active_conn.flush()
        return {
            "status": "sent",
            "bytes_written": bytes_written,
            "hex_sent": payload.hex()
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def uart_read(max_bytes: int = 1024, timeout_sec: float = 2.0) -> Dict[str, Any]:
    """
    Read available data from UART buffer up to max_bytes or until timeout.
    """
    global active_conn
    if not active_conn or not active_conn.is_open:
        return {"status": "error", "message": "No active UART connection. Call uart_connect first."}
    
    old_timeout = active_conn.timeout
    try:
        active_conn.timeout = timeout_sec
        raw_data = active_conn.read(max_bytes)
        decoded = raw_data.decode("utf-8", errors="replace")
        return {
            "status": "ok",
            "bytes_read": len(raw_data),
            "text": decoded,
            "hex": raw_data.hex()
        }
    finally:
        active_conn.timeout = old_timeout


@mcp.tool()
def uart_expect(expected_pattern: str, timeout_sec: float = 3.0, command_to_send: str = "") -> Dict[str, Any]:
    """
    Send an optional command, then read from UART until expected_pattern (regex) matches or timeout expires.
    """
    global active_conn
    if not active_conn or not active_conn.is_open:
        return {"status": "error", "message": "No active UART connection."}
    
    if command_to_send:
        cmd_bytes = command_to_send.encode("utf-8") + b"\r\n"
        active_conn.write(cmd_bytes)
        active_conn.flush()
    
    start_time = time.time()
    accumulated = ""
    pattern = re.compile(expected_pattern)
    matched = False
    groups = []
    
    while time.time() - start_time < timeout_sec:
        if active_conn.in_waiting > 0:
            chunk = active_conn.read(active_conn.in_waiting).decode("utf-8", errors="replace")
            accumulated += chunk
            match = pattern.search(accumulated)
            if match:
                matched = True
                groups = list(match.groups())
                break
        time.sleep(0.02)
    
    duration = round(time.time() - start_time, 3)
    return {
        "status": "PASS" if matched else "FAIL",
        "matched": matched,
        "pattern": expected_pattern,
        "groups": groups,
        "elapsed_sec": duration,
        "received_buffer": accumulated
    }


@mcp.tool()
def uart_run_suite(suite_json: str, port: str = "", baudrate: int = 115200) -> Dict[str, Any]:
    """
    Run an automated sequence of diagnostic test cases defined in JSON format.
    suite_json format:
    [
      {"name": "Ping Test", "command": "PING", "expect": "PONG", "timeout": 2.0},
      {"name": "Status Check", "command": "STATUS", "expect": "STATUS: (OK|RUNNING)", "timeout": 2.0}
    ]
    """
    global active_conn
    try:
        steps = json.loads(suite_json)
    except Exception as e:
        return {"status": "error", "message": f"Invalid suite JSON: {e}"}
    
    if port:
        conn_res = uart_connect(port=port, baudrate=baudrate)
        if conn_res.get("status") == "error":
            return {"status": "error", "message": f"Failed to connect to {port}: {conn_res.get('message')}"}
    
    if not active_conn or not active_conn.is_open:
        return {"status": "error", "message": "No active UART connection. Specify port or call uart_connect."}
    
    results = []
    passed = 0
    failed = 0
    total_start = time.time()
    
    for step in steps:
        step_name = step.get("name", "Unnamed Step")
        cmd = step.get("command", "")
        exp = step.get("expect", "")
        timeout = float(step.get("timeout", 2.5))
        
        res = uart_expect(expected_pattern=exp, timeout_sec=timeout, command_to_send=cmd)
        step_result = {
            "name": step_name,
            "command": cmd,
            "expected_pattern": exp,
            "passed": res.get("matched", False),
            "elapsed_sec": res.get("elapsed_sec"),
            "received": res.get("received_buffer")
        }
        results.append(step_result)
        if res.get("matched", False):
            passed += 1
        else:
            failed += 1
    
    total_time = round(time.time() - total_start, 3)
    return {
        "status": "PASS" if failed == 0 else "FAIL",
        "total_tests": len(steps),
        "passed": passed,
        "failed": failed,
        "duration_sec": total_time,
        "steps": results
    }


@mcp.tool()
def uart_export_report(report_data_json: str, output_path: str = "reports/uart-test-report.json") -> Dict[str, Any]:
    """
    Save test results to a JSON report and generate an accompanying HTML dashboard report.
    """
    try:
        data = json.loads(report_data_json)
    except Exception as e:
        return {"status": "error", "message": f"Invalid JSON data: {e}"}
    
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    
    # Save JSON
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    
    # Generate HTML
    html_path = p.with_suffix(".html")
    overall = data.get("status", data.get("overall", "UNKNOWN"))
    bg_color = "#10b981" if overall == "PASS" else "#ef4444"
    
    rows = ""
    for step in data.get("steps", []):
        st = "PASS" if step.get("passed") else "FAIL"
        col = "#10b981" if st == "PASS" else "#ef4444"
        rows += f"""<tr>
            <td style="padding: 8px; border: 1px solid #334155;">{step.get('name')}</td>
            <td style="padding: 8px; border: 1px solid #334155; font-family: monospace;">{step.get('command')}</td>
            <td style="padding: 8px; border: 1px solid #334155; font-family: monospace;">{step.get('expected_pattern')}</td>
            <td style="padding: 8px; border: 1px solid #334155; color: {col}; font-weight: bold;">{st}</td>
            <td style="padding: 8px; border: 1px solid #334155;">{step.get('elapsed_sec')}s</td>
        </tr>"""
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>STM32 HIL Test Report</title>
    <style>
        body {{ font-family: system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }}
        .card {{ background: #1e293b; border-radius: 8px; padding: 24px; border: 1px solid #334155; max-width: 900px; margin: 0 auto; }}
        .badge {{ background: {bg_color}; color: white; padding: 4px 12px; border-radius: 9999px; font-weight: bold; display: inline-block; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
        th {{ background: #334155; padding: 10px; text-align: left; border: 1px solid #475569; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>STM32 Hardware-in-the-Loop Test Report</h1>
        <p><strong>Status:</strong> <span class="badge">{overall}</span></p>
        <p><strong>Total:</strong> {data.get('total_tests', len(data.get('steps', [])))} | <strong>Passed:</strong> {data.get('passed', 0)} | <strong>Failed:</strong> {data.get('failed', 0)}</p>
        <table>
            <thead>
                <tr>
                    <th>Test Name</th>
                    <th>Command</th>
                    <th>Expected</th>
                    <th>Result</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
    </div>
</body>
</html>"""
    
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    return {
        "status": "exported",
        "json_path": str(p.resolve()),
        "html_path": str(html_path.resolve())
    }


if __name__ == "__main__":
    mcp.run()
