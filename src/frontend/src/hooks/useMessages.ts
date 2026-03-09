import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, SenderType } from "../backend";
import { getBackend } from "../utils/getBackend";

export function useMessages(pollInterval = 2000) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchMessages = useCallback(async () => {
    try {
      const b = await getBackend();
      const all = await b.getAllMessages();
      if (mountedRef.current) {
        setMessages(all.sort((a, b) => Number(a.timestamp - b.timestamp)));
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchMessages();
    intervalRef.current = setInterval(fetchMessages, pollInterval);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMessages, pollInterval]);

  const sendMessage = useCallback(
    async (text: string, sender: SenderType) => {
      if (!text.trim()) return;
      try {
        const b = await getBackend();
        await b.sendMessage(text, sender);
        await fetchMessages();
      } catch (err) {
        console.error("Error sending message:", err);
      }
    },
    [fetchMessages],
  );

  return { messages, isLoading, sendMessage, refetch: fetchMessages };
}
