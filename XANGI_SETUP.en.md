English | [日本語](XANGI_SETUP.md)

# AI-guided setup

Read README.en.md, extension.config.json, xangi-extension.json, and [usage](docs/en/usage.md). Work only with the selected instance and workspace; do not inspect unrelated files or personal memory.

1. For a new installation, resolve the ID, display name, and independent UI/AI features, then run configure. Device ingress is not implemented. Preserve existing IDs and storage paths; plan backup and migration before changing them.
2. Run npm ci, npm test, and npm run build. Build checks syntax and config/manifest agreement. Read help using the absolute CLI supplied by the destination instance.
3. Within the authorized scope, register the manifest, start only this extension, and inspect status/doctor. The paths below are placeholders. No host restart is needed.
4. Compare existing skills before copying generation/registration skills into the user workspace. Do not overwrite customizations. Prefer user-owned saving policies.
5. Verify sample registration, JavaScript interactions, library collapse/resize, and retention of content, revisions, and classification after restart. If migrating data, read back and compare counts, IDs, all revisions, settings, and Notion page mappings.
6. Enable Notion only when needed, using the saving agent's connected tools, destination, and saving skill. Verify attachment support, actual saving, and read-back. Do not describe mock coverage as a completed external save. Report effective settings, results, and unknowns.

```sh
/absolute/path/to/xangi extension --help
/absolute/path/to/xangi extension link /absolute/path/to/xangi-report/xangi-extension.json
/absolute/path/to/xangi extension start xangi-report
/absolute/path/to/xangi extension status xangi-report
/absolute/path/to/xangi extension doctor xangi-report
```

Required host capabilities are schema-2 managed HTTP, readiness, and authenticated service/UI proxies. AI saving also uses agents/runtime-settings/sessions/chat APIs. Artifact import uses artifact-preview or session-attachment APIs.

The reference host's package reports 0.1.0; this is not a compatibility guarantee. Record verified host capabilities and unknowns. The manifest has no machine-enforced host version range. Publishing, merging, unrelated settings, and additional external delivery are outside setup. Review [storage and recovery](docs/en/usage.md#storage-and-recovery).
