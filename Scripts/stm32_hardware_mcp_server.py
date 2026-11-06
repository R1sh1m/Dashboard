# STM32 UART Hardware Test MCP — Python Server Scaffold

This is a scaffold for the custom STM32 hardware test MCP server. It provides UART connection, command/response testing, and automated diagnostics for the NUCLEO-F722ZE.

## Installation

```powershell
cd C:\STM32-AI\Tools
mkdir stm32-hardware-mcp
cd stm32-hardware-mcp
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "mcp[cli]" pyserial pytest
```

## Server Entry Point (`server.py`)

```python
"""STM32 Hardware Test MCP Server — UART diagnostics for NUCLEO-F722ZE."""

from mcp.server.fastmcp import FastMCP
import serial
import serial.tools.list_ports
import json
import time
from typing import Optional, List, Dict, Any

mcp = FastMCP("stm32-hardware")

# Global connection state
_connections: Dict[str, serial.Serial] = {}


@mcp.tool()
def list_serial_ports() -> List[Dict[str, str]]:
    """List all available serial ports."""
    ports = serial.tools.list_ports.comports()
    return [
        {
            "device": p.device,
            "description": p.description,
            "hwid": p.hwid,
        }
        for p in ports
    ]


@mcp.tool()
def uart_connect(port: str, baudrate: int = 115200, timeout: float = 2.0) -> str:
    """Connect to a serial port (e.g., ST-LINK virtual COM)."""
    if port in _connections:
        _connections[port].close()
    ser = serial.Serial(port, baudrate=baudrate, timeout=timeout)
    _connections[port] = ser
    return f"Connected to {port} at {baudrate} baud"


@mcp.tool()
def uart_disconnect(port: str) -> str:
    """Disconnect from a serial port."""
    if port in _connections:
        _connections[port].close()
        del _connections[port]
        return f"Disconnected from {port}"
    return f"Not connected to {port}"


@mcp.tool()
def uart_send(port: str, data: str) -> str:
    """Send data over UART."""
    if port not in _connections:
        return f"Error: Not connected to {port}"
    ser = _connections[port]
    ser.write((data + "\n").encode())
    return f"Sent: {data}"


@mcp.tool()
def uart_read(port: str, max_bytes: int = 256) -> str:
    """Read available data from UART."""
    if port not in _connections:
        return "Error: Not connected"
    ser = _connections[port]
    data = ser.read(max_bytes)
    return data.decode(errors="replace")


@mcp.tool()
def uart_expect(port: str, expected: str, timeout: float = 5.0) -> Dict[str, Any]:
    """Wait for expected string on UART. Returns match status and received data."""
    if port not in _connections:
        return {"match": False, "error": "Not connected"}
    ser = _connections[port]
    ser.timeout = timeout
    buffer = ""
    start = time.time()
    while time.time() - start < timeout:
        if ser.in_waiting:
            buffer += ser.read(ser.in_waiting).decode(errors="replace")
            if expected in buffer:
                return {"match": True, "received": buffer}
        time.sleep(0.01)
    return {"match": False, "received": buffer, "expected": expected}


@mcp.tool()
def uart_run_suite(port: str, test_cases: List[Dict[str, str]]) -> Dict[str, Any]:
    """Run a suite of UART test cases. Each case: {send, expect}."""
    results = []
    for i, tc in enumerate(test_cases):
        uart_send(port, tc.get("send", ""))
        result = uart_expect(port, tc.get("expect", ""))
        results.append({
            "case": i,
            "send": tc.get("send", ""),
            "expect": tc.get("expect", ""),
            "match": result.get("match", False),
            "received": result.get("received", ""),
        })
    return {"tests": results, "passed": sum(1 for r in results if r["match"]), "total": len(results)}


@mcp.tool()
def uart_export_report(results: Dict[str, Any], path: str) -> str:
    """Export test results to JSON file."""
    with open(path, "w") as f:
        json.dump(results, f, indent=2)
    return f"Report saved to {path}"


if __name__ == "__main__":
    mcp.run()
```

## OpenCode Configuration Entry

Add to `opencode.json` in your project:

```json
"stm32-hardware": {
  "type": "local",
  "command": [
    "C:\\STM32-AI\\Tools\\stm32-hardware-mcp\\.venv\\Scripts\\python.exe",
    "C:\\STM32-AI\\Tools\\stm32-hardware-mcp\\server.py"
  ],
  "enabled": false,
  "timeout": 60000
}
```

Enable after testing the server independently.

## Example Test Suite

```json
[
  {"send": "STATUS", "expect": "OK"},
  {"send": "TEMP", "expect": "TEMP:"},
  {"send": "BUTTON", "expect": "BUTTON:"}
]
```
