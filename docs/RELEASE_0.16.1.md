# Desktop Buddy 0.16.1 for Windows

- Fix the startup error `state not managed ... get_dashboard` by initializing the database and command state before opening the workspace and companion windows.
- Clear dashboard and goal-loading errors after a successful retry, while preserving errors from failed user actions.

In an existing installation, open **Updates → Check for updates → Update & restart**. If the startup check failed in 0.16.0, use this manual check after the workspace has loaded. Alternatively, download and run `Desktop.Buddy_0.16.1_x64-setup.exe` to upgrade the existing installation. Local goals, profile and credentials are retained.

Validation: 54 frontend tests and 115 backend tests passed; one optional credential-vault test remains ignored. Production build, signing checks and the first-dashboard IPC regression test passed. The update is signed with the existing trusted key, which remains on its owner's PC.
