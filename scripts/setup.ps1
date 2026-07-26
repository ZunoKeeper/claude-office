# claude-office 초기 셋업 (Windows).
# Volta 확보 → Node 22 pin → 공용 셋업(scripts/setup.mjs) 실행.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Test-Command($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user;$env:Path"
  $voltaHome = [Environment]::GetEnvironmentVariable('VOLTA_HOME', 'Machine')
  if ($null -eq $voltaHome) { $voltaHome = [Environment]::GetEnvironmentVariable('VOLTA_HOME', 'User') }
  if ($null -ne $voltaHome) { $env:VOLTA_HOME = $voltaHome }
}

if (-not (Test-Command 'volta')) {
  Write-Host '[setup] Volta가 없어 winget으로 설치합니다...'
  if (-not (Test-Command 'winget')) {
    Write-Host 'ERROR: winget이 없습니다. https://docs.volta.sh/guide/getting-started 에서 Volta를 수동 설치한 뒤 다시 실행하세요.'
    exit 1
  }
  winget install --id Volta.Volta --accept-source-agreements --accept-package-agreements
  Update-SessionPath
}

if (-not (Test-Command 'volta')) {
  Write-Host 'ERROR: Volta 설치에 실패했습니다. 새 터미널에서 다시 시도하거나 수동 설치하세요: https://docs.volta.sh/guide/getting-started'
  exit 1
}

$pkg = Get-Content package.json -Raw
if ($pkg -notmatch '"volta"') {
  Write-Host '[setup] Node 22 LTS를 프로젝트에 pin합니다...'
  volta pin node@22
  if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: volta pin 실패'; exit 1 }
}

node scripts/setup.mjs @args
exit $LASTEXITCODE
