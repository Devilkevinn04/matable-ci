#!/usr/bin/env python3
import argparse
import os
from datetime import datetime
from pathlib import Path
import subprocess
import sys
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
ALLOWED_ENV_TEMPLATES = {".env.example", ".env.production.example"}


def should_exclude(path: str) -> bool:
    parts = Path(path).parts
    if not parts or parts[0] in {".git", "archives"}:
        return True
    if any(part in {"node_modules", "dist", "build"} for part in parts):
        return True
    if parts[0] == "data" and len(parts) > 1:
        name = parts[-1].lower()
        if name.endswith((".db", ".db-wal", ".db-shm", ".db-journal", ".sqlite", ".sqlite3", ".sqlite-wal", ".sqlite-shm", ".sqlite-journal")):
            return True
    if len(parts) == 1 and parts[0].startswith(".env") and parts[0] not in ALLOWED_ENV_TEMPLATES:
        return True
    return False


def tracked_and_unignored_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    return sorted(
        path
        for path in (os.fsdecode(item) for item in result.stdout.split(b"\0") if item)
        if not should_exclude(path) and (ROOT / path).is_file()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a source ZIP without secrets or generated data.")
    parser.add_argument("--output", type=Path, help="ZIP path (default: archives/matable-ci-<timestamp>.zip)")
    parser.add_argument("--dry-run", action="store_true", help="List the source files without creating an archive.")
    args = parser.parse_args()

    try:
        files = tracked_and_unignored_files()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Unable to list repository files: {error}", file=sys.stderr)
        return 1

    if args.dry_run:
        print("\n".join(files))
        return 0

    output = args.output or Path("archives") / f"matable-ci-{datetime.now().astimezone():%Y%m%d-%H%M%S}.zip"
    if not output.is_absolute():
        output = ROOT / output
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        relative_output = output.relative_to(ROOT).as_posix()
        if not should_exclude(relative_output):
            print("Archive output must be inside an excluded folder or outside the repository.", file=sys.stderr)
            return 2

    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
            for file in files:
                archive.write(ROOT / file, file)
    except OSError as error:
        print(f"Unable to create archive at {output}: {error}", file=sys.stderr)
        return 1

    print(f"Created {output} with {len(files)} source files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
