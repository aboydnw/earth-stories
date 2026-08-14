import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const componentCodes = [
  "main",
  "service",
  "renderer",
  "conversion",
  "publishing",
  "credentials",
  "workspace",
  "tools",
] as const;
const errorCodes = [
  "none",
  "unexpected",
  "service-startup",
  "service-readiness",
  "workspace-invalid",
  "conversion-failed",
  "publishing-failed",
  "credential-store",
  "tool-provision",
] as const;
const lifecycleStages = [
  "startup",
  "workspace",
  "service",
  "editing",
  "conversion",
  "publishing",
  "shutdown",
] as const;
const serviceStatusCodes = [
  "starting",
  "ready",
  "draining",
  "stopped",
  "failed",
] as const;
const platforms: readonly NodeJS.Platform[] = [
  "aix",
  "android",
  "darwin",
  "freebsd",
  "haiku",
  "linux",
  "openbsd",
  "sunos",
  "win32",
  "cygwin",
  "netbsd",
];
const applicationVersion = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;

type ComponentCode = (typeof componentCodes)[number];
type ErrorCode = (typeof errorCodes)[number];
type LifecycleStage = (typeof lifecycleStages)[number];
type ServiceStatusCode = (typeof serviceStatusCodes)[number];

interface DiagnosticServiceState {
  statusCode?: ServiceStatusCode;
  ready?: boolean;
  acceptingMutations?: boolean;
  runningConversions?: number;
  runningPublishes?: number;
}

interface DiagnosticRecord {
  componentCode: ComponentCode;
  errorCode: ErrorCode;
  lifecycleStage: LifecycleStage;
  timestamp: string;
  appVersion: string;
  platform: NodeJS.Platform;
  serviceState?: DiagnosticServiceState;
}

interface DiagnosticDocument {
  formatVersion: 1;
  records: DiagnosticRecord[];
}

export interface DesktopDiagnosticsOptions {
  directory: string;
  appVersion: string;
  platform: NodeJS.Platform;
  now?: () => Date;
  maxRecords?: number;
  maxAgeMs?: number;
}

const setOf = <Value extends string>(values: readonly Value[]) =>
  new Set<string>(values);
const componentCodeSet = setOf(componentCodes);
const errorCodeSet = setOf(errorCodes);
const lifecycleStageSet = setOf(lifecycleStages);
const serviceStatusCodeSet = setOf(serviceStatusCodes);
const platformSet = setOf(platforms);

function requireCode<Value extends string>(
  value: unknown,
  values: Set<string>,
  name: string,
): Value {
  if (typeof value !== "string" || !values.has(value))
    throw new TypeError(`Invalid diagnostic ${name} code.`);
  return value as Value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireCount(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`Invalid diagnostic ${name}.`);
  return value as number;
}

function sanitizeServiceState(
  value: unknown,
): DiagnosticServiceState | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value))
    throw new TypeError("Invalid diagnostic service state.");
  const state: DiagnosticServiceState = {};
  if (value.statusCode !== undefined)
    state.statusCode = requireCode<ServiceStatusCode>(
      value.statusCode,
      serviceStatusCodeSet,
      "service status",
    );
  for (const name of ["ready", "acceptingMutations"] as const) {
    if (value[name] === undefined) continue;
    if (typeof value[name] !== "boolean")
      throw new TypeError(`Invalid diagnostic ${name}.`);
    state[name] = value[name];
  }
  for (const name of ["runningConversions", "runningPublishes"] as const) {
    if (value[name] !== undefined)
      state[name] = requireCount(value[name], name);
  }
  return Object.keys(state).length > 0 ? state : undefined;
}

function sanitizeStoredRecord(value: unknown): DiagnosticRecord | null {
  if (!isRecord(value)) return null;
  try {
    const timestamp =
      typeof value.timestamp === "string" ? value.timestamp : "";
    if (new Date(timestamp).toISOString() !== timestamp) return null;
    if (
      typeof value.appVersion !== "string" ||
      !applicationVersion.test(value.appVersion)
    )
      return null;
    if (typeof value.platform !== "string" || !platformSet.has(value.platform))
      return null;
    const record: DiagnosticRecord = {
      componentCode: requireCode<ComponentCode>(
        value.componentCode,
        componentCodeSet,
        "component",
      ),
      errorCode: requireCode<ErrorCode>(value.errorCode, errorCodeSet, "error"),
      lifecycleStage: requireCode<LifecycleStage>(
        value.lifecycleStage,
        lifecycleStageSet,
        "lifecycle stage",
      ),
      timestamp,
      appVersion: value.appVersion,
      platform: value.platform as NodeJS.Platform,
    };
    const serviceState = sanitizeServiceState(value.serviceState);
    if (serviceState) record.serviceState = serviceState;
    return record;
  } catch {
    return null;
  }
}

export class DesktopDiagnostics {
  readonly path: string;
  readonly #appVersion: string;
  readonly #platform: NodeJS.Platform;
  readonly #now: () => Date;
  readonly #maxRecords: number;
  readonly #maxAgeMs: number;
  #pending: Promise<void> = Promise.resolve();

  constructor(options: DesktopDiagnosticsOptions) {
    this.path = join(options.directory, "diagnostics.json");
    this.#appVersion = options.appVersion;
    this.#platform = options.platform;
    this.#now = options.now ?? (() => new Date());
    this.#maxRecords = options.maxRecords ?? 200;
    this.#maxAgeMs = options.maxAgeMs ?? 14 * 24 * 60 * 60 * 1_000;
    if (!applicationVersion.test(this.#appVersion))
      throw new TypeError("Invalid diagnostic application version.");
    if (!platformSet.has(this.#platform))
      throw new TypeError("Invalid diagnostic platform.");
    if (!Number.isSafeInteger(this.#maxRecords) || this.#maxRecords < 1)
      throw new TypeError(
        "Diagnostic record limit must be a positive integer.",
      );
    if (!Number.isFinite(this.#maxAgeMs) || this.#maxAgeMs < 0)
      throw new TypeError("Diagnostic retention age must be non-negative.");
  }

  async record(value: unknown): Promise<void> {
    if (!isRecord(value)) throw new TypeError("Invalid diagnostic record.");
    const record: DiagnosticRecord = {
      componentCode: requireCode<ComponentCode>(
        value.componentCode,
        componentCodeSet,
        "component",
      ),
      errorCode: requireCode<ErrorCode>(value.errorCode, errorCodeSet, "error"),
      lifecycleStage: requireCode<LifecycleStage>(
        value.lifecycleStage,
        lifecycleStageSet,
        "lifecycle stage",
      ),
      timestamp: this.#now().toISOString(),
      appVersion: this.#appVersion,
      platform: this.#platform,
    };
    const serviceState = sanitizeServiceState(value.serviceState);
    if (serviceState) record.serviceState = serviceState;
    const operation = this.#pending.then(async () => {
      const document = await this.#read();
      document.records.push(record);
      document.records = this.#retain(document.records);
      await this.#persist(document);
    });
    this.#pending = operation.catch(() => undefined);
    await operation;
  }

  async exportTo(destination: string): Promise<void> {
    await this.#pending;
    const document = await this.#read();
    document.records = this.#retain(document.records);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, this.#serialize(document), { mode: 0o600 });
    await chmod(destination, 0o600);
  }

  async #read(): Promise<DiagnosticDocument> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.records))
        return { formatVersion: 1, records: [] };
      return {
        formatVersion: 1,
        records: parsed.records
          .map(sanitizeStoredRecord)
          .filter((record): record is DiagnosticRecord => record !== null),
      };
    } catch {
      return { formatVersion: 1, records: [] };
    }
  }

  #retain(records: DiagnosticRecord[]): DiagnosticRecord[] {
    const cutoff = this.#now().getTime() - this.#maxAgeMs;
    return records
      .filter((record) => new Date(record.timestamp).getTime() >= cutoff)
      .slice(-this.#maxRecords);
  }

  async #persist(document: DiagnosticDocument): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = join(directory, `.diagnostics-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, this.#serialize(document), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, this.path);
      await chmod(this.path, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  #serialize(document: DiagnosticDocument): string {
    return `${JSON.stringify(document, null, 2)}\n`;
  }
}
