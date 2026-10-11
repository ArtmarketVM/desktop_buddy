# Feedback

Buddy has one feedback mechanism: **Share an idea** (Feedback page) opens a draft email
to `artmarket.vm@gmail.com` in the user's own email app. The user reviews and sends it;
nothing is transmitted by Buddy, and no activity logs, goals or profile data are attached.

- Success: "Email draft opened. Press Send in your email app to deliver it."
- Error (no email app configured): the error is shown with a **Copy message** button so the
  text can be sent manually to the same address.
- The recipient is fixed in the backend (`src-tauri/src/contact.rs`); message content cannot
  change recipients or headers.

Star ratings after a goal (`ProductFeedback`) are separate and stay on this device.

The optional private contact service (Supabase, see `docs/CONTACT_SERVICE.md`) is not used
for feedback. It is only needed later for confirmed subscriptions and research opt-ins, and
no project has been deployed.
