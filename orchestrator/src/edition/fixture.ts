import type {
  EditionModelGateway,
  EditionUsage,
  StructuredToolRequest
} from "./types.js";

export interface FixtureModelResponse {
  tool: string;
  value: unknown;
  usage: EditionUsage;
}

export class FixtureEditionModelGateway implements EditionModelGateway {
  private cursor = 0;

  constructor(private readonly responses: readonly FixtureModelResponse[]) {}

  async invoke<T>(request: StructuredToolRequest<T>): Promise<{ value: T; usage: EditionUsage }> {
    const response = this.responses[this.cursor];
    this.cursor += 1;
    if (!response) throw new Error(`Fixture has no response for ${request.stage}`);
    if (response.tool !== request.tool.name) {
      throw new Error(`Fixture expected ${response.tool}, received ${request.tool.name}`);
    }
    if (response.usage.model !== request.model || response.usage.stage !== request.stage) {
      throw new Error(`Fixture usage does not match ${request.model}/${request.stage}`);
    }
    return { value: request.parse(response.value), usage: response.usage };
  }

  consumed(): number {
    return this.cursor;
  }
}
