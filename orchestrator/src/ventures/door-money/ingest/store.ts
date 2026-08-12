import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  BookKbIndexSchema,
  type BookKbIndex
} from "../../../contracts/book-kb-index.js";
import { StyleProfileSchema } from "../../../contracts/style-profile.js";
import { atomicWriteJson, readJson } from "../../../state.js";
import { annotationToBookChunk } from "./annotate.js";
import {
  inspectDoorMoneyPublicArtifacts,
  type DoorMoneyPublicArtifact
} from "../public-boundary.js";
import type {
  BookIngestPrivateArtifacts,
  BookIngestPrivateStore,
  BookIngestReport
} from "./run.js";

const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const CoverageSchema = z.strictObject({
  chapters: z.number().int().nonnegative(),
  chunks: z.number().int().nonnegative(),
  annotations: z.number().int().nonnegative(),
  embeddings: z.number().int().nonnegative(),
  styleExemplars: z.number().int().nonnegative()
});
const ReportSchema: z.ZodType<BookIngestReport> = z.strictObject({
  status: z.enum(["complete", "refused"]),
  reason: z.string().nullable(),
  dry: z.boolean(),
  reused: z.boolean(),
  manuscriptHash: HashSchema.nullable(),
  cycleId: z.string().nullable(),
  actualUsd: z.number().finite().nonnegative(),
  dayUsd: z.number().finite().nonnegative(),
  programUsd: z.number().finite().nonnegative(),
  calls: z.number().int().nonnegative(),
  coverage: CoverageSchema
});

const PublicVersionSchema = z.strictObject({
  manuscriptHash: HashSchema,
  status: z.enum(["current", "superseded"]),
  generatedAt: z.string().datetime(),
  supersededAt: z.string().datetime().nullable(),
  supersededBy: HashSchema.nullable()
});
const PublicVersionsSchema = z.strictObject({
  schemaVersion: z.literal("door-money-knowledge-versions/1"),
  currentManuscriptHash: HashSchema,
  versions: z.array(PublicVersionSchema).min(1)
});

function hashHex(manuscriptHash: string): string {
  return HashSchema.parse(manuscriptHash).slice("sha256:".length);
}

function privateVersionPath(manuscriptHash: string, tail: string): string {
  return `kb/versions/${hashHex(manuscriptHash)}/${tail}`;
}

function publicVersionPath(manuscriptHash: string, tail: string): string {
  return `ventures/door-money/knowledge/versions/${hashHex(manuscriptHash)}/${tail}`;
}

function publicArtifactPath(relativePath: string): string {
  return `state/${relativePath}`;
}

function assertSeparatedRoots(privateRoot: string, stateRoot: string): void {
  const privatePath = path.resolve(privateRoot);
  const publicPath = path.resolve(stateRoot);
  const privateFromPublic = path.relative(publicPath, privatePath);
  const publicFromPrivate = path.relative(privatePath, publicPath);
  const nested = (relative: string) => relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (nested(privateFromPublic) || nested(publicFromPrivate)) {
    throw new Error("Private book clone and public state roots must not overlap");
  }
}

function publicIndex(artifacts: BookIngestPrivateArtifacts, report: BookIngestReport): BookKbIndex {
  const annotations = new Map(artifacts.annotations.map((annotation) => [annotation.chunkId, annotation]));
  return BookKbIndexSchema.parse({
    schemaVersion: "book-kb-index/1",
    ventureId: "door-money",
    ingestionId: `book-ingest-${hashHex(artifacts.manuscriptHash).slice(0, 16)}`,
    manuscriptHash: artifacts.manuscriptHash,
    manuscriptBytes: artifacts.manuscriptBytes,
    modelVersions: {
      annotation: artifacts.annotationModelVersion,
      rollup: artifacts.rollupModelVersion,
      embedding: artifacts.embeddingModelVersion
    },
    ingestionCostUsd: report.actualUsd,
    chunkCount: artifacts.chunked.chunks.length,
    chapters: artifacts.rollups.chapters,
    entityIndex: artifacts.rollups.entityIndex,
    themeIndex: artifacts.rollups.themeIndex,
    chunks: artifacts.chunked.chunks.map((chunk) => annotationToBookChunk({
      chunk,
      annotation: annotations.get(chunk.id)!
    })),
    generatedAt: artifacts.styleProfile.generatedAt
  });
}

function promotedManifest(
  current: unknown,
  manuscriptHash: string,
  generatedAt: string
): z.infer<typeof PublicVersionsSchema> {
  if (current === null) {
    return PublicVersionsSchema.parse({
      schemaVersion: "door-money-knowledge-versions/1",
      currentManuscriptHash: manuscriptHash,
      versions: [{
        manuscriptHash,
        status: "current",
        generatedAt,
        supersededAt: null,
        supersededBy: null
      }]
    });
  }
  const manifest = PublicVersionsSchema.parse(current);
  if (manifest.currentManuscriptHash === manuscriptHash) return manifest;
  if (manifest.versions.some((version) => version.manuscriptHash === manuscriptHash)) {
    throw new Error("A superseded public knowledge version cannot become current again");
  }
  return PublicVersionsSchema.parse({
    schemaVersion: "door-money-knowledge-versions/1",
    currentManuscriptHash: manuscriptHash,
    versions: [
      ...manifest.versions.map((version) => version.status === "current"
        ? { ...version, status: "superseded", supersededAt: generatedAt, supersededBy: manuscriptHash }
        : version),
      {
        manuscriptHash,
        status: "current",
        generatedAt,
        supersededAt: null,
        supersededBy: null
      }
    ]
  });
}

export class LocalCloneBookIngestStore implements BookIngestPrivateStore {
  constructor(
    readonly privateRoot: string,
    readonly stateRoot: string
  ) {
    assertSeparatedRoots(privateRoot, stateRoot);
  }

  async summary(manuscriptHash: string): Promise<BookIngestReport | null> {
    const raw = await readJson<unknown>(
      this.privateRoot,
      privateVersionPath(manuscriptHash, "complete-report.json"),
      null
    );
    return raw === null ? null : ReportSchema.parse(raw);
  }

  async writeVersion(artifacts: BookIngestPrivateArtifacts, report: BookIngestReport): Promise<void> {
    if (report.status !== "complete" || report.manuscriptHash !== artifacts.manuscriptHash) {
      throw new Error("Only a matching complete ingestion may write a private version");
    }
    if (await this.summary(artifacts.manuscriptHash)) {
      throw new Error(`Private book version ${artifacts.manuscriptHash} is complete and immutable`);
    }
    const annotationByChunk = new Map(
      artifacts.annotations.map((annotation) => [annotation.chunkId, annotation])
    );
    await Promise.all(artifacts.chunked.chunks.map((chunk) => atomicWriteJson(
      this.privateRoot,
      privateVersionPath(artifacts.manuscriptHash, `chunks/${chunk.id}.json`),
      {
        schemaVersion: "private-book-chunk/1",
        manuscriptHash: artifacts.manuscriptHash,
        ...chunk,
        annotation: annotationByChunk.get(chunk.id)
      }
    )));
    await Promise.all([
      atomicWriteJson(this.privateRoot, privateVersionPath(artifacts.manuscriptHash, "annotations.json"), {
        schemaVersion: "private-book-annotations/1",
        manuscriptHash: artifacts.manuscriptHash,
        annotations: artifacts.annotations
      }),
      atomicWriteJson(this.privateRoot, privateVersionPath(artifacts.manuscriptHash, "rollups.json"), {
        schemaVersion: "private-book-rollups/1",
        manuscriptHash: artifacts.manuscriptHash,
        ...artifacts.rollups
      }),
      atomicWriteJson(this.privateRoot, privateVersionPath(artifacts.manuscriptHash, "embeddings.json"), {
        schemaVersion: "private-book-embeddings/1",
        manuscriptHash: artifacts.manuscriptHash,
        model: artifacts.embeddingModelVersion,
        embeddings: artifacts.embeddings
      }),
      atomicWriteJson(this.privateRoot, privateVersionPath(artifacts.manuscriptHash, "style-profile.json"), artifacts.styleProfile)
    ]);

    const index = publicIndex(artifacts, report);
    const style = StyleProfileSchema.parse(artifacts.styleProfile);
    const manifestPath = "ventures/door-money/knowledge/versions.json";
    const manifest = promotedManifest(
      await readJson<unknown>(this.stateRoot, manifestPath, null),
      artifacts.manuscriptHash,
      style.generatedAt
    );
    const indexPath = publicVersionPath(artifacts.manuscriptHash, "book-kb-index.json");
    const stylePath = publicVersionPath(artifacts.manuscriptHash, "style-profile.json");
    const currentPath = "ventures/door-money/knowledge/current.json";
    const current = {
      schemaVersion: "door-money-knowledge-current/1",
      manuscriptHash: artifacts.manuscriptHash,
      bookKbIndexPath: publicArtifactPath(indexPath),
      styleProfilePath: publicArtifactPath(stylePath),
      generatedAt: style.generatedAt
    };
    const publicArtifacts: DoorMoneyPublicArtifact[] = [
      { path: publicArtifactPath(indexPath), content: JSON.stringify(index) },
      { path: publicArtifactPath(stylePath), content: JSON.stringify(style) },
      { path: publicArtifactPath(manifestPath), content: JSON.stringify(manifest) },
      { path: publicArtifactPath(currentPath), content: JSON.stringify(current) }
    ];
    const violations = inspectDoorMoneyPublicArtifacts(publicArtifacts);
    if (violations.length > 0) {
      throw new Error(`Door Money public boundary refused output: ${violations.map(({ field, message }) => `${field}: ${message}`).join("; ")}`);
    }
    await Promise.all([
      atomicWriteJson(this.stateRoot, indexPath, index),
      atomicWriteJson(this.stateRoot, stylePath, style)
    ]);
    await atomicWriteJson(this.stateRoot, manifestPath, manifest);
    await atomicWriteJson(this.stateRoot, currentPath, current);
    // The completion report is deliberately last. Its presence is the idempotency marker.
    await atomicWriteJson(
      this.privateRoot,
      privateVersionPath(artifacts.manuscriptHash, "complete-report.json"),
      report
    );
  }
}

export async function openLocalCloneBookIngestStore(input: {
  privateRoot: string;
  stateRoot: string;
  requireGitClone?: boolean;
}): Promise<LocalCloneBookIngestStore> {
  if (input.requireGitClone ?? true) await access(path.join(input.privateRoot, ".git"));
  return new LocalCloneBookIngestStore(input.privateRoot, input.stateRoot);
}
