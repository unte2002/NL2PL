import Cerebras from '@cerebras/cerebras_cloud_sdk';

let client: Cerebras | null = null;

function getClient(): Cerebras {
  if (!client) {
    client = new Cerebras({
      apiKey: process.env.CEREBRAS_API_KEY,
    });
  }
  return client;
}

const BATCH_INTERVAL_MS = 50;

/**
 * Stream code generation from Cerebras, yielding batched chunks.
 * Chunks are buffered for up to BATCH_INTERVAL_MS before being yielded
 * to reduce the number of WebSocket messages sent to the client.
 */
export async function* generateCode(prompt: string): AsyncGenerator<string, void, void> {
  const cerebras = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-oss-120b';

  console.log(`Using LLM model: ${model}`); // Log the model for verification

  const stream = await cerebras.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a code generator. Output only code, no explanations or markdown fences unless the language requires it.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    stream: true,
  });

  let buffer = '';
  let lastYield = Date.now();

  for await (const chunk of stream) {
    const content = (chunk as any).choices[0]?.delta?.content;
    if (content) {
      buffer += content;

      const now = Date.now();
      if (now - lastYield >= BATCH_INTERVAL_MS) {
        yield buffer;
        buffer = '';
        lastYield = now;
      }
    }
  }

  // Flush remaining buffer
  if (buffer) {
    yield buffer;
  }
}
