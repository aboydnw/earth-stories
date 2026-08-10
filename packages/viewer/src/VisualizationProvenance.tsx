import type { PublicationAsset } from "@earth-stories/story-schema";
import {
  activeFilterDescriptions,
  formatProvenanceDate,
  safeHttpUrl,
  sourceFreshness,
} from "./provenance.js";

function DateValue({ value }: { value: string }) {
  return <time dateTime={value}>{formatProvenanceDate(value)}</time>;
}

export function VisualizationProvenance({
  assets,
  now,
}: {
  assets: PublicationAsset[];
  now?: Date;
}) {
  const unique = [
    ...new Map(assets.map((asset) => [asset.id, asset])).values(),
  ];
  if (!unique.length) return null;
  const summaryFreshness = unique.map((asset) => sourceFreshness(asset, now));
  const stale = summaryFreshness.some(({ state }) => state === "stale");
  const current = summaryFreshness.every(({ state }) => state === "current");
  const freshnessLabel = stale
    ? "May include stale data"
    : current
      ? "Freshness current"
      : "Freshness details";
  return (
    <details className="story-provenance">
      <summary>
        <span>{unique.map(({ label }) => label).join(" + ")}</span>
        <small
          data-freshness={stale ? "stale" : current ? "current" : "unknown"}
        >
          {freshnessLabel}
        </small>
      </summary>
      <div className="story-provenance__content">
        {unique.map((asset) => {
          const provenance = asset.provenance;
          const sourceUrl =
            safeHttpUrl(provenance.sourceUrl) ??
            (asset.delivery === "connected" ? safeHttpUrl(asset.href) : null);
          const licenseUrl = safeHttpUrl(provenance.licenseUrl);
          const filters = activeFilterDescriptions(asset);
          const freshness = sourceFreshness(asset, now);
          return (
            <section key={asset.id} className="story-provenance__source">
              <h3>{asset.label}</h3>
              <p
                className="story-provenance__freshness"
                data-freshness={freshness.state}
              >
                {freshness.label}
              </p>
              <dl>
                <div>
                  <dt>Publisher</dt>
                  <dd>
                    {provenance.publisher ??
                      asset.attribution ??
                      "Not provided"}
                  </dd>
                </div>
                {sourceUrl ? (
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a href={sourceUrl} target="_blank" rel="noreferrer">
                        Open source
                      </a>
                    </dd>
                  </div>
                ) : null}
                {provenance.licenseName || licenseUrl ? (
                  <div>
                    <dt>License</dt>
                    <dd>
                      {licenseUrl ? (
                        <a href={licenseUrl} target="_blank" rel="noreferrer">
                          {provenance.licenseName ?? "License details"}
                        </a>
                      ) : (
                        provenance.licenseName
                      )}
                    </dd>
                  </div>
                ) : null}
                {provenance.dataUpdatedAt ? (
                  <div>
                    <dt>Data updated</dt>
                    <dd>
                      <DateValue value={provenance.dataUpdatedAt} />
                    </dd>
                  </div>
                ) : null}
                {provenance.accessedAt ? (
                  <div>
                    <dt>Accessed</dt>
                    <dd>
                      <DateValue value={provenance.accessedAt} />
                    </dd>
                  </div>
                ) : null}
                {provenance.temporalCoverage ? (
                  <div>
                    <dt>Temporal coverage</dt>
                    <dd>
                      {provenance.temporalCoverage.start ? (
                        <DateValue value={provenance.temporalCoverage.start} />
                      ) : (
                        "Start not provided"
                      )}
                      {" – "}
                      {provenance.temporalCoverage.end ? (
                        <DateValue value={provenance.temporalCoverage.end} />
                      ) : (
                        "End not provided"
                      )}
                    </dd>
                  </div>
                ) : null}
                {provenance.spatialCoverage ? (
                  <div>
                    <dt>Spatial coverage</dt>
                    <dd>{provenance.spatialCoverage}</dd>
                  </div>
                ) : null}
              </dl>
              {provenance.transformations.length ? (
                <div>
                  <h4>Transformations</h4>
                  <ol>
                    {provenance.transformations.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {filters.length ? (
                <div>
                  <h4>Active display filters</h4>
                  <ul>
                    {filters.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </details>
  );
}
