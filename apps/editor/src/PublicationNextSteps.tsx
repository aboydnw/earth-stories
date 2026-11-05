/** Host links open a provider page only. No files or credentials are sent. */
export function PublicationNextSteps() {
  return (
    <section
      className="publication-next-steps"
      aria-labelledby="publication-next-steps-title"
    >
      <h3 id="publication-next-steps-title">Put your story online</h3>
      <p>Building saves files on this computer. Nothing has been uploaded.</p>
      <ol>
        <li>
          <strong>Review your release.</strong> Only share data and images you
          have permission to publish. Keep source credits and license notices
          with the files.
        </li>
        <li>
          <strong>Choose a host.</strong> Use{" "}
          <strong>Publish to the web</strong> below for GitHub Pages, or upload
          your publication ZIP or folder to a static host. Upload the
          publication, not your editable project folder.
        </li>
        <li>
          <strong>Check and share.</strong> Open the hosted story and test each
          chapter. In <strong>Verify and share after deployment</strong>, enter
          its final URL. Build again and replace the hosted files so link
          previews and embeds use that address.
        </li>
      </ol>
      <details className="publish-disclosure">
        <summary>
          <span>Upload to another host</span>
          <small>Netlify or Cloudflare Pages</small>
        </summary>
        <div className="publish-disclosure__body">
          <p>
            <strong>Netlify Drop:</strong> Open{" "}
            <a
              href="https://app.netlify.com/drop"
              target="_blank"
              rel="noreferrer"
            >
              Netlify Drop
            </a>{" "}
            and drop the ZIP or publication folder. Sign in to claim and manage
            the site, then check its visibility before sharing. Unclaimed
            uploads may be temporarily password-protected.{" "}
            <a
              href="https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/"
              target="_blank"
              rel="noreferrer"
            >
              Netlify instructions
            </a>
          </p>
          <p>
            <strong>Cloudflare Pages:</strong> In the signed-in dashboard, open
            Workers &amp; Pages, create an application, and choose the
            drag-and-drop upload. Give it a name and upload the ZIP or folder.
            Dashboard uploads allow up to 1,000 files and 25 MiB per file. A
            Direct Upload project cannot later switch to Git integration.{" "}
            <a
              href="https://developers.cloudflare.com/pages/get-started/direct-upload/"
              target="_blank"
              rel="noreferrer"
            >
              Cloudflare instructions
            </a>
          </p>
          <p>
            Keep <strong>index.html</strong> at the site root and preserve the
            folder structure. For large map data, check the host’s file limits
            and HTTP byte-range support. Connected sources still need internet
            and must allow requests from the new site.
          </p>
          <p>
            The interactive story needs a web server; double-clicking index.html
            may not load maps. These links only open the provider. You choose
            what to upload there.
          </p>
        </div>
      </details>
    </section>
  );
}
