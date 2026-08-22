# designgenerator 마에 CLI 릴레이 기동 (릴레이 + Cloudflare 터널).
#
# 운영 Cloud Run 이 이 PC 의 구독 CLI 사다리를 쓰기 위한 경로다. 둘 다 떠 있어야
# 하나의 길이 완성되므로 한 스크립트에서 함께 올리고 함께 확인한다.
#
#   Cloud Run ──HTTPS──▶ adg-llm-9f4c2a71.archiwork.io ──터널──▶ 127.0.0.1:19330
#
# 콘솔 창은 띄우지 않는다(GlobalContext §11). 로그는 파일로 받는다 — 창을 숨기면
# 화면에 아무것도 안 남으므로 로그마저 없으면 실패를 볼 방법이 사라진다.
#
# 사용:  powershell -NoProfile -ExecutionPolicy Bypass -File start_relay.ps1
#        powershell ... -File start_relay.ps1 -Restart      # 떠 있어도 다시 올린다

param([switch]$Restart)

$ErrorActionPreference = 'Stop'

$Root       = 'D:\Project\designgenerator'
$Backend    = Join-Path $Root 'backend'
$LogDir     = Join-Path $Root 'logs'
$Python     = Join-Path $Backend '.venv\Scripts\python.exe'
$Cloudflared= 'C:\Users\Joon\AppData\Local\Microsoft\WinGet\Links\cloudflared.exe'
$TunnelCfg  = 'C:\Users\Joon\.cloudflared\adg-llm.yml'
$SecretFile = 'D:\Project\ContextBuilder\Secrets\env\designgenerator\relay.env'
$Port       = 19330
$Hostname   = 'adg-llm-9f4c2a71.archiwork.io'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }

# ── 시크릿 ────────────────────────────────────────────────────────
# 값은 화면·로그에 찍지 않는다. 존재와 길이만 확인한다.
if (-not (Test-Path $SecretFile)) { throw "relay.env 없음: $SecretFile" }
$token = ((Get-Content $SecretFile -Encoding UTF8 | Where-Object { $_ -like 'ADG_RELAY_TOKEN=*' }) -replace '^ADG_RELAY_TOKEN=', '').Trim()
if ($token.Length -lt 32) { throw 'ADG_RELAY_TOKEN 이 없거나 32자 미만이다. 인증 없는 릴레이는 띄우지 않는다.' }

function Test-RelayUp {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# ── 릴레이 ────────────────────────────────────────────────────────
if ((Test-RelayUp) -and -not $Restart) {
    Write-Output "relay already up on $Port"
} else {
    if ($Restart) {
        Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
            Where-Object { $_.CommandLine -like '*relay_server:app*' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
    }
    $env:ADG_RELAY_TOKEN = $token
    Start-Process -FilePath $Python `
        -ArgumentList '-m', 'uvicorn', 'relay_server:app', '--host', '127.0.0.1', '--port', "$Port" `
        -WorkingDirectory $Backend `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir 'relay.out.log') `
        -RedirectStandardError  (Join-Path $LogDir 'relay.err.log')
    Start-Sleep -Seconds 6
    if (Test-RelayUp) { Write-Output "relay started on $Port" }
    else { throw "relay 기동 실패 — $LogDir\relay.err.log 확인" }
}

# ── 터널 ──────────────────────────────────────────────────────────
$tunnelUp = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
    Where-Object { $_.CommandLine -like '*adg-llm*' }

if ($tunnelUp -and -not $Restart) {
    Write-Output 'tunnel already running'
} else {
    if ($Restart -and $tunnelUp) {
        $tunnelUp | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
    }
    Start-Process -FilePath $Cloudflared `
        -ArgumentList '--config', $TunnelCfg, '--no-autoupdate', 'tunnel', 'run', 'adg-llm' `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir 'tunnel-adg-llm.out.log') `
        -RedirectStandardError  (Join-Path $LogDir 'tunnel-adg-llm.err.log')
    Start-Sleep -Seconds 12
    Write-Output 'tunnel started'
}

# ── 바깥에서 실제로 닿는지 ─────────────────────────────────────────
# 로컬 health 만 보고 끝내면 터널이 죽은 채로 "정상" 이 된다. 운영이 실제로
# 쓰는 경로는 이 공개 주소이므로 여기까지 확인해야 기동이 끝난 것이다.
try {
    $public = Invoke-WebRequest -Uri "https://$Hostname/health" -TimeoutSec 25 -UseBasicParsing
    Write-Output "public health: $($public.StatusCode) $($public.Content)"
} catch {
    Write-Output "public health FAILED — 터널 경로 확인 필요: $($_.Exception.Message)"
    exit 1
}
