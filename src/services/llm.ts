import { spend, isOverCap } from '../lib/cost/meter';
import { recordSpend, spendEvents } from '../db';
import { getAnthropicKey, getOpenAIKey } from './keys';

/**
 * One chat-completion layer for the teacher and the conversation partner.
 * Provider preference: Anthropic when its key is present (Claude holds the
 * teaching protocols' discipline best — owner decision 2026-06-12), else
 * OpenAI. Every call is metered; the soft cap stops calls gracefully.
 */

export interface ChatTurn {
  role: 'teacher' | 'learner';
  text: string;
}

export type LlmResult =
  | { kind: 'ok'; text: string }
  | { kind: 'no_key' }
  | { kind: 'capped'; capUsd: number }
  | { kind: 'error'; message: string };

type Feature = 'teacher' | 'conversation';

const MODELS: Record<Feature, { anthropic: string; openai: string }> = {
  // Sonnet 4.6: best speed/intelligence balance — protocol discipline.
  // One-line upgrade if it ever slips: 'claude-opus-4-8'.
  teacher: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4.1-mini' },
  // Haiku 4.5: fast turns for the spoken loop.
  conversation: { anthropic: 'claude-haiku-4-5', openai: 'gpt-4.1-mini' },
};

export interface ChatOptions {
  feature: Feature;
  system: string;
  turns: ChatTurn[];
  /** Sent as the first user message when the history is empty. */
  openingUserMsg: string;
  maxTokens: number;
  capUsd: number;
}

export async function chatComplete(opts: ChatOptions): Promise<LlmResult> {
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    if (isOverCap(await spendEvents(monthStart.toISOString()), opts.capUsd, new Date())) {
      return { kind: 'capped', capUsd: opts.capUsd };
    }
  } catch {
    // metering read failure must not block a lesson
  }

  const anthropicKey = await getAnthropicKey();
  if (anthropicKey) return anthropicChat(anthropicKey, opts);
  const openaiKey = await getOpenAIKey();
  if (openaiKey) return openaiChat(openaiKey, opts);
  return { kind: 'no_key' };
}

// ---- Anthropic (Messages API, raw fetch — app pattern: no SDK, key from keychain) ----

async function anthropicChat(key: string, opts: ChatOptions): Promise<LlmResult> {
  // Messages must start with 'user' and alternate; our histories may start
  // with the teacher's opening line, so prepend a framing user turn.
  const mapped = opts.turns.map((t) => ({
    role: t.role === 'teacher' ? ('assistant' as const) : ('user' as const),
    content: t.text,
  }));
  const messages: { role: 'user' | 'assistant'; content: unknown }[] =
    mapped.length === 0
      ? [{ role: 'user', content: opts.openingUserMsg }]
      : mapped[0].role === 'assistant'
        ? [{ role: 'user', content: opts.openingUserMsg }, ...mapped]
        : [...mapped];

  // Prompt caching: stable system prefix + incremental history breakpoint
  // (cache reads bill at ~0.1×; folded into metered units below).
  const last = messages[messages.length - 1];
  last.content = [{ type: 'text', text: String(last.content), cache_control: { type: 'ephemeral' } }];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS[opts.feature].anthropic,
        max_tokens: opts.maxTokens,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });
    if (!res.ok) {
      return { kind: 'error', message: `teacher unavailable (anthropic ${res.status})` };
    }
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      stop_reason: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    const text = data.content
      ?.filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return { kind: 'error', message: `empty reply (${data.stop_reason})` };

    if (data.usage) {
      // Pre-weight cache economics into input units: writes ~1.25×, reads ~0.1×.
      const u = data.usage;
      const inputUnits =
        (u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)) /
        1000;
      const now = new Date();
      await recordSpend(spend(`anthropic:${opts.feature}_input`, inputUnits, now)).catch(() => {});
      await recordSpend(spend(`anthropic:${opts.feature}_output`, u.output_tokens / 1000, now)).catch(() => {});
    }
    return { kind: 'ok', text };
  } catch (e) {
    return { kind: 'error', message: (e as Error)?.message ?? 'network error' };
  }
}

// ---- OpenAI fallback ----

async function openaiChat(key: string, opts: ChatOptions): Promise<LlmResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELS[opts.feature].openai,
        temperature: 0.7,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: opts.system },
          ...(opts.turns.length === 0
            ? [{ role: 'user' as const, content: opts.openingUserMsg }]
            : opts.turns.map((t) => ({
                role: t.role === 'teacher' ? ('assistant' as const) : ('user' as const),
                content: t.text,
              }))),
        ],
      }),
    });
    if (!res.ok) return { kind: 'error', message: `teacher unavailable (openai ${res.status})` };
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { kind: 'error', message: 'empty reply' };
    if (data.usage) {
      const now = new Date();
      await recordSpend(spend(`openai:${opts.feature}_input`, data.usage.prompt_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend(`openai:${opts.feature}_output`, data.usage.completion_tokens / 1000, now)).catch(
        () => {},
      );
    }
    return { kind: 'ok', text };
  } catch (e) {
    return { kind: 'error', message: (e as Error)?.message ?? 'network error' };
  }
}
