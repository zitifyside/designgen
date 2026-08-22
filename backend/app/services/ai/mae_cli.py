"""마에가 쓰는 CLI 경로를 그대로 호출한다.

Antigravity = ContextBuilder `gemini-call.ps1` (agy 구독)
Codex      = 기존 `codex exec` (이 머신 ChatGPT 로그인)
Claude     = `claude -p` (Claude Code CLI)

창을 띄우지 않고(CREATE_NO_WINDOW), 프롬프트는 파일로 넘긴다.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.ai.codex_cli import extract_json_object

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0

GEMINI_CALL = Path(r"D:/Project/ContextBuilder/scripts/gemini-call.ps1")
ORCH_CALL = Path(r"D:/Project/mae/scripts/orchestrator-call.ps1")
POWERSHELL = os.environ.get("SystemRoot", r"C:\Windows") + r"\System32\WindowsPowerShell\v1.0\powershell.exe"


def build_json_prompt(system_prompt: str, payload: dict[str, Any], schema: dict[str, Any]) -> str:
    return (
        f"{system_prompt.strip()}\n\n"
        "입력 JSON:\n"
        f"{json.dumps(payload, ensure_ascii=False)}\n\n"
        "아래 JSON Schema 를 만족하는 JSON 객체만 출력하라. "
        "설명, 마크다운 펜스, 앞뒤 문장 금지.\n"
        f"{json.dumps(schema, ensure_ascii=False)}"
    )


def antigravity_available() -> bool:
    if not GEMINI_CALL.is_file():
        return False
    return bool(shutil.which("agy") or shutil.which("agy.cmd") or shutil.which("agy.exe"))


def claude_cli_available() -> bool:
    return bool(shutil.which("claude") or shutil.which("claude.cmd") or shutil.which("claude.exe"))


def mae_channels_available() -> list[str]:
    from app.services.ai.codex_cli import codex_cli_available

    found: list[str] = []
    if antigravity_available():
        found.append("antigravity")
    if codex_cli_available():
        found.append("codex")
    if claude_cli_available():
        found.append("claude")
    return found


def record_mae_channel(channel: str, ok: bool, reason: str = "") -> None:
    """마에 오케 헬스레저에 성공·실패를 남긴다. 실패해도 생성을 막지 않는다.

    ⚠ 이 함수는 PowerShell 을 띄우는 **동기 호출**이라 1초 안팎을 잡아먹는다.
    async 안에서 그대로 부르면 이벤트 루프가 그동안 멈춘다 — 3채널을 동시에
    돌리기 시작하면서 이게 지배적 병목이 됐다(시안 6장이 6.1초, 순차와 동일).
    그래서 async 문맥에서는 `record_mae_channel_async` 를 쓴다. 기록은 생성의
    결과에 영향을 주지 않으므로 뒤에서 돌아도 된다.
    """
    if not ORCH_CALL.is_file():
        return
    args = [
        POWERSHELL,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(ORCH_CALL),
    ]
    if ok:
        args += ["-RecordSuccess", channel]
    else:
        args += ["-RecordFailure", channel, "-Reason", (reason or "fail")[:200]]
    try:
        subprocess.run(
            args,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception:
        return


def record_mae_channel_async(channel: str, ok: bool, reason: str = "") -> None:
    """레저 기록을 스레드로 던지고 즉시 돌아온다.

    결과를 기다리지 않는다. 기록이 늦거나 실패해도 생성은 그대로 진행되어야
    하고, 반대로 기록 때문에 생성이 느려지면 안 된다.
    """
    if not ORCH_CALL.is_file():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        record_mae_channel(channel, ok, reason)
        return
    # 태스크 참조를 붙들지 않는다 — 결과를 쓰지 않으므로 fire-and-forget 이고,
    # 예외는 to_thread 안에서 이미 삼켜진다.
    loop.create_task(asyncio.to_thread(record_mae_channel, channel, ok, reason))


def _kill_tree(pid: int) -> None:
    """프로세스 트리를 통째로 정리한다. 실패해도 조용히 넘어간다."""
    if sys.platform != "win32":
        return
    try:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
            timeout=15,
            check=False,
        )
    except Exception:  # noqa: BLE001 — 정리 실패가 원래 오류를 덮으면 안 된다.
        pass


async def _run_hidden(argv: list[str], *, timeout: int, cwd: str | None = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        creationflags=CREATE_NO_WINDOW,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        # proc.kill() 은 직접 자식(powershell)만 죽인다. 실제 작업은 그 아래
        # agy·codex·claude 손자가 하고 있어서, 트리째 정리하지 않으면 죽은
        # 요청의 CLI 가 계속 살아 구독 쿼터와 CPU 를 먹는다.
        _kill_tree(proc.pid)
        proc.kill()
        try:
            await asyncio.wait_for(proc.communicate(), timeout=10)
        except (asyncio.TimeoutError, ProcessLookupError):
            pass
        raise RuntimeError(f"CLI 가 {timeout}초 안에 끝나지 않았습니다.") from None
    out = (stdout or b"").decode("utf-8", errors="replace")
    err = (stderr or b"").decode("utf-8", errors="replace")
    return proc.returncode or 0, out, err


async def run_antigravity_json(
    *,
    system_prompt: str,
    payload: dict[str, Any],
    schema: dict[str, Any],
    timeout: int | None = None,
) -> dict[str, Any]:
    if not antigravity_available():
        raise RuntimeError("Antigravity CLI(agy) 또는 gemini-call.ps1 이 없습니다.")
    wait = timeout or settings.mae_cli_timeout_seconds
    model = settings.antigravity_model
    prompt = build_json_prompt(system_prompt, payload, schema)
    work = Path(tempfile.mkdtemp(prefix="adg-agy-"))
    try:
        prompt_path = work / "prompt.txt"
        runner = work / "run.ps1"
        prompt_path.write_text(prompt, encoding="utf-8")
        runner.write_text(
            "\n".join(
                [
                    "$ErrorActionPreference = 'Stop'",
                    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
                    "$p = [IO.File]::ReadAllText($args[0], [Text.UTF8Encoding]::new($false))",
                    f"& '{GEMINI_CALL.as_posix()}' -Purpose subscription -Model '{model}' -Prompt $p",
                    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
                ]
            ),
            encoding="utf-8",
        )
        code, out, err = await _run_hidden(
            [
                POWERSHELL,
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(runner),
                str(prompt_path),
            ],
            timeout=wait,
            cwd=str(work),
        )
        text = (out or "").strip() or (err or "").strip()
        if code != 0:
            raise RuntimeError(f"Antigravity(agy) 실패 (exit {code}). {err[-300:]}")
        if not text:
            raise RuntimeError("Antigravity(agy) 빈 응답.")
        return extract_json_object(text)
    finally:
        shutil.rmtree(work, ignore_errors=True)


async def run_claude_json(
    *,
    system_prompt: str,
    payload: dict[str, Any],
    schema: dict[str, Any],
    timeout: int | None = None,
) -> dict[str, Any]:
    bin_path = shutil.which("claude") or shutil.which("claude.cmd") or shutil.which("claude.exe")
    if not bin_path:
        raise RuntimeError("Claude CLI 를 찾지 못했습니다. 이 머신에서 `claude` 로그인을 확인하세요.")
    wait = timeout or settings.mae_cli_timeout_seconds
    prompt = build_json_prompt(system_prompt, payload, schema)
    work = Path(tempfile.mkdtemp(prefix="adg-claude-"))
    try:
        prompt_path = work / "prompt.txt"
        last_path = work / "out.txt"
        prompt_path.write_text(prompt, encoding="utf-8")
        # stdin 으로 프롬프트를 넘긴다 (Mae evolution-code 와 동일). cmd 래퍼는 창 숨김.
        if bin_path.lower().endswith((".cmd", ".bat")):
            argv = [
                "cmd.exe",
                "/d",
                "/c",
                bin_path,
                "-p",
                "--output-format",
                "text",
                "--permission-mode",
                "plan",
            ]
        else:
            argv = [bin_path, "-p", "--output-format", "text", "--permission-mode", "plan"]
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(work),
            creationflags=CREATE_NO_WINDOW,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(prompt.encode("utf-8")),
                timeout=wait,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError(f"Claude CLI 가 {wait}초 안에 끝나지 않았습니다.") from None
        out = (stdout or b"").decode("utf-8", errors="replace")
        err = (stderr or b"").decode("utf-8", errors="replace")
        last_path.write_text(out, encoding="utf-8")
        if proc.returncode not in (0, None) and not out.strip():
            raise RuntimeError(f"Claude CLI 실패 (exit {proc.returncode}). {err[-300:]}")
        if not out.strip():
            raise RuntimeError("Claude CLI 빈 응답.")
        return extract_json_object(out)
    finally:
        shutil.rmtree(work, ignore_errors=True)
