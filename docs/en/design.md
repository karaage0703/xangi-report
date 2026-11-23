English | [日本語](../design.md)

# Structure, authentication, and storage

## Recommended UI typography and density

Use the host file browser as the default density reference, so lists and controls stay consistent across screens. Follow the host extension guide for names and icons without renaming existing IDs. These are recommended defaults for new and maintained UI; user preferences and task-specific presentation take priority. No exception approval or mandatory SDK is required.

- List text, buttons, navigation and ordinary labels: 13px (`--xangi-font-ui`).
- Supporting descriptions and dates: 12px (`--xangi-font-caption`); short counts and badges: 11px (`--xangi-font-micro`). Keep primary information readable.
- Screen title: 18px (`--xangi-font-heading`); section heading: 16px (`--xangi-font-section`). Keep large promotional headings out of work areas.
- Reading content, including articles, mail, Markdown and conversations: 16px with 1.6–1.75 line height (`--xangi-font-reading`). Content headings can use 24/18/16px.
- Code and file editors: 13px monospace (`--xangi-font-code`); prominent chart values: 24px (`--xangi-font-metric`).

Use the device's system font for the management UI. Let the browser select fallback fonts for Japanese and other characters. Preserve browser text enlargement. Each extension owns the same named CSS variables and works standalone. The parent iframe leaves descendant font selection to the embedded page. Preserve imported report HTML and external preview typography.

Keep existing layout, functions and reading order. Use 4px spacing increments, quiet neutral surfaces, blue actions, thin borders and 6–8px radii where appropriate. Mobile inputs stay at 16px and touch targets around 44px independently of text size. Screen titles normally stay 18px on desktop and mobile; do not shrink long-form text solely for narrow screens.

Check computed styles, long labels, scrolling, focus, input and back navigation at desktop/mobile widths in light/dark themes, both embedded and standalone. Report device conditions that remain unverified.

## Template and modules

The baseline is [xangi-extension-template](https://github.com/karaage0703/xangi-extension-template) 0.1.1 at commit 8680333fef6840596b0e12dae8475282786e065a. Report follows its configuration, manifest generation, entrypoint, storage, feature-module, and bilingual documentation structure. Report's version is independent of the template.

- extension.config.json / src/config.mjs: validate identity/version/features, derive environment prefixes, generate the manifest.
- scripts/configure.mjs: generate config and manifest together; build also checks agreement.
- scripts/xangi-extension / src/main.mjs: managed HTTP entrypoint, readiness, shutdown.
- src/server.mjs: service bearer/Origin checks, base API, enabled features, shutdown.
- src/storage.mjs: storage validation, single writer, originals/revisions/settings/save requests, migration.
- src/features/ui.mjs: embed trusted management resources authored under public/.
- src/features/ai.mjs: authenticated parent-host requests, saving sessions/turns, artifact retrieval.
- src/classification.mjs / imports.mjs / saves.mjs / formats/html.mjs: Report-specific classification, importing, saving workflows, and format handling.

The counter example is replaced by Report's data model. UI and AI are independent; unimplemented device ingress is rejected. Saving conversations remain available for questions and uncertain-delivery recovery, unlike the template's synchronous example that closes its session after the response. These are intentional domain adaptations.

## Authentication and reading

All service APIs require the injected bearer and reject unrelated Origins. UI assets/APIs resolve under the service proxy; embedded management assets also work with the host's inline-only UI CSP. Direct UI responses authorize exact resource hashes. Host-API credentials are separate from service authentication and are never sent to browsers.

Stored originals, plain views, and downloads are unchanged. An allow-scripts iframe without allow-same-origin and sandbox/CSP response headers separate it from management privileges. Network, forms, and other frames are restricted. Direct views receive the same response restrictions.

Only presentation=1 viewing copies receive a dimension-reporting script. The parent verifies the source Window, current URL, and finite dimensions, bounded to 12000px wide and 120000px high. It scales the appropriately sized iframe and scrolls the outer viewport without sharing DOM access. Growth stops when iframe resizing repeatedly expands the content, including when width and height affect each other. Fitted sizes are bounded by the available viewport after reserving space for a vertical scrollbar. Overflow can scroll inside the iframe when the original allows it. Authored CSPs that prohibit the script may prevent automatic measurement.

## Data and updates

Report IDs, metadata, classification, HTML revisions, and saving results are durable. Classification revisions are independent of content revisions. Explicit import sources are checked by the host; source identity/content hashes prevent duplicates atomically. Changed preview hashes require review. Original files are never edited.

Archive state is independent of content revisions; omitted legacy schema-2 values read as false without rewriting stored data. expectedArchived detects concurrent changes. Archiving preserves timestamps, revisions, classifications, and save results. Normal listings return active reports. Orders include ascending/descending update or addition time and Japanese title order, with IDs breaking ties. Browser preferences retain the view and order.

Storage is outside source and scoped by workspace/instance, preserving legacy paths and environment settings. Exact schema-1 backups precede migration to schema 2. Serialized rename, locking, and fail-closed validation prevent silent resets. See [usage](usage.md) for recovery.

Saving results must match request ID, session ID, content revision, and callback token, and report a real page URL/read-back verification. Unknown delivery is not automatically replayed; old results never mark new revisions saved. Automatic saving follows user-enabled settings.

## UI

On startup, the UI requests settings, the report list, and the selected report's metadata in parallel. The iframe loads the selected HTML revision for viewing. The editor fetches the original HTML when the user opens it.

The reader header uses one line. Source metadata and editing actions start collapsed. Long titles are truncated in the toolbar and available in full in the details panel. Expanding the reader temporarily hides the top menu and library without changing stored layout preferences. Desktop/mobile verification covers opening details, performing actions, closing them to read, and restoring the normal view.

Neutral surfaces, a blue accent, system fonts, and light/dark themes support a desktop library/reader and separate mobile screens. The library collapses and resizes while preserving reader space. Controls have labels, visible focus, touch-sized targets, status/errors, and retained input. Shared host navigation is not duplicated. Management code does not edit report DOM.

## Verification scope

Tests cover config/manifest, all four supported feature selections, storage/migration/authentication, import/classification, saving states, and desktop/mobile operations. Host parser/proxy and live UI checks complement fixtures; mocks are not live AI/Notion verification. Required host capabilities and destination-specific checks are documented in [setup](../../XANGI_SETUP.en.md).
