
## Loading (5-second rule)
Every page must show content or a skeleton immediately and never leave the user
waiting more than 5 seconds: parallelise requests, put deadlines (`withTimeout`)
on secondary lookups, and use `PageLoadState` / `FilmonsBrandLoader` /
`useLoadDeadline` so a slow load becomes "taking longer than expected" + Retry.
See `CLAUDE.md` for the full rule.
