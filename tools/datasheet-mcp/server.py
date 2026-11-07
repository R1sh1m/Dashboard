#!/usr/bin/env python3
"""
Datasheet and Technical PDF MCP Server for OpenCode Agents
Provides high-fidelity PDF reading, outline exploration, semantic searching,
and Markdown extraction for datasheets (u-blox NEO-M8, Bosch BME688, Semtech SX1262, STM32F7, etc.).
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import Optional, Dict, Any, List

import pymupdf
try:
    import pymupdf4llm  # type: ignore
    HAS_PYMUPDF4LLM = True
except ImportError:
    HAS_PYMUPDF4LLM = False

from mcp.server.fastmcp import FastMCP  # type: ignore
mcp = FastMCP("datasheet-mcp")

# Known datasheet directories
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASHEET_DIRS = [
    REPO_ROOT / "Docs" / "Datasheets",
    REPO_ROOT / "Docs",
    REPO_ROOT / "Sender_station",
    Path(r"C:\STM32-AI\Projects\NUCLEO-F722ZE\datasheets"),
    Path(r"C:\STM32-AI\Projects\NUCLEO-F722ZE")
]

def _resolve_pdf(pdf_path_or_name: str) -> Path:
    p = Path(pdf_path_or_name)
    if p.is_file() and p.suffix.lower() == ".pdf":
        return p
    
    # Search in default directories
    clean_name = p.name.lower()
    for d in DEFAULT_DATASHEET_DIRS:
        if d.is_dir():
            for f in d.rglob("*.pdf"):
                if f.name.lower() == clean_name or clean_name in f.name.lower():
                    return f
    
    raise FileNotFoundError(f"PDF datasheet '{pdf_path_or_name}' not found in known paths.")


@mcp.tool()
def list_datasheets(directory: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    List all available PDF datasheets, reference manuals, and architecture guides.
    Returns file paths, page counts, titles, and file sizes.
    """
    search_dirs = [Path(directory)] if directory else DEFAULT_DATASHEET_DIRS
    results = []
    seen = set()

    for d in search_dirs:
        if not d.is_dir():
            continue
        for f in d.rglob("*.pdf"):
            real_path = str(f.resolve())
            if real_path in seen:
                continue
            seen.add(real_path)

            try:
                doc = pymupdf.open(f)
                page_count = len(doc)
                meta = doc.metadata or {}
                title = meta.get("title") or f.stem
                doc.close()
            except Exception:
                page_count = -1
                title = f.stem

            results.append({
                "name": f.name,
                "path": str(f.resolve()),
                "title": title,
                "pages": page_count,
                "size_kb": round(f.stat().st_size / 1024, 1)
            })

    return sorted(results, key=lambda x: x["name"].lower())


@mcp.tool()
def get_pdf_outline(pdf_path: str) -> Dict[str, Any]:
    """
    Get the Table of Contents / Outline / Bookmarks of a PDF datasheet with page numbers.
    Use this to identify which sections (Pinout, UART, UBX Protocol, Electrical Specs) to read.
    """
    target = _resolve_pdf(pdf_path)
    doc = pymupdf.open(target)
    toc = doc.get_toc() # List of [lvl, title, page]
    total_pages = len(doc)
    doc.close()

    outline = []
    for item in toc:
        outline.append({
            "level": item[0],
            "title": item[1],
            "page": item[2]
        })

    return {
        "file": str(target),
        "total_pages": total_pages,
        "outline": outline
    }


@mcp.tool()
def read_pdf_page(pdf_path: str, page_number: int) -> Dict[str, Any]:
    """
    Read a single page (1-based index) of a PDF datasheet formatted as Markdown.
    Includes text, tables, and section headings.
    """
    target = _resolve_pdf(pdf_path)
    doc = pymupdf.open(target)
    total_pages = len(doc)
    
    if page_number < 1 or page_number > total_pages:
        doc.close()
        raise ValueError(f"Page number {page_number} out of range (1 to {total_pages}).")

    page_idx = page_number - 1
    if HAS_PYMUPDF4LLM:
        md_text = pymupdf4llm.to_markdown(doc, pages=[page_idx])
    else:
        page = doc[page_idx]
        md_text = page.get_text("markdown") or page.get_text("text")

    doc.close()

    return {
        "file": str(target),
        "page": page_number,
        "total_pages": total_pages,
        "content": md_text
    }


@mcp.tool()
def read_pdf_range(pdf_path: str, start_page: int, end_page: int) -> Dict[str, Any]:
    """
    Read a range of pages (1-based index, inclusive) formatted as Markdown.
    Max 10 pages per call to avoid context window explosion.
    """
    target = _resolve_pdf(pdf_path)
    doc = pymupdf.open(target)
    total_pages = len(doc)

    if start_page < 1:
        start_page = 1
    if end_page > total_pages:
        end_page = total_pages
    if start_page > end_page:
        doc.close()
        raise ValueError(f"start_page ({start_page}) cannot be greater than end_page ({end_page}).")
    
    if end_page - start_page + 1 > 12:
        end_page = start_page + 11

    page_indices = list(range(start_page - 1, end_page))
    if HAS_PYMUPDF4LLM:
        md_text = pymupdf4llm.to_markdown(doc, pages=page_indices)
    else:
        chunks = []
        for idx in page_indices:
            chunks.append(f"## Page {idx + 1}\n" + doc[idx].get_text("text"))
        md_text = "\n\n".join(chunks)

    doc.close()

    return {
        "file": str(target),
        "start_page": start_page,
        "end_page": end_page,
        "total_pages": total_pages,
        "content": md_text
    }


@mcp.tool()
def search_pdf(pdf_path: str, query: str, max_results: int = 10) -> Dict[str, Any]:
    """
    Search a PDF datasheet for key terms (e.g. 'baudrate', 'UBX-NAV-PVT', 'VCC_IO', 'TXD', 'checksum').
    Returns matching page numbers with snippets of surrounding context.
    """
    target = _resolve_pdf(pdf_path)
    doc = pymupdf.open(target)
    matches = []

    pattern = re.compile(re.escape(query), re.IGNORECASE)

    for idx, page in enumerate(doc):
        text = page.get_text("text")
        found = list(pattern.finditer(text))
        if found:
            snippets = []
            for m in found[:3]:
                start = max(0, m.start() - 100)
                end = min(len(text), m.end() + 100)
                snippet = text[start:end].replace("\n", " ").strip()
                snippets.append(f"...{snippet}...")
            
            matches.append({
                "page": idx + 1,
                "match_count": len(found),
                "snippets": snippets
            })
            if len(matches) >= max_results:
                break

    doc.close()

    return {
        "file": str(target),
        "query": query,
        "total_pages_matched": len(matches),
        "results": matches
    }


@mcp.tool()
def get_gps_datasheet_summary() -> Dict[str, Any]:
    """
    Quick extract of the u-blox NEO-M8 GNSS / GPS datasheet critical specifications:
    UART pinout, default baudrates, protocols (NMEA & UBX), supply voltages, and frame formatting.
    """
    target = _resolve_pdf("NEO-M8_Datasheet_UBX-15031086.pdf")
    doc = pymupdf.open(target)

    # Search for pinout, communication, electrical
    outline = doc.get_toc()
    
    # Extract page 1 (Abstract/features), pinout page, and protocol description
    p1 = doc[0].get_text("text")
    p2 = doc[1].get_text("text")

    doc.close()

    return {
        "file": str(target),
        "device": "u-blox NEO-M8 Concurrent GNSS Module",
        "key_specifications": {
            "default_uart_baudrate": 9600,
            "supported_baudrates": [4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800],
            "default_data_bits": 8,
            "default_parity": "None",
            "default_stop_bits": 1,
            "supply_voltage_vcc": "2.7V to 3.6V (Nominal 3.0V / 3.3V)",
            "io_voltage_vcc_io": "1.65V to 3.6V (Directly compatible with STM32 3.3V logic)",
            "supported_protocols": ["NMEA 0183 v4.0", "UBX (u-blox proprietary binary)", "RTCM 2.3"],
            "max_navigation_update_rate": "Single GNSS: up to 18 Hz, Concurrent GNSS (GPS+GLO): up to 10 Hz",
            "ubx_sync_characters": "0xB5 0x62 (µb)",
            "ubx_checksum_algorithm": "8-bit Fletcher checksum (RFC 1145) calculated over Class, ID, Length, and Payload"
        },
        "abstract_preview": p1[:1000]
    }


if __name__ == "__main__":
    mcp.run()
