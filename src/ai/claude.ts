/**
 * Optional rewrite through Claude. Only de-identified text reaches this file;
 * the caller is responsible for scrubbing and for showing the teacher the
 * exact payload first.
 */
export const MODEL = "claude-opus-5-5";

export const SYSTEM_PROMPT = `You help a teacher write report card comments.

You will get the teacher's own observation notes about one student. Names and other identifying details have been replaced with placeholders such as [STUDENT_1], [STUDENT_2], [TEACHER] and [SCHOOL]. The comment is about [STUDENT_1].

Write one comment of 70 to 110 words addressed to the student's family.
- Use only what the notes support. Do not invent achievements, grades, or traits.
- Be specific: refer to concrete things from the notes.
- Name one area to keep working on if the notes include one, framed as a next step.
- Keep placeholders exactly as written, e.g. [STUDENT_1]. Do not mention other students.
- Plain, warm, professional language. No clichés like "a joy to have in class", no exclamation marks.
- Output only the comment text.`;

export function buildUserMessage(pronouns: string, notes: { tag: string; body: string }[]): string {
  const lines = notes.map((n) => `- (${n.tag}) ${n.body}`).join("\n");
  return `Pronouns for [STUDENT_1]: ${pronouns}\n\nNotes:\n${lines}`;
}

export class ClaudeError extends Error {}

export async function rewriteWithClaude(apiKey: string, userMessage: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      // Server-side fallback if the request is declined by a safety classifier.
      ...({ fallbacks: "default" } as Record<string, unknown>),
    } as Parameters<typeof client.beta.messages.create>[0]) as { stop_reason: string | null; content: { type: string; text?: string }[] };

    if (msg.stop_reason === "refusal") throw new ClaudeError("Claude declined to write this comment. Try the starter draft instead.");
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    if (!text) throw new ClaudeError("Claude returned an empty response.");
    return text;
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("That API key was rejected. Check it in Privacy and settings.");
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError("Rate limited by the API. Wait a minute and try again.");
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError("Couldn't reach the Claude API. Check your connection.");
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`The API returned an error (${e.status ?? "unknown"}): ${e.message}`);
    throw e;
  }
}
