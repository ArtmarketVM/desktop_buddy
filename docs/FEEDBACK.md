# Feedback

The current user-facing Feedback page has one delivery mechanism: **Share an idea** (Feedback page) opens a draft email
to `artmarket.vm@gmail.com` in the user's own email app. The user reviews and sends it;
nothing is transmitted by sumi, and no activity logs, goals or profile data are attached.

- Success: "Email draft opened. Press Send in your email app to deliver it."
- Error (no email app configured): the error is shown with a **Copy message** button so the
  text can be sent manually to the same address.
- The recipient is fixed in the backend (`src-tauri/src/contact.rs`); message content cannot
  change recipients or headers.

The backend retains a local `ProductFeedback` command/table for 1–5 ratings, but the current frontend has no post-goal star-rating form. Do not describe that backend capability as a visible shipped flow. Companion usefulness feedback follows its own local decision-feedback path.

A separate optional [contact service](CONTACT_SERVICE.md) has a backend feedback/subscription API, but the current FeedbackCard calls the email-draft path rather than that API. Its deployment and delivery must be checked independently. The deployed [Built-in AI gateway](SUPABASE_GATEWAY.md) is a different function; it does not automatically upload feedback, local profiles or AI usefulness ratings.
