<#
.SYNOPSIS
    로컬 백엔드(FastAPI) 개발 서버 제어 스크립트.

.DESCRIPTION
    콘솔 창을 띄우지 않고(숨김 실행) uvicorn 을 백그라운드로 올리고, 로그는
    backend/logs/ 로 리다이렉트한다. PID 파일로 기동·정지·상태를 관리한다.

    Action
      setup    가상환경 생성 + 의존성 설치 + .env 확인 + DB 시드까지 한 번에
      start    서버 기동 (이미 떠 있으면 그대로 둔다)
      stop     서버 정지
      restart  정지 후 기동
      status   기동 여부 · 포트 · health 응답 확인
      logs     최근 로그 출력 (-Lines 로 줄 수 조절)
      seed     플랜·데모 계정 시드 (멱등)
      reset    DB 파일 삭제 후 재시드 ⚠ 로컬 데이터가 사라진다
      smoke    문서 v0.5.0 규칙 E2E 스모크 (임시 DB 격리, 서버 불필요)

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 setup
    powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 start
    powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 status
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('setup', 'start', 'stop', 'restart', 'status', 'logs', 'seed', 'reset', 'smoke')]
    [string]$Action = 'status',

    [int]$Port = 8000,
    [int]$Lines = 40,
    [switch]$Reload
)

$ErrorActionPreference = 'Stop'

$BackendDir = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $BackendDir '.venv\Scripts\python.exe'
$LogDir     = Join-Path $BackendDir 'logs'
$OutLog     = Join-Path $LogDir 'api.out.log'
$ErrLog     = Join-Path $LogDir 'api.err.log'
$PidFile    = Join-Path $LogDir 'api.pid'
$BaseUrl    = "http://127.0.0.1:$Port/api/v1"

function Write-Step($message) { Write-Host "  $message" }

function Get-RunningPid {
    if (-not (Test-Path $PidFile)) { return $null }
    $recorded = (Get-Content $PidFile -Raw).Trim()
    if (-not $recorded) { return $null }
    $proc = Get-Process -Id ([int]$recorded) -ErrorAction SilentlyContinue
    if ($null -eq $proc) { return $null }
    return [int]$recorded
}

function Get-PortPid {
    # PID 파일이 없어도(수동 기동 등) 포트 점유 프로세스를 찾아낸다.
    $line = netstat -ano | Select-String ":$Port\s+.*LISTENING" | Select-Object -First 1
    if ($null -eq $line) { return $null }
    return [int](($line.ToString() -split '\s+')[-1])
}

function Stop-Tree([int]$ProcessId) {
    # 자식 먼저, 부모 나중. taskkill 을 쓰면 네이티브 stderr 가 콘솔에 새어 나오므로
    # 순수 PowerShell 로 처리한다 (이미 죽은 PID 는 조용히 넘어간다).
    $children = @(
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty ProcessId
    )
    foreach ($child in $children) {
        Stop-Process -Id $child -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Test-Health {
    try {
        $res = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 3
        return $res
    } catch {
        return $null
    }
}

function Assert-Venv {
    if (-not (Test-Path $VenvPython)) {
        throw "가상환경이 없다. 먼저 실행: scripts\dev-server.ps1 setup"
    }
}

function Assert-EnvFile {
    $envPath = Join-Path $BackendDir '.env'
    if (Test-Path $envPath) { return }
    Write-Warning ".env 가 없다. 시크릿은 ContextBuilder Secrets 에서 심볼릭 링크로 연결한다:"
    Write-Warning "  powershell -File D:\Project\ContextBuilder\scripts\link-secrets.ps1 -Project designgenerator"
    Write-Warning "링크가 어려우면 .env.example 을 복사한 뒤 SECRET_KEY 를 교체한다."
    throw ".env 없음"
}

function Invoke-Setup {
    if (-not (Test-Path $VenvPython)) {
        Write-Step '가상환경 생성 (.venv)'
        & python -m venv (Join-Path $BackendDir '.venv')
    } else {
        Write-Step '가상환경 확인됨 (.venv)'
    }

    Write-Step '의존성 설치 (requirements.txt)'
    & $VenvPython -m pip install --upgrade pip --quiet
    & $VenvPython -m pip install -r (Join-Path $BackendDir 'requirements.txt') --quiet

    Assert-EnvFile
    Write-Step '.env 확인됨'

    Invoke-Seed
    Write-Host ''
    Write-Host '준비 완료. 서버 기동: scripts\dev-server.ps1 start'
}

function Invoke-Seed {
    Assert-Venv
    Write-Step 'DB 시드 (테이블 생성 + 플랜 + 데모/관리자 계정)'
    Push-Location $BackendDir
    try {
        $env:DEBUG = 'false'   # SQL echo 소음 억제
        & $VenvPython -m app.seed | Select-Object -Last 1
    } finally {
        Remove-Item Env:\DEBUG -ErrorAction SilentlyContinue
        Pop-Location
    }
}

function Invoke-Start {
    Assert-Venv
    Assert-EnvFile

    $existing = Get-RunningPid
    if ($existing) {
        Write-Host "이미 기동 중 (PID $existing) — $BaseUrl"
        return
    }
    $portPid = Get-PortPid
    if ($portPid) {
        Write-Warning "포트 $Port 를 PID $portPid 가 이미 점유하고 있다. stop 후 다시 시도하거나 -Port 로 다른 포트를 쓴다."
        return
    }

    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

    $argList = @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$Port")
    if ($Reload) { $argList += '--reload' }

    # 콘솔 창을 띄우지 않고 실행하고 로그는 파일로 받는다 (콘솔창 숨김 실행규약).
    $proc = Start-Process -FilePath $VenvPython `
        -ArgumentList $argList `
        -WorkingDirectory $BackendDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -PassThru
    Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Health) {
            Write-Host "기동 완료 (PID $($proc.Id)) — $BaseUrl"
            Write-Host "  Swagger: http://127.0.0.1:$Port/docs"
            return
        }
        if ($proc.HasExited) { break }
    }

    Write-Warning '기동을 확인하지 못했다. 로그를 확인한다:'
    if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 20 }
}

function Invoke-Stop {
    # uvicorn 은 Windows 에서 자식 프로세스가 포트를 잡는다. 부모만 죽이면
    # 자식이 고아로 남아 포트를 계속 물고 있으므로 트리째 정리한다.
    $targets = @()
    $recorded = Get-RunningPid
    if ($recorded) { $targets += $recorded }
    $portPid = Get-PortPid
    if ($portPid -and ($targets -notcontains $portPid)) { $targets += $portPid }

    if ($targets.Count -eq 0) {
        Write-Host '기동 중인 서버가 없다.'
        if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
        return
    }

    foreach ($target in $targets) { Stop-Tree $target }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }

    # 포트가 실제로 풀렸는지 확인한다.
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 300
        if (-not (Get-PortPid)) {
            Write-Host ("정지 완료 (PID {0})" -f ($targets -join ', '))
            return
        }
    }
    Write-Warning "포트 $Port 가 아직 점유돼 있다: PID $(Get-PortPid)"
}

function Invoke-Status {
    # 포트를 실제로 물고 있는 프로세스가 진실이다 (자식이 listen 한다).
    $running = Get-PortPid
    if (-not $running) { $running = Get-RunningPid }
    if ($running) {
        Write-Host "상태: 기동 중 (PID $running, 포트 $Port)"
    } else {
        Write-Host "상태: 정지"
    }

    $health = Test-Health
    if ($health) {
        Write-Host "health: $($health.status) · DB $($health.database) · env $($health.environment) · fakeAI $($health.fakeAiPipeline)"
        Write-Host "base : $BaseUrl"
    } else {
        Write-Host 'health: 응답 없음'
    }
}

function Invoke-Logs {
    if (-not (Test-Path $OutLog)) { Write-Host '로그 파일이 아직 없다.'; return }
    Write-Host "--- $OutLog (마지막 $Lines 줄) ---"
    Get-Content $OutLog -Tail $Lines
    if ((Test-Path $ErrLog) -and (Get-Item $ErrLog).Length -gt 0) {
        Write-Host ''
        Write-Host "--- $ErrLog (마지막 $Lines 줄) ---"
        Get-Content $ErrLog -Tail $Lines
    }
}

function Invoke-Reset {
    Invoke-Stop
    $dbPath = Join-Path $BackendDir 'designgen.db'
    if (Test-Path $dbPath) {
        Remove-Item $dbPath -Force
        Write-Step 'designgen.db 삭제'
    }
    Invoke-Seed
    Write-Host '초기화 완료.'
}

function Invoke-Smoke {
    Assert-Venv
    Push-Location $BackendDir
    try {
        & $VenvPython (Join-Path $BackendDir 'scripts\smoke_e2e.py')
    } finally {
        Pop-Location
    }
}

switch ($Action) {
    'setup'   { Invoke-Setup }
    'start'   { Invoke-Start }
    'stop'    { Invoke-Stop }
    'restart' { Invoke-Stop; Start-Sleep -Seconds 1; Invoke-Start }
    'status'  { Invoke-Status }
    'logs'    { Invoke-Logs }
    'seed'    { Invoke-Seed }
    'reset'   { Invoke-Reset }
    'smoke'   { Invoke-Smoke }
}
