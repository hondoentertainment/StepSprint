import { describe, it, expect } from "vitest";
import { sealSecret, openSecret } from "./cryptoSecret";

describe("cryptoSecret", () => {
  it("round-trips arbitrary strings", () => {
    const plain = "oauth-access-token-abc123";
    const sealed = sealSecret(plain);
    expect(sealed).not.toContain(plain);
    expect(openSecret(sealed)).toBe(plain);
  });
});
