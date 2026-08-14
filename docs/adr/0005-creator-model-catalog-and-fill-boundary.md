# Creator model catalog and fill boundary

**Status**: accepted

The creator wizard supports both the current SillyTavern connection and an independent OpenAI-compatible endpoint. Model discovery reads every page returned by `/models`, while AI fill keeps an offline fallback and manual model entry. The independent endpoint is called directly by the message iframe, so its requests appear in that API service's logs rather than the SillyTavern backend; the interface exposes the actual channel, target, model, prompt length, and request phase without revealing the API key.

A request starts only after the user clicks. The response becomes a local fill preview patch, and existing fields or the story anchor are never overwritten. Common response wrappers are unwrapped; fields outside the requested page and values that violate the field schema are ignored and reported. The remaining allowed fields are still previewable instead of losing the whole response to one bad field. Transport, authentication, timeout, and malformed-response failures remain visible instead of becoming a silent “no reply”. API keys and model settings never enter the role state payload.
