#!/usr/bin/env python
"""Faithful reimplementation of the BixBench open-answer grader (phase 02).

Scope
-----
This is metric #1 of the Cairn × BixBench eval (see
``docs/notes/bixbench-eval/01-design.md`` §5): score a *predicted answer*
string against the curated *target* (``ideal``) using BixBench's own judge,
so accuracy is measured with ZERO scar annotation.

It re-implements the grading logic of
``/private/tmp/bixbench-src/bixbench/graders.py`` for the OPEN-ANSWER track
(``GradeAnswer(answer_mode=openanswer)`` → ``OpenEndedGrader``), dropping the
``litellm``/``aviary`` dependency in favor of a PLUGGABLE LLM callable.

Per eval_mode (matching the source open-answer path):
  * ``str_verifier``  — cleaned EXACT match, then cleaned PARTIAL (substring)
    match, then LLM fallback via ``OPEN_ENDED_GRADING_PROMPT``. (Source:
    ``_grade_str_verifier`` with ``partial_match=True, llm_match=True``, which
    are the ``OpenEndedGrader.grade`` defaults.)
  * ``range_verifier`` — deterministic numeric check: target is ``(lower,upper)``;
    correct iff ``lower <= float(predicted) <= upper``. (Source:
    ``_grade_range_verifier``; the design anchors range on this pure-numeric
    test — no LLM needed.) Falls back to ``refused`` if the prediction is not
    numeric / not comparable.
  * ``llm_verifier`` (and any unknown mode) — fill ``OPEN_ENDED_GRADING_PROMPT``
    and parse ``<grade>``. (Source: ``_grade_llm_verifier``.)

Grade parsing matches the source byte-for-byte:
    re.search(r"<grade>\\s*(.*?)\\s*</grade>", response, re.DOTALL)
NOTE one deliberate fidelity choice below re. ``refused`` — see ``_parse_grade``.

LLM pluggability
----------------
``grade(...)`` takes an optional ``llm`` callable ``(prompt: str) -> str``.
If not given, a default is built from the environment:
  * ``OPENAI_BASE_URL`` / ``OPENAI_API_KEY`` (and optional
    ``CAIRN_JUDGE_MODEL``), or the ``CAIRN_JUDGE_*`` equivalents
    (``CAIRN_JUDGE_BASE_URL`` / ``CAIRN_JUDGE_API_KEY`` / ``CAIRN_JUDGE_MODEL``),
    calling an OpenAI-compatible ``/chat/completions`` endpoint.
If NOTHING is configured, the judge does NOT crash: any path that would need
the LLM returns ``verdict="NO_JUDGE_LLM_CONFIGURED"`` with ``grade=0`` and a
clear ``raw``. The workflow can then route grading to an LLM-judge agent
instead. The deterministic paths (str exact/partial, range numeric) still work
fully offline.

Interpreter contract: ``~/.claude/python/bin/python``.
"""

from __future__ import annotations

import ast
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Callable, Optional

# --------------------------------------------------------------------------
# The judge prompt — VERBATIM from
# /private/tmp/bixbench-src/bixbench/prompts.py (OPEN_ENDED_GRADING_PROMPT).
# Verified byte-identical in phase 01 (01-design.md §6). Do not reword.
# --------------------------------------------------------------------------

OPEN_ENDED_GRADING_PROMPT = """You are given a question, target answer and a predicted answer. Your task is to compare the target answer with the predicted and assess if the predicted answer is correct, incorrect or it refused to answer.
Question: {question}
Target Answer: {target}
Predicted Answer: {predicted}

Important: You must only output one from `correct`, `incorrect` or `refused` between <grade> tags.
Example Output: <grade> correct </grade>
"""  # noqa: E501

# Sentinel returned when an LLM grade is required but no LLM is configured.
NO_JUDGE_LLM = "NO_JUDGE_LLM_CONFIGURED"


# --------------------------------------------------------------------------
# Grade-response parsing (mirrors graders.py::_parse_grade_response)
# --------------------------------------------------------------------------


def _parse_grade(response: str) -> str:
    """Parse ``correct|incorrect|refused`` from an LLM grade response.

    Regex is byte-identical to the source. The source's
    ``_parse_grade_response`` collapses everything that is not exactly
    ``correct`` into ``incorrect`` (it never returns ``refused``). We preserve
    a ``refused`` reading here (the prompt explicitly allows ``refused``, and
    the design's verdict vocabulary includes it) while keeping the source's
    correct/incorrect outcome semantics: only ``correct`` scores grade=1.
    """
    match = re.search(r"<grade>\s*(.*?)\s*</grade>", response, re.DOTALL)
    grade = match[1].strip().lower() if match else None
    if grade == "correct":
        return "correct"
    if grade == "refused":
        return "refused"
    return "incorrect"


def _result(verdict: str, raw: str) -> dict[str, Any]:
    """Shape the public return value. grade=1 iff verdict == 'correct'."""
    return {
        "grade": 1 if verdict == "correct" else 0,
        "verdict": verdict,
        "raw": raw,
    }


# --------------------------------------------------------------------------
# Cleaning helpers (mirror graders.py::_grade_str_verifier)
# --------------------------------------------------------------------------


def _clean(s: str) -> str:
    """Strip to ``[a-zA-Z0-9]`` and lowercase — exactly as the source does."""
    return re.sub(r"[^a-zA-Z0-9]", "", str(s)).lower()


# --------------------------------------------------------------------------
# Pluggable LLM callable
# --------------------------------------------------------------------------


def _env_llm() -> Optional[Callable[[str], str]]:
    """Build an OpenAI-compatible chat callable from the environment.

    Reads, in priority order:
      CAIRN_JUDGE_BASE_URL / CAIRN_JUDGE_API_KEY / CAIRN_JUDGE_MODEL
      then OPENAI_BASE_URL / OPENAI_API_KEY / CAIRN_JUDGE_MODEL.
    Returns None if neither base_url nor api_key is configured (so the caller
    can degrade to the NO_JUDGE_LLM sentinel rather than crash).
    """
    base_url = os.environ.get("CAIRN_JUDGE_BASE_URL") or os.environ.get("OPENAI_BASE_URL")
    api_key = os.environ.get("CAIRN_JUDGE_API_KEY") or os.environ.get("OPENAI_API_KEY")
    model = (
        os.environ.get("CAIRN_JUDGE_MODEL")
        or os.environ.get("OPENAI_MODEL")
        or "gpt-4o"
    )
    if not base_url and not api_key:
        return None

    base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
    url = f"{base_url}/chat/completions"

    def _call(prompt: str) -> str:
        body = json.dumps(
            {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
            }
        ).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return payload["choices"][0]["message"]["content"] or ""

    return _call


def _llm_grade(
    question: str,
    target: str,
    predicted: str,
    llm: Optional[Callable[[str], str]],
) -> dict[str, Any]:
    """Fill OPEN_ENDED_GRADING_PROMPT, call the LLM, parse the grade.

    Degrades to the NO_JUDGE_LLM sentinel (grade=0) if no LLM is available, and
    surfaces transport errors as a clear ``JUDGE_LLM_ERROR`` verdict instead of
    raising — the harness must never crash on a missing/broken judge.
    """
    if llm is None:
        llm = _env_llm()
    prompt = OPEN_ENDED_GRADING_PROMPT.format(
        question=question, target=target, predicted=predicted
    )
    if llm is None:
        return {
            "grade": 0,
            "verdict": NO_JUDGE_LLM,
            "raw": (
                "No judge LLM configured. Set CAIRN_JUDGE_BASE_URL/"
                "CAIRN_JUDGE_API_KEY (or OPENAI_BASE_URL/OPENAI_API_KEY), or "
                "pass llm=callable. Prompt that WOULD have been sent:\n\n"
                + prompt
            ),
        }
    try:
        response = llm(prompt) or ""
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, OSError) as exc:
        return {"grade": 0, "verdict": "JUDGE_LLM_ERROR", "raw": f"{type(exc).__name__}: {exc}"}
    return _result(_parse_grade(response), response)


# --------------------------------------------------------------------------
# Per-mode graders
# --------------------------------------------------------------------------


def _grade_str_verifier(
    question: str,
    target: str,
    predicted: str,
    llm: Optional[Callable[[str], str]],
) -> dict[str, Any]:
    """str_verifier: cleaned exact → cleaned partial → LLM fallback.

    Mirrors graders.py::_grade_str_verifier with the OpenEndedGrader defaults
    ``partial_match=True, llm_match=True``.
    """
    ct, cp = _clean(target), _clean(predicted)
    if cp == ct and ct != "":
        return _result("correct", f"str_verifier exact match: {cp!r} == {ct!r}")
    # PARTIAL match: source checks ``cleaned_predicted in cleaned_target``.
    if cp != "" and cp in ct:
        return _result(
            "correct", f"str_verifier partial match: {cp!r} in {ct!r}"
        )
    # LLM fallback.
    return _llm_grade(question, target, predicted, llm)


def _grade_range_verifier(target: str, predicted: str) -> dict[str, Any]:
    """range_verifier: deterministic numeric check on a ``(lower,upper)`` target.

    Mirrors graders.py::_grade_range_verifier. ``ast.literal_eval`` parses the
    ``(lower,upper)`` tuple; correct iff ``lower <= float(predicted) <= upper``.
    Non-numeric / non-comparable predictions → ``refused``.
    """
    try:
        lower, upper = ast.literal_eval(target)
    except (ValueError, SyntaxError) as exc:
        return {
            "grade": 0,
            "verdict": "incorrect",
            "raw": f"range target not a (lower,upper) tuple: {target!r} ({exc})",
        }
    # Extract a number from the prediction (tolerate surrounding text).
    raw_pred = str(predicted).strip()
    try:
        value = float(raw_pred)
    except ValueError:
        m = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", raw_pred)
        if not m:
            return {
                "grade": 0,
                "verdict": "refused",
                "raw": f"prediction not numeric / not comparable to range: {predicted!r}",
            }
        value = float(m.group(0))
    correct = lower <= value <= upper
    return _result(
        "correct" if correct else "incorrect",
        f"range check: {lower} <= {value} <= {upper} -> {correct}",
    )


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def grade(
    question: str,
    target: str,
    predicted: str,
    eval_mode: str = "llm_verifier",
    llm: Optional[Callable[[str], str]] = None,
) -> dict[str, Any]:
    """Grade ``predicted`` against ``target`` for one BixBench question.

    Args:
      question:  the task text (used by the LLM judge prompt).
      target:    the ground-truth answer (BixBench ``ideal``). For
                 ``range_verifier`` this is a ``"(lower,upper)"`` string.
      predicted: the agent's answer string.
      eval_mode: ``str_verifier`` | ``range_verifier`` | ``llm_verifier``
                 (anything else is treated as ``llm_verifier``).
      llm:       optional ``(prompt)->str`` callable. If None, an env-driven
                 OpenAI-compatible client is used; if that is unconfigured,
                 LLM paths degrade to the ``NO_JUDGE_LLM_CONFIGURED`` sentinel.

    Returns: ``{"grade": 0|1, "verdict": str, "raw": str}``.
      verdict ∈ {correct, incorrect, refused, NO_JUDGE_LLM_CONFIGURED,
                 JUDGE_LLM_ERROR}; ``grade == 1`` iff ``verdict == "correct"``.
    """
    target = "" if target is None else str(target)
    predicted = "" if predicted is None else str(predicted)

    if eval_mode == "str_verifier":
        return _grade_str_verifier(question, target, predicted, llm)
    if eval_mode == "range_verifier":
        return _grade_range_verifier(target, predicted)
    # llm_verifier and any unknown mode → LLM judge.
    return _llm_grade(question, target, predicted, llm)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="BixBench open-answer judge (Cairn eval)."
    )
    parser.add_argument("--question", required=True)
    parser.add_argument("--target", required=True, help="ground-truth answer (ideal)")
    parser.add_argument("--predicted", required=True, help="the agent's answer")
    parser.add_argument(
        "--eval-mode",
        default="llm_verifier",
        choices=["str_verifier", "range_verifier", "llm_verifier"],
    )
    args = parser.parse_args(argv)

    result = grade(
        question=args.question,
        target=args.target,
        predicted=args.predicted,
        eval_mode=args.eval_mode,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
