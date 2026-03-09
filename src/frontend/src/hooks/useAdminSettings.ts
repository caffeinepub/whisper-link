import { useCallback, useEffect, useState } from "react";
import type { AdminSettings } from "../backend";
import { getBackend } from "../utils/getBackend";

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>({
    aiMode: false,
    aiVoice: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const b = await getBackend();
      const s = await b.getAdminSettings();
      setSettings(s);
    } catch (err) {
      console.error("Error fetching admin settings:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(
    async (aiMode: boolean, aiVoice: boolean) => {
      try {
        const b = await getBackend();
        await b.setAdminSettings(aiMode, aiVoice);
        setSettings({ aiMode, aiVoice });
      } catch (err) {
        console.error("Error updating admin settings:", err);
      }
    },
    [],
  );

  return { settings, isLoading, updateSettings, refetch: fetchSettings };
}
