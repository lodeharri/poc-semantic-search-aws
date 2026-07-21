/**
 * GeminiEmbeddingGenerator — infrastructure adapter implementing EmbeddingGenerator port.
 * Uses @google/genai SDK to call gemini-embedding-001.
 */
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { ExternalServiceError } from '../../domain/errors/app-error.js';
import type {
  EmbeddingGenerator,
  EmbeddingOptions,
} from '../../domain/ports/embedding-generator.js';

export class GeminiEmbeddingGenerator implements EmbeddingGenerator {
  private readonly client: GoogleGenAI;
  private readonly model = env.GEMINI_MODEL;
  private readonly outputDimensionality = env.OUTPUT_DIMENSIONALITY;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generate(text: string, options?: EmbeddingOptions): Promise<number[]> {
    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: text,
        config: {
          taskType: options?.taskType ?? 'RETRIEVAL_DOCUMENT',
          outputDimensionality: this.outputDimensionality,
        },
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('Empty embedding response from Gemini');
      }

      const embedding = response.embeddings[0].values;
      if (!embedding || embedding.length !== this.outputDimensionality) {
        throw new Error(`Expected ${this.outputDimensionality} dims, got ${embedding?.length}`);
      }

      logger.info({ dim: embedding.length, taskType: options?.taskType }, 'embedding generated');
      return embedding;
    } catch (err) {
      logger.error({ err, taskType: options?.taskType }, 'failed to generate embedding');
      throw new ExternalServiceError('Gemini', err);
    }
  }
}
