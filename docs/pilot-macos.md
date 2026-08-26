# Earth Stories macOS pilot

This is a pilot build for named testers. It is not a released product.

The application is **unsigned and not notarized**: Apple has not checked it, so
macOS will refuse to open it until you explicitly allow it. That is expected,
and the steps below are the whole workaround. It is published as a pre-release on a public
repository, so the file is technically downloadable by anyone, but it is aimed
at a small group and is not announced. Please do not pass it around — the point
of a pilot is that everyone running it knows what they are running.

## Install

1. Find out which Mac you have: **Apple menu → About This Mac**. A chip whose
   name begins with **Apple** (any M-series) means **arm64**; a chip named
   **Intel** means **x64**.
2. Download the `.dmg` matching that chip from the pilot release.
3. Open the `.dmg` and drag **Earth Stories** into **Applications**.

## First launch

macOS will block the first launch because the app is unsigned. There are two
ways past it; try the first, and use the second if the first is refused.

**Right-click to open.** In Applications, right-click (or Control-click) **Earth
Stories** and choose **Open**, then **Open** again in the dialog. On some macOS
versions this route is refused for unsigned applications, in which case:

**Remove the quarantine flag.** Open Terminal and run:

```bash
xattr -dr com.apple.quarantine "/Applications/Earth Stories.app"
```

That command removes the "downloaded from the internet" marker macOS attaches
to the app. It does not change the application, and it affects only this one
app. After it runs, open Earth Stories normally.

If you would rather not run either step, say so — that is useful feedback in
itself, and it is exactly the friction that signing removes.

## What to expect the first time

- **You choose where stories live.** Earth Stories asks for a folder and keeps
  your projects there as ordinary files. Put it somewhere you back up.
- **Data tools download on demand.** The first time you prepare a GeoTIFF, a
  shapefile, or a point cloud, the app downloads the tools for that format and
  shows you the size first. This is normal, it happens once per format, and it
  needs an internet connection.

Neither of these is an error, even though both involve a wait.

## What to try

Roughly in this order, because each step depends on the one before:

1. Create a story and give it a title.
2. Add a text chapter and write a paragraph.
3. Import a GeoTIFF or a CSV with coordinates, and prepare it.
4. Add a map chapter using that data and move the camera to frame it.
5. Preview the story as a reader.
6. Build a publication.
7. Quit the app, reopen it, and confirm your story is exactly as you left it.

Step 7 matters more than it looks: it is the one that catches saving bugs.

## Known gaps in this build

- No automatic updates. New pilots arrive as a new download.
- Unsigned, as described above.
- Upgrading over a previous version and uninstalling have not been verified on
  a range of machines. Keep your stories folder somewhere separate from the app.
- The MCP server for agent-driven authoring does not connect to the packaged
  application. It currently works only against a development checkout.
- The in-app feedback recorder is a development-only feature and is not in this
  build.

## Reporting

Send findings to Anthony. Please include:

- your macOS version and chip (**About This Mac**),
- what you were doing, what you expected, and what happened,
- a screenshot if the problem is visible.

Small annoyances are worth reporting. A pilot is for finding the things that
are obvious to a new user and invisible to the person who built it.
