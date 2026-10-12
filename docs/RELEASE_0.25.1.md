# Desktop Buddy 0.25.1

Fixes for macOS, shared build for Windows and macOS.

- The Accessibility permission block now responds. **Check permission** reports whether access
  is enabled or still blocked and explains why, the page re-checks by itself every two seconds
  while blocked, and a new **Reset and ask again** button clears the stale macOS entry for
  Desktop Buddy and asks again. macOS ties the Accessibility switch to the exact signature of
  the app, so after an update the switch can look on while access stays blocked.
- The mascot window is pinned to every Space and above full-screen apps on macOS, so it is no
  longer left behind on another desktop when you switch Spaces.

Published macOS builds are still ad-hoc signed, so the permission may need the reset again
after future updates until Developer ID signing is configured. Verified locally: the window sits
at the status level and is on screen; Space switching, the reset prompt and a Windows install
were not exercised from this Mac.
