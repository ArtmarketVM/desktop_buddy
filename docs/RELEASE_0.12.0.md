Nine illustrated role cards now loop continuously in either direction. **Other** lets you describe any role, and every profile can include declared app names.

This release also delivers the workspace changes since 0.10.0: fixed companion colors, Light/Dark themes, simpler saved checklists, installed Windows app categories, a separate profile menu, a calm desktop companion with a visibility switch, and expanded feedback.

Optional private role research has separate consent and email confirmation, sharing only email, role and entered apps. The Supabase/mail template is prepared but not deployed. Without a server, profile data remains local and feedback opens an email draft. Research does not subscribe users to marketing.

Download the Windows x64 setup executable, or use **Updates → Check for updates → Update & restart** from an updater-enabled installation. The updater verifies the installer signature. Local goals, settings and provider credentials are preserved. The private signing key remains on the owner's PC; no key is uploaded to GitHub.

Validation: 44 frontend tests, 91 Rust tests (one optional credential-vault test skipped), eight isolated contact contract tests and the release-manifest test passed. TypeScript/Vite production build passed. The privacy notice remains explicitly labeled as a draft.

The attached Russian developer handoff explains the changes and how to update both the installed app and the source checkout.
