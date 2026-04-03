import type { Response } from 'express';

/** Set up an SSE response and return a typed send helper. */
export function startSSE(res: Response): (data: Record<string, unknown>) => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  return (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}
