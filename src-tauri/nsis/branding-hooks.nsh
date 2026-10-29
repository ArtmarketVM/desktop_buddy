; Only migrate shortcuts belonging to this exact installation.
!macro SumiRenameShortcut OLD NEW LABEL
  !insertmacro IsShortcutTarget "${OLD}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $R0
  ${If} $R0 = 0
    !insertmacro IsShortcutTarget "${OLD}" "$INSTDIR\$OldMainBinaryName"
    Pop $R0
  ${EndIf}
  ${If} $R0 = 0
    !insertmacro IsShortcutTarget "${OLD}" "$INSTDIR\desktop-buddy.exe"
    Pop $R0
  ${EndIf}
  ${If} $R0 = 1
    !insertmacro SetShortcutTarget "${OLD}" "$INSTDIR\${MAINBINARYNAME}.exe"
    IfFileExists "${NEW}" sumi_existing_${LABEL} 0
      Rename "${OLD}" "${NEW}"
      Goto sumi_shortcut_done_${LABEL}
    sumi_existing_${LABEL}:
      !insertmacro IsShortcutTarget "${NEW}" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $R0
      ${If} $R0 = 1
        Delete "${OLD}"
      ${EndIf}
    sumi_shortcut_done_${LABEL}:
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Let Tauri recognize and update the legacy shortcut before renaming its label.
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro SumiRenameShortcut "$SMPROGRAMS\Desktop Buddy.lnk" "$SMPROGRAMS\sumi.lnk" root
  !insertmacro SumiRenameShortcut "$SMPROGRAMS\$AppStartMenuFolder\Desktop Buddy.lnk" "$SMPROGRAMS\$AppStartMenuFolder\sumi.lnk" folder
  !insertmacro SumiRenameShortcut "$DESKTOP\Desktop Buddy.lnk" "$DESKTOP\sumi.lnk" desktop
!macroend
