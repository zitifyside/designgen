"""Codex CLI (`codex exec`) 호출.

ChatGPT 구독 세션을 쓰므로 OPENAI_API_KEY 가 필요 없다.
프롬프트가 Windows 명령줄 한도(8191)를 넘을 수 있어 작업 폴더에 파일을 두고
짧은 지시만 인자로 넘긴다. stdin 은 닫는다 (CLI 가 EOF 를 기다리는 함정).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import settings

_LIMIT_MARKERS = (
    "rate limit",
    "usage limit",
    "too many requests",
    "limit reached",
    "try again later",
    "you've hit",
    "quota",
    "한도",
    "리밋",
)


def extract_json_object(text: str) -> dict[str, Any]:
    """마지막 메시지에서 JSON 객체 하나를 꺼낸다."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("Codex CLI 응답에서 JSON 객체를 찾지 못했습니다.")
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Codex CLI JSON 파싱 실패: {exc}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Codex CLI 응답이 JSON 객체가 아닙니다.")
    return parsed


def resolve_codex_bin() -> str:
    configured = (settings.codex_cli or "").strip()
    if configured:
        return configured
    found = shutil.which("codex")
    if found:
        return found
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        candidate = Path(appdata) / "npm" / "codex.cmd"
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError(
        "Codex CLI 를 찾지 못했습니다. 이 머신에서 `codex login` 후 PATH 를 확인하세요."
    )


def codex_cli_available() -> bool:
    try:
        resolve_codex_bin()
    except RuntimeError:
        return False
    return True


def _exec_argv(bin_path: str, args: list[str]) -> list[str]:
    if bin_path.lower().endswith((".cmd", ".bat")):
        return ["cmd.exe", "/d", "/c", bin_path, *args]
    return [bin_path, *args]


async def run_codex_json(
    *,
    system_prompt: str,
    payload: dict[str, Any],
    schema: dict[str, Any],
    timeout: int | None = None,
) -> dict[str, Any]:
    """read-only ephemeral exec 로 스키마에 맞는 JSON 을 받는다."""
    bin_path = resolve_codex_bin()
    wait = timeout or settings.codex_timeout_seconds
    work = Path(tempfile.mkdtemp(prefix="adg-codex-"))
    last_path = work / "last.txt"
    try:
        (work / "schema.json").write_text(
            json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (work / "input.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (work / "prompt.md").write_text(
            system_prompt.strip()
            + "\n\n"
            "input.json 과 schema.json 을 읽어라.\n"
            "schema.json 을 만족하는 JSON 객체만 출력하라.\n"
            "설명, 마크다운 펜스, 앞뒤 문장 금지.\n",
            encoding="utf-8",
        )
        args = [
            "exec",
            "--skip-git-repo-check",
            "-s",
            "read-only",
            "--ephemeral",
            "--color",
            "never",
            "-m",
            settings.codex_model,
            "-C",
            str(work),
            "--output-last-message",
            str(last_path),
            "Read prompt.md, input.json, and schema.json. "
            "Reply with only valid JSON that matches schema.json. "
            "No markdown fences and no commentary.",
        ]
        argv = _exec_argv(bin_path, args)
        flags = 0
        if sys.platform == "win32":
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(work),
            creationflags=flags,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=wait)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError(f"Codex CLI 가 {wait}초 안에 끝나지 않았습니다.") from None

        out_text = last_path.read_text(encoding="utf-8", errors="replace") if last_path.is_file() else ""
        err_text = (stderr or b"").decode("utf-8", errors="replace")
        combined = f"{out_text}\n{err_text}\n{(stdout or b'').decode('utf-8', errors='replace')}"
        lowered = combined.lower()
        if any(marker in lowered for marker in _LIMIT_MARKERS):
            raise RuntimeError(
                "Codex 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요."
            )
        if "not logged in" in lowered:
            raise RuntimeError("Codex CLI 에 로그인되어 있지 않습니다. `codex login` 을 실행하세요.")
        if proc.returncode not in (0, None) and not out_text.strip():
            tail = err_text.strip()[-400:]
            raise RuntimeError(
                f"Codex CLI 가 실패했습니다 (exit {proc.returncode}). {tail}"
            )
        if not out_text.strip():
            raise RuntimeError("Codex CLI 가 빈 응답을 반환했습니다.")
        return extract_json_object(out_text)
    finally:
        shutil.rmtree(work, ignore_errors=True)
