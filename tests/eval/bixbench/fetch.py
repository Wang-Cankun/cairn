#!/usr/bin/env python
"""BixBench data fetcher for the Cairn × BixBench eval harness (phase 02).

What this module is FOR
-----------------------
BixBench is treated as a *parts supplier*, not a runner (see
``docs/notes/bixbench-eval/01-design.md`` §2). This file owns exactly the
"download + unzip a capsule" job:

  1. load ``BixBench.jsonl`` (205 question rows / 59 capsules), re-downloading
     it from HuggingFace anonymously (``token=False``) if it is missing,
  2. list / look up questions by ``question_id`` or ``capsule_uuid``,
  3. given a capsule, ``hf_hub_download`` the matching
     ``CapsuleFolder-<uuid>.zip`` (anonymous) and unzip its CONTENTS into a
     target project dir, mirroring BixBench's own extraction (hoist the
     ``*Data*`` folder contents to the project root; by default strip the
     reference notebooks so the agent cannot read the solution),
  4. return a manifest:
     ``{question_id, question, ideal, eval_mode, capsule_uuid, data_files:[...]}``.

NOTHING in this file calls an LLM or scores anything — grading lives in
``judge.py``. Everything under ``/tmp`` (the dataset + capsule zips) is
out-of-tree and is never committed.

Interpreter contract: run with ``~/.claude/python/bin/python`` (has
``pandas``/``scipy``/``numpy`` and ``huggingface_hub``).

CLI
---
    ~/.claude/python/bin/python tests/eval/bixbench/fetch.py list [--n N]
    ~/.claude/python/bin/python tests/eval/bixbench/fetch.py show <question_id>
    ~/.claude/python/bin/python tests/eval/bixbench/fetch.py fetch <question_id> <target_dir> \
        [--keep-notebooks]

With no subcommand it prints 3 sample question summaries (the phase-02 verify).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------
# Constants — verified facts from phase 01 (see 01-design.md §4).
# --------------------------------------------------------------------------

HF_REPO_ID = "futurehouse/BixBench"          # HuggingFace dataset repo
HF_REPO_TYPE = "dataset"                       # repo_type for hf_hub_download
DATASET_FILENAME = "BixBench.jsonl"            # 205 question rows

# Default out-of-tree location for the dataset + capsule zips. /tmp is NEVER
# committed; the harness reads it by absolute path.
DEFAULT_DATA_DIR = Path("/private/tmp/bixbench-data")


# --------------------------------------------------------------------------
# Dataset loading
# --------------------------------------------------------------------------


def _download_dataset_jsonl(data_dir: Path) -> Path:
    """Anonymously download BixBench.jsonl from HuggingFace into ``data_dir``.

    Uses ``token=False`` (anonymous download works — verified phase 00).
    Returns the local path to the downloaded jsonl.
    """
    from huggingface_hub import hf_hub_download  # local import: optional dep

    data_dir.mkdir(parents=True, exist_ok=True)
    local = hf_hub_download(
        repo_id=HF_REPO_ID,
        filename=DATASET_FILENAME,
        repo_type=HF_REPO_TYPE,
        local_dir=str(data_dir),
        token=False,
    )
    return Path(local)


def load_questions(
    jsonl_path: str | Path | None = None,
    data_dir: str | Path = DEFAULT_DATA_DIR,
) -> list[dict[str, Any]]:
    """Load the BixBench question rows.

    Resolution order for the jsonl:
      1. explicit ``jsonl_path`` if given and it exists,
      2. ``<data_dir>/BixBench.jsonl`` if it exists,
      3. otherwise re-download anonymously from HuggingFace into ``data_dir``.

    Returns a list of dicts, one per question row (205 rows expected).
    """
    data_dir = Path(data_dir)

    candidates: list[Path] = []
    if jsonl_path is not None:
        candidates.append(Path(jsonl_path))
    candidates.append(data_dir / DATASET_FILENAME)

    path: Path | None = next((p for p in candidates if p.exists()), None)
    if path is None:
        path = _download_dataset_jsonl(data_dir)

    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def list_questions(
    rows: list[dict[str, Any]] | None = None,
    **load_kwargs: Any,
) -> list[dict[str, Any]]:
    """Return compact summaries for every question row.

    Each summary: ``{question_id, capsule_uuid, eval_mode, ideal, question}``.
    """
    if rows is None:
        rows = load_questions(**load_kwargs)
    return [
        {
            "question_id": r.get("question_id"),
            "capsule_uuid": r.get("capsule_uuid"),
            "eval_mode": r.get("eval_mode"),
            "ideal": r.get("ideal"),
            "question": r.get("question"),
        }
        for r in rows
    ]


def get_question(
    question_id: str,
    rows: list[dict[str, Any]] | None = None,
    **load_kwargs: Any,
) -> dict[str, Any]:
    """Return the full row for a given ``question_id`` (e.g. ``bix-1-q1``)."""
    if rows is None:
        rows = load_questions(**load_kwargs)
    for r in rows:
        if r.get("question_id") == question_id:
            return r
    raise KeyError(f"question_id not found: {question_id!r}")


# --------------------------------------------------------------------------
# Capsule download + unzip
# --------------------------------------------------------------------------


def _download_capsule_zip(zip_filename: str, data_dir: Path) -> Path:
    """Anonymously download ``CapsuleFolder-<uuid>.zip`` from HuggingFace.

    Mirrors BixBench's own call (generate_trajectories.py): same repo,
    ``repo_type='dataset'``, but with ``token=False`` for anonymous access.
    Returns the local path to the zip. If already present, returns it as-is.
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    local_zip = data_dir / zip_filename
    if local_zip.exists() and local_zip.stat().st_size > 0:
        return local_zip

    from huggingface_hub import hf_hub_download  # local import: optional dep

    downloaded = hf_hub_download(
        repo_id=HF_REPO_ID,
        filename=zip_filename,
        repo_type=HF_REPO_TYPE,
        local_dir=str(data_dir),
        token=False,
    )
    return Path(downloaded)


def _hoist_data_and_strip_notebooks(
    extract_dir: Path, keep_notebooks: bool = False
) -> None:
    """Normalize an extracted capsule to BixBench's on-disk layout.

    BixBench (generate_trajectories.py::_extract_and_process_files) does:
      - move the contents of the ``*Data*`` subfolder up to the capsule root,
      - delete the ``*Notebook*`` folder and any ``*.ipynb`` (so the agent
        cannot read the reference solution / cheat),
    We reproduce that. Notebook stripping is the default; pass
    ``keep_notebooks=True`` to retain them for debugging only.
    """
    # Hoist contents of the first dir whose name contains "Data" to the root.
    data_folder = next(
        (p for p in extract_dir.rglob("*") if p.is_dir() and "Data" in p.name),
        None,
    )
    if data_folder is not None and data_folder != extract_dir:
        for item in list(data_folder.iterdir()):
            dest = extract_dir / item.name
            if dest.exists():
                # Avoid clobbering an existing root entry.
                continue
            shutil.move(str(item), str(dest))
        shutil.rmtree(data_folder, ignore_errors=True)

    if keep_notebooks:
        return

    # Strip reference notebooks (anti-cheat parity with BixBench).
    for nb_dir in [
        p for p in extract_dir.rglob("*") if p.is_dir() and "Notebook" in p.name
    ]:
        shutil.rmtree(nb_dir, ignore_errors=True)
    for ipynb in extract_dir.rglob("*.ipynb"):
        try:
            ipynb.unlink()
        except FileNotFoundError:
            pass


def fetch_capsule(
    question_id: str,
    target_dir: str | Path,
    *,
    rows: list[dict[str, Any]] | None = None,
    data_dir: str | Path = DEFAULT_DATA_DIR,
    keep_notebooks: bool = False,
    clean_target: bool = True,
    **load_kwargs: Any,
) -> dict[str, Any]:
    """Download + unzip a capsule for ``question_id`` into ``target_dir``.

    The capsule's data files are placed at the ROOT of ``target_dir`` (the
    env contract: the agent's cwd == the project dir with capsule data at the
    top level). Reference notebooks are stripped by default (anti-cheat).

    Returns a manifest:
        {
          "question_id": str,
          "question": str,          # task text handed to the agent
          "ideal": str,             # THE TARGET ANSWER (judge target)
          "eval_mode": str,         # str_verifier | range_verifier | llm_verifier
          "capsule_uuid": str,
          "data_folder": str,       # CapsuleFolder-<uuid>.zip
          "target_dir": str,        # absolute path the data landed in
          "data_files": [str, ...], # paths relative to target_dir
        }
    """
    data_dir = Path(data_dir)
    target_dir = Path(target_dir)

    row = get_question(question_id, rows=rows, data_dir=data_dir, **load_kwargs)
    zip_filename = row["data_folder"]  # e.g. CapsuleFolder-<uuid>.zip

    # Clean / create the target project dir.
    if clean_target and target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Download (cached) + extract directly into target_dir, then normalize.
    local_zip = _download_capsule_zip(zip_filename, data_dir)
    with zipfile.ZipFile(local_zip) as zf:
        zf.extractall(target_dir)
    _hoist_data_and_strip_notebooks(target_dir, keep_notebooks=keep_notebooks)

    data_files = sorted(
        str(p.relative_to(target_dir))
        for p in target_dir.rglob("*")
        if p.is_file()
    )

    return {
        "question_id": row.get("question_id"),
        "question": row.get("question"),
        "ideal": row.get("ideal"),
        "eval_mode": row.get("eval_mode"),
        "capsule_uuid": row.get("capsule_uuid"),
        "data_folder": zip_filename,
        "target_dir": str(target_dir.resolve()),
        "data_files": data_files,
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _fmt_summary(s: dict[str, Any]) -> str:
    q = (s.get("question") or "").replace("\n", " ").strip()
    if len(q) > 160:
        q = q[:157] + "..."
    return (
        f"[{s.get('question_id')}] capsule={s.get('capsule_uuid')} "
        f"eval_mode={s.get('eval_mode')}\n"
        f"  ideal:    {s.get('ideal')!r}\n"
        f"  question: {q}"
    )


def _cmd_list(args: argparse.Namespace) -> int:
    summaries = list_questions(jsonl_path=args.jsonl, data_dir=args.data_dir)
    n = args.n if args.n and args.n > 0 else len(summaries)
    print(f"Loaded {len(summaries)} questions; showing {min(n, len(summaries))}:\n")
    for s in summaries[:n]:
        print(_fmt_summary(s))
        print()
    return 0


def _cmd_show(args: argparse.Namespace) -> int:
    row = get_question(args.question_id, jsonl_path=args.jsonl, data_dir=args.data_dir)
    print(json.dumps(row, indent=2, ensure_ascii=False))
    return 0


def _cmd_fetch(args: argparse.Namespace) -> int:
    manifest = fetch_capsule(
        args.question_id,
        args.target_dir,
        data_dir=args.data_dir,
        jsonl_path=args.jsonl,
        keep_notebooks=args.keep_notebooks,
    )
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 0


def _cmd_default(args: argparse.Namespace) -> int:
    """Default action == phase-02 verify: print 3 sample question summaries."""
    summaries = list_questions(jsonl_path=args.jsonl, data_dir=args.data_dir)
    print(f"Loaded {len(summaries)} BixBench questions.\n")
    print("First 3 question summaries:\n")
    for s in summaries[:3]:
        print(_fmt_summary(s))
        print()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="BixBench data fetcher (Cairn eval).")
    parser.add_argument(
        "--jsonl",
        default=None,
        help="explicit path to BixBench.jsonl (default: <data-dir>/BixBench.jsonl)",
    )
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help=f"out-of-tree data dir (default: {DEFAULT_DATA_DIR})",
    )
    sub = parser.add_subparsers(dest="cmd")

    p_list = sub.add_parser("list", help="list question summaries")
    p_list.add_argument("--n", type=int, default=0, help="show first N (0 = all)")

    p_show = sub.add_parser("show", help="dump one full question row as JSON")
    p_show.add_argument("question_id")

    p_fetch = sub.add_parser("fetch", help="download+unzip a capsule into target dir")
    p_fetch.add_argument("question_id")
    p_fetch.add_argument("target_dir")
    p_fetch.add_argument(
        "--keep-notebooks",
        action="store_true",
        help="keep reference notebooks (debug only; default strips them)",
    )

    args = parser.parse_args(argv)

    if args.cmd == "list":
        return _cmd_list(args)
    if args.cmd == "show":
        return _cmd_show(args)
    if args.cmd == "fetch":
        return _cmd_fetch(args)
    return _cmd_default(args)


if __name__ == "__main__":
    raise SystemExit(main())
