!ifndef BOLOUI_INSTALLER_UPDATE_VERIFY_NSH
!define BOLOUI_INSTALLER_UPDATE_VERIFY_NSH

Var /GLOBAL BoloUiUninstallHadErrors
Var /GLOBAL BoloUiUninstallLogResult
Var /GLOBAL BoloUiVerifyResourceResult
Var /GLOBAL BoloUiUpdatedAppExitWaitResult
Var /GLOBAL BoloUiActiveMarkerExecResult
Var /GLOBAL BoloUiActiveMarkerResult

!define BOLOUI_ACTIVE_INSTALLER_MARKER "boloui-installer-active.marker"

!macro BOLOUI_BRING_UPDATED_INSTALLER_TO_FRONT
  ${If} ${isUpdated}
    BringToFront
    !insertmacro BOLOUI_SLOG "event=updated-installer-foreground action=bring-to-front"
  ${EndIf}
!macroend

!macro BOLOUI_WAIT_FOR_UPDATED_APP_EXIT
  ${If} ${isUpdated}
    !insertmacro BOLOUI_SLOG "event=updated-app-exit-wait phase=start"
    StrCpy $BoloUiUpdatedAppExitWaitResult "0"

    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
      $$ErrorActionPreference = 'SilentlyContinue'; \
      $$deadline = (Get-Date).AddSeconds(10); \
      $$target = [System.IO.Path]::GetFullPath((Join-Path '$INSTDIR' '${BOLOUI_APP_EXECUTABLE_FILENAME}')); \
      do { \
        $$hits = @(Get-CimInstance -ClassName Win32_Process | Where-Object { \
          $$path = $$_.ExecutablePath; \
          if (-not $$path) { $$path = $$_.Path } \
          $$_.Name -ieq '${BOLOUI_APP_EXECUTABLE_FILENAME}' -and $$path -and \
          [string]::Equals([System.IO.Path]::GetFullPath($$path), $$target, [System.StringComparison]::CurrentCultureIgnoreCase) \
        }); \
        if ($$hits.Count -eq 0) { exit 0 }; \
        Start-Sleep -Milliseconds 500; \
      } while ((Get-Date) -lt $$deadline); \
      exit 1 \
    }"`
    Pop $BoloUiUpdatedAppExitWaitResult

    ${If} $BoloUiUpdatedAppExitWaitResult != 0
      !insertmacro BOLOUI_SLOG "event=updated-app-exit-wait phase=timeout action=stop"
      !insertmacro BOLOUI_STOP_APP_PROCESSES
    ${EndIf}

    !insertmacro BOLOUI_SLOG "event=updated-app-exit-wait phase=done result=$BoloUiUpdatedAppExitWaitResult"
  ${EndIf}
!macroend

!macro BOLOUI_RECORD_ACTIVE_INSTALLER_MARKER
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$marker = Join-Path $$env:TEMP '${BOLOUI_ACTIVE_INSTALLER_MARKER}'; \
    if (-not (Test-Path -LiteralPath $$marker)) { Write-Output 'missing'; exit 0 }; \
    $$item = Get-Item -LiteralPath $$marker; \
    if ($$item.LastWriteTime -lt (Get-Date).AddHours(-2)) { Write-Output 'stale'; exit 0 }; \
    Write-Output 'active' \
  }"`
  Pop $BoloUiActiveMarkerExecResult
  Pop $BoloUiActiveMarkerResult
  ${If} $BoloUiActiveMarkerResult == "active"
    !insertmacro BOLOUI_SLOG "event=installer-active-marker state=active"
  ${ElseIf} $BoloUiActiveMarkerResult == "stale"
    !insertmacro BOLOUI_SLOG "event=installer-active-marker state=stale"
  ${Else}
    !insertmacro BOLOUI_SLOG "event=installer-active-marker state=missing"
  ${EndIf}
!macroend

!macro BOLOUI_WRITE_ACTIVE_INSTALLER_MARKER
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
    $$ErrorActionPreference = 'SilentlyContinue'; \
    $$marker = Join-Path $$env:TEMP '${BOLOUI_ACTIVE_INSTALLER_MARKER}'; \
    Set-Content -LiteralPath $$marker -Encoding UTF8 -Value ('pid=' + $$PID + ';session=$BoloUiSessionId;started=' + (Get-Date -Format o)) \
  }"`
  Pop $BoloUiActiveMarkerResult
!macroend

!macro BOLOUI_CLEAR_ACTIVE_INSTALLER_MARKER
  !ifndef BUILD_UNINSTALLER
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { \
      $$ErrorActionPreference = 'SilentlyContinue'; \
      Remove-Item -LiteralPath (Join-Path $$env:TEMP '${BOLOUI_ACTIVE_INSTALLER_MARKER}') -Force \
    }"`
    Pop $BoloUiActiveMarkerResult
  !endif
!macroend

!macro BOLOUI_OVERRIDE_SINGLE_INSTANCE
!macroend

!macro BOLOUI_OVERRIDE_APP_CANNOT_BE_CLOSED_MESSAGE
  !pragma warning disable 6030
  LangString appCannotBeClosed 1033 "${BOLOUI_MSG_APP_CANNOT_BE_CLOSED_ZH}$\r$\n$\r$\n${BOLOUI_MSG_BLOCK_SEPARATOR}$\r$\n$\r$\n${BOLOUI_MSG_APP_CANNOT_BE_CLOSED_EN}"
  LangString appCannotBeClosed 2052 "${BOLOUI_MSG_APP_CANNOT_BE_CLOSED_ZH}$\r$\n$\r$\n${BOLOUI_MSG_BLOCK_SEPARATOR}$\r$\n$\r$\n${BOLOUI_MSG_APP_CANNOT_BE_CLOSED_EN}"
  !pragma warning default 6030
!macroend

!macro BOLOUI_INSTALLER_CUSTOM_HEADER
  !insertmacro BOLOUI_OVERRIDE_SINGLE_INSTANCE
  !insertmacro BOLOUI_OVERRIDE_APP_CANNOT_BE_CLOSED_MESSAGE
!macroend

!macro BOLOUI_RELEASE_INSTALL_DIR_OUTDIR
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  StrCpy $BoloUiCurrentOutDir "$PLUGINSDIR"
!macroend

; Resolve the machine's real native architecture (arm64 / x64 / x86) for diagnostics.
; Backed by IsWow64Process2 (via x64.nsh), so it reports the true hardware arch even when
; the installer runs under x86/x64 emulation. Replaces the old hardcoded "non-arm64" detail.
!macro BOLOUI_DETECT_NATIVE_ARCH _OUT
  ${If} ${IsNativeARM64}
    StrCpy ${_OUT} "arm64"
  ${ElseIf} ${RunningX64}
    StrCpy ${_OUT} "x64"
  ${Else}
    StrCpy ${_OUT} "x86"
  ${EndIf}
!macroend

!macro BOLOUI_INSTALLER_PREINIT
  !ifdef BUILD_UNINSTALLER
    StrCpy $BoloUiSessionId ""
    StrCpy $BoloUiIsUpdated "0"
    StrCpy $BoloUiSessionLogResult ""
    StrCpy $BoloUiSessionLogPath "$TEMP\${BOLOUI_FALLBACK_LOG}"
    StrCpy $BoloUiUninstallHadErrors "0"
    StrCpy $BoloUiUninstallLogResult ""
    StrCpy $BoloUiVerifyResourceResult ""
    StrCpy $BoloUiUpdatedAppExitWaitResult ""
    StrCpy $BoloUiActiveMarkerExecResult ""
    StrCpy $BoloUiActiveMarkerResult ""
    StrCpy $BoloUiStopResult ""
    StrCpy $BoloUiLockerListZh ""
    StrCpy $BoloUiLockerListEn ""
  !else
    !insertmacro BOLOUI_RELEASE_INSTALL_DIR_OUTDIR
    !insertmacro BOLOUI_SESSION_BEGIN
    !insertmacro BOLOUI_SLOG "event=installer-outdir-release outDir=$BoloUiCurrentOutDir instDir=$INSTDIR"
    ; Guard target/machine architecture as early as possible: this runs before customInit's
    ; registry heal/clear/repair, so a wrong-arch installer aborts without mutating an existing
    ; correct-arch install's registry or uninstaller state. (Sentry ELECTRON-3BX / code E1040)
    !insertmacro BOLOUI_ASSERT_TARGET_ARCH
    !insertmacro BOLOUI_BRING_UPDATED_INSTALLER_TO_FRONT
    !insertmacro BOLOUI_RECORD_ACTIVE_INSTALLER_MARKER
    !insertmacro BOLOUI_WRITE_ACTIVE_INSTALLER_MARKER
  !endif
!macroend

!macro BOLOUI_VERIFY_REQUIRED_FILE _PATH _LABEL
  ${IfNot} ${FileExists} "${_PATH}"
    !insertmacro BOLOUI_LOG_EVENT "verify-required-file missing label=${_LABEL} path=${_PATH}"
    !insertmacro BOLOUI_FAIL_UX \
      "${BOLOUI_E_CORE_APP_FILES_INCOMPLETE}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "${BOLOUI_MSG_VERIFY_REQUIRED_FILE_ZH} ${_LABEL}" \
      "${BOLOUI_MSG_VERIFY_REQUIRED_FILE_EN} ${_LABEL}" \
      "${BOLOUI_MSG_VERIFY_REQUIRED_FILE_ACTION_ZH}" \
      "${BOLOUI_MSG_VERIFY_REQUIRED_FILE_ACTION_EN}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}" \
      "verify-required-file missing label=${_LABEL} path=${_PATH}"
  ${Else}
    !insertmacro BOLOUI_LOG_EVENT "verify-required-file ok label=${_LABEL} path=${_PATH}"
  ${EndIf}
!macroend

!macro BOLOUI_VERIFY_CORE_APP_FILES
  !insertmacro BOLOUI_LOG_EVENT "verify-install start instDir=$INSTDIR"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\BoloUi.exe" "BoloUi.exe"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\ffmpeg.dll" "ffmpeg.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\libEGL.dll" "libEGL.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\libGLESv2.dll" "libGLESv2.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\d3dcompiler_47.dll" "d3dcompiler_47.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\dxcompiler.dll" "dxcompiler.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\dxil.dll" "dxil.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\vk_swiftshader.dll" "vk_swiftshader.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\vulkan-1.dll" "vulkan-1.dll"
  !insertmacro BOLOUI_VERIFY_REQUIRED_FILE "$INSTDIR\resources\app.asar" "resources\app.asar"
!macroend

!macro BOLOUI_VERIFY_BUNDLED_AIONCORE_RESOURCES _RUNTIME_KEY
  InitPluginsDir
  File "/oname=$PLUGINSDIR\verify-bundled-aioncore-install.ps1" "${PROJECT_DIR}\resources\windows\support\verify-bundled-aioncore-install.ps1"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\verify-bundled-aioncore-install.ps1" -InstallDir "$INSTDIR" -RuntimeKey "${_RUNTIME_KEY}" -LogPath "$BoloUiSessionLogPath"`
  Pop $BoloUiVerifyResourceResult

  ${If} $BoloUiVerifyResourceResult != 0
    !insertmacro BOLOUI_FAIL_UX \
      "${BOLOUI_E_BUNDLED_AIONCORE_INCOMPLETE}" \
      "event=session-end result=fail code=${BOLOUI_E_BUNDLED_AIONCORE_INCOMPLETE} detail=bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$BoloUiVerifyResourceResult" \
      "${BOLOUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ZH}" \
      "${BOLOUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_EN}" \
      "${BOLOUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_ZH}" \
      "${BOLOUI_MSG_BUNDLED_AIONCORE_INCOMPLETE_ACTION_EN}" \
      "bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$BoloUiVerifyResourceResult instDir=$INSTDIR" \
      "bundled-aioncore-incomplete runtime=${_RUNTIME_KEY} result=$BoloUiVerifyResourceResult instDir=$INSTDIR"
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro BOLOUI_VERIFY_CORE_APP_FILES
  !insertmacro BOLOUI_VERIFY_BUNDLED_AIONCORE_RESOURCES "${BOLOUI_RUNTIME_KEY}"
  !insertmacro BOLOUI_LOG_EVENT "verify-install ok instDir=$INSTDIR"
  !insertmacro BOLOUI_CLEAR_ACTIVE_INSTALLER_MARKER
  !insertmacro BOLOUI_SESSION_SUCCESS
!macroend

!endif
