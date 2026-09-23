!ifndef BOLOUI_INSTALLER_REPAIR_HEAL_NSH
!define BOLOUI_INSTALLER_REPAIR_HEAL_NSH

Var /GLOBAL BoloUiRegistryInstallIsValid
Var /GLOBAL BoloUiInnerFailureSummary
Var /GLOBAL BoloUiInnerRootCode
Var /GLOBAL BoloUiInnerFailureReadResult

!macro BOLOUI_READ_LAST_INNER_FAILURE
  InitPluginsDir
  StrCpy $BoloUiInnerRootCode ""
  StrCpy $BoloUiInnerFailureSummary "No specific locking process was identified. Close BoloUi, terminals, editors, and file managers opened in the install folder."
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$logPath = '$BoloUiSessionLogPath'; \
    $$summary = 'No specific locking process was identified. Close BoloUi, terminals, editors, and file managers opened in the install folder.'; \
    $$code = ''; \
    if ($$logPath -and (Test-Path -LiteralPath $$logPath)) { \
      $$events = @(Get-Content -LiteralPath $$logPath -ErrorAction SilentlyContinue | ForEach-Object { try { $$_ | ConvertFrom-Json } catch { $$null } } | Where-Object { $$_ }); \
      $$failure = @($$events | Where-Object { $$_.event -eq 'failure' -and $$_.updated -eq $$true } | Select-Object -Last 1)[0]; \
      if (-not $$failure) { $$failure = @($$events | Where-Object { $$_.event -eq 'failure' } | Select-Object -Last 1)[0] }; \
      if ($$failure) { \
        $$code = ([string]$$failure.code).Trim(); \
        $$phase = ([string]$$failure.phase).Trim(); \
        $$path = ([string]$$failure.failedPath).Trim(); \
        $$blocking = ''; \
        $$processes = @($$failure.blockingProcesses); \
        if ($$processes.Count -gt 0) { $$blocking = (@($$processes | ForEach-Object { if ($$_.pid) { [string]$$_.name + '(' + [string]$$_.pid + ')' } else { [string]$$_.name } }) -join ', ') }; \
        if (-not $$blocking) { $$blocking = ([string]$$failure.message).Trim() }; \
        if (-not $$blocking) { $$blocking = 'Windows did not identify a specific locking process. Close terminals, editors, and file managers opened in the install folder.' }; \
        $$parts = @('- Outer installer: previous uninstaller exited with code $R0', ('- Inner failure: ' + $$code + ' phase ' + $$phase)); \
        if ($$path) { $$parts += ('- File or folder: ' + $$path) }; \
        $$parts += ('- Blocking process: ' + $$blocking); \
        $$summary = $$parts -join [Environment]::NewLine; \
      } \
    }; \
    if (-not $$code) { $$code = '-----' }; \
    [Console]::Out.Write($$code + '|' + $$summary) \
  }"`
  Pop $BoloUiInnerFailureReadResult
  Pop $BoloUiInnerFailureReadResult
  StrCpy $BoloUiInnerRootCode $BoloUiInnerFailureReadResult 5
  ${If} $BoloUiInnerRootCode == "-----"
    StrCpy $BoloUiInnerRootCode ""
  ${EndIf}
  StrCpy $BoloUiInnerFailureSummary $BoloUiInnerFailureReadResult 4096 6
!macroend

!macro BOLOUI_LOG_UNINSTALLER_REPAIR _PHASE
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$path = '$INSTDIR\${UNINSTALL_FILENAME}'; \
    $$item = Get-Item -LiteralPath $$path -ErrorAction SilentlyContinue; \
    $$version = if ($$item) { $$item.VersionInfo.ProductVersion } else { '' }; \
    $$length = if ($$item) { $$item.Length } else { '' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$BoloUiSessionId'; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'uninstaller-repair'; phase = '${_PHASE}'; path = $$path; exists = [bool]$$item; productVersion = $$version; length = $$length }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $BoloUiRepairLogResult
!macroend

!macro BOLOUI_REPAIR_INSTALLED_UNINSTALLER
  Var /GLOBAL BoloUiInstalledUninstaller
  Var /GLOBAL BoloUiBundledUninstaller
  Var /GLOBAL BoloUiRepairLogResult

  !insertmacro BOLOUI_LOG_UNINSTALLER_REPAIR "before"
  StrCpy $BoloUiInstalledUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"

  InitPluginsDir
  StrCpy $BoloUiBundledUninstaller "$PLUGINSDIR\BoloUi-fixed-uninstaller.exe"
  SetOverwrite on
  File "/oname=$PLUGINSDIR\BoloUi-fixed-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"

  ${If} ${FileExists} "$BoloUiInstalledUninstaller"
    ClearErrors
    CopyFiles /SILENT "$BoloUiBundledUninstaller" "$BoloUiInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro BOLOUI_LOG_UNINSTALLER_REPAIR "copy-failed-retry"
      !insertmacro BOLOUI_STOP_APP_PROCESSES
      Sleep 1000

      ClearErrors
      CopyFiles /SILENT "$BoloUiBundledUninstaller" "$BoloUiInstalledUninstaller"
      ${If} ${Errors}
        ${If} ${FileExists} "$BoloUiBundledUninstaller"
          !insertmacro BOLOUI_LOG_UNINSTALLER_REPAIR "copy-failed-using-bundled"
          !insertmacro BOLOUI_LOG_EVENT "event=uninstaller-repair phase=copy-failed-using-bundled"
        ${Else}
          !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL ${BOLOUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair copy-failed-retry-bundled-missing" "${BOLOUI_MSG_UNINSTALLER_COPY_LOCKED_EN}" "${BOLOUI_MSG_UNINSTALLER_COPY_LOCKED_ZH}" "${BOLOUI_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${BOLOUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
        ${EndIf}
      ${Else}
        !insertmacro BOLOUI_LOG_UNINSTALLER_REPAIR "after-copy-retry"
      ${EndIf}
    ${Else}
      !insertmacro BOLOUI_LOG_UNINSTALLER_REPAIR "after-copy"
    ${EndIf}
  ${Else}
    ClearErrors
    CopyFiles /SILENT "$BoloUiBundledUninstaller" "$BoloUiInstalledUninstaller"
    ${If} ${Errors}
      !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL ${BOLOUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-failed" "${BOLOUI_MSG_UNINSTALLER_REBUILD_FAILED_EN}" "${BOLOUI_MSG_UNINSTALLER_REBUILD_FAILED_ZH}" "${BOLOUI_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${BOLOUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
    ${EndIf}

    ${IfNot} ${FileExists} "$BoloUiInstalledUninstaller"
      !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL ${BOLOUI_E_UNINSTALLER_COPY_OR_REBUILD_FAILED} "uninstaller-repair rebuild-missing-after-copy" "${BOLOUI_MSG_UNINSTALLER_REBUILD_MISSING_EN}" "${BOLOUI_MSG_UNINSTALLER_REBUILD_MISSING_ZH}" "${BOLOUI_MSG_UNINSTALLER_REPAIR_ACTION_EN}" "${BOLOUI_MSG_UNINSTALLER_REPAIR_ACTION_ZH}"
    ${EndIf}

    !insertmacro BOLOUI_LOG_UNINSTALLER_REPAIR "rebuilt"
    !insertmacro BOLOUI_LOG_EVENT "event=uninstaller-repair phase=rebuilt"
  ${EndIf}
!macroend

!macro BOLOUI_HEAL_INSTALL_REGISTRY
  Var /GLOBAL BoloUiRegInstallLocation
  Var /GLOBAL BoloUiRegUninstallString
  Var /GLOBAL BoloUiRegInstallExe

  StrCpy $BoloUiRegistryInstallIsValid "0"

  ReadRegStr $BoloUiRegInstallLocation SHCTX "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $BoloUiRegUninstallString SHCTX "${UNINSTALL_REGISTRY_KEY}" "UninstallString"

  ${If} $BoloUiRegInstallLocation == ""
    !insertmacro BOLOUI_LOG_EVENT "event=registry-heal phase=missing-install-location uninstallString=$BoloUiRegUninstallString"
    !insertmacro BOLOUI_CLEAR_INSTALL_REGISTRY "missing-install-location"
  ${Else}
    StrCpy $BoloUiRegInstallExe "$BoloUiRegInstallLocation\${BOLOUI_APP_EXECUTABLE_FILENAME}"
    ${If} ${FileExists} "$BoloUiRegInstallExe"
      StrCpy $INSTDIR "$BoloUiRegInstallLocation"
      StrCpy $BoloUiRegistryInstallIsValid "1"
      !insertmacro BOLOUI_LOG_EVENT "event=registry-heal phase=valid-install-location instDir=$INSTDIR uninstallString=$BoloUiRegUninstallString"
    ${Else}
      !insertmacro BOLOUI_LOG_EVENT "event=registry-heal phase=stale-install-location installLocation=$BoloUiRegInstallLocation uninstallString=$BoloUiRegUninstallString"
      !insertmacro BOLOUI_CLEAR_INSTALL_REGISTRY "stale-install-location"
    ${EndIf}
  ${EndIf}
!macroend

!macro BOLOUI_LOG_UNINSTALL_RESULT _ROOT_KEY _HAD_ERRORS
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$log = '$BoloUiSessionLogPath'; \
    if (-not $$log) { $$log = Join-Path $$env:TEMP '${BOLOUI_FALLBACK_LOG}' }; \
    $$payload = [ordered]@{ schemaVersion = 1; ts = (Get-Date -Format o); session = '$BoloUiSessionId'; version = '${VERSION}'; arch = '${BOLOUI_TARGET_ARCH}'; updated = ('$BoloUiIsUpdated' -eq '1'); instDir = '$INSTDIR'; event = 'uninstall-result'; root = '${_ROOT_KEY}'; launchErrors = '${_HAD_ERRORS}'; exitCode = '$R0' }; \
    Add-Content -LiteralPath $$log -Encoding UTF8 -Value ($$payload | ConvertTo-Json -Compress -Depth 8) \
  }"`
  Pop $BoloUiUninstallLogResult
!macroend

!macro BOLOUI_HANDLE_UNINSTALL_RESULT _ROOT_KEY _LABEL_PREFIX
  ${If} ${Errors}
    StrCpy $BoloUiUninstallHadErrors "1"
  ${Else}
    StrCpy $BoloUiUninstallHadErrors "0"
  ${EndIf}

  !insertmacro BOLOUI_LOG_UNINSTALL_RESULT "${_ROOT_KEY}" "$BoloUiUninstallHadErrors"

  ${If} $BoloUiUninstallHadErrors == "1"
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
  ${EndIf}

  ${If} $R0 != 0
      DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
      !insertmacro BOLOUI_READ_LAST_INNER_FAILURE
      ${If} $BoloUiLockerList != ""
        StrCpy $BoloUiInnerFailureSummary "- Failure: previous uninstaller failed with exit code $R0$\r$\n- File or folder: $INSTDIR$\r$\n- Blocking process: $BoloUiLockerList"
      ${EndIf}
      !insertmacro BOLOUI_LOG_EVENT "event=old-uninstaller-failed action=report exitCode=$R0 lockers=$BoloUiLockerList uninstallerDetail=$BoloUiInnerFailureSummary"
      ${If} $BoloUiInnerRootCode != ""
        !insertmacro BOLOUI_FAIL_REPORTABLE_ROOTED_BILINGUAL_DIAGNOSTICS "$BoloUiInnerRootCode" ${BOLOUI_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0 lockers=$BoloUiLockerList uninstallerDetail=$BoloUiInnerFailureSummary" "${BOLOUI_MSG_OLD_UNINSTALL_FAILED_EN}" "${BOLOUI_MSG_OLD_UNINSTALL_FAILED_ZH}" "${BOLOUI_MSG_OLD_UNINSTALL_ACTION_EN}" "${BOLOUI_MSG_OLD_UNINSTALL_ACTION_ZH}" "$BoloUiInnerFailureSummary" "$BoloUiInnerFailureSummary"
      ${Else}
        !insertmacro BOLOUI_FAIL_REPORTABLE_BILINGUAL_DIAGNOSTICS ${BOLOUI_E_OLD_UNINSTALL_FAILED} "old-uninstaller exitCode=$R0 lockers=$BoloUiLockerList uninstallerDetail=$BoloUiInnerFailureSummary" "${BOLOUI_MSG_OLD_UNINSTALL_FAILED_EN}" "${BOLOUI_MSG_OLD_UNINSTALL_FAILED_ZH}" "${BOLOUI_MSG_OLD_UNINSTALL_ACTION_EN}" "${BOLOUI_MSG_OLD_UNINSTALL_ACTION_ZH}" "$BoloUiInnerFailureSummary" "$BoloUiInnerFailureSummary"
      ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro BOLOUI_HEAL_INSTALL_REGISTRY
  ${If} $BoloUiRegistryInstallIsValid == "1"
    !insertmacro BOLOUI_REPAIR_INSTALLED_UNINSTALLER
  ${EndIf}
!macroend

!macro customUnInstallCheck
  !insertmacro BOLOUI_HANDLE_UNINSTALL_RESULT "SHELL_CONTEXT" "shctx"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro BOLOUI_HANDLE_UNINSTALL_RESULT "HKEY_CURRENT_USER" "hkcu"
!macroend

!endif
