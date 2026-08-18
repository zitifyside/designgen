"""로컬 실생성 API (Mae 사다리) 를 8010 에 숨김 기동한다.

8000 이 구버전 placeholder 로 점유된 경우를 피한다. 콘솔 창을 띄우지 않는다.
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PORT = 8010
BACKEND = Path(__file__).resolve().parents[1]
PYTHON = BACKEND / ".venv" / "Scripts" / "python.exe"
LOG_DIR = BACKEND / "logs"
OUT = LOG_DIR / "api-8010.out.log"
ERR = LOG_DIR / "api-8010.err.log"
PID_FILE = LOG_DIR / "api-8010.pid"
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
DETACHED_PROCESS = 0x00000008


def port_open(port: int) -> bool:
    sock = socket.socket()
    sock.settimeout(0.4)
    try:
        sock.connect(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def health() -> str:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/v1/health", timeout=3) as res:
            return res.read().decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        return f"unreachable: {exc}"


def main() -> int:
    if not PYTHON.is_file():
        print("venv python 없음")
        return 1
    LOG_DIR.mkdir(exist_ok=True)
    if port_open(PORT):
        print(f"이미 listen {PORT} — {health()}")
        return 0
    out = open(OUT, "ab")
    err = open(ERR, "ab")
    flags = CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    try:
        flags |= CREATE_BREAKAWAY_FROM_JOB
    except Exception:
        pass
    proc = subprocess.Popen(
        [
            str(PYTHON),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(PORT),
        ],
        cwd=str(BACKEND),
        stdout=out,
        stderr=err,
        stdin=subprocess.DEVNULL,
        creationflags=flags,
        close_fds=True,
    )
    PID_FILE.write_text(str(proc.pid), encoding="ascii")
    for _ in range(40):
        time.sleep(0.5)
        if proc.poll() is not None:
            print(f"기동 실패 exit={proc.returncode}")
            print(ERR.read_text(encoding="utf-8", errors="replace")[-1500:])
            return 1
        if port_open(PORT):
            print(f"기동 PID {proc.pid} :{PORT} — {health()}")
            return 0
    print("기동 타임아웃")
    return 1


if __name__ == "__main__":
    sys.exit(main())
