English | [日本語](../api.md)

# HTTP API

Every endpoint requires the host-injected managed bearer. Browser requests go through the authenticated service proxy. JSON writes require application/json and are limited to 4 MiB; UTF-8 HTML is limited to 2 MiB.

## Reports

- GET /health: readiness.
- GET /api/reports?q=TEXT: search title/project/category/tags; starred filters stars, category and tag filter exact names, uncategorized=true filters empty categories. No content bodies. archive is active (default), archived, or all; sort is updated_desc (default), updated_asc, created_desc, created_asc, or title_asc. Unknown values return 400. IDs break sorting ties.
- POST /api/reports: required title (200 characters) and content; optional project (100), sourceNotes (16000), format (default html), category, tags. Returns 201 with ID/revision.
- GET /api/reports/{id}: current content, metadata, revisions, saving results.
- PUT /api/reports/{id}: creation content fields plus expectedRevision; retains older revisions and rejects conflicts with 409. Does not change classification.
- PATCH /api/reports/{id}: starred boolean.
- POST /api/reports/{id}/archive: archived and expectedArchived booleans; conflicts return 409. Preserves content, timestamps, classification, and save results without triggering saving. Responses default legacy reports to archived:false.
- GET /api/reports/{id}/versions/{revision}: original content, format/mediaType, and metadata for that revision.
- GET /api/reports/{id}/versions/{revision}/view: sandboxed HTML response. Only presentation=1 appends a dimension-reporting script to a viewing copy. Plain view and download remain original. The parent accepts only finite dimensions from its own iframe with a matching URL, bounded to 12000px wide and 120000px high. The iframe remains an opaque sandbox.
- GET /api/reports/{id}/versions/{revision}/download: original attachment download.

Revisions start at 1. Unsupported formats return 415, empty content 400, oversized content 413, missing IDs/revisions 404. There is no deletion API or automatic relative-asset collection.

## Classification

Creation accepts category (60 characters) and tags (up to 20 strings, 40 characters each). Whitespace is trimmed and duplicate tags removed. POST /api/reports/{id}/classification accepts category, tags, and expectedClassificationRevision from the current GET response. Conflicts return 409. Classification does not create content revisions or trigger automatic saving.

## Artifact import

POST /api/imports/preview accepts an HTML file path and optionally workspaceId or sessionId, not both. It reads only a host-authorized source and returns content, a suggested title, and sha256 without creating a report.

POST /api/imports/artifact accepts that source, expectedSha256, title, and optional project/sourceNotes/category/tags. A changed source returns 409. A new snapshot returns 201. The same source/content returns 200 with duplicate:true and importedRevision, without overwriting metadata or sending another automatic save. Different contents create a new report. GET responses expose origin metadata with source/hash/imported revision.

Remote URLs are not accepted. The UI decomposes same-host preview URLs into the source fields. Source files and session history are not modified or automatically scanned.

## Saving settings

GET /api/settings returns saveMode, saveAgentId, saveSkillName, notionDestination, host connection status, and aiEnabled. PUT accepts the first four fields. Modes are off/manual/auto; an enabled mode requires a destination. If the AI feature is disabled, GET reports effective mode off and configuredSaveMode while preserving stored settings. GET /api/agents returns available parent agents/default metadata.

## Save requests and results

POST /api/reports/{id}/save accepts requestId (UUID), revision, and optional retryAfterCheck. It returns 202 with request state. Repeating an ID returns the same request; reusing it for another target returns 409. One unfinished request per report is sent at a time. Disabled AI rejects new save requests.

queued/creating/sending/requested describe acceptance. Agent reports use saved/partial/needs_input/error. uncertain is unknown delivery and is not automatically replayed. Check the saving conversation and Notion before using a new ID with retryAfterCheck:true. Answer needs_input in the existing conversation.

The request fixes its content revision, destination, saving agent, and policy. On saved, automatic mode can send the latest newer revision. Partial/error/needs_input/uncertain do not immediately continue that chain. Results remain bound to the revision actually sent.

POST /api/reports/{id}/save-result requires the managed bearer plus requestId, sessionId, revision, callbackToken, status, optional pageUrl, verified, summary, and error. The callback token is passed only to the saving agent, not the UI. saved requires verified:true and a real Notion page URL; partial also requires a page URL. Completed requests reject later reports with 409. Previous page links survive failures.

Verification is the saving agent's report, not a direct Notion check by the extension. AI-off configurations accept results for previously sent work but do not launch new saves.
