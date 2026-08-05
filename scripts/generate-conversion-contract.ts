import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import {
  conversionJobEventSchema,
  conversionJobRequestSchema,
} from "../packages/story-schema/src/conversion.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = resolve(repositoryRoot, "conversion/schema");
await mkdir(outputDirectory, { recursive: true });

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://earth-stories.dev/schema/conversion/v1.json",
  title: "Earth Stories conversion protocol v1",
  oneOf: [
    z.toJSONSchema(conversionJobRequestSchema, { target: "draft-2020-12" }),
    z.toJSONSchema(conversionJobEventSchema, { target: "draft-2020-12" }),
  ],
};

await writeFile(
  resolve(outputDirectory, "conversion-v1.schema.json"),
  `${JSON.stringify(schema, null, 2)}\n`,
);
