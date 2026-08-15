# AI Design Generator API — Cloud Run 배포용 이미지.
#
# 빌드:  docker build -t gcr.io/design-gen-zitify/adg-api ./backend
# 실행:  Cloud Run 은 $PORT 로 요청을 보낸다.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 빌드 캐시를 위해 의존성 먼저 설치한다.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos "" --uid 10001 appuser \
    && mkdir -p /tmp \
    && chown -R appuser:appuser /app /tmp

USER appuser

# Cloud Run 은 PORT 환경변수를 주입한다 (기본 8080).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
