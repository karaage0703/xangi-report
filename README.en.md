English | [日本語](README.md)

# xangi-report

A xangi extension for saving HTML reports created in conversation and reading them on desktop or mobile. HTML is the initial supported format and the default when no format is specified.

## Features

- Add HTML, import previous artifacts, and retain originals and previous revisions.
- Run interactive JavaScript charts, filters, and calculations inside a sandbox separated from management UI.
- One category and multiple tags, with search, stars, and classification filters.
- Hide/show the library and resize it by dragging or keyboard. Preferences persist in the browser.
- Sort by update time, addition time, or title; archive reports and restore them.
- Fit large HTML to width or page, change zoom, and scroll in both directions.
- Optional manual or automatic Notion saving through a selected xangi agent and user-owned saving skill.

## Quickstart

Node.js 22 or newer and npm are required. There are no runtime dependencies.

```sh
npm ci
npm run configure -- --id xangi-report --name xangi-report --features ui,ai
npm test
npm run build
```

Follow [setup](XANGI_SETUP.en.md) to register and start the extension. Plan data migration and recovery before changing an existing installation's ID or storage path. Notion saving is off by default. An [interactive sample](examples/comparison.html) is included.

## Documentation

- [Setup and registration](XANGI_SETUP.en.md)
- [Usage, settings, recovery, and verification](docs/en/usage.md)
- [Structure, authentication, and storage](docs/en/design.md)
- [HTTP API](docs/en/api.md)
- [Generation/registration skill](skills/xangi-report/SKILL.md) / [Notion saving skill](skills/xangi-report-save/SKILL.md)
- [Japanese setup](XANGI_SETUP.md) / [usage](docs/usage.md) / [design](docs/design.md) / [API](docs/api.md)

xangi-report was inspired by [HTML共有くん](https://github.com/minorun365/html-share). Many thanks to its creators.

## License

MIT
