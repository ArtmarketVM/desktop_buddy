# Desktop Buddy 0.26.1

Chat improvements for Windows and macOS.

- **Mascot chat** is a taller, support-style window with the whole conversation, a close button in the
  top-right corner and the mascot below the chat instead of over the send button.
- **Voice:** recording stops by itself after a pause in speech (about 1.5 s), keeps a short tail so the
  last word is not clipped, and in the mascot chat the transcript is sent as a message right away. Quiet
  speech is no longer discarded when every recognizer score is low.
- **Chats in the app:** Enter sends (Shift+Enter adds a line). The goal-context toggle, the "Buddy" header
  text and the "Your conversations with Buddy" subtitle are gone.
- **Chat titles** describe the topic of the conversation, written by the AI after the first and third
  exchange, instead of repeating the first message.
- **Sending:** a message leaves the field and shows in the chat immediately, and you can keep typing; messages
  sent while Buddy is still answering are queued and delivered in order. A message that fails to send is put
  back in the field.
- **Answers** now read like a helpful assistant: Buddy answers the question first, writes out prompts, drafts and
  examples instead of describing them, and no longer recites the goal name or ids.
- **New chat while Buddy is answering** no longer loses anything: the question and answer are saved in the chat
  they were asked in, and starting or opening another chat no longer discards the reply.
- **Chats screen redesign**: quiet sidebar with working search (titles and message text), selected chat shown
  as a soft gray row, and the chat title with its options menu (delete) in the header.
- Your question is saved the moment you send it, so switching chats, an error or closing the app can no longer
  lose it. Empty chats are removed automatically when you move on, and "New chat" reuses an empty one.
- Buddy answers are formatted like Claude: paragraphs, headings, bold text, lists and copyable code blocks
  (a prompt gets a Copy button). Older answers that were saved as one long line are repaired when shown.
- Answers show when they were sent, have a Copy button, and list their web sources in a compact "Sources" list.
  When you ask for websites or tools, Buddy now writes the actual names in the answer.
- Chat only changes goals when your own words clearly ask for it: the AI must quote the instruction, the
  quote must be in your message and contain an action word, and questions or wishes ("what do I need for
  it", "I want to finish...") never change anything.
- Each time the mascot chat is opened it starts a new conversation (an empty one is reused), which appears
  in the app's Chats; earlier chats stay in the list.

Windows install and restart and an exact macOS 14.5 machine were not verified from this Mac, and the
microphone behavior was tested with unit tests and a layout check, not with live speech.
