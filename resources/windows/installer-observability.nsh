!ifndef BOLOUI_INSTALLER_OBSERVABILITY_NSH
!define BOLOUI_INSTALLER_OBSERVABILITY_NSH

!define BOLOUI_APP_EXECUTABLE_FILENAME "BoloUi.exe"
!define BOLOUI_FALLBACK_LOG "boloui-installer-${VERSION}-fallback-log.jsonl"

!pragma warning disable 6001
Var /GLOBAL BoloUiSessionId
Var /GLOBAL BoloUiIsUpdated
Var /GLOBAL BoloUiSessionLogResult
Var /GLOBAL BoloUiSessionLogPath

!macro BOLOUI_SESSION_HEADER
  !insertmacro BOLOUI_SLOG "event=header arch=${BOLOUI_TARGET_ARCH} updated=$BoloUiIsUpdated instDir=$INSTDIR version=${VERSION} log=$BoloUiSessionLogPath detail=customHeader"
!macroend

!macro BOLOUI_SLOG _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$session = '$BoloUiSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    $$message = '${_MESSAGE}'; \
    $$event = 'log'; \
    if ($$message -match '(^|\s)event=([^\s]+)') { $$event = $$Matches[2] } else { $$first = @($$message -split '\s+', 2)[0]; if ($$first -and $$first -notmatch '=') { $$event = $$first } }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = $$session; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = $$event; message = $$message }; \
    $$json = $$payload | ConvertTo-Json -Compress -Depth 8; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value $$json \
  }"`
  Pop $9
  Pop $9
!macroend

!macro BOLOUI_LOG_EVENT _MESSAGE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$session = '$BoloUiSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    $$message = '${_MESSAGE}'; \
    $$event = 'log'; \
    if ($$message -match '(^|\s)event=([^\s]+)') { $$event = $$Matches[2] } else { $$first = @($$message -split '\s+', 2)[0]; if ($$first -and $$first -notmatch '=') { $$event = $$first } }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = $$session; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = $$event; message = $$message }; \
    $$json = $$payload | ConvertTo-Json -Compress -Depth 8; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value $$json \
  }"`
  Pop $9
  Pop $9
!macroend

!macro BOLOUI_LOG_JSON_EVENT _EVENT _JSON_FIELDS
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$session = '$BoloUiSessionId'; \
    if (-not $$session) { $$session = 'uninitialized' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = $$session; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = '${_EVENT}' }; \
    ${_JSON_FIELDS}; \
    $$json = $$payload | ConvertTo-Json -Compress -Depth 8; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value $$json \
  }"`
  Pop $9
  Pop $9
!macroend

!macro BOLOUI_SESSION_BEGIN
  ${GetParameters} $R9
  ClearErrors
  ${GetOptions} $R9 "--installer-log=" $R8
  ${IfNot} ${Errors}
    StrCpy $BoloUiSessionLogPath $R8
  ${EndIf}
  ClearErrors
  ${GetOptions} $R9 "--installer-session=" $R8
  ${IfNot} ${Errors}
    StrCpy $BoloUiSessionId $R8
  ${EndIf}

  ${If} $BoloUiSessionLogPath == ""
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$id = '$BoloUiSessionId'; if (-not $$id) { $$id = [guid]::NewGuid().ToString('N').Substring(0,12) }; $$stamp = Get-Date -Format 'yyyyMMdd'; $$name = 'boloui-installer-${VERSION}-' + $$stamp + '-log.jsonl'; $$log = Join-Path $$env:TEMP $$name; [Console]::Out.Write($$id + '|' + $$log)"`
    Pop $BoloUiSessionLogResult
    Pop $BoloUiSessionLogResult
    StrCpy $BoloUiSessionId $BoloUiSessionLogResult 12
    StrCpy $BoloUiSessionLogPath $BoloUiSessionLogResult 1024 13
  ${ElseIf} $BoloUiSessionId == ""
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "[Console]::Out.Write([guid]::NewGuid().ToString('N').Substring(0,12))"`
    Pop $BoloUiSessionLogResult
    Pop $BoloUiSessionLogResult
    StrCpy $BoloUiSessionId $BoloUiSessionLogResult
  ${EndIf}

  ClearErrors
  ${GetOptions} $R9 "--updated" $R8
  StrCpy $BoloUiIsUpdated "0"
  ${IfNot} ${Errors}
    StrCpy $BoloUiIsUpdated "1"
  ${EndIf}

  !insertmacro BOLOUI_SLOG "event=session-begin detail=preInit"
!macroend

!macro BOLOUI_LOG_EXTRACT_RESULT _METHOD
  ${IfNot} ${FileExists} "$INSTDIR\BoloUi.exe"
    !insertmacro BOLOUI_FAIL_UX \
      "${BOLOUI_E_EXTRACT_FAILED}" \
      "event=extract result=fail method=${_METHOD} missing=BoloUi.exe" \
      "${BOLOUI_MSG_EXTRACT_FAILED_ZH}" \
      "${BOLOUI_MSG_EXTRACT_FAILED_EN}" \
      "${BOLOUI_MSG_EXTRACT_FAILED_ACTION_ZH}" \
      "${BOLOUI_MSG_EXTRACT_FAILED_ACTION_EN}" \
      "extract result=fail method=${_METHOD} missing=BoloUi.exe instDir=$INSTDIR" \
      "extract result=fail method=${_METHOD} missing=BoloUi.exe instDir=$INSTDIR"
  ${Else}
    !insertmacro BOLOUI_SLOG "event=extract result=ok method=${_METHOD} detail=customFiles_${BOLOUI_TARGET_ARCH}"
  ${EndIf}
!macroend

!macro BOLOUI_SESSION_SUCCESS
  !insertmacro BOLOUI_SLOG "event=session-end result=success detail=customInstall"
!macroend

!endif
