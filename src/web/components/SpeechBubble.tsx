import { useEffect, useState } from 'react';
import { useNow } from '../hooks/useNow.js';

interface Props { text: string; ts: number; ttlMs: number }

export function SpeechBubble({ text, ts, ttlMs }: Props) {
  const [visible, setVisible] = useState(true);
  const now = useNow(500);
  const remainMs = Math.max(0, ts + ttlMs - now);
  const remainPct = ttlMs > 0 ? Math.max(0, Math.min(100, (remainMs / ttlMs) * 100)) : 0;

  useEffect(() => {
    setVisible(true);
    const remain = Math.max(0, ts + ttlMs - Date.now());
    const t = setTimeout(() => setVisible(false), remain);
    return () => clearTimeout(t);
  }, [text, ts, ttlMs]);

  return (
    <div className="bubble" style={{ opacity: visible ? 1 : 0 }}>
      {text}
      {visible && remainMs > 0 && (
        <div className="bubble-ttl" style={{ width: `${remainPct}%` }} />
      )}
    </div>
  );
}
