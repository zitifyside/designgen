"""연출 방향(creative direction) 알고리즘 속성 검증.

pytest 스위트가 없는 저장소라 단독 실행 스크립트로 둔다.

    .venv/Scripts/python.exe scripts/verify_creative_directions.py

검증 항목
  V1 순환 길이가 32,768 인가 (5축 x 8값)
  V2 보폭이 순환 길이와 서로소인가 (전 구간 비반복의 필요조건)
  V3 한 시드에서 32,768 회까지 조합이 한 번도 반복되지 않는가
  V4 같은 시드는 항상 같은 결과인가 (재현성)
  V5 다른 시드는 다른 시작점을 갖는가 (재생성 시 다양성)
  V6 축별 값이 고르게 분포하는가 (편향 없음)
  V7 축 개수/값 개수가 원본과 같은가
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.ai.visual_prompt import (  # noqa: E402
    COMPONENT_DIRECTIONS,
    DENSITY_DIRECTIONS,
    EMPHASIS_DIRECTIONS,
    LAYOUT_DIRECTIONS,
    NAVIGATION_DIRECTIONS,
    _coprime_stride,
    creative_direction_for,
    creative_directions_for,
)

AXES = (
    LAYOUT_DIRECTIONS,
    DENSITY_DIRECTIONS,
    NAVIGATION_DIRECTIONS,
    COMPONENT_DIRECTIONS,
    EMPHASIS_DIRECTIONS,
)
CYCLE = 1
for _axis in AXES:
    CYCLE *= len(_axis)

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


# V7 축 구성 -----------------------------------------------------------------
check(
    "V7 축 5종 x 값 8개",
    len(AXES) == 5 and all(len(a) == 8 for a in AXES),
    f"축 {len(AXES)}개, 값 {[len(a) for a in AXES]}",
)

# V1 순환 길이 ---------------------------------------------------------------
check("V1 순환 길이 32,768", CYCLE == 32768, f"cycle={CYCLE:,}")

# V2 서로소 보폭 -------------------------------------------------------------
from math import gcd  # noqa: E402

seeds = [f"proj-{i}\n요건 텍스트\ngen_{i:04d}" for i in range(200)]
bad_stride = [s for s in seeds if gcd(_coprime_stride(s, CYCLE), CYCLE) != 1]
check(
    "V2 보폭이 순환과 서로소 (시드 200종)",
    not bad_stride,
    f"위반 {len(bad_stride)}건",
)

# V3 전 구간 비반복 -----------------------------------------------------------
seed = "비반복 검증\n요건\ngen_x"
seen: set[str] = set()
dup_at = None
for take in range(1, CYCLE + 1):
    value = creative_direction_for(seed, take)
    if value in seen:
        dup_at = take
        break
    seen.add(value)
check(
    f"V3 {CYCLE:,} 회까지 조합 비반복",
    dup_at is None,
    f"고유 {len(seen):,}건" if dup_at is None else f"take {dup_at} 에서 최초 중복",
)

# V4 재현성 ------------------------------------------------------------------
same = all(
    creative_direction_for("동일 시드", t) == creative_direction_for("동일 시드", t)
    for t in range(1, 50)
)
check("V4 같은 시드 = 같은 결과", same)

# V5 시드 다양성 --------------------------------------------------------------
firsts = {creative_direction_for(s, 1) for s in seeds}
check(
    "V5 시드 200종의 첫 시안이 서로 다름",
    len(firsts) >= 190,
    f"고유 {len(firsts)}/200",
)

# V6 축별 균등 분포 ----------------------------------------------------------
LABELS = ("레이아웃", "밀도", "내비게이션", "컴포넌트", "강조")
counts = [{} for _ in AXES]
for take in range(1, CYCLE + 1):
    parts = creative_direction_for(seed, take).split("; ")
    for i, part in enumerate(parts):
        key = part.split(": ", 1)[1]
        counts[i][key] = counts[i].get(key, 0) + 1
expected = CYCLE // 8
uneven = [
    (LABELS[i], c)
    for i, c in enumerate(counts)
    if len(c) != 8 or any(v != expected for v in c.values())
]
check(
    "V6 축별 값이 완전 균등 분포",
    not uneven,
    f"축당 {expected:,}회씩" if not uneven else f"불균등 {uneven}",
)

# 표본 출력 ------------------------------------------------------------------
print("\n--- 시안 4장 표본 (같은 시드) ---")
for i, d in enumerate(creative_directions_for("샘플 프로젝트\n요건\ngen_demo", 4), 1):
    print(f"  시안 {i}: {d}")

print("\n--- 재생성 시 달라지는가 (generation.id 만 다름) ---")
for gid in ("gen_aaa", "gen_bbb"):
    fixed_seed = "\n".join(["같은 프로젝트", "같은 요건", gid])
    print(f"  {gid}: {creative_direction_for(fixed_seed, 1)}")

print()
if failures:
    print(f"실패 {len(failures)}건: {failures}")
    sys.exit(1)
print("전 항목 PASS")
