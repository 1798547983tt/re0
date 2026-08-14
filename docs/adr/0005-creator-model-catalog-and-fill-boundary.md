# Creator model catalog and fill boundary

**Status**: accepted

The creator wizard supports both the current SillyTavern connection and an independent OpenAI-compatible endpoint. Model discovery reads every page returned by `/models`, while AI fill keeps an offline fallback and manual model entry. A request starts only after the user clicks and confirms; the response becomes a local fill preview patch, and existing fields or the story anchor are never overwritten. Transport, authentication, timeout, and malformed-response failures remain visible instead of becoming a silent “no reply”. API keys and model settings never enter the role state payload.
