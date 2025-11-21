// src/hooks/useRealtime.js
import { useEffect, useRef } from "react";

export default function useRealtime(onMessage) {
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:6000");
    wsRef.current = ws;
    ws.onopen = () => console.log("WS connected");
    ws.onmessage = e => {
      const data = JSON.parse(e.data);
      onMessage && onMessage(data);
    };
    ws.onerror = (e) => console.error("WS error", e);
    ws.onclose = () => console.log("WS closed");
    return () => ws.close();
  }, [onMessage]);

  return wsRef;
}
