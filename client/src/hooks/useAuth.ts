import { useEffect, useState } from "react";
import { api } from "../api";
import type { User } from "../types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, name?: string) {
    const data = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, name: name || undefined }),
    });
    setUser(data.user);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("stepSprintJustLoggedIn", "1");
    }
    return data.user;
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return { user, setUser, isLoading, login, logout };
}
