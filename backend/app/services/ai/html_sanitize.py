"""LLM 이 작성한 시안 HTML 을 브라우저에 넣기 전에 살균한다.

Stage 4 Renderer 는 모델이 직접 쓴 마크업을 돌려준다. 그 문자열은 결국
사용자 브라우저의 DOM 으로 들어가므로 **신뢰할 수 없는 입력**과 똑같이
다룬다 — 모델이 악의적이지 않더라도, 모델에게 들어가는 프롬프트에는
사용자 원문과 업로드 문서에서 뽑은 텍스트가 섞여 있어 프롬프트 주입으로
스크립트를 심을 경로가 실재한다.

방침은 차단 목록이 아니라 **허용 목록**이다. 모르는 태그·속성은 통과가
아니라 제거다. 차단 목록은 새 벡터가 생길 때마다 뒤늦게 따라가야 하지만
허용 목록은 모르는 것이 기본적으로 막힌다.

CSS 격리는 여기서 하지 않는다 — 프론트가 Shadow DOM 안에 넣으므로
선택자 접두어를 붙일 필요가 없고, `<style>` 은 내용만 검사한다.
"""
from __future__ import annotations

import re
from html import escape
from html.parser import HTMLParser

# 시안 마크업에 실제로 필요한 것만 남긴다. form·iframe·object·embed·link·
# base·meta·script 는 어떤 경우에도 통과시키지 않는다.
ALLOWED_TAGS = frozenset(
    {
        "section", "div", "span", "header", "footer", "nav", "main", "article",
        "aside", "figure", "figcaption", "picture", "hgroup",
        "h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "pre", "code",
        "ul", "ol", "li", "dl", "dt", "dd",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
        "a", "img", "button", "input", "select", "option", "textarea", "label",
        "strong", "em", "b", "i", "u", "s", "small", "mark", "sub", "sup",
        "br", "hr", "time", "abbr", "address",
        "style",
        # 아이콘·장식용 인라인 SVG. use 는 외부 참조 벡터라 제외한다.
        "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline",
        "polygon", "defs", "linearGradient", "radialGradient", "stop", "text",
        "tspan", "clipPath", "mask", "pattern", "filter", "feGaussianBlur",
        "feOffset", "feBlend", "feColorMatrix",
    }
)

# SVG 도형·필터 원시요소는 자식을 갖지 않는다. 여기 넣지 않으면 모델이
# `<rect/>` 로 닫아도 컨테이너로 열려 뒤따르는 형제가 안으로 말려 들어간다.
VOID_TAGS = frozenset(
    {
        "br", "hr", "img", "input", "col",
        "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
        "stop", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix",
    }
)
VOID_TAGS = frozenset(t.lower() for t in VOID_TAGS)

# 태그 무관 공통 허용 속성.
GLOBAL_ATTRS = frozenset({"class", "id", "style", "title", "role", "lang", "dir"})

TAG_ATTRS: dict[str, frozenset[str]] = {
    "a": frozenset({"href", "target", "rel"}),
    "img": frozenset({"src", "alt", "width", "height", "loading", "decoding"}),
    "input": frozenset({"type", "placeholder", "value", "name", "checked", "disabled", "readonly"}),
    "textarea": frozenset({"placeholder", "rows", "cols", "disabled", "readonly"}),
    "select": frozenset({"name", "disabled"}),
    "option": frozenset({"value", "selected"}),
    "label": frozenset({"for"}),
    "th": frozenset({"colspan", "rowspan", "scope"}),
    "td": frozenset({"colspan", "rowspan"}),
    "col": frozenset({"span", "width"}),
    "colgroup": frozenset({"span"}),
    "time": frozenset({"datetime"}),
    "abbr": frozenset({"title"}),
}

# SVG 프레젠테이션 속성 — 태그별로 나누면 표만 길어지고 얻는 게 없다.
SVG_ATTRS = frozenset(
    {
        "viewBox", "xmlns", "width", "height", "fill", "stroke", "stroke-width",
        "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity",
        "fill-opacity", "fill-rule", "clip-rule", "opacity", "d", "cx", "cy", "r",
        "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "points", "transform",
        "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
        "spreadMethod", "patternUnits", "clip-path", "mask", "filter", "in",
        "stdDeviation", "dx", "dy", "result", "mode", "values", "type",
        "text-anchor", "font-size", "font-family", "font-weight", "dominant-baseline",
        "preserveAspectRatio", "vector-effect",
    }
)

SVG_TAGS = frozenset(
    {
        "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline",
        "polygon", "defs", "linearGradient", "radialGradient", "stop", "text",
        "tspan", "clipPath", "mask", "pattern", "filter", "feGaussianBlur",
        "feOffset", "feBlend", "feColorMatrix",
    }
)

# HTMLParser 는 태그·속성명을 소문자로 넘긴다. SVG 의 카멜케이스 이름
# (`linearGradient`·`clipPath`·`viewBox`)을 그대로 비교하면 전부 탈락하므로
# 비교용 집합은 소문자로 접어 둔다. 브라우저는 HTML 안의 소문자 SVG 이름을
# 파싱 단계에서 카멜케이스로 되돌리므로 출력은 소문자로 내보내도 된다.
ALLOWED_TAGS = frozenset(t.lower() for t in ALLOWED_TAGS)
SVG_TAGS = frozenset(t.lower() for t in SVG_TAGS)
SVG_ATTRS = frozenset(a.lower() for a in SVG_ATTRS)
GLOBAL_ATTRS = frozenset(a.lower() for a in GLOBAL_ATTRS)
TAG_ATTRS = {tag: frozenset(a.lower() for a in attrs) for tag, attrs in TAG_ATTRS.items()}

# 이미지 슬롯 자리표시자. 이미지 파이프라인이 실제 URL 로 바꾸기 전까지
# src 에 남아 있어야 하므로 URL 검사에서 통과시킨다.
SLOT_PATTERN = re.compile(r"^\{\{img:[A-Za-z0-9_-]{1,60}\}\}$")

_SAFE_URL = re.compile(r"^(?:https?:|mailto:|tel:|#|/|\./)", re.IGNORECASE)
_DATA_IMAGE = re.compile(r"^data:image/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$", re.IGNORECASE)

# style 속성·<style> 본문에서 통째로 막을 패턴.
_CSS_FORBIDDEN = re.compile(
    r"(?:javascript\s*:|expression\s*\(|behavior\s*:|-moz-binding|@import|"
    r"</\s*style|<\s*script)",
    re.IGNORECASE,
)
# CSS 안의 url(...) 은 원격 트래킹 경로라 data:image 와 슬롯만 허용한다.
_CSS_URL = re.compile(r"url\(\s*(['\"]?)([^)'\"]*)\1\s*\)", re.IGNORECASE)


def _safe_url(value: str) -> str | None:
    url = value.strip()
    if not url:
        return None
    if SLOT_PATTERN.match(url):
        return url
    if _DATA_IMAGE.match(url):
        return "".join(url.split())
    # 제어문자를 끼워 스킴 검사를 우회하는 고전 수법을 먼저 지운다.
    probe = re.sub(r"[\x00-\x20   ]", "", url).lower()
    if probe.startswith(("javascript:", "data:", "vbscript:", "file:")):
        return None
    if not _SAFE_URL.match(url):
        return None
    return url


def _safe_url_in_css(match: re.Match[str]) -> str:
    inner = match.group(2).strip()
    if SLOT_PATTERN.match(inner) or _DATA_IMAGE.match(inner):
        return f"url('{inner}')"
    # 같은 문서 안의 조각 참조(그라디언트·클립패스·필터)는 바깥으로 나가는
    # 요청이 아니므로 살린다. 이걸 막으면 SVG 장식이 통째로 무늬를 잃는다.
    if inner.startswith("#") and re.fullmatch(r"#[A-Za-z0-9_.:-]{1,64}", inner):
        return f"url({inner})"
    return "none"


# `<rect width=10 height=10/>` 처럼 따옴표 없는 마지막 속성은 HTMLParser 가
# 자기닫힘 슬래시까지 값으로 삼킨다(`height="10/"`). 모델이 SVG 를 이렇게 쓰는
# 일이 잦고, 값이 깨지면 도형이 사라지므로 수치형에 한해 되돌린다.
_TRAILING_SLASH_NUMBER = re.compile(r"^([-+0-9.eE%]+)/$")


def _safe_style_attr(value: str) -> str | None:
    """style 속성 검사. 위반이 있으면 속성 하나를 통째로 버린다.

    인라인 style 은 대개 선언 몇 개짜리라 통째로 버려도 화면이 크게 상하지
    않는다. 반대로 `<style>` 본문은 페이지 전체 스타일이라 같은 처리를 하면
    시안이 통째로 무너지므로 아래 `_safe_style_block` 이 따로 다룬다.
    """
    if _CSS_FORBIDDEN.search(value):
        return None
    return _CSS_URL.sub(_safe_url_in_css, value)


def _safe_style_block(value: str) -> str:
    """<style> 본문 검사. 위반 선언만 지우고 나머지 스타일시트는 살린다.

    `@import` 하나 때문에 스타일시트 전체를 버리면 살균은 통과했는데 화면은
    민무늬로 깨지는, 실패보다 나쁜 상태가 된다 — 성공으로 보고되기 때문이다.
    """
    cleaned = re.sub(r"@import\b[^;]*;?", "", value, flags=re.IGNORECASE)
    cleaned = _CSS_URL.sub(_safe_url_in_css, cleaned)
    # 남은 위험 토큰은 선언 단위로 지운다.
    cleaned = re.sub(
        r"[^;{}]*(?:javascript\s*:|expression\s*\(|behavior\s*:|-moz-binding)[^;{}]*;?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    # HTMLParser 는 raw text 요소 안의 `</style` 에서 이미 끊으므로 여기까지
    # 오지 않지만, 방어적으로 남은 태그 시작 문자는 무해화한다.
    return cleaned.replace("<", "\\3c ")


def _allowed_attrs(tag: str) -> frozenset[str]:
    if tag in SVG_TAGS:
        return GLOBAL_ATTRS | SVG_ATTRS
    return GLOBAL_ATTRS | TAG_ATTRS.get(tag, frozenset())


class _Sanitizer(HTMLParser):
    """허용 목록에 없는 것은 전부 버린다.

    버릴 태그를 만나면 여는 태그만 지우는 게 아니라 **그 안의 내용까지**
    버린다 — `<script>alert(1)</script>` 에서 태그만 지우면 본문이 텍스트로
    남아 무해하지만, `<style>` 계열은 내용이 곧 실행 대상이라 함께 버려야
    한다. 그래서 위험 태그는 깊이를 세어 통째로 건너뛴다.
    """

    #: 태그를 지울 때 내용까지 함께 버릴 것들.
    DROP_WITH_CONTENT = frozenset(
        {"script", "iframe", "object", "embed", "template", "noscript", "form", "svg:use"}
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.open_stack: list[str] = []
        self._skip_depth = 0
        self._skip_tag: str | None = None
        self._in_style = False

    # ── 태그 ──────────────────────────────────────────────────
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self._skip_depth:
            if tag == self._skip_tag:
                self._skip_depth += 1
            return
        if tag in self.DROP_WITH_CONTENT:
            self._skip_tag = tag
            self._skip_depth = 1
            return
        if tag not in ALLOWED_TAGS:
            return  # 내용은 살리고 껍데기만 버린다.
        if tag == "style":
            self._in_style = True
            self.out.append("<style>")
            return

        rendered = self._render_attrs(tag, attrs)
        if tag in VOID_TAGS:
            self.out.append(f"<{tag}{rendered} />")
            return
        self.open_stack.append(tag)
        self.out.append(f"<{tag}{rendered}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self._skip_depth or tag not in ALLOWED_TAGS or tag == "style":
            return
        self.out.append(f"<{tag}{self._render_attrs(tag, attrs)} />")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._skip_depth:
            if tag == self._skip_tag:
                self._skip_depth -= 1
                if not self._skip_depth:
                    self._skip_tag = None
            return
        if tag == "style" and self._in_style:
            self._in_style = False
            self.out.append("</style>")
            return
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return
        if tag not in self.open_stack:
            return  # 짝 없는 닫는 태그는 트리를 망가뜨리므로 버린다.
        # 모델이 닫기를 빠뜨린 안쪽 태그를 여기서 함께 닫는다.
        while self.open_stack:
            open_tag = self.open_stack.pop()
            self.out.append(f"</{open_tag}>")
            if open_tag == tag:
                break

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._in_style:
            self.out.append(_safe_style_block(data))
            return
        self.out.append(escape(data, quote=False))

    def handle_comment(self, data: str) -> None:
        del data  # 주석은 남길 이유가 없다.

    def handle_decl(self, decl: str) -> None:
        del decl  # DOCTYPE 은 조각 삽입에 쓰지 않는다.

    def handle_pi(self, data: str) -> None:
        del data

    def unknown_decl(self, data: str) -> None:
        del data  # CDATA 우회 차단.

    # ── 속성 ──────────────────────────────────────────────────
    def _render_attrs(self, tag: str, attrs: list[tuple[str, str | None]]) -> str:
        allowed = _allowed_attrs(tag)
        parts: list[str] = []
        for raw_name, raw_value in attrs:
            name = raw_name.strip()
            lower = name.lower()
            if lower.startswith("on"):
                continue  # 이벤트 핸들러는 예외 없이 차단.
            if lower.startswith(("xlink:", "xmlns:")):
                continue  # 외부 참조 벡터.
            is_data_attr = lower.startswith("data-") or lower.startswith("aria-")
            if not is_data_attr and lower not in {a.lower() for a in allowed}:
                continue
            value = raw_value or ""
            if lower not in {"href", "src"}:
                trimmed = _TRAILING_SLASH_NUMBER.match(value)
                if trimmed:
                    value = trimmed.group(1)
            if lower in {"href", "src"}:
                safe = _safe_url(value)
                if safe is None:
                    continue
                value = safe
            elif lower == "style":
                safe_style = _safe_style_attr(value)
                if safe_style is None:
                    continue
                value = safe_style
            elif lower == "target":
                value = "_blank"
            elif lower == "type" and tag == "input":
                if value.lower() in {"file", "image", "submit", "button", "hidden"}:
                    continue
            parts.append(f' {name}="{escape(value, quote=True)}"')
        # 새 창 링크는 opener 를 끊는다.
        if tag == "a" and any(p.startswith(' target=') for p in parts):
            parts.append(' rel="noopener noreferrer"')
        return "".join(parts)

    def result(self) -> str:
        tail = "".join(f"</{tag}>" for tag in reversed(self.open_stack))
        self.open_stack.clear()
        return "".join(self.out) + tail


def sanitize_mockup_html(html: str, *, max_bytes: int = 400_000) -> str:
    """시안 HTML 을 허용 목록으로 걸러 돌려준다.

    `max_bytes` 는 모델이 폭주해 거대한 문서를 만들었을 때 DB 행과 브라우저를
    함께 지키는 상한이다. 넘으면 잘라내는 대신 예외를 올려 Fallback 경로가
    받도록 한다 — 반쯤 잘린 마크업은 살균을 통과해도 화면이 깨진다.
    """
    if not isinstance(html, str) or not html.strip():
        raise ValueError("empty mockup html")
    if len(html.encode("utf-8")) > max_bytes:
        raise ValueError(f"mockup html exceeds {max_bytes} bytes")

    parser = _Sanitizer()
    parser.feed(html)
    parser.close()
    cleaned = parser.result().strip()
    if not cleaned:
        raise ValueError("mockup html was empty after sanitising")
    return cleaned


def collect_image_slots(html: str) -> list[str]:
    """살균된 HTML 안에 남아 있는 `{{img:...}}` 슬롯 id 를 순서대로 모은다."""
    found: list[str] = []
    for match in re.finditer(r"\{\{img:([A-Za-z0-9_-]{1,60})\}\}", html):
        slot = match.group(1)
        if slot not in found:
            found.append(slot)
    return found


def replace_image_slots(html: str, urls: dict[str, str]) -> str:
    """슬롯 자리표시자를 실제 이미지 URL 로 바꾼다.

    채우지 못한 슬롯은 빈 문자열이 아니라 투명 1x1 로 바꾼다. 빈 src 는
    브라우저가 현재 문서를 다시 요청하게 만들어 렌더가 한 번 더 돈다.
    """
    blank = (
        "data:image/gif;base64,"
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
    )

    def _sub(match: re.Match[str]) -> str:
        return urls.get(match.group(1)) or blank

    return re.sub(r"\{\{img:([A-Za-z0-9_-]{1,60})\}\}", _sub, html)
