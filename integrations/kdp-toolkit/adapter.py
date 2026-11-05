#!/usr/bin/env python3
"""Adapt a KDP Toolkit text project into BookNexa's portable KDP package.

This wrapper invokes the separately installed upstream `kdp` CLI; it does not
copy or vendor upstream implementation code.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
UPSTREAM_URL = "https://github.com/devanasolver/kdp-toolkit"
UPSTREAM_LICENSE = "MIT"
ALLOWED_TRIMS = {"5x8", "5.06x7.81", "5.25x8", "5.5x8.5", "6x9", "6.14x9.21", "6.69x9.61", "7x10", "7.5x9.25", "8x10", "8.5x11"}
ALLOWED_INK_PAPER = {"bw-white", "bw-cream", "standard-color", "premium-color"}


def safe_package_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    p = PurePosixPath(normalized)
    if not normalized or normalized.startswith("/") or ":" in p.parts[0] or any(part in ("", ".", "..") for part in p.parts):
        raise ValueError(f"unsafe package-relative path: {value!r}")
    return normalized


def normalize_metadata(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("metadata.json must be a JSON object")
    title = raw.get("title")
    author = raw.get("author")
    description = raw.get("description")
    if not all(isinstance(v, str) and v.strip() for v in (title, author, description)):
        raise ValueError("metadata.json must include non-empty title, author, and description")
    keywords = raw.get("keywords", [])
    categories = raw.get("categories", [])
    if not isinstance(keywords, list) or not all(isinstance(v, str) for v in keywords):
        raise ValueError("metadata.json keywords must be an array of strings")
    if not isinstance(categories, list) or not all(isinstance(v, str) for v in categories):
        raise ValueError("metadata.json categories must be an array of strings")
    # Preserve upstream and author-defined metadata, normalizing common field names only.
    normalized = dict(raw)
    normalized["title"] = title.strip()
    normalized["author"] = author.strip()
    normalized["description"] = description.strip()
    normalized["keywords"] = [v.strip() for v in keywords if v.strip()]
    normalized["categories"] = [v.strip() for v in categories if v.strip()]
    normalized["publication_format"] = "paperback"
    return normalized


def make_manifest(metadata: dict[str, Any], version: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "format": "paperback",
        "metadata": "metadata.json",
        "assets": {"manuscript": "interior.pdf", "cover": "cover.pdf"},
        "source": {
            "adapter": "kdp-toolkit",
            "version": version,
            "license": UPSTREAM_LICENSE,
            "sourceUrl": UPSTREAM_URL,
        },
        "validation": {
            "status": "passed",
            "validator": "KDP Toolkit CLI + BookNexa local package preflight",
            "validatedAt": datetime.now(timezone.utc).isoformat(),
            "warnings": ["Human review in KDP Previewer is still required."],
        },
    }


def run(command: list[str], *, cwd: Path, capture: bool = False) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(command, cwd=cwd, text=True, capture_output=capture, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Could not run {command[0]!r}. Install KDP Toolkit and ensure its `kdp` command is on PATH.") from exc
    if result.returncode != 0:
        detail = (result.stdout or "") + (result.stderr or "")
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}\n{detail.strip()}")
    return result


def toolkit_version() -> str:
    try:
        import kdp_toolkit  # type: ignore[import-not-found]
        version = getattr(kdp_toolkit, "__version__", None)
        if isinstance(version, str) and version:
            return version
    except ImportError:
        pass
    result = run(["kdp", "--version"], cwd=REPO_ROOT, capture=True)
    return (result.stdout or result.stderr).strip().split()[-1]


def build_package(project: Path, output: Path, trim: str, ink_paper: str, bleed: bool, kdp_command: str) -> dict[str, Any]:
    project = project.resolve()
    metadata_path = project / "metadata.json"
    manuscript_path = project / "manuscript.md"
    if not project.is_dir():
        raise ValueError(f"project directory does not exist: {project}")
    if not metadata_path.is_file() or not manuscript_path.is_file():
        raise ValueError("project must contain manuscript.md and metadata.json (KDP Toolkit project layout)")
    raw_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata = normalize_metadata(raw_metadata)
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="booknexa-kdp-toolkit-") as temp_name:
        work = Path(temp_name)
        interior = work / "interior.pdf"
        cover = work / "cover.pdf"
        common = ["--trim", trim, "--ink-paper", ink_paper]
        interior_cmd = [kdp_command, "interior", str(manuscript_path), "--title", metadata["title"], "--author", metadata["author"], *common, "--output", str(interior)]
        if bleed:
            interior_cmd.append("--bleed")
        run(interior_cmd, cwd=project, capture=True)
        validation_cmd = [kdp_command, "validate", str(interior), *common, "--json"]
        if bleed:
            validation_cmd.append("--bleed")
        interior_report = json.loads(run(validation_cmd, cwd=project, capture=True).stdout)
        if not interior_report.get("ok"):
            raise RuntimeError(f"KDP Toolkit rejected the interior: {json.dumps(interior_report.get('errors', []))}")
        pages = interior_report.get("pages")
        if not isinstance(pages, int) or pages <= 0:
            raise RuntimeError("KDP Toolkit validation did not report a positive interior page count")

        cover_cmd = [kdp_command, "cover", "--title", metadata["title"], "--author", metadata["author"], "--pages", str(pages), *common, "--output", str(cover)]
        run(cover_cmd, cwd=project, capture=True)
        cover_report = json.loads(run([kdp_command, "validate", str(cover), "--cover", "--pages", str(pages), *common, "--json"], cwd=project, capture=True).stdout)
        if not cover_report.get("ok"):
            raise RuntimeError(f"KDP Toolkit rejected the cover: {json.dumps(cover_report.get('errors', []))}")

        manifest = make_manifest(metadata, toolkit_version())
        safe_package_path(manifest["metadata"])
        safe_package_path(manifest["assets"]["manuscript"])
        safe_package_path(manifest["assets"]["cover"])
        staging = output.with_name(f".{output.name}.{os.getpid()}.tmp")
        try:
            with zipfile.ZipFile(staging, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
                archive.writestr("booknexa-kdp.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
                archive.write(interior, "interior.pdf")
                archive.write(cover, "cover.pdf")
                archive.writestr("validation/kdp-toolkit-interior.json", json.dumps(interior_report, indent=2) + "\n")
                archive.writestr("validation/kdp-toolkit-cover.json", json.dumps(cover_report, indent=2) + "\n")
            staging.replace(output)
        finally:
            staging.unlink(missing_ok=True)

    return {"output": output, "manifest": manifest, "pages": pages}


def main() -> int:
    parser = argparse.ArgumentParser(description="Adapt a KDP Toolkit text project into a validated BookNexa KDP package.")
    parser.add_argument("--project", required=True, type=Path, help="KDP Toolkit project folder with manuscript.md and metadata.json")
    parser.add_argument("--output", required=True, type=Path, help="Output package ZIP path")
    parser.add_argument("--trim", default="6x9", choices=sorted(ALLOWED_TRIMS))
    parser.add_argument("--ink-paper", default="bw-white", choices=sorted(ALLOWED_INK_PAPER))
    parser.add_argument("--bleed", action="store_true")
    parser.add_argument("--kdp-command", default="kdp", help="KDP Toolkit CLI executable")
    parser.add_argument("--handoff", action="store_true", help="After package validation, open the local KDP browser workflow")
    parser.add_argument("--account", help="Local KDP profile label; required with --handoff")
    args = parser.parse_args()
    if args.handoff and not args.account:
        parser.error("--handoff requires --account <local profile label>")
    try:
        result = build_package(args.project, args.output, args.trim, args.ink_paper, args.bleed, args.kdp_command)
        print(f"Created KDP package: {result['output']} ({result['pages']} pages)")
        print(f"Source adapter: {result['manifest']['source']['adapter']} {result['manifest']['source']['version']}")
        # Exercise the exact BookNexa package reader before allowing browser handoff.
        local_cli = ["npm", "run", "kdp:local", "--", "--package", str(result["output"]), "--check"]
        run(local_cli, cwd=REPO_ROOT)
        if args.handoff:
            run(["npm", "run", "kdp:local", "--", "--package", str(result["output"]), "--open", "--account", args.account], cwd=REPO_ROOT)
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"KDP Toolkit adapter failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
