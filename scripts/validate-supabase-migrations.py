#!/usr/bin/env python3
"""Static checks for Supabase SQL migrations; never connects to a database."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

MIGRATIONS = Path("supabase/migrations")
NAME_PATTERN = re.compile(r"^(?P<version>\\d+)_(?P<name>[a-z0-9_]+)\\.sql$")

def changed_migrations() -> list[Path]:
    event = os.getenv("EVENT_NAME", "")
    base = os.getenv("BASE_SHA", "")
    head = os.getenv("HEAD_SHA", "HEAD")
    if event == "workflow_dispatch" or not base or set(base) == {"0"}:
        return []
    revision = f"{base}...{head}" if event == "pull_request" else f"{base} {head}"
    result = subprocess.run(
        ["git", "diff", "--name-only", *revision.split()],
        check=True, capture_output=True, text=True,
    )
    return [
        Path(line) for line in result.stdout.splitlines()
        if line.startswith(f"{MIGRATIONS.as_posix()}/") and line.endswith(".sql")
    ]

def main() -> int:
    if not MIGRATIONS.is_dir():
        print(f"::error::{MIGRATIONS} directory does not exist")
        return 1
    all_files = sorted(MIGRATIONS.glob('*.sql'))
    errors: list[str] = []
    versions: dict[str, list[Path]] = defaultdict(list)
    for path in all_files:
        match = NAME_PATTERN.match(path.name)
        if not match:
            errors.append(f"Invalid migration filename: {path}")
            continue
        versions[match.group("version")].append(path)
        if not path.read_text(encoding="utf-8").strip():
            errors.append(f"Empty migration file: {path}")
    duplicates = {version: paths for version, paths in versions.items() if len(paths) > 1}
    for version, paths in sorted(duplicates.items()):
        print(f"::warning::Existing duplicate migration version {version}: {", ".join(map(str, paths))}")
    changed = changed_migrations()
    for path in changed:
        if not path.is_file():
            errors.append(f"Changed migration file is missing: {path}")
            continue
        match = NAME_PATTERN.match(path.name)
        if match and len(versions[match.group("version")]) > 1:
            errors.append(f"Changed migration {path} reuses version {match.group('version')}; choose a unique version.")
    if errors:
        for error in errors:
            print(f"::error::{error}")
        return 1
    print(f"Validated {len(all_files)} migration file(s); no database credentials were used.")
    if duplicates:
        print("Legacy duplicate versions remain; do not run supabase db push until production history is reconciled.")
    if not changed:
        print("No changed migration files detected (manual validation run).")
    return 0

if __name__ == "__main__":
    sys.exit(main())
