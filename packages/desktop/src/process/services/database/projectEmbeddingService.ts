import path from 'node:path';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { getDataPath } from '@process/utils';

export const PROJECT_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
export const PROJECT_EMBEDDING_DIMENSIONS = 384;

export type ProjectEmbeddingBackend = 'directml' | 'cpu';

type LoadedExtractor = {
  backend: ProjectEmbeddingBackend;
  extractor: FeatureExtractionPipeline;
};

let extractorPromise: Promise<LoadedExtractor> | null = null;
let activeBackend: ProjectEmbeddingBackend | null = null;

async function loadExtractor(): Promise<LoadedExtractor> {
  const options = {
    cache_dir: path.join(getDataPath(), 'models', 'huggingface'),
    dtype: 'q8' as const,
  };
  try {
    const extractor = await pipeline('feature-extraction', PROJECT_EMBEDDING_MODEL, {
      ...options,
      device: 'dml',
    });
    activeBackend = 'directml';
    console.info('[ProjectEmbedding] DirectML GPU acceleration enabled');
    return { backend: 'directml', extractor };
  } catch (error) {
    console.warn('[ProjectEmbedding] DirectML unavailable; falling back to CPU', error);
    const extractor = await pipeline('feature-extraction', PROJECT_EMBEDDING_MODEL, {
      ...options,
      device: 'cpu',
    });
    activeBackend = 'cpu';
    return { backend: 'cpu', extractor };
  }
}

function getExtractor(): Promise<LoadedExtractor> {
  extractorPromise ??= loadExtractor();
  return extractorPromise;
}

/** Returns the active backend after the model is loaded. */
export function getProjectEmbeddingBackend(): ProjectEmbeddingBackend | null {
  return activeBackend;
}

/** Generates a normalized multilingual embedding using the locally cached Hugging Face model. */
export async function embedProjectMemory(text: string, inputType: 'query' | 'passage'): Promise<Float32Array> {
  const { extractor } = await getExtractor();
  const output = await extractor(`${inputType}: ${text}`, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data as Float32Array);
}

export function serializeEmbedding(embedding: Float32Array): Uint8Array {
  return new Uint8Array(embedding.buffer.slice(embedding.byteOffset, embedding.byteOffset + embedding.byteLength));
}

export function deserializeEmbedding(value: Uint8Array): Float32Array {
  const bytes = Uint8Array.from(value);
  return new Float32Array(bytes.buffer);
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length === 0) return -1;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? -1 : dot / denominator;
}
