!ifndef BOLOUI_INSTALLER_REMOVE_REGISTRY_NSH
!define BOLOUI_INSTALLER_REMOVE_REGISTRY_NSH

!macro BOLOUI_CLEAR_INSTALL_REGISTRY _REASON
  DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"
  !insertmacro BOLOUI_LOG_EVENT "event=registry-clear reason=${_REASON} uninstallKey=${UNINSTALL_REGISTRY_KEY} installKey=${INSTALL_REGISTRY_KEY}"
!macroend

!macro BOLOUI_LOG_ATOMIC_REMOVE_FAILURE
  Push $9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$failed = '$BoloUiAtomicFailedPath'; \
    $$instDir = '$INSTDIR'; \
    $$oldInstallDir = '$BoloUiAtomicStagingDir'; \
    $$relative = $$failed; \
    if ($$failed.StartsWith($$instDir, [System.StringComparison]::CurrentCultureIgnoreCase)) { $$relative = $$failed.Substring($$instDir.Length).TrimStart('\') }; \
    $$tempCandidate = if ($$relative -and $$relative -ne $$failed) { Join-Path $$oldInstallDir $$relative } else { '' }; \
    $$kind = if ($$tempCandidate.Length -ge 260) { 'likely-long-path' } else { 'unknown' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$BoloUiSessionId'; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'remove-atomic-failed'; kind = $$kind; pathLength = $$failed.Length; tempCandidateLength = $$tempCandidate.Length; atomicFailedPath = $$failed; tempCandidate = $$tempCandidate }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $9
  Pop $9
!macroend

!macro BOLOUI_LOG_REMOVE_FAILURE_JSON _PHASE _FATAL _FAILED_PATH _EXTRA_FIELDS
  !insertmacro BOLOUI_LOG_JSON_EVENT "failure" "$$lockerText = '$BoloUiLockerList'; $$processes = @(); if ($$lockerText -and $$lockerText -notlike 'Windows did not identify*' -and $$lockerText -ne 'unknown process') { $$processes = @($$lockerText -split ',\s*' | Where-Object { $$_ } | ForEach-Object { if ($$_ -match '^(.*)\(([0-9]+)\)$$') { [ordered]@{ name = $$Matches[1]; pid = [int]$$Matches[2] } } else { [ordered]@{ name = $$_; pid = $$null } } }) }; $$payload.code = '${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED}'; $$payload.phase = '${_PHASE}'; $$payload.failedPath = '${_FAILED_PATH}'; $$payload.blockingProcesses = @($$processes); if ($$lockerText -like 'BoloUi installer(*)') { $$payload.fallbackReason = 'installer-self-lock'; $$payload.message = 'The installer process is using the install directory as its current output directory.' } elseif ($$processes.Count -eq 0) { $$payload.fallbackReason = 'restart-manager-no-process'; $$payload.message = 'Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.' } else { $$payload.fallbackReason = ''; $$payload.message = '' }; $$payload.fatal = ('${_FATAL}' -eq '1'); ${_EXTRA_FIELDS}"
!macroend

!macro BOLOUI_REMOVE_INSTALL_DIR
  StrCpy $BoloUiRemoveResidueCount "0"
  ${If} $BoloUiRemoveResidueRoot == ""
    StrCpy $BoloUiRemoveResidueRoot "$INSTDIR"
  ${EndIf}
  StrCpy $BoloUiRemoveFirstFailedPath ""
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'Continue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$path = [System.IO.Path]::GetFullPath('$BoloUiRemoveResidueRoot'); \
    $$firstFailedFile = '$PLUGINSDIR\boloui-remove-first-failed.txt'; \
    Set-Content -LiteralPath $$firstFailedFile -Encoding UTF8 -NoNewline -Value ''; \
    function Write-InstallerLog($$message) { $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$BoloUiSessionId'; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'remove-log'; message = $$message }; if ($$message -match '(^|\s)event=([^\s]+)') { $$payload.event = $$Matches[2] }; Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) } \
    function Convert-LongPath($$itemPath) { if ($$itemPath.StartsWith('\\')) { return '\\?\UNC\' + $$itemPath.TrimStart('\') } return '\\?\' + $$itemPath } \
    function Remove-WithRetries($$item, $$isDir) { \
      $$delays = @(200,500,1000); \
      for ($$i = 0; $$i -lt $$delays.Count; $$i++) { \
        try { \
          if ($$isDir) { [System.IO.Directory]::Delete((Convert-LongPath $$item), $$false) } else { [System.IO.File]::Delete((Convert-LongPath $$item)) } \
          return $$true \
        } catch { \
          if ($$i -lt $$delays.Count - 1) { Start-Sleep -Milliseconds $$delays[$$i] } else { Write-InstallerLog ('event=remove-resilient-leftover path=' + $$item + ' attempts=3 error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message); return $$false } \
        } \
      } \
      return $$false \
    } \
    try { \
      if (-not (Test-Path -LiteralPath $$path)) { Write-InstallerLog ('remove-longpath result=0 instDir=' + $$path); exit 0 } \
      $$failed = New-Object System.Collections.Generic.List[string]; \
      foreach ($$file in @(Get-ChildItem -LiteralPath $$path -Force -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)) { if (-not (Remove-WithRetries $$file.FullName $$false)) { $$failed.Add($$file.FullName) } } \
      foreach ($$dir in @(Get-ChildItem -LiteralPath $$path -Force -Recurse -Directory -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)) { if (-not (Remove-WithRetries $$dir.FullName $$true)) { $$failed.Add($$dir.FullName) } } \
      if (-not (Remove-WithRetries $$path $$true)) { $$failed.Add($$path) } \
      Write-InstallerLog ('event=remove-resilient-summary failedCount=' + $$failed.Count + ' root=' + $$path); \
      if ($$failed.Count -gt 0) { Set-Content -LiteralPath $$firstFailedFile -Encoding UTF8 -NoNewline -Value $$failed[0]; exit $$failed.Count } \
      Write-InstallerLog ('remove-longpath result=0 instDir=' + $$path); \
      exit 0 \
    } catch { \
      Write-InstallerLog ('remove-longpath result=1 instDir=' + $$path + ' error=' + $$_.Exception.GetType().FullName + ': ' + $$_.Exception.Message); \
      exit 1 \
    } \
  }"`
  Pop $BoloUiRemoveDirResult

  ClearErrors
  SetDetailsPrint none
  FileOpen $BoloUiRemoveFirstFailedFile "$PLUGINSDIR\boloui-remove-first-failed.txt" r
  ${IfNot} ${Errors}
    FileRead $BoloUiRemoveFirstFailedFile $BoloUiRemoveFirstFailedPath
    FileClose $BoloUiRemoveFirstFailedFile
  ${EndIf}
  SetDetailsPrint lastused

  ${If} $BoloUiRemoveDirResult == "error"
    !insertmacro BOLOUI_LOG_EVENT "event=remove-longpath fallback=RMDir reason=no-powershell root=$INSTDIR"
    RMDir /r "$BoloUiRemoveResidueRoot"
    ${If} ${FileExists} "$BoloUiRemoveResidueRoot\*.*"
      StrCpy $BoloUiRemoveDirResult "1"
    ${Else}
      StrCpy $BoloUiRemoveDirResult "0"
    ${EndIf}
  ${EndIf}

  ${If} $BoloUiRemoveDirResult != 0
    StrCpy $BoloUiRemoveResidueCount $BoloUiRemoveDirResult
  ${EndIf}
!macroend

!macro customRemoveFiles
  !insertmacro BOLOUI_LOG_EVENT "remove-start instDir=$INSTDIR"
  Var /GLOBAL BoloUiRemoveDirResult
  Var /GLOBAL BoloUiAtomicFailedPath
  Var /GLOBAL BoloUiAtomicRemoveSucceeded
  Var /GLOBAL BoloUiAtomicStagingDir
  Var /GLOBAL BoloUiRemoveResidueCount
  Var /GLOBAL BoloUiRemoveResidueRoot
  Var /GLOBAL BoloUiRemoveFirstFailedPath
  Var /GLOBAL BoloUiRemoveFirstFailedFile
  StrCpy $BoloUiAtomicFailedPath ""
  StrCpy $BoloUiAtomicRemoveSucceeded "0"
  StrCpy $BoloUiAtomicStagingDir ""
  StrCpy $BoloUiRemoveResidueCount "0"
  StrCpy $BoloUiRemoveResidueRoot "$INSTDIR"
  StrCpy $BoloUiRemoveFirstFailedPath ""

  SetOutPath $TEMP
  StrCpy $BoloUiCurrentOutDir "$TEMP"

  ${if} ${isUpdated}
    StrCpy $BoloUiAtomicStagingDir "$INSTDIR.__old"
    ${If} ${FileExists} "$BoloUiAtomicStagingDir\*.*"
      StrCpy $BoloUiRemoveResidueRoot "$BoloUiAtomicStagingDir"
      !insertmacro BOLOUI_LOG_EVENT "remove-stale-staging start root=$BoloUiRemoveResidueRoot"
      !insertmacro BOLOUI_REMOVE_INSTALL_DIR
      StrCpy $BoloUiRemoveResidueRoot "$INSTDIR"
    ${EndIf}

    boloui_retry_atomic_rename:
      ClearErrors
      Rename "$INSTDIR" "$BoloUiAtomicStagingDir"
    ${if} ${Errors}
      DetailPrint "Atomic update cleanup failed before replacing previous installation: $INSTDIR"
      StrCpy $BoloUiAtomicFailedPath "$INSTDIR"
      !insertmacro BOLOUI_LOG_ATOMIC_REMOVE_FAILURE
      !insertmacro BOLOUI_CAPTURE_FAILED_PATH_LOCKERS "$BoloUiAtomicFailedPath"
      ${IfNot} ${Silent}
        !insertmacro BOLOUI_PROMPT_FAILED_PATH_LOCKERS "$BoloUiAtomicFailedPath" "atomic-failed" boloui_retry_atomic_rename boloui_cancel_atomic_rename boloui_continue_atomic_failed
        boloui_cancel_atomic_rename:
      ${EndIf}
      boloui_continue_atomic_failed:
      !insertmacro BOLOUI_LOG_REMOVE_FAILURE_JSON "atomic-failed" "1" "$BoloUiAtomicFailedPath" "$$payload.atomicFailedPath = '$BoloUiAtomicFailedPath'"
      !insertmacro BOLOUI_LOG_EVENT "code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 degraded=none firstFailed=$BoloUiAtomicFailedPath atomicFailedPath=$BoloUiAtomicFailedPath"
      !insertmacro BOLOUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL ${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=atomic-failed fatal=1 firstFailed=$BoloUiAtomicFailedPath lockers=$BoloUiLockerList" "${BOLOUI_MSG_REPLACE_LOCKED_EN}" "${BOLOUI_MSG_REPLACE_LOCKED_ZH}" "${BOLOUI_MSG_CLOSE_SHOWN_FILE_ACTION_EN}" "${BOLOUI_MSG_CLOSE_SHOWN_FILE_ACTION_ZH}"
    ${else}
      !insertmacro BOLOUI_LOG_EVENT "remove-atomic result=0 staging=$BoloUiAtomicStagingDir"
      StrCpy $BoloUiAtomicRemoveSucceeded "1"
      StrCpy $BoloUiRemoveResidueRoot "$BoloUiAtomicStagingDir"
    ${endif}
  ${endif}

  boloui_retry_remove_install_dir:
    !insertmacro BOLOUI_REMOVE_INSTALL_DIR
  ${if} $BoloUiRemoveDirResult != 0
    !insertmacro BOLOUI_CAPTURE_FAILED_PATH_LOCKERS "$BoloUiRemoveFirstFailedPath"
    ${if} $BoloUiAtomicRemoveSucceeded == "1"
      ${IfNot} ${Silent}
        !insertmacro BOLOUI_PROMPT_FAILED_PATH_LOCKERS "$BoloUiRemoveFirstFailedPath" "residual-delete-failed" boloui_retry_remove_install_dir boloui_cancel_remove_after_rm boloui_continue_after_rm
        boloui_cancel_remove_after_rm:
          !insertmacro BOLOUI_LOG_REMOVE_FAILURE_JSON "residual-delete-failed" "1" "$BoloUiRemoveFirstFailedPath" "$$payload.residueRoot = '$BoloUiRemoveResidueRoot'; $$payload.failedCount = '$BoloUiRemoveResidueCount'; $$payload.removeDirResult = '$BoloUiRemoveDirResult'; $$payload.atomicSucceeded = ('$BoloUiAtomicRemoveSucceeded' -eq '1')"
          !insertmacro BOLOUI_LOG_EVENT "code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed userAction=cancel fatal=1 residueRoot=$BoloUiRemoveResidueRoot failedCount=$BoloUiRemoveResidueCount firstFailed=$BoloUiRemoveFirstFailedPath removeDirResult=$BoloUiRemoveDirResult removeResidueCount=$BoloUiRemoveResidueCount atomicFailedPath=$BoloUiAtomicFailedPath atomicSucceeded=$BoloUiAtomicRemoveSucceeded"
          !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL ${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed userAction=cancel fatal=1 firstFailed=$BoloUiRemoveFirstFailedPath lockers=$BoloUiLockerList" "${BOLOUI_MSG_PREVIOUS_FILE_OPEN_EN}" "${BOLOUI_MSG_PREVIOUS_FILE_OPEN_ZH}" "${BOLOUI_MSG_CLOSE_SHOWN_FILE_ACTION_EN}" "${BOLOUI_MSG_CLOSE_SHOWN_FILE_ACTION_ZH}"
      ${EndIf}
      boloui_continue_after_rm:
      DetailPrint `BoloUi previous installation had locked residual files; continuing after atomic cleanup succeeded: $INSTDIR`
      !insertmacro BOLOUI_LOG_EVENT "code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed degraded=continue fatal=0 residueRoot=$BoloUiRemoveResidueRoot failedCount=$BoloUiRemoveResidueCount firstFailed=$BoloUiRemoveFirstFailedPath removeDirResult=$BoloUiRemoveDirResult removeResidueCount=$BoloUiRemoveResidueCount atomicFailedPath=$BoloUiAtomicFailedPath atomicSucceeded=$BoloUiAtomicRemoveSucceeded"
    ${else}
      DetailPrint `Can't safely remove previous installation without atomic cleanup proof: $INSTDIR`
      ${IfNot} ${Silent}
        !insertmacro BOLOUI_PROMPT_FAILED_PATH_LOCKERS "$BoloUiRemoveFirstFailedPath" "residual-delete-failed-no-atomic-proof" boloui_retry_remove_install_dir boloui_cancel_remove_no_atomic boloui_continue_remove_no_atomic
        boloui_cancel_remove_no_atomic:
      ${EndIf}
      boloui_continue_remove_no_atomic:
      !insertmacro BOLOUI_LOG_REMOVE_FAILURE_JSON "residual-delete-failed-no-atomic-proof" "1" "$BoloUiRemoveFirstFailedPath" "$$payload.residueRoot = '$BoloUiRemoveResidueRoot'; $$payload.failedCount = '$BoloUiRemoveResidueCount'; $$payload.removeDirResult = '$BoloUiRemoveDirResult'; $$payload.atomicSucceeded = ('$BoloUiAtomicRemoveSucceeded' -eq '1')"
      !insertmacro BOLOUI_LOG_EVENT "code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof degraded=none fatal=1 residueRoot=$BoloUiRemoveResidueRoot failedCount=$BoloUiRemoveResidueCount firstFailed=$BoloUiRemoveFirstFailedPath removeDirResult=$BoloUiRemoveDirResult removeResidueCount=$BoloUiRemoveResidueCount atomicFailedPath=$BoloUiAtomicFailedPath atomicSucceeded=$BoloUiAtomicRemoveSucceeded"
      !insertmacro BOLOUI_CLEAR_INSTALL_REGISTRY "remove-failed-before-quit"
      !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL ${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} "event=session-end result=fail code=${BOLOUI_E_INSTALL_DIR_REMOVE_OR_LOCKED} phase=residual-delete-failed-no-atomic-proof fatal=1 firstFailed=$BoloUiRemoveFirstFailedPath removeDirResult=$BoloUiRemoveDirResult lockers=$BoloUiLockerList" "${BOLOUI_MSG_REMOVE_PREVIOUS_DIR_EN}" "${BOLOUI_MSG_REMOVE_PREVIOUS_DIR_ZH}" "${BOLOUI_MSG_CLOSE_INSTALL_DIR_ACTION_EN}" "${BOLOUI_MSG_CLOSE_INSTALL_DIR_ACTION_ZH}"
    ${endif}
  ${else}
    !insertmacro BOLOUI_LOG_EVENT "remove-final errors=0 instDir=$INSTDIR removeDirResult=$BoloUiRemoveDirResult removeResidueCount=$BoloUiRemoveResidueCount removeResidueRoot=$BoloUiRemoveResidueRoot atomicFailedPath=$BoloUiAtomicFailedPath atomicSucceeded=$BoloUiAtomicRemoveSucceeded"
  ${endif}
!macroend

!macro customUnInit
  !insertmacro BOLOUI_LOG_EVENT "uninit instDir=$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro BOLOUI_LOG_EVENT "uninstall-section start instDir=$INSTDIR"
!macroend

!endif
