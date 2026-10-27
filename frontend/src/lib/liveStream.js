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

// While the live connection works, the regular check is only a slow safety net; without it, it is the only way
// new orders arrive, so it runs often. Each check costs the server several database round trips.
export const POLL_MS = 10_000;
export const LIVE_POLL_MS = 60_000;
// The server sends a heartbeat every 20 s; this long without a byte means the connection died without saying so.
export const SILENT_MS = 45_000;

/** Whether the regular check should fetch now. */
export const shouldPoll = ({ live, lastLoadAt, now }) => !live || now - lastLoadAt >= LIVE_POLL_MS;

/** Whether an open live connection has gone quiet for too long and should be dropped and reopened. */
export const isSilent = ({ live, lastByteAt, now }) => live && now - lastByteAt > SILENT_MS;
