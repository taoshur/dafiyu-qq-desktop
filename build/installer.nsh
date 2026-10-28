!macro customInstall
  CreateShortCut "$SMPROGRAMS\卸载 Dafiyu Control Center.lnk" "$INSTDIR\Uninstall Dafiyu Control Center.exe" "/currentuser"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\卸载 Dafiyu Control Center.lnk"
!macroend
