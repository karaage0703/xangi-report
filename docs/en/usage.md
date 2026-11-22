English | [日本語](../usage.md)

# Usage, settings, and verification

## Read and add reports

Open xangi-report from xangi's extensions. Choose “HTMLを追加” to select a file or paste HTML, review metadata, and save. Use a self-contained UTF-8 HTML file up to 2 MiB, including CSS, images, and required libraries. JavaScript is enabled.

On desktop, the library is on the left and the reader on the right. The header library button and the library close button hide/show it. Drag the separator, or focus it with Tab and use Left/Right (Shift for larger steps), Home/End, or double-click to reset. Escape cancels a drag. Width and collapse preferences persist in this browser and are clamped to preserve reader space.

Mobile shows the library and reader separately. Use the list/back or header library button to switch. Desktop width preferences are preserved but the separator is hidden.

“更新” creates a new revision without deleting earlier ones. Use the version selector to read older content and “HTMLを取得” for the original file. Conflicting updates require reloading. The bundled skill supports generation and registration from conversation.

Large fixed-size HTML fits the reader width by default. Choose “全体表示” in the zoom control to fit both dimensions, or choose 25–200%. When larger than the reader, scroll the content region horizontally and vertically. Viewing adjustments never change stored originals or revisions.

Open “絞り込み・並び順” below search to change stars, archive view, sorting, and classification. It starts collapsed to leave room for reports. Its summary indicates active filters and archive views even while closed.


## Sorting and archiving

The reader keeps its title, zoom, details/actions, and expand-view controls on one line. Open “詳細・操作” (⋯) for the full title, timestamps, source, classification, editing, stars, revisions, and archiving. “表示を広げる” temporarily hides the top menu and library; the same button restores them without changing library preferences. Escape also closes details or restores the normal view while focus is in the management UI.

The default order is latest update first. You can also choose newest additions, oldest updates/additions, or title order. Archiving does not change update times. For imported reports, addition time means import time.

Use “アーカイブ” in the reader to hide a report from the normal list. Select the archived view to find it and choose “アーカイブから戻す” to restore it. The all view includes both. Archiving preserves HTML, revisions, classification, stars, and Notion results and does not trigger AI saving. View and sort preferences persist in this browser.

## Import older HTML

Expand “xangiの過去のHTMLから取り込む” inside the add dialog. Enter a path or preview URL on this xangi, then review the fetched content. Specify a workspace ID for another workspace, or a session ID for an attachment; do not supply both. Review the title, project, category, and tags before saving.

Import copies the source without editing it. A source changed after preview requires another review. The same source and content open the existing imported revision without overwriting metadata. Changed content from the same source creates a separate report. Files exported from ChatGPT or other applications can use the ordinary file picker.

The extension does not automatically scan all history. Bulk imports are separate, explicitly scoped work. It does not gather relative assets or external libraries.

## Categories and tags

Set one category (60 characters) and up to 20 tags (40 characters each) at creation or through “分類”. An empty category is uncategorized. Classification edits do not create HTML revisions or trigger automatic Notion saving. Existing categories are offered as suggestions and conflicts are detected.

Combine category, tag, star, and search filters. Search includes classification names. Filters persist in this browser; clear them with the reset button. Hierarchies and bulk renaming are not implemented.

## Notion saving

Configure a destination, saving agent, skill, and timing. The default is off. Manual saves the displayed revision; auto applies to subsequent new/updated reports, not all previous reports. Turning it off does not delete existing sessions or pages.

The saving agent uses its connected Notion tools; no Notion key is entered in the extension. Policy precedence is workspace/skills/NAME/SKILL.md, repository/skills-local/NAME/SKILL.md, then bundled xangi-report-save. Names use lowercase letters, digits, and hyphens, up to 64 characters. User-owned policies take precedence.

Acceptance and completion are distinct. The agent reports saved, partial, needs_input, error, or uncertain results. Completion requires a real page URL and reported read-back verification; the extension does not directly verify Notion content. Answer questions in the saving conversation. Check that conversation and Notion before retrying an uncertain request.

Saves for one report are serialized. After completion, a newer pending revision can be sent. Older results do not mark newer content saved. A changed destination does not reuse a page at the previous destination. Notion does not execute report JavaScript; readable content and original-file attachments/links are separate, and omissions must be reported. Local storage and reading work without Notion.

## Features and settings

extension.config.json owns the ID, display name, version, and ui/device/ai switches. Configure also generates the manifest. Supported independent selections are ui, ai, ui,ai, and none; device ingress is not implemented. Disabling UI removes management UI routes. Disabling AI preserves saved preferences while reporting effective saving mode off and preventing new AI saves. Deterministic artifact retrieval is independent of AI execution.

```sh
npm run configure -- --features ui,ai
npm test
npm run build
```

Build rejects config/manifest disagreement. Choose identity before registration. Changing an existing ID requires explicit data migration.

- DATA_DIR uses the prefix printed by configure: XANGI_XANGI_DASH_REPORT_DATA_DIR for the default ID. It must be absolute and applies at startup.
- Legacy XANGI_REPORT_DATA_DIR remains supported for the default ID. Conflicting canonical and legacy paths fail startup.
- XANGI_EXTENSION_AUTH_TOKEN is the host-injected service bearer, at least 32 characters. Never expose it to browsers or logs.
- XANGI_EXTENSION_HOST_URL is the parent host origin. There is no automatic switch to another host.
- XANGI_TOKEN authenticates host APIs; the service token is not reused.
- XANGI_EXTENSION_INSTANCE_ID defines storage scope and must not change without checking existing data.

Choose the saving agent in saving settings; omission delegates to the host default. Report has no remote-host, device, or environment-selected saving-agent mode. Policy changes apply to new requests and do not cancel already sent work.

## Storage and recovery

The default is workspace/.ID/INSTANCE_HASH/state.json, preserving workspace/.xangi-report/INSTANCE_HASH for existing Report installations. The hash is the first 16 SHA-256 hex characters of the instance ID, or of default when absent. Source-local paths and symlinks resolving into source are rejected.

A single-writer lock, serialized mutations, and temporary-file rename protect storage. Corrupt data fails startup instead of resetting. Back up while stopped. When relocating storage, compare counts, IDs, all revisions, settings, and Notion mappings; changing a path alone is not migration. Keep originals until verified.

Data schema 2 backs up exact schema-1 text to state.schema-1.SHA256.json before adding classification while retaining existing information. For rollback, stop, back up newer data too, then restore the schema-1 copy as state.json. Data schema is distinct from manifest schema.

EOF/SIGTERM/SIGINT shut down the extension. Dead-owner locks can be recovered; incomplete locks and PID reuse require inspecting usage before manual recovery. Concurrent multi-process crash recovery is unsupported. Interrupted queued/creating/sending requests become uncertain without automatic replay; requested/needs_input continue in their saving conversations.

All revisions are retained; automatic deletion and total-capacity management are not implemented. Monitor space and keep stopped backups. Updates and unlinking do not remove durable data. update.prepare runs npm ci/test/build.

## Boundaries and verification

The sandbox restricts parent DOM, cookies/storage, networking, forms, and other frames. HTML requiring CDN resources, external fonts/APIs, eval, or relative assets may not work unchanged. Downloads retain original contents. Markdown/PDF and public sharing links are unsupported.

npm test covers config, feature selection, HTTP, persistence, migrations, and saving states. Build checks syntax and manifest agreement. An existing Python Playwright/Chromium installation can run browser checks; it is not a product dependency.

```sh
uv run --no-project python test/browser.py /absolute/path/to/artifacts
```

Mocks do not verify live AI/Notion. Verify status/doctor, real UI, save read-back, and access from the user's device in the destination environment. See the [API reference](api.md).
