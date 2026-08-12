import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { CredentialStore } from "./credentials.js";

export type { CredentialStore, StoredCredentials } from "./credentials.js";

export interface ServiceLimits {
  maxBodyBytes: number;
  maxAssetBytes: number;
  maxExportBodyBytes: number;
  maxShareCardBodyBytes: number;
}

export const DEFAULT_SERVICE_LIMITS: Readonly<ServiceLimits> = Object.freeze({
  maxBodyBytes: 2 * 1024 * 1024,
  maxAssetBytes: 5 * 1024 * 1024 * 1024,
  maxExportBodyBytes: 50 * 1024 * 1024,
  maxShareCardBodyBytes: 8 * 1024 * 1024,
});

export interface LocalServiceConfig {
  host: string;
  port: number;
  projectsDirectory: string;
  viewerDirectory: string;
  editorDirectory: string | null;
  conversion: {
    pixiExecutable: string;
    manifestDirectory: string;
    workerDirectory: string;
    pixiHome: string | null;
  };
  credentials: CredentialStore;
  capabilityToken: string | null;
  limits?: Partial<ServiceLimits>;
}

export interface ResolvedLocalServiceConfig extends Omit<
  LocalServiceConfig,
  "limits"
> {
  limits: ServiceLimits;
}

function requireAbsolute(name: string, value: string | null): void {
  if (value !== null && !isAbsolute(value))
    throw new Error(`${name} must be an absolute path.`);
}

function resolveLimits(overrides: Partial<ServiceLimits> = {}): ServiceLimits {
  const limits = { ...DEFAULT_SERVICE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error(`${name} must be a non-negative integer.`);
  return limits;
}

export async function resolveLocalServiceConfig(
  config: LocalServiceConfig,
): Promise<ResolvedLocalServiceConfig> {
  if (config.host !== "127.0.0.1")
    throw new Error("The local service host must be 127.0.0.1.");
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65_535)
    throw new Error(
      "The local service port must be an integer from 0 to 65535.",
    );
  if (config.capabilityToken !== null && !/\S/.test(config.capabilityToken))
    throw new Error(
      "capabilityToken must be null or contain a non-whitespace character.",
    );

  requireAbsolute("projectsDirectory", config.projectsDirectory);
  requireAbsolute("viewerDirectory", config.viewerDirectory);
  requireAbsolute("editorDirectory", config.editorDirectory);
  requireAbsolute(
    "conversion.pixiExecutable",
    config.conversion.pixiExecutable,
  );
  requireAbsolute(
    "conversion.manifestDirectory",
    config.conversion.manifestDirectory,
  );
  requireAbsolute(
    "conversion.workerDirectory",
    config.conversion.workerDirectory,
  );
  requireAbsolute("conversion.pixiHome", config.conversion.pixiHome);

  let viewerInfo;
  try {
    viewerInfo = await stat(config.viewerDirectory);
  } catch {
    throw new Error("The configured viewer directory does not exist.");
  }
  if (!viewerInfo.isDirectory())
    throw new Error("The configured viewer directory is not a directory.");

  try {
    await mkdir(config.projectsDirectory, { recursive: true });
    await access(config.projectsDirectory, constants.R_OK | constants.W_OK);
  } catch {
    throw new Error("The configured projects directory cannot be created.");
  }

  return {
    ...config,
    conversion: { ...config.conversion },
    limits: resolveLimits(config.limits),
  };
}
