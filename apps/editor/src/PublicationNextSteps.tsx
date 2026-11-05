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
          <strong>Publish to the web</strong> below for GitHub Pages. For
          another host, check the upload limits first: this viewer includes
          large map runtime files. Upload the publication, not your editable
          project folder.
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
          <span>Other hosting options</span>
          <small>Netlify CLI and upload limits</small>
        </summary>
        <div className="publish-disclosure__body">
          <p>
            <strong>
              Netlify is an advanced option, not a guaranteed fit.
            </strong>{" "}
            Netlify Drop can stall on files above 10 MB or projects above 50 MB.
            This viewer includes 34–39 MB runtime files. Netlify also warns that
            files above 10 MB are not well-supported by its CDN, so test the
            hosted story before relying on it.{" "}
            <a
              href="https://docs.netlify.com/build/configure-builds/troubleshooting-tips/#large-files-or-sites"
              target="_blank"
              rel="noreferrer"
            >
              Netlify large-file guidance
            </a>
          </p>
          <p>If you choose Netlify, use its CLI instead of Drop:</p>
          <ol>
            <li>
              Install current Node.js LTS with npm. Extract the ZIP and open a
              terminal in the publication folder containing index.html.
            </li>
            <li>
              Run <code>npx netlify-cli@latest login</code>. You approve Netlify
              access in your browser; the CLI saves that sign-in.
            </li>
            <li>
              Run <code>npx netlify-cli@latest deploy --dir . --no-build</code>.
              Choose or create the correct site and team. This uploads a draft
              for review without rebuilding your files.
            </li>
            <li>
              Test the draft, including maps. To publish live, run{" "}
              <code>
                npx netlify-cli@latest deploy --dir . --prod --no-build
              </code>
              . Check site visibility before sharing.
            </li>
          </ol>
          <p>
            <a
              href="https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/"
              target="_blank"
              rel="noreferrer"
            >
              Netlify CLI setup
            </a>{" "}
            ·{" "}
            <a
              href="https://cli.netlify.com/commands/deploy/"
              target="_blank"
              rel="noreferrer"
            >
              Deploy command reference
            </a>
          </p>
          <p>
            <strong>
              Cloudflare Pages is not suitable for current exports.
            </strong>{" "}
            Its 25 MiB per-file limit is smaller than the bundled DuckDB runtime
            files. Both dashboard and command-line uploads have this limit.{" "}
            <a
              href="https://developers.cloudflare.com/pages/get-started/direct-upload/"
              target="_blank"
              rel="noreferrer"
            >
              Cloudflare upload limits
            </a>
          </p>
          <p>
            <strong>For GitHub Pages, use Publish to the web below.</strong>{" "}
            GitHub’s browser file uploader also has a 25 MiB limit. The
            integrated publishing flow avoids that browser limit; manual uploads
            need Git or the GitHub API, not dragging the ZIP into a repository.
          </p>
          <p>
            Keep <strong>index.html</strong> at the site root and preserve the
            folder structure. For large map data, check the host’s file limits
            and HTTP byte-range support. Connected sources still need internet
            and must allow requests from the new site.
          </p>
          <p>
            The interactive story needs a web server; double-clicking index.html
            may not load maps. These links only open instructions. You choose
            what to upload and authorize the provider separately.
          </p>
        </div>
      </details>
    </section>
  );
}
