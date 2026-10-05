# Desktop Buddy 0.17.1 signing transition

This primary-signed transition preserves all 0.17.0 Goals / Today functionality from commit `3b68228`. It enrolls the second Windows computer as signer `developer2` and advances the embedded trust epoch from 1 to 2. The existing `primary` public key remains trusted. After installing 0.17.1, Buddy accepts future updates signed by either trusted developer.

The second computer holds its own Windows DPAPI-protected private key. Only its public key is included in the repository. The primary private key is not available on this computer.

Validation of the combined 0.17.1 source is recorded in VALIDATION.md. The original computer built and verified the signed installer on 2026-10-06: 5,335,602 bytes, SHA-256 `453af89db3d58f60d6f800d8c3594548a57cd4f48d2b7d0605fa4ffd1564f620`. Both epoch-1 and epoch-2 manifests point to this primary-signed transition, and the epoch-1 bridge is recorded in `updates/compatibility.json`.

## Update channels

- `latest.json` preserves the original 0.13.0 bridge for legacy installations.
- `updates-epoch-1.json` offers the primary-signed 0.17.1 transition to existing installations and remains archived for future releases.
- `updates-epoch-2.json` offers 0.17.1 to installations that trust both developers.

The release includes the Windows x64 installer, its `.exe.sig`, all three channel files and `SHA256SUMS.txt`. In Buddy, choose **Check for updates**, then **Update & restart**. Installing the setup file over the current version is also supported. Goals, settings and credentials stay on the device.

The transition must be signed by `primary`. Existing epoch-1 installations do not yet trust `developer2`, so that new key cannot sign its own transition. The legacy `latest.json` stays pinned to the original 0.13.0 bridge; epoch 1 receives the primary-signed 0.17.1 bridge.

## Release from the second computer afterward

After the primary-signed transition is published, pull the source and committed compatibility archive onto the second computer. Use a new version synchronized across all five version files, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task test
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task release -SignerId developer2
```

Publish all generated updater channel files with that new release. Epoch-2 installations accept either trusted key; older installations first follow the pinned, primary-signed transition.
