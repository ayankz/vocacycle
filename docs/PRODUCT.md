# Product

## Purpose

VocaCycle helps users learn unfamiliar English vocabulary through personalized, repeated audio listening. It is mobile-first and requires very little interaction: choose words → generate → play → put the phone away.

## Core loop

**ADD → GENERATE → LISTEN → REPEAT**

1. **Add:** While consuming an audiobook, podcast, YouTube video, conversation, or other content outside VocaCycle, the user encounters an unfamiliar English word and quickly saves it in VocaCycle.
2. **Generate:** Later, the user selects approximately 5–20 saved words and requests a personalized Audio Session.
3. **Listen:** The user plays one continuous session, primarily for passive listening.
4. **Repeat:** The user listens again to reinforce the vocabulary.

## MVP workflow and approved screens

| Screen | Intended role |
| --- | --- |
| Home | Entry point to the core learning workflow |
| Vocabulary | Save and review English words |
| Create Audio | Configure and generate an Audio Session from the selected vocabulary. |
| Generating Audio | Show generation progress/status |
| Audio Ready | Present the generated session for playback |
| Audio Player | Listen and control playback |
| Audio Library | Find previously generated sessions |
| Progress | Present measurable listening activity such as listening time, active listening days, session plays, and listening history. |

These screens and an approved visual design system already exist and will be transferred to Figma before frontend implementation.

## Audio Session behavior

For each selected word, the recording follows:

**WORD → TRANSLATION → 5–7 natural English example sentences → NEXT WORD**

The session is one continuous audio file accompanied by timeline metadata. Playback time will synchronize the displayed word, translation, current example sentence, word position, and example position.

Planned playback capabilities include background and lock-screen playback, playback speed, seeking ±15 seconds, and session repeat. Offline/local caching is a later enhancement. These capabilities are not implemented yet.

## Product principles

- Passive listening is the primary learning mode.
- VocaCycle is not currently a spaced-repetition or flashcard product.
- Audio Sessions do not require question-and-answer interaction or testing.
- The player treats an Audio Session as one continuous listening experience rather than individual word tracks.
- Word-level and example-level timeline data exists primarily to synchronize the Now Playing UI.
- Repeat Session is a playback behavior and does not regenerate audio.
- The user should be able to start playback and put the phone away.

## Explicit boundaries

- VocaCycle does not play, store, or manage external audiobooks, podcasts, YouTube, or Spotify content.
- External content is where users encounter words; it is outside the product's media workflow.
- The primary experience is repeated listening to generated vocabulary sessions.
- Progress reports measurable listening behavior rather than inferred vocabulary mastery.
- An active listening day means a day with actual audio listening activity, not merely opening the app.
- Translation language must be configurable; the initial product design currently uses English vocabulary with Russian translation as the working example.
- Detailed implementation contracts may evolve, but the approved core workflow and screen behavior should not be changed without an explicit product decision.
