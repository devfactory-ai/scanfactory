"""Format conversion utilities."""

import json
from typing import Any, Dict, List, Optional

from core.ocr_strategy import OCRResult


def convert_to_markdown(
    result: OCRResult,
    include_metadata: bool = False,
    include_confidence: bool = False,
) -> str:
    """
    Convert OCR result to Markdown format.

    Args:
        result: OCR result to convert
        include_metadata: Include metadata header
        include_confidence: Include confidence scores

    Returns:
        Markdown formatted string
    """
    lines = []

    # Metadata header
    if include_metadata and result.metadata:
        lines.append("---")
        lines.append("# Document Metadata")
        for key, value in result.metadata.items():
            lines.append(f"- **{key}**: {value}")
        if include_confidence:
            lines.append(f"- **confidence**: {result.confidence:.2%}")
        lines.append("---")
        lines.append("")

    # Main content
    if result.layout and result.layout.get("structured_text"):
        lines.append(result.layout["structured_text"])
    else:
        lines.append(result.text)

    return "\n".join(lines)


def convert_to_json(
    result: OCRResult,
    indent: int = 2,
    include_blocks: bool = True,
) -> str:
    """
    Convert OCR result to JSON format.

    Args:
        result: OCR result to convert
        indent: JSON indentation
        include_blocks: Include detailed blocks

    Returns:
        JSON formatted string
    """
    data = result.to_json()

    if not include_blocks:
        data.pop("blocks", None)

    return json.dumps(data, indent=indent, ensure_ascii=False)


def convert_blocks_to_table(blocks: List[Dict[str, Any]]) -> str:
    """
    Convert text blocks to Markdown table.

    Args:
        blocks: List of text blocks

    Returns:
        Markdown table string
    """
    if not blocks:
        return ""

    lines = [
        "| Text | Confidence | Position |",
        "|------|------------|----------|",
    ]

    for block in blocks:
        text = block.get("text", "")[:50]  # Truncate long text
        conf = block.get("confidence", 0)
        bbox = block.get("bbox", {})
        pos = f"({bbox.get('x1', 0)}, {bbox.get('y1', 0)})" if bbox else "N/A"

        lines.append(f"| {text} | {conf:.2%} | {pos} |")

    return "\n".join(lines)


def merge_results(results: List[OCRResult]) -> OCRResult:
    """
    Merge multiple OCR results into one.

    Args:
        results: List of OCR results to merge

    Returns:
        Merged OCR result
    """
    if not results:
        return OCRResult(text="", confidence=0.0)

    if len(results) == 1:
        return results[0]

    # Merge text
    texts = [r.text for r in results if r.text]
    merged_text = "\n\n---\n\n".join(texts)

    # Merge blocks
    all_blocks = []
    for i, result in enumerate(results):
        for block in result.blocks:
            block["page"] = i + 1
            all_blocks.append(block)

    # Average confidence
    confidences = [r.confidence for r in results if r.confidence > 0]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    # Merge metadata
    merged_metadata = {
        "page_count": len(results),
        "engines": list(set(r.metadata.get("engine", "unknown") for r in results if r.metadata)),
    }

    return OCRResult(
        text=merged_text,
        confidence=avg_confidence,
        blocks=all_blocks,
        layout={"merged": True, "page_count": len(results)},
        metadata=merged_metadata,
    )


def extract_tables(result: OCRResult) -> List[Dict[str, Any]]:
    """
    Extract table structures from OCR result.

    Args:
        result: OCR result

    Returns:
        List of detected tables
    """
    tables = []

    if result.layout and "tables" in result.layout:
        return result.layout["tables"]

    # Try to detect tables from blocks
    # This is a simple heuristic - could be improved with ML
    if result.blocks:
        # Group blocks by y-coordinate to find rows
        rows: Dict[int, List[Dict]] = {}
        for block in result.blocks:
            if "bbox" in block:
                y = block["bbox"].get("y1", 0)
                y_key = int(y / 30) * 30  # 30px tolerance
                if y_key not in rows:
                    rows[y_key] = []
                rows[y_key].append(block)

        # Check if we have table-like structure (multiple columns per row)
        potential_table_rows = []
        for y_key in sorted(rows.keys()):
            row_blocks = sorted(rows[y_key], key=lambda b: b["bbox"].get("x1", 0))
            if len(row_blocks) >= 2:  # At least 2 columns
                potential_table_rows.append([b["text"] for b in row_blocks])

        if len(potential_table_rows) >= 2:
            tables.append(
                {
                    "rows": potential_table_rows,
                    "row_count": len(potential_table_rows),
                    "col_count": max(len(row) for row in potential_table_rows),
                }
            )

    return tables
