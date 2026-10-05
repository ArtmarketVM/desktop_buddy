# Desktop Buddy 0.17.1 signing transition

Status: prepared, unpublished. All 0.17.0 Goals / Today functionality is preserved from commit `3b68228`. This release enrolls the owner's second Windows computer as signer `developer2` and advances the embedded trust epoch from 1 to 2. The existing `primary` public key remains trusted.

The second computer holds its own Windows DPAPI-protected private key. Only its public key is included in the repository. The primary private key is not available on this computer.

Validation of the combined 0.17.1 source is recorded in VALIDATION.md. No installer has been built or published.

## Build the transition on the original computer

Commit and push the reviewed release source, then pull that commit on the original computer, which holds the existing primary key. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task test
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task release -SignerId primary
```

Publish a new GitHub Release with tag `v0.17.1`. Attach the generated installer, its `.exe.sig`, `latest.json`, `updates-epoch-1.json`, and `updates-epoch-2.json` from `src-tauri/target/release/bundle/nsis/`. Commit the generated public `updates/compatibility.json` so later releases retain the epoch-1 transition. Do not overwrite artifacts from older versions.

The transition must be signed by `primary`. Existing epoch-1 installations do not yet trust `developer2`, so that new key cannot sign its own transition. The legacy `latest.json` stays pinned to the original 0.13.0 bridge; epoch 1 receives the primary-signed 0.17.1 bridge.

## Release from the second computer afterward

After the primary-signed transition is published, pull the source and committed compatibility archive onto the second computer. Use a new version synchronized across all five version files, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task test
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task release -SignerId developer2
```

Publish all generated updater channel files with that new release. Epoch-2 installations accept either trusted key; older installations first follow the pinned, primary-signed transition.
