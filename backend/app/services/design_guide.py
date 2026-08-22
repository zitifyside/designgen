"""컨셉 토큰에서 디자인 시스템·컴포넌트 가이드를 만든다.

**LLM 을 부르지 않는다.** 가이드는 토큰의 다른 표현일 뿐이라 계산으로 나온다.
모델에 맡기면 세 가지가 나빠진다 — 토큰을 고칠 때마다 다시 불러야 하고,
같은 토큰에서 매번 다른 문서가 나오며, 실제 값과 어긋난 설명이 섞인다.
계산으로 뽑으면 토큰을 한 칸 바꾼 순간 가이드가 정확히 그만큼 바뀐다.

산출은 시안과 같은 HTML 조각이다. 앱은 이미 Shadow DOM 으로 마크업을 그리고
확대·이동·Export 를 붙여 두었으므로, 같은 형태로 내면 그 기계를 그대로 쓴다.

담는 것:
  · 색 역할 — 토큰 11종의 쓰임과 대비비(WCAG)
  · 타이포 스케일 — baseSize·scale 로 계산한 6단
  · 간격 — baseUnit 배수 8단
  · 라운드·보더·섀도
  · 컴포넌트 — 버튼·인풋·카드·배지·칩을 **상태별로** 실제 렌더

컴포넌트 모양은 `tokens.components` 가 정한다(buttonVariant·inputStyle·
cardElevation). 그 값을 무시하고 예쁜 기본형을 그리면 가이드가 시안과 달라진다.
"""
from __future__ import annotations

from html import escape
from typing import Any

# 대비비 기준 — WCAG 2.1. AA 본문 4.5, AA 큰 글자·AAA 본문은 각각 3.0·7.0.
AA_NORMAL = 4.5
AA_LARGE = 3.0
AAA_NORMAL = 7.0

COLOR_ROLES: list[tuple[str, str, str]] = [
    ("primary", "주요", "주 동작·강조·브랜드 인상을 지는 색. 한 화면에 과하게 쓰지 않는다."),
    ("secondary", "보조", "주요 색을 받치는 색. 보조 동작과 부차 강조에 쓴다."),
    ("neutral", "중립", "구분선·비활성·배경 위 미묘한 층에 쓴다."),
    ("background", "배경", "화면 바탕. 가장 넓은 면적을 차지한다."),
    ("surface", "표면", "배경 위에 올라오는 카드·패널의 면."),
    ("text", "본문", "기본 글자색. 배경·표면 위에서 AA 를 넘겨야 한다."),
    ("textMuted", "보조 글자", "설명·캡션·메타. 본문보다 낮은 위계."),
    ("success", "성공", "완료·정상 상태."),
    ("warning", "주의", "되돌릴 수 있는 위험·확인 요청."),
    ("error", "오류", "실패·파괴적 동작·입력 오류."),
    ("info", "정보", "중립적 안내."),
]

SPACE_STEPS = [(1, 0.5), (2, 1), (3, 1.5), (4, 2), (5, 3), (6, 4), (7, 6), (8, 8)]
TYPE_STEPS = [
    ("3xl", 4, "화면 제목·히어로"),
    ("2xl", 3, "섹션 제목"),
    ("xl", 2, "카드 제목"),
    ("lg", 1, "강조 본문"),
    ("base", 0, "본문"),
    ("sm", -1, "캡션·메타"),
]

SHADOW_CSS = {
    "none": "none",
    "sm": "0 1px 2px rgba(0,0,0,.06)",
    "md": "0 6px 18px rgba(0,0,0,.10)",
    "lg": "0 12px 32px rgba(0,0,0,.14)",
    "xl": "0 24px 60px rgba(0,0,0,.18)",
}

BUTTON_RADIUS = {"rounded": "var(--g-radius-md)", "pill": "999px", "square": "0"}


# ── 색 계산 ────────────────────────────────────────────────────────
def _rgb(value: str) -> tuple[int, int, int]:
    raw = (value or "").lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        return (0, 0, 0)
    try:
        return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return (0, 0, 0)


def _luminance(value: str) -> float:
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = _rgb(value)
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_ratio(fg: str, bg: str) -> float:
    a, b = _luminance(fg), _luminance(bg)
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


def _grade(ratio: float) -> tuple[str, str]:
    """대비 등급과 표시 색."""
    if ratio >= AAA_NORMAL:
        return "AAA", "var(--g-success)"
    if ratio >= AA_NORMAL:
        return "AA", "var(--g-success)"
    if ratio >= AA_LARGE:
        return "AA Large", "var(--g-warning)"
    return "미달", "var(--g-error)"


def _readable_on(background: str) -> str:
    """그 배경 위에서 읽히는 글자색을 고른다. 견본 라벨이 안 보이면 견본이 아니다."""
    return "#111111" if _luminance(background) > 0.45 else "#FFFFFF"


# ── 토큰 정규화 ────────────────────────────────────────────────────
def _tokens(raw: dict[str, Any]) -> dict[str, Any]:
    color = raw.get("color") or {}
    typo = raw.get("typography") or {}
    border = raw.get("border") or {}
    return {
        "color": {key: str(color.get(key) or "#888888") for key, _, _ in COLOR_ROLES},
        "fontFamily": str(typo.get("fontFamily") or "Pretendard, sans-serif"),
        "baseSize": float(typo.get("baseSize") or 16),
        "scale": float(typo.get("scale") or 1.25),
        "lineHeight": float(typo.get("lineHeight") or 1.6),
        "letterSpacing": float(typo.get("letterSpacing") or 0),
        "weights": {
            "regular": int((typo.get("weights") or {}).get("regular") or 400),
            "medium": int((typo.get("weights") or {}).get("medium") or 500),
            "bold": int((typo.get("weights") or {}).get("bold") or 700),
        },
        "baseUnit": float((raw.get("spacing") or {}).get("baseUnit") or 8),
        "border": {
            "width": float(border.get("width") or 1),
            "style": str(border.get("style") or "solid"),
            "radiusSm": float(border.get("radiusSm") or 6),
            "radiusMd": float(border.get("radiusMd") or 12),
            "radiusLg": float(border.get("radiusLg") or 20),
        },
        "shadow": str((raw.get("shadow") or {}).get("preset") or "md"),
        "components": {
            "buttonVariant": str((raw.get("components") or {}).get("buttonVariant") or "rounded"),
            "inputStyle": str((raw.get("components") or {}).get("inputStyle") or "outlined"),
            "cardElevation": str((raw.get("components") or {}).get("cardElevation") or "raised"),
        },
    }


def _css_vars(t: dict[str, Any]) -> str:
    parts = [f"--g-{key}: {value};" for key, value in t["color"].items()]
    parts.append(f"--g-font: {t['fontFamily']};")
    parts.append(f"--g-radius-sm: {t['border']['radiusSm']:g}px;")
    parts.append(f"--g-radius-md: {t['border']['radiusMd']:g}px;")
    parts.append(f"--g-radius-lg: {t['border']['radiusLg']:g}px;")
    parts.append(f"--g-border: {t['border']['width']:g}px {t['border']['style']} {t['color']['neutral']}55;")
    parts.append(f"--g-shadow: {SHADOW_CSS.get(t['shadow'], SHADOW_CSS['md'])};")
    unit = t["baseUnit"]
    for step, mult in SPACE_STEPS:
        parts.append(f"--g-space-{step}: {unit * mult:g}px;")
    return "".join(parts)


# ── 섹션 ───────────────────────────────────────────────────────────
def _section(title: str, note: str, body: str, anchor: str) -> str:
    return (
        f'<section class="g-sec" data-guide="{anchor}">'
        f'<h2 class="g-h2">{escape(title)}</h2>'
        f'<p class="g-note">{escape(note)}</p>'
        f"{body}</section>"
    )


def _colors(t: dict[str, Any]) -> str:
    bg = t["color"]["background"]
    rows = []
    for key, label, usage in COLOR_ROLES:
        value = t["color"][key]
        ratio = contrast_ratio(value, bg)
        grade, tone = _grade(ratio)
        # 배경·표면 자체는 글자색이 아니므로 대비 등급을 매기지 않는다.
        judged = key not in ("background", "surface")
        rows.append(
            f'<div class="g-color">'
            f'<div class="g-swatch" style="background:{escape(value)};color:{_readable_on(value)}">'
            f"{escape(value.upper())}</div>"
            f'<div class="g-color-meta"><b>{escape(label)}</b><code>{escape(key)}</code>'
            f'<p>{escape(usage)}</p>'
            + (
                f'<span class="g-badge" style="color:{tone}">배경 대비 {ratio:.1f}:1 · {grade}</span>'
                if judged
                else '<span class="g-badge g-muted">면 색</span>'
            )
            + "</div></div>"
        )
    return f'<div class="g-colors">{"".join(rows)}</div>'


def _typography(t: dict[str, Any]) -> str:
    base, scale = t["baseSize"], t["scale"]
    rows = []
    for name, power, usage in TYPE_STEPS:
        size = base * (scale**power)
        rows.append(
            f'<div class="g-type-row">'
            f'<div class="g-type-meta"><code>{name}</code>'
            f"<span>{size:.0f}px · {usage}</span></div>"
            f'<div class="g-type-sample" style="font-size:{size:.0f}px">'
            f"다람쥐 헌 쳇바퀴에 타고파 Ag 123</div></div>"
        )
    weights = "".join(
        f'<div class="g-weight" style="font-weight:{value}">'
        f"<code>{name}</code><span>{value}</span>"
        f"<p>본문 예시 문장입니다.</p></div>"
        for name, value in t["weights"].items()
    )
    return (
        f'<div class="g-types">{"".join(rows)}</div>'
        f'<div class="g-weights">{weights}</div>'
        f'<p class="g-note">스케일 비율 {scale:g} · 행간 {t["lineHeight"]:g} · '
        f'자간 {t["letterSpacing"]:g}em · 서체 {escape(t["fontFamily"])}</p>'
    )


def _spacing(t: dict[str, Any]) -> str:
    unit = t["baseUnit"]
    bars = "".join(
        f'<div class="g-space-row"><code>space-{step}</code>'
        f'<div class="g-space-bar" style="width:{unit * mult:g}px"></div>'
        f"<span>{unit * mult:g}px</span></div>"
        for step, mult in SPACE_STEPS
    )
    radius = "".join(
        f'<div class="g-radius"><div class="g-radius-box" style="border-radius:{value:g}px"></div>'
        f"<code>{name}</code><span>{value:g}px</span></div>"
        for name, value in (
            ("sm", t["border"]["radiusSm"]),
            ("md", t["border"]["radiusMd"]),
            ("lg", t["border"]["radiusLg"]),
        )
    )
    return (
        f'<div class="g-spaces">{bars}</div>'
        f'<h3 class="g-h3">모서리 · 보더 · 그림자</h3>'
        f'<div class="g-radii">{radius}</div>'
        f'<p class="g-note">보더 {t["border"]["width"]:g}px {t["border"]["style"]} · '
        f'그림자 프리셋 {t["shadow"]}</p>'
    )


def _button(label: str, kind: str, state: str, t: dict[str, Any]) -> str:
    radius = BUTTON_RADIUS.get(t["components"]["buttonVariant"], "var(--g-radius-md)")
    base = (
        f"border-radius:{radius};padding:var(--g-space-3) var(--g-space-5);"
        f"font-weight:{t['weights']['medium']};border:var(--g-border);"
        "display:inline-flex;align-items:center;gap:6px;cursor:pointer;"
    )
    if kind == "primary":
        fill = t["color"]["primary"]
        style = f"{base}background:{fill};color:{_readable_on(fill)};border-color:transparent;"
    elif kind == "secondary":
        fill = t["color"]["secondary"]
        style = f"{base}background:{fill};color:{_readable_on(fill)};border-color:transparent;"
    elif kind == "danger":
        fill = t["color"]["error"]
        style = f"{base}background:{fill};color:{_readable_on(fill)};border-color:transparent;"
    else:  # ghost
        style = f"{base}background:transparent;color:var(--g-text);"

    # 상태는 실제로 눈에 보이게 표현한다. 이름만 적어 두면 가이드가 아니다.
    if state == "hover":
        style += "filter:brightness(1.08);box-shadow:var(--g-shadow);"
    elif state == "active":
        style += "filter:brightness(0.92);transform:translateY(1px);"
    elif state == "disabled":
        style += "opacity:.45;cursor:not-allowed;"
    elif state == "focus":
        style += f"outline:3px solid {t['color']['info']}66;outline-offset:2px;"
    return f'<button type="button" style="{style}">{escape(label)}</button>'


def _components(t: dict[str, Any]) -> str:
    states = ("default", "hover", "active", "focus", "disabled")
    kinds = (("primary", "주요"), ("secondary", "보조"), ("ghost", "고스트"), ("danger", "위험"))

    header = "".join(f"<th>{s}</th>" for s in states)
    rows = "".join(
        f"<tr><th>{escape(label)}</th>"
        + "".join(f"<td>{_button(label, kind, state, t)}</td>" for state in states)
        + "</tr>"
        for kind, label in kinds
    )
    buttons = f'<table class="g-matrix"><tr><th></th>{header}</tr>{rows}</table>'

    style = t["components"]["inputStyle"]
    if style == "filled":
        field = f"background:{t['color']['neutral']}22;border:none;border-radius:var(--g-radius-sm);"
    elif style == "underline":
        field = "background:transparent;border:none;border-bottom:var(--g-border);border-radius:0;"
    else:
        field = "background:var(--g-surface);border:var(--g-border);border-radius:var(--g-radius-sm);"
    field += "padding:var(--g-space-3) var(--g-space-4);width:220px;color:var(--g-text);"

    inputs = (
        f'<div class="g-row">'
        f'<div><label>기본</label><input style="{field}" placeholder="입력해 주세요"></div>'
        f'<div><label>포커스</label><input style="{field}outline:3px solid {t["color"]["info"]}66;outline-offset:2px;" value="입력 중"></div>'
        f'<div><label>오류</label><input style="{field}border-color:{t["color"]["error"]};" value="잘못된 값">'
        f'<span class="g-err">형식이 올바르지 않습니다.</span></div>'
        f'<div><label>비활성</label><input style="{field}opacity:.45;" placeholder="사용할 수 없음" disabled></div>'
        f"</div>"
    )

    elevation = t["components"]["cardElevation"]
    if elevation == "flat":
        card = "background:var(--g-surface);border:none;box-shadow:none;"
    elif elevation == "outlined":
        card = "background:var(--g-surface);border:var(--g-border);box-shadow:none;"
    else:
        card = "background:var(--g-surface);border:none;box-shadow:var(--g-shadow);"
    card += "border-radius:var(--g-radius-md);padding:var(--g-space-5);width:260px;"

    cards = (
        f'<div class="g-row">'
        f'<div style="{card}"><b>카드 제목</b>'
        f'<p style="color:var(--g-textMuted);margin-top:8px">표면 위에 올라오는 묶음. '
        f'{escape(elevation)} 설정을 따른다.</p></div>'
        f'<div style="{card}border-left:4px solid {t["color"]["primary"]};"><b>강조 카드</b>'
        f'<p style="color:var(--g-textMuted);margin-top:8px">주요 색으로 한 변을 물들여 위계를 준다.</p></div>'
        f"</div>"
    )

    badge_kinds = (("success", "성공"), ("warning", "주의"), ("error", "오류"), ("info", "정보"))
    badges = '<div class="g-row">' + "".join(
        f'<span style="background:{t["color"][key]}22;color:{t["color"][key]};'
        f'border-radius:999px;padding:4px 12px;font-size:{t["baseSize"] * 0.8:.0f}px;'
        f'font-weight:{t["weights"]["medium"]}">{escape(label)}</span>'
        for key, label in badge_kinds
    ) + "</div>"

    return (
        f'<h3 class="g-h3">버튼 — {escape(t["components"]["buttonVariant"])}</h3>{buttons}'
        f'<h3 class="g-h3">입력 — {escape(style)}</h3>{inputs}'
        f'<h3 class="g-h3">카드 — {escape(elevation)}</h3>{cards}'
        f'<h3 class="g-h3">배지</h3>{badges}'
    )


STYLE = """
.g-wrap{font-family:var(--g-font);color:var(--g-text);background:var(--g-background);
  padding:var(--g-space-7) var(--g-space-8);width:1200px;line-height:1.6;}
.g-title{font-size:34px;font-weight:700;margin:0 0 4px;}
.g-sub{color:var(--g-textMuted);margin:0 0 var(--g-space-7);}
.g-sec{margin-bottom:var(--g-space-8);}
.g-h2{font-size:22px;font-weight:700;margin:0 0 4px;padding-bottom:8px;border-bottom:var(--g-border);}
.g-h3{font-size:15px;font-weight:600;margin:var(--g-space-6) 0 var(--g-space-3);color:var(--g-textMuted);}
.g-note{color:var(--g-textMuted);font-size:13px;margin:0 0 var(--g-space-5);}
.g-colors{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--g-space-4);}
.g-color{display:flex;gap:var(--g-space-3);align-items:flex-start;}
.g-swatch{width:84px;height:84px;flex:none;border-radius:var(--g-radius-md);
  display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;font-size:11px;font-weight:600;}
.g-color-meta b{display:block;font-size:14px;}
.g-color-meta code{font-size:11px;color:var(--g-textMuted);}
.g-color-meta p{font-size:12px;color:var(--g-textMuted);margin:4px 0 4px;}
.g-badge{font-size:11px;font-weight:600;}
.g-muted{color:var(--g-textMuted);}
.g-type-row{display:flex;align-items:baseline;gap:var(--g-space-5);padding:var(--g-space-3) 0;
  border-bottom:var(--g-border);}
.g-type-meta{width:180px;flex:none;}
.g-type-meta code{font-weight:600;}
.g-type-meta span{display:block;font-size:12px;color:var(--g-textMuted);}
.g-type-sample{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.g-weights{display:flex;gap:var(--g-space-5);margin-top:var(--g-space-5);}
.g-weight code{font-size:12px;}.g-weight span{font-size:11px;color:var(--g-textMuted);margin-left:6px;}
.g-weight p{margin:4px 0 0;}
.g-space-row{display:flex;align-items:center;gap:var(--g-space-4);padding:5px 0;}
.g-space-row code{width:78px;font-size:12px;color:var(--g-textMuted);}
.g-space-bar{height:14px;background:var(--g-primary);border-radius:3px;}
.g-space-row span{font-size:12px;color:var(--g-textMuted);}
.g-radii{display:flex;gap:var(--g-space-5);}
.g-radius{text-align:center;}
.g-radius-box{width:76px;height:56px;background:var(--g-primary);opacity:.85;margin-bottom:6px;}
.g-radius code{font-size:12px;}.g-radius span{font-size:11px;color:var(--g-textMuted);margin-left:4px;}
.g-matrix{border-collapse:separate;border-spacing:var(--g-space-3);}
.g-matrix th{font-size:11px;color:var(--g-textMuted);font-weight:600;text-align:left;}
.g-row{display:flex;gap:var(--g-space-5);flex-wrap:wrap;align-items:flex-start;}
.g-row label{display:block;font-size:11px;color:var(--g-textMuted);margin-bottom:5px;}
.g-err{display:block;font-size:11px;color:var(--g-error);margin-top:5px;}
"""


def build_guide_html(tokens: dict[str, Any], concept_name: str = "") -> str:
    """토큰에서 디자인 시스템·컴포넌트 가이드 마크업을 만든다."""
    t = _tokens(tokens or {})
    title = concept_name.strip() or "디자인 시스템"
    body = (
        f'<div class="g-wrap">'
        f'<h1 class="g-title">{escape(title)}</h1>'
        f'<p class="g-sub">이 문서는 컨셉 토큰에서 계산해 만든다. 토큰을 고치면 값과 견본이 함께 바뀐다.</p>'
        + _section(
            "색",
            "역할로 쓴다. 값을 직접 박지 말고 역할 이름을 부른다. 대비비는 배경색 기준이다.",
            _colors(t),
            "color",
        )
        + _section(
            "타이포그래피",
            f"기준 {t['baseSize']:g}px 에 비율 {t['scale']:g} 를 거듭 곱해 만든 6단.",
            _typography(t),
            "typography",
        )
        + _section(
            "간격 · 형태",
            f"기본 단위 {t['baseUnit']:g}px 의 배수만 쓴다. 사이 값을 임의로 만들면 리듬이 깨진다.",
            _spacing(t),
            "spacing",
        )
        + _section(
            "컴포넌트",
            "상태를 이름이 아니라 실제 모양으로 둔다. 아래 견본이 곧 명세다.",
            _components(t),
            "components",
        )
        + "</div>"
    )
    return f"<style>:host,.g-wrap{{{_css_vars(t)}}}{STYLE}</style>{body}"


def build_guide(tokens: dict[str, Any], concept_name: str = "") -> dict[str, Any]:
    t = _tokens(tokens or {})
    background = t["color"]["background"]
    return {
        "html": build_guide_html(tokens, concept_name),
        "sections": ["color", "typography", "spacing", "components"],
        # 접근성 점검 결과를 따로 낸다 — 화면에도 보이지만, 목록으로 있어야
        # Export 나 검사 도구가 값을 그대로 쓸 수 있다.
        "contrast": [
            {
                "token": key,
                "value": t["color"][key],
                "ratio": round(contrast_ratio(t["color"][key], background), 2),
                "grade": _grade(contrast_ratio(t["color"][key], background))[0],
            }
            for key, _, _ in COLOR_ROLES
            if key not in ("background", "surface")
        ],
    }
