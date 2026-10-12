#!/usr/bin/env python3
"""Prepare and recover an independently verified Daily Brief editorial handoff.

This does not push or publish anything. A bundle is a portable recovery copy for
the already-researched three-file candidate, not a replacement for promotion.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_SIZE = 64 * 1024 * 1024
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def file_names(date):
    if not DATE_RE.fullmatch(date):
        raise ValueError("date must be YYYY-MM-DD")
    if datetime.strptime(date, "%Y-%m-%d").strftime("%Y-%m-%d") != date:
        raise ValueError("invalid calendar date")
    return ("data/latest.json", f"data/archive/{date}.json", f"data/research/{date}.json")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def validate_payload(date, payload):
    latest, archive, research = file_names(date)
    if set(payload) != {latest, archive, research}:
        raise ValueError("bundle must contain exactly the three dated editorial files")
    if payload[latest] != payload[archive]:
        raise ValueError("latest and dated archive are not byte-identical")
    for filename, contents in payload.items():
        if len(contents) > MAX_FILE_SIZE:
            raise ValueError(f"oversized file: {filename}")
        document = json.loads(contents.decode("utf-8"))
        if not isinstance(document, dict) or document.get("date") != date:
            raise ValueError(f"wrong snapshot date: {filename}")


def validate_editorial_audit(date, payload, baseline):
    """Use the exact validators used by the live staging promotion gate."""
    with tempfile.TemporaryDirectory(prefix="daily-brief-validate-") as work:
        root = Path(work)
        for name, data in payload.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        latest, _, research = file_names(date)
        for arguments in (
            [sys.executable, str(ROOT / "scripts/validate_data.py"), str(root / latest)],
            [sys.executable, str(ROOT / "scripts/validate_research_audit.py"), str(root / research), str(root / latest), str(baseline)],
        ):
            subprocess.run(arguments, cwd=ROOT, check=True)


def read_bundle(bundle):
    with ZipFile(bundle) as zipped:
        names = zipped.namelist()
        if len(names) != 4 or len(set(names)) != 4 or "receipt.json" not in names:
            raise ValueError("unexpected or duplicate files in bundle")
        if any(info.file_size > MAX_FILE_SIZE for info in zipped.infolist()):
            raise ValueError("oversized bundle entry")
        receipt = json.loads(zipped.read("receipt.json"))
        if receipt.get("format") != "daily-brief-editorial-bundle-v1":
            raise ValueError("unsupported bundle format")
        date = receipt.get("date")
        if not isinstance(date, str):
            raise ValueError("bundle receipt has no valid date")
        expected = file_names(date)
        if set(names) != set(expected) | {"receipt.json"}:
            raise ValueError("unexpected bundle path")
        payload = {name: zipped.read(name) for name in expected}
    validate_payload(date, payload)
    hashes = {name: sha256(contents) for name, contents in payload.items()}
    if receipt.get("sha256") != hashes:
        raise ValueError("publication bundle checksum mismatch")
    return receipt, payload


def pack(args):
    latest, archive, research = file_names(args.date)
    payload = {
        latest: Path(args.latest).read_bytes(),
        archive: Path(args.archive).read_bytes(),
        research: Path(args.research).read_bytes(),
    }
    validate_payload(args.date, payload)
    validate_editorial_audit(args.date, payload, Path(args.baseline).resolve())
    receipt = {
        "format": "daily-brief-editorial-bundle-v1",
        "date": args.date,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sha256": {name: sha256(contents) for name, contents in payload.items()},
    }
    destination = Path(args.out).resolve()
    if destination.exists():
        raise FileExistsError(f"will not overwrite an existing recovery bundle: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".daily-brief-", suffix=".zip", dir=destination.parent, delete=False) as stream:
            temporary = Path(stream.name)
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as zipped:
            for name, contents in payload.items():
                zipped.writestr(name, contents)
            zipped.writestr("receipt.json", json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        read_bundle(temporary)
        # Both paths share a filesystem. The link makes the complete verified
        # archive visible atomically, without overwriting a prior receipt.
        os.link(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    print(f"VERIFIED BUNDLE: {destination}")
    print("Retain a second copy in persistent storage before starting the GitHub handoff.")


def inspect(args):
    receipt, payload = read_bundle(args.bundle)
    if args.date and receipt["date"] != args.date:
        raise ValueError("bundle date does not match expected date")
    if args.baseline:
        validate_editorial_audit(receipt["date"], payload, Path(args.baseline).resolve())
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    print("CHECKSUMS OK" + ("; EDITORIAL AUDIT OK" if args.baseline else "; audit not rerun"))


def unpack(args):
    receipt, payload = read_bundle(args.bundle)
    if receipt["date"] != args.date:
        raise ValueError("bundle date does not match expected date")
    validate_editorial_audit(args.date, payload, Path(args.baseline).resolve())
    destination = Path(args.into).resolve()
    if destination.exists():
        raise FileExistsError(f"recovery destination must be new and empty: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Expose the recovered tree only when all files have been written. A failed
    # restore must not leave a plausible but incomplete candidate directory.
    with tempfile.TemporaryDirectory(prefix=".daily-brief-restore-", dir=destination.parent) as work:
        temporary = Path(work)
        for name, contents in payload.items():
            path = temporary / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)
        (temporary / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if destination.exists():
            raise FileExistsError(f"recovery destination appeared during restore: {destination}")
        temporary.rename(destination)
    print(f"RESTORED VALIDATED CANDIDATE: {destination}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("pack")
    for flag in ("date", "latest", "archive", "research", "baseline", "out"):
        prepare.add_argument(f"--{flag}", required=True)
    prepare.set_defaults(func=pack)
    check = commands.add_parser("inspect")
    check.add_argument("--bundle", required=True)
    check.add_argument("--date")
    check.add_argument("--baseline", help="rerun live research audit against this baseline")
    check.set_defaults(func=inspect)
    restore = commands.add_parser("unpack")
    for flag in ("bundle", "date", "baseline", "into"):
        restore.add_argument(f"--{flag}", required=True)
    restore.set_defaults(func=unpack)
    arguments = parser.parse_args()
    try:
        arguments.func(arguments)
    except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")


if __name__ == "__main__":
    main()
