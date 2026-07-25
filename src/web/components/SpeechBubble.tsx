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
    <div style={{
      opacity: visible ? 1 : 0, transition: 'opacity 400ms',
      background: '#fff8e1', border: '1px solid #f59e0b40',
      padding: '6px 10px', borderRadius: 8, fontSize: 13,
      marginTop: 8, minHeight: 20,
    }}>💬 {text}</div>
  );
}
