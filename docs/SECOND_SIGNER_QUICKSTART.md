# Second Developer: Create an Update Signing Key

This is a one-time setup on the second developer's Windows computer. It creates a private key that stays on that computer and a public key that can be shared with the repository owner.

## Create the key

1. Open PowerShell in your local `desktop_buddy` project folder. This is the folder that contains `package.json` and `scripts`.

2. Update the project and install its Node dependencies:

   ```powershell
   git pull
   node --version
   npm --version
   npm ci
   ```

   If `node` or `npm` is not recognized, install Node.js LTS, reopen PowerShell, and repeat these commands.

3. Create your key. Use a short lowercase ID with letters, numbers, and hyphens only:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\setup-signing-key.ps1 -SignerId developer2
   ```

   Replace `developer2` with your own ID. Run this once only; keep using the same key for future releases.

4. The script prints the path to `public-key.pub`. Send that file to the repository owner.

## Keep the private key private

The script stores the private key at:

```text
%USERPROFILE%\.desktop-buddy\signers\developer2\signing-key.dpapi
```

Never send, upload, commit, or paste `signing-key.dpapi` into chat. Only `public-key.pub` is meant to be shared. The private file is protected for your Windows account and computer; copying it to another computer may not work. Keep this computer and Windows account available for future releases, and tell the repository owner before changing computers or reinstalling Windows.

## What happens after you send the public key

The repository owner adds `public-key.pub` to the app's trusted signer list and publishes one transition release signed with the owner's existing key. This is required because currently installed copies of the app do not yet trust your new key. After users install that transition release and you pull the updated project, you can sign later releases with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Task release -SignerId developer2
```

The release command creates a signed Windows installer and updater manifests locally. It does not publish them automatically. Coordinate the version and release with the repository owner; never overwrite an already published version. Only developers with GitHub write/release permission can publish the generated files.
