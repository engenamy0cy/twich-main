# Запуск MediaMTX с конфигом проекта.
# Окно терминала должно оставаться открытым, пока идёт эфир.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root 'tools\mediamtx\mediamtx.exe'
$config = Join-Path $root 'mediamtx.yml'

if (-not (Test-Path $exe)) {
    Write-Host "MediaMTX не найден: $exe" -ForegroundColor Red
    Write-Host "Скачайте архив с https://github.com/bluenviron/mediamtx/releases"
    Write-Host "и распакуйте mediamtx.exe в tools\mediamtx\"
    exit 1
}

Write-Host "MediaMTX запускается..." -ForegroundColor Cyan
Write-Host "  RTMP (OBS):  rtmp://127.0.0.1:1935/live"
Write-Host "  HLS:         http://127.0.0.1:8888/live/stream/index.m3u8"
Write-Host "  WebRTC:      http://127.0.0.1:8889/live/stream/whep"
Write-Host "  API:         http://127.0.0.1:9997/v3/paths/list"
Write-Host ""

& $exe $config
