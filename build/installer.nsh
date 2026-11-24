; KALAI DIGITAL — NSIS overrides.
;
; 1) INSTALL DIRECTORY IS PINNED
; The app has been installed at %LOCALAPPDATA%\Programs\KALAI DIGITAL since
; 1.3.0. The installer is now one-click (electron-builder's supported silent
; update target), and its default directory is derived from the package name,
; which is not the same string. Pinning $INSTDIR guarantees an update replaces
; the existing installation in place instead of creating a second copy next to
; it. Test builds keep their own directory because the pin only applies to the
; real product name.
;
; 2) NO customCheckAppRunning OVERRIDE
; 1.5.0/1.6.0 launched the installer as a CHILD of the running app and quit
; 1.5 s later, leaving a live Electron process (its loopback HTTP server was
; never closed) that held the application files. electron-builder skips its
; "close the running app" step when the installer's parent is the app
; executable, so the unpacker showed
;   "KALAI DIGITAL cannot be closed. Please close it manually and click Retry".
;
; From 1.7.0 the app closes every window, closes the local server and exits
; completely BEFORE a detached helper starts the verified installer, so the
; installer's parent is no longer the app and electron-builder's own
; CHECK_APP_RUNNING can close a leftover instance of an older build.
;
; A hand-written replacement for that macro was tried and removed: under nsExec
; its process check reported a running app as closed, the old uninstaller then
; ran against live files and the install aborted with exit code 2.

!macro customInit
  ${if} "${PRODUCT_FILENAME}" == "KALAI DIGITAL"
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\KALAI DIGITAL"
  ${endIf}
!macroend
