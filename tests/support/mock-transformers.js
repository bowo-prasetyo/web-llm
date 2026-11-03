// Stand-in for Transformers.js: document search is not exercised in tests.
export async function pipeline() {
  throw new Error("Embeddings are not available in tests");
}
