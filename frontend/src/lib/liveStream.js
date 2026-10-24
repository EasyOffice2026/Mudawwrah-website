/**
 * Reads the order desk's live connection (server-sent events). A message can arrive split across reads, so the text
 * is buffered and only whole lines are acted on. Each `data:` line is one message; comment lines (the server's
 * heartbeat) are ignored.
 */
export const createSseParser = (onData) => {
  let rest = '';
  return (chunk) => {
    rest += chunk;
    const lines = rest.split('\n');
    rest = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data:')) onData(line.slice(5).trim());
    }
  };
};

/** Seconds to wait before reconnecting: 3, 6, 12, 24, then 30 at most. */
export const reconnectDelay = (attempt) => Math.min(3000 * 2 ** attempt, 30000);
