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
    setIsLoading(true);
    setError("");
    api<{ challenges: Challenge[] }>("/api/challenges")
      .then((data) => {
        setChallenges(data.challenges);
        setSelectedChallengeId((current) => current || data.challenges[0]?.id || "");
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setIsLoading(false));

    api<{ challenge: Challenge | null }>("/api/challenges/active")
      .then((data) => {
        if (data.challenge) {
          setSelectedChallengeId(data.challenge.id);
        }
      })
      .catch(() => null);
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
