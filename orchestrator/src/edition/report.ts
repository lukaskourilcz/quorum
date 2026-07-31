import { randomUUID } from "node:crypto";
import type { EditionPackage } from "../contracts/edition-package.js";
import type { EditionUsage } from "./types.js";
import type { QualityMetrics, QualityResult } from "./quality.js";
import type { StetReview } from "./stet.js";

export interface EditionStageReport {
  name: string;
  status: "success" | "failed" | "skipped";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface EditionRunReport {
  schemaVersion: 1;
  runId: string;
  date: string;
  mode: "dry_run" | "production";
  status: "edition" | "no_edition" | "failed";
  startedAt: string;
  completedAt: string;
  stages: EditionStageReport[];
  regenerationAttempts: number;
  stetBlocks: number;
  hacekBlocks: number;
  usage: EditionUsage[];
  measuredCostUsd?: number;
  quality?: { metrics: QualityMetrics; result: QualityResult };
  stet?: StetReview;
  hacek?: StetReview;
  packageStatus?: EditionPackage["status"];
  warnings: string[];
}

export class EditionRunReporter {
  private readonly startedAt: Date;
  private readonly stages: EditionStageReport[] = [];
  readonly usage: EditionUsage[] = [];
  readonly warnings: string[] = [];
  regenerationAttempts = 0;
  stetBlocks = 0;
  hacekBlocks = 0;
  quality?: { metrics: QualityMetrics; result: QualityResult };
  stet?: StetReview;
  hacek?: StetReview;

  constructor(
    readonly date: string,
    readonly mode: "dry_run" | "production",
    private readonly now: () => Date = () => new Date(),
    readonly runId: string = randomUUID()
  ) {
    this.startedAt = now();
  }

  async stage<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
    const started = this.now();
    try {
      const value = await operation();
      this.addStage(name, "success", started);
      return value;
    } catch (error) {
      this.addStage(name, "failed", started, error);
      throw error;
    }
  }

  skip(name: string): void {
    this.addStage(name, "skipped", this.now());
  }

  addUsage(usage: EditionUsage): void {
    this.usage.push(usage);
  }

  warn(value: string): void {
    if (!this.warnings.includes(value)) this.warnings.push(value);
  }

  totalCostUsd(): number | undefined {
    if (this.usage.length === 0) return undefined;
    return Number(this.usage.reduce((sum, usage) => sum + usage.costUsd, 0).toFixed(8));
  }

  build(status: EditionRunReport["status"], packageStatus?: EditionPackage["status"]): EditionRunReport {
    const completedAt = this.now();
    const measuredCostUsd = this.totalCostUsd();
    return {
      schemaVersion: 1,
      runId: this.runId,
      date: this.date,
      mode: this.mode,
      status,
      startedAt: this.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      stages: [...this.stages],
      regenerationAttempts: this.regenerationAttempts,
      stetBlocks: this.stetBlocks,
      hacekBlocks: this.hacekBlocks,
      usage: [...this.usage],
      ...(measuredCostUsd === undefined ? {} : { measuredCostUsd }),
      ...(this.quality ? { quality: this.quality } : {}),
      ...(this.stet ? { stet: this.stet } : {}),
      ...(this.hacek ? { hacek: this.hacek } : {}),
      ...(packageStatus ? { packageStatus } : {}),
      warnings: [...this.warnings]
    };
  }

  private addStage(
    name: string,
    status: EditionStageReport["status"],
    startedAt: Date,
    error?: unknown
  ): void {
    const completedAt = this.now();
    this.stages.push({
      name,
      status,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      ...(error
        ? {
            errorCode: error instanceof Error ? error.name : "unknown",
            errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown error"
          }
        : {})
    });
  }
}
