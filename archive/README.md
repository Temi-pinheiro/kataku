# Archive

Superseded artifacts moved out of the active tree during the pre-build cleanup
(roadmap step: *protocols promoted → archive → push*). Nothing here is imported
by the app, scripts, or tests. Kept (not deleted) so the history and originals
stay one `git mv` away.

## `content/teacher/drafts/`

The six protocol **review drafts**. Each was byte-identical to its promoted
final in `content/teacher/<language>-protocol.md` at archive time — the
promotion path in the drafts' own README had already been run for all six
(id / es / fr wired into the app; it / zh / ja finals authored and waiting on
their language packs). The drafts had served their purpose, so they live here
rather than in `content/`.

To revive the review workflow, move a file back to
`content/teacher/drafts/`, edit, then re-run the promotion path
(`embed-protocols`).

## `design/`

The earlier "design system cards" reference folder (the set originally synced to
claude.ai/design). Superseded by `design_handoff_kataku/` at the repo root: six
of its seven files were duplicated there verbatim, and its `home/home.html` was
the pre-rebuild version (the handoff carries the rebuilt Home plus Map, Stories,
Settings, usability studies, and screenshots — the reference the current app was
built from). `design_handoff_kataku/` is now the single live design source.
