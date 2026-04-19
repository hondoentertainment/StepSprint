import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Challenge } from "../types";
import { getErrorMessage } from "../api";

export function useChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadChallenges() {
      try {
        const data = await api<{ challenges: Challenge[] }>("/api/challenges");
        if (cancelled) return;
        setChallenges(data.challenges);
        setSelectedChallengeId((current) => current || data.challenges[0]?.id || "");
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    async function loadActive() {
      try {
        const data = await api<{ challenge: Challenge | null }>("/api/challenges/active");
        if (cancelled) return;
        if (data.challenge) {
          setSelectedChallengeId(data.challenge.id);
        }
      } catch {
        // ignore; active-challenge lookup is best-effort
      }
    }

    void loadChallenges();
    void loadActive();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChallenge = useMemo(
    () => challenges.find((c) => c.id === selectedChallengeId) ?? null,
    [challenges, selectedChallengeId]
  );

  async function refreshChallenges() {
    const data = await api<{ challenges: Challenge[] }>("/api/challenges");
    setChallenges(data.challenges);
    return data.challenges;
  }

  return {
    challenges,
    selectedChallengeId,
    setSelectedChallengeId,
    selectedChallenge,
    isLoading,
    error,
    refreshChallenges,
  };
}
