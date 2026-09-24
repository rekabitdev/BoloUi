param(
  [ValidateSet('win-x64', 'win-arm64')]
  [string]$Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repoRoot 'packages\bolouicore\BoloUiCore.csproj'
$runtimeKey = if ($Runtime -eq 'win-arm64') { 'win32-arm64' } else { 'win32-x64' }
$destination = Join-Path $repoRoot "resources\bundled-aioncore\$runtimeKey"
$publish = Join-Path $repoRoot "packages\bolouicore\bin\Release\net10.0\$Runtime\publish"

& dotnet publish $project -c Release -r $Runtime --self-contained true `
  -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw "BoloUiCore publish failed with exit code $LASTEXITCODE" }

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item (Join-Path $publish 'bolouicore.exe') (Join-Path $destination 'bolouicore.exe') -Force

$legacyEngine = Join-Path $destination 'aioncore.exe'
$compatEngine = Join-Path $destination 'aioncore-engine.exe'
if ((Test-Path $legacyEngine) -and -not (Test-Path $compatEngine)) {
  Copy-Item $legacyEngine $compatEngine -Force
}

Write-Output "BoloUiCore ready: $destination\bolouicore.exe"
