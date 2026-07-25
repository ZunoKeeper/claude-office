import { useEffect, useState } from 'react';

interface Props { text: string; ts: number; ttlMs: number }

export function SpeechBubble({ text, ts, ttlMs }: Props) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const remain = Math.max(0, ts + ttlMs - Date.now());
    const t = setTimeout(() => setVisible(false), remain);
    return () => clearTimeout(t);
  }, [text, ts, ttlMs]);
  return (
    <div className="bubble" style={{ opacity: visible ? 1 : 0 }}>
      {text}
    </div>
  );
}
