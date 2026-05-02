import { useEffect, useState } from "react";
import { api } from "../api";
import type { RegisterOutcome, User } from "../types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("stepSprintJustLoggedIn", "1");
    }
    return data.user;
  }

  async function register(
    email: string,
    password: string,
    name?: string
  ): Promise<RegisterOutcome> {
    const data = await api<{
      user?: User;
      ok?: boolean;
      message?: string;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name: name || undefined }),
    });
    if (data.user) {
      setUser(data.user);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("stepSprintJustLoggedIn", "1");
      }
      return { kind: "session", user: data.user };
    }
    if (data.ok && typeof data.message === "string") {
      return { kind: "verify_email", message: data.message };
    }
    throw new Error("Unexpected registration response");
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return { user, setUser, isLoading, login, register, logout };
}
