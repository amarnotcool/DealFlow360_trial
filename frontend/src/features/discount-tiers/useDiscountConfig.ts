// The discount ceilings, and saving one of them.
//
// A saved ceiling changes what the engine scores new work against, so the whole
// config is re-read after a write rather than patched in place — the tier's own
// displayed ceiling moves with the rule, and the screen has to show both.

import { useCallback, useEffect, useState } from 'react';
import type { ApiError, DiscountConfigView } from '@dealflow360/shared';

import { fetchDiscountConfig, updateCeiling } from './discount-tiers.api';

export interface DiscountConfigState {
  /** Null until the first read lands. */
  config: DiscountConfigView | null;
  error: ApiError | null;
  loading: boolean;
  /** The rule currently being written, so only its own row goes busy. */
  savingId: string | null;
  /** The last rule saved, so the screen can say what changed. */
  savedId: string | null;
  save: (ruleId: string, ceilingPct: number, reason: string | null) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useDiscountConfig(): DiscountConfigState {
  const [config, setConfig] = useState<DiscountConfigView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await fetchDiscountConfig();
    setConfig(response.data);
    setError(response.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (ruleId: string, ceilingPct: number, reason: string | null) => {
      setSavingId(ruleId);
      setError(null);
      const response = await updateCeiling(ruleId, ceilingPct, reason);
      setSavingId(null);

      if (!response.data) {
        setError(response.error);
        return false;
      }

      setSavedId(ruleId);
      await reload();
      return true;
    },
    [reload],
  );

  return { config, error, loading, savingId, savedId, save, reload };
}
