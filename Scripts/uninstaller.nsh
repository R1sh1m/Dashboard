; Custom NSIS installer script for Artemis Ground Station
; - Force-closes running instances of the app
; - Auto-uninstalls previous versions before installing
; Uses only built-in NSIS commands (no external plugins required)

!macro customHeader
  !define APP_EXE "Artemis Ground Station.exe"
!macroend

!macro customInstall
  ; Close any running instances of the app
  DetailPrint "Checking for running instances of Artemis Ground Station..."
  ExecWait 'taskkill /IM "${APP_EXE}" /F' $0
  Sleep 1000
  
  ; Uninstall previous versions (machine-wide install)
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.artemis.groundstation}" "UninstallString"
  StrCmp $R0 "" check_user_install 0
  DetailPrint "Previous version found (machine-wide). Uninstalling..."
  ExecWait '$R0 /S'
  Goto uninstall_done
  
  check_user_install:
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{com.artemis.groundstation}" "UninstallString"
  StrCmp $R0 "" uninstall_done 0
  DetailPrint "Previous version found (user-level). Uninstalling..."
  ExecWait '$R0 /S'
  
  uninstall_done:
  DetailPrint "Installing new version."
!macroend

!macro customUninstall
  ; Close any running instances before uninstalling
  DetailPrint "Closing running instances of Artemis Ground Station..."
  ExecWait 'taskkill /IM "${APP_EXE}" /F' $0
  Sleep 1000
!macroend
