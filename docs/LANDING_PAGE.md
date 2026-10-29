# Public download landing page

Public URL: https://artmarketvm.github.io/desktop_buddy/

The owner authorized GitHub Pages publication on 30 October 2026. The existing Pages source was changed from `main` at `/` to the dedicated [`gh-pages` branch](https://github.com/ArtmarketVM/desktop_buddy/tree/gh-pages) at `/`. The application root index.html remains unchanged. Never merge the website branch's root files into app main.

## Content and behavior

- The app’s pixel **sumi** wordmark (bundled Silkscreen, weight 400, 0.08em letter spacing), the owner’s English slogan, the supplied temporary Full HD MP4 and two platform download buttons. The owner’s follow-up removed the header mascot/stretching animation.
- Instrument Sans, the app's Cloud/Lime colors and the owner's requested sky-blue highlights; responsive layout, keyboard focus and reduced-motion behavior.
- A single public GitHub latest-release metadata request resolves the exact matching Apple Silicon DMG and Windows x64 EXE. It accepts only uploaded, nonempty, complete pairs from the exact public repository's stable release. Future releases update automatically without editing the page.
- If metadata/JavaScript is unavailable or GitHub rate-limits the request, buttons open the latest release page. The metadata request times out after eight seconds. No API keys, personal accounts, backend, Supabase access, analytics or browser storage are required by the page.
- The small line below the buttons shows only the resolved version. GitHub and Privacy links remain beneath it.

## Replace the temporary video

Edit [`site-config.mjs` on gh-pages](https://github.com/ArtmarketVM/desktop_buddy/blob/gh-pages/site-config.mjs). Set `youtubeId` to the official eleven-character YouTube video ID. Leave it empty to play the existing MP4. No desktop update or server is needed.

YouTube uses a privacy-enhanced iframe created only after the visitor clicks Play, with a direct Watch on YouTube fallback. Before clicking, no YouTube iframe loads. A future official video can use an updated local poster; update the Open Graph image if needed. The MP4 remains available as a fallback until intentionally removed.

## Privacy and publishing

The existing application policy URL **/desktop_buddy/docs/privacy.html** is preserved with an exact copy of main's docs/privacy.html and its font assets. When the policy changes on main, copy it and any referenced fonts to the same paths on gh-pages, publish, then run `npm run verify:privacy` from the application checkout. Website publication must not silently change the application's configured policy URL.

Commit and push website-only edits to gh-pages. GitHub's built-in Pages deployment handles publication; no desktop CI or installer build is triggered by that branch. Source tests are `node --test tests/site.test.mjs` from the website checkout. Preview via a local static server, then verify native video play/pause, download targets, a mobile viewport and the retained policy URL. The website README contains the source and third-party asset details.

Initial source: website `3a64951`, application/privacy/animation source `ab48f00137d119400b961a58b6f643acddfbe60d`, latest public app v0.49.4. Website changes do not bump the desktop app version or alter signing/update trust.
