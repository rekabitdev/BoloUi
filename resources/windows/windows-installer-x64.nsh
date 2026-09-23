; x64 architecture entry for the NSIS installer.

!include "x64.nsh"

!define BOLOUI_TARGET_ARCH "x64"
!define BOLOUI_RUNTIME_KEY "win32-x64"
!define BOLOUI_EXTRACT_METHOD "7z"

!addincludedir "${PROJECT_DIR}\resources\windows"
!include "installer-common.nsh"

!macro customHeader
  !insertmacro BOLOUI_INSTALLER_CUSTOM_HEADER
!macroend

!macro preInit
  !insertmacro BOLOUI_INSTALLER_PREINIT
!macroend

!macro customFiles_x64
  !insertmacro BOLOUI_LOG_EXTRACT_RESULT "7z"
!macroend

; Architecture guard. Inserted from BOLOUI_INSTALLER_PREINIT (preInit) so it runs before any
; registry mutation, replacing the old .onVerifyInstDir placement which fired after customInit
; had already healed/cleared/repaired an existing install's registry. (Sentry ELECTRON-3BX)
; Rejection policy is unchanged: an x64 build refuses both x86 and ARM64 machines.
!macro BOLOUI_ASSERT_TARGET_ARCH
  Var /GLOBAL BoloUiActualArch
  ${If} ${IsNativeARM64}
    !insertmacro BOLOUI_DETECT_NATIVE_ARCH $BoloUiActualArch
    !insertmacro BOLOUI_FAIL_UX \
      "${BOLOUI_E_ARCH_MISMATCH}" \
      "target=x64 actual=$BoloUiActualArch" \
      "${BOLOUI_MSG_ARCH_MISMATCH_ZH}" \
      "${BOLOUI_MSG_ARCH_MISMATCH_EN}" \
      "${BOLOUI_MSG_ARCH_MISMATCH_ACTION_ZH}" \
      "${BOLOUI_MSG_ARCH_MISMATCH_ACTION_EN}" \
      "target=x64 actual=$BoloUiActualArch" \
      "target=x64 actual=$BoloUiActualArch"
  ${ElseIfNot} ${RunningX64}
    !insertmacro BOLOUI_DETECT_NATIVE_ARCH $BoloUiActualArch
    !insertmacro BOLOUI_FAIL_UX \
      "${BOLOUI_E_ARCH_MISMATCH}" \
      "target=x64 actual=$BoloUiActualArch" \
      "${BOLOUI_MSG_ARCH_MISMATCH_ZH}" \
      "${BOLOUI_MSG_ARCH_MISMATCH_EN}" \
      "${BOLOUI_MSG_ARCH_MISMATCH_ACTION_ZH}" \
      "${BOLOUI_MSG_ARCH_MISMATCH_ACTION_EN}" \
      "target=x64 actual=$BoloUiActualArch" \
      "target=x64 actual=$BoloUiActualArch"
  ${EndIf}
!macroend
