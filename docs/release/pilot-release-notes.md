**This is an unsigned pilot build for named testers. It is not a released
product, and Apple has not checked it.**

macOS will refuse to open it until you explicitly allow it. The
[macOS pilot guide](https://github.com/aboydnw/earth-stories/blob/main/docs/pilot-macos.md)
has the two ways past that, what to expect on first launch, and what is worth
trying.

Download the `.dmg` matching your Mac: `arm64` for Apple silicon, `x64` for
Intel. **About This Mac** tells you which.

## Known gaps

- Unsigned and not notarized.
- No automatic updates; a new pilot is a new download.
- Upgrade and uninstall behavior is unverified across machines. Keep your
  stories folder separate from the application.
- The MCP server does not connect to the packaged application.

## Verifying your download

`SHA256SUMS.txt` lists the checksum of each artifact:

```bash
shasum -a 256 -c earth-stories-0.1.0-pilot.1-SHA256SUMS.txt
```

The release manifest records `signed: false` and `releaseReady: false`. That is
accurate and deliberate for a pilot.
