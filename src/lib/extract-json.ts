/**
 * Pull the first JSON value out of an LLM reply — tolerates ```json fences and
 * surrounding prose. Throws if there's nothing parseable. Pure (no rn/node), so
 * the runtime services and the Node scripts share one implementation. Anthropic
 * has no strict JSON mode, so this is how we read structured output off Claude.
 */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}
