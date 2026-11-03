// Fitting a conversation into the model's context window.
// WebLLM rejects a prompt that doesn't fit, so before each reply the worker
// drops the oldest turns, then the document context, to make room.
// Pure functions, no DOM: imported by worker.js, testable on its own.

// Rough token count: about 3 characters per token, rounded up so the
// estimate errs on the safe side, plus per-message template overhead.
export function estimateTokens(messages) {
  return messages.reduce((n, m) => n + Math.ceil((m.content || "").length / 3) + 6, 0);
}

// history: [system?, ...turns, lastUser] with the bare question last.
// Returns { history, augmentedPrompt, droppedContext } where history fits
// with the (possibly augmented) question and room for maxTokens of reply.
// Throws when even the system prompt and the question alone don't fit.
export function fitToContext({ history, prompt, augmentedPrompt, contextWindow, maxTokens, margin = 64 }) {
  const budget = contextWindow - maxTokens - margin;
  const ragExtra =
    estimateTokens([{ content: augmentedPrompt }]) - estimateTokens([{ content: prompt }]);
  const sys = history[0]?.role === "system" ? [history[0]] : [];
  let rest = history.slice(sys.length);
  const fits = (extra) => estimateTokens([...sys, ...rest]) + extra <= budget;

  while (rest.length > 1 && !fits(ragExtra)) {
    // Drop the oldest message; never leave a reply without its question
    rest = rest.slice(1);
    if (rest[0]?.role === "assistant" && rest.length > 1) rest = rest.slice(1);
  }

  let droppedContext = false;
  let finalPrompt = augmentedPrompt;
  if (augmentedPrompt !== prompt && !fits(ragExtra)) {
    finalPrompt = prompt;
    droppedContext = true;
  }

  if (!fits(finalPrompt === prompt ? 0 : ragExtra)) {
    throw new Error(
      "Your message is too long for this model's context window " +
      `(${contextWindow} tokens). Shorten it, or raise Context Window in Settings.`
    );
  }

  return { history: [...sys, ...rest], augmentedPrompt: finalPrompt, droppedContext };
}
