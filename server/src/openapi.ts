import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

/* ------------------------------------------------------------------ */
/*  Shared schemas                                                    */
/* ------------------------------------------------------------------ */

const UserSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable().optional(),
    role: z.enum(["ADMIN", "PARTICIPANT"]),
  })
  .openapi("User");

const ErrorSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi("Error");

/* ------------------------------------------------------------------ */
/*  Auth schemas                                                      */
/* ------------------------------------------------------------------ */

const LoginRequest = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .openapi("LoginRequest");

const LoginResponse = z
  .object({
    token: z.string(),
    user: UserSchema,
  })
  .openapi("LoginResponse");

const RegisterRequest = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).optional(),
    password: z.string().min(8),
  })
  .openapi("RegisterRequest");

const RegisterResponse = z
  .object({
    user: UserSchema,
  })
  .openapi("RegisterResponse");

const MeResponse = z.object({ user: UserSchema }).openapi("MeResponse");

/* ------------------------------------------------------------------ */
/*  Submission schemas                                                */
/* ------------------------------------------------------------------ */

const SubmissionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    challengeId: z.string(),
    date: z.string().datetime(),
    steps: z.number().int().min(0),
    isFlagged: z.boolean(),
  })
  .openapi("Submission");

const CreateSubmissionRequest = z
  .object({
    challengeId: z.string().min(1),
    date: z.string().min(1),
    steps: z.number().int().min(0),
  })
  .openapi("CreateSubmissionRequest");

const CreateSubmissionResponse = z
  .object({ submission: SubmissionSchema })
  .openapi("CreateSubmissionResponse");

const ListSubmissionsResponse = z
  .object({ submissions: z.array(SubmissionSchema) })
  .openapi("ListSubmissionsResponse");

/* ------------------------------------------------------------------ */
/*  Challenge schemas                                                 */
/* ------------------------------------------------------------------ */

const ChallengeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    timezone: z.string(),
    teamSize: z.number().int(),
    locked: z.boolean(),
    inviteCode: z.string().nullable().optional(),
    inviteCodeExpiresAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Challenge");

const ListChallengesResponse = z
  .object({ challenges: z.array(ChallengeSchema) })
  .openapi("ListChallengesResponse");

/* ------------------------------------------------------------------ */
/*  Leaderboard schemas                                               */
/* ------------------------------------------------------------------ */

const WeeklyLeaderboardEntry = z
  .object({
    userId: z.string(),
    name: z.string(),
    email: z.string().email(),
    steps: z.number().int(),
    trend: z.enum(["up", "down", "same"]),
    delta: z.number().int(),
  })
  .openapi("WeeklyLeaderboardEntry");

const WeeklyLeaderboardResponse = z
  .object({
    weekYear: z.number().int(),
    weekNumber: z.number().int(),
    leaderboard: z.array(WeeklyLeaderboardEntry),
  })
  .openapi("WeeklyLeaderboardResponse");

/* ------------------------------------------------------------------ */
/*  Invite schemas                                                    */
/* ------------------------------------------------------------------ */

const InvitePreviewResponse = z
  .object({
    challengeId: z.string(),
    challengeName: z.string(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .openapi("InvitePreviewResponse");

const AcceptInviteResponse = z
  .object({
    challengeId: z.string(),
    challengeName: z.string(),
  })
  .openapi("AcceptInviteResponse");

/* ------------------------------------------------------------------ */
/*  Summary schemas                                                   */
/* ------------------------------------------------------------------ */

const UserSummaryResponse = z
  .object({
    personalTotals: z.object({
      today: z.number().int(),
      week: z.number().int(),
      month: z.number().int(),
    }),
    teamTotals: z.object({
      teamName: z.string(),
      total: z.number().int(),
    }),
    rank: z.number().int().nullable(),
    gapToFirst: z.number().int(),
    streak: z.object({
      currentDays: z.number().int(),
      longestDays: z.number().int(),
    }),
    consistency: z.object({
      activeDays: z.number().int(),
      elapsedDays: z.number().int(),
      score: z.number().int(),
    }),
  })
  .openapi("UserSummaryResponse");

/* ------------------------------------------------------------------ */
/*  Registry                                                          */
/* ------------------------------------------------------------------ */

export function buildOpenApiRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  // Schemas
  registry.register("User", UserSchema);
  registry.register("Error", ErrorSchema);
  registry.register("Submission", SubmissionSchema);
  registry.register("Challenge", ChallengeSchema);
  registry.register("WeeklyLeaderboardEntry", WeeklyLeaderboardEntry);

  // Security scheme (JWT cookie or bearer token)
  const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });

  // Auth routes
  registry.registerPath({
    method: "post",
    path: "/api/auth/login",
    description: "Authenticate a user with email + password.",
    summary: "Log in",
    tags: ["Auth"],
    request: {
      body: {
        content: {
          "application/json": { schema: LoginRequest },
        },
      },
    },
    responses: {
      200: {
        description: "Credentials accepted.",
        content: { "application/json": { schema: LoginResponse } },
      },
      400: {
        description: "Invalid payload.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      401: {
        description: "Invalid credentials.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/register",
    description: "Create a new user account.",
    summary: "Register",
    tags: ["Auth"],
    request: {
      body: {
        content: {
          "application/json": { schema: RegisterRequest },
        },
      },
    },
    responses: {
      200: {
        description: "Account created.",
        content: { "application/json": { schema: RegisterResponse } },
      },
      400: {
        description: "Invalid payload.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      409: {
        description: "An account with this email already exists.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/me",
    description: "Return the currently authenticated user.",
    summary: "Current user",
    tags: ["Auth"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: {
        description: "Authenticated user.",
        content: { "application/json": { schema: MeResponse } },
      },
      401: {
        description: "Authentication required.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  // Submission routes
  registry.registerPath({
    method: "post",
    path: "/api/submissions",
    description: "Create or update a step submission for a given date.",
    summary: "Submit steps",
    tags: ["Submissions"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: CreateSubmissionRequest },
        },
      },
    },
    responses: {
      200: {
        description: "Submission recorded.",
        content: { "application/json": { schema: CreateSubmissionResponse } },
      },
      400: {
        description: "Invalid payload or date outside challenge range.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      401: {
        description: "Authentication required.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Submissions locked or user not enrolled.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Challenge not found.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/submissions",
    description: "List the authenticated user's submissions for a challenge.",
    summary: "List submissions",
    tags: ["Submissions"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
      query: z.object({
        challengeId: z.string().openapi({
          description: "Challenge id to filter submissions by.",
        }),
      }),
    },
    responses: {
      200: {
        description: "Submissions for the authenticated user.",
        content: { "application/json": { schema: ListSubmissionsResponse } },
      },
      401: {
        description: "Authentication required.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  // Challenge routes
  registry.registerPath({
    method: "get",
    path: "/api/challenges",
    description: "List all challenges, most recent first.",
    summary: "List challenges",
    tags: ["Challenges"],
    responses: {
      200: {
        description: "All challenges.",
        content: { "application/json": { schema: ListChallengesResponse } },
      },
    },
  });

  // Leaderboard routes
  registry.registerPath({
    method: "get",
    path: "/api/leaderboards/weekly",
    description:
      "Weekly per-user leaderboard for a challenge, with trend vs. the previous ISO week.",
    summary: "Weekly leaderboard",
    tags: ["Leaderboards"],
    request: {
      query: z.object({
        challengeId: z.string().openapi({
          description: "Challenge id to scope the leaderboard to.",
        }),
        weekYear: z
          .string()
          .optional()
          .openapi({
            description: "ISO week year (defaults to current in challenge timezone).",
          }),
        weekNumber: z
          .string()
          .optional()
          .openapi({
            description: "ISO week number (defaults to current in challenge timezone).",
          }),
      }),
    },
    responses: {
      200: {
        description: "Weekly leaderboard entries.",
        content: { "application/json": { schema: WeeklyLeaderboardResponse } },
      },
      400: {
        description: "`challengeId` query param missing.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Challenge not found.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  // Invite routes
  registry.registerPath({
    method: "get",
    path: "/api/invites/{code}",
    description:
      "Resolve an invite code to a challenge preview. Returns 410 if the code has expired.",
    summary: "Preview invite",
    tags: ["Invites"],
    request: {
      params: z.object({
        code: z.string().openapi({ description: "Invite code." }),
      }),
    },
    responses: {
      200: {
        description: "Invite is valid; preview of the linked challenge.",
        content: { "application/json": { schema: InvitePreviewResponse } },
      },
      404: {
        description: "Invite not found.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      410: {
        description: "Invite has expired.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/invites/{code}/accept",
    description:
      "Join the challenge linked to the invite code as the authenticated user.",
    summary: "Accept invite",
    tags: ["Invites"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
      params: z.object({
        code: z.string().openapi({ description: "Invite code." }),
      }),
    },
    responses: {
      200: {
        description: "Invite accepted; user is enrolled in the challenge.",
        content: { "application/json": { schema: AcceptInviteResponse } },
      },
      401: {
        description: "Authentication required.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Invite not found.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      410: {
        description: "Invite has expired.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Integrations — API tokens
  // ---------------------------------------------------------------------------

  const integrationTokenAuth = registry.registerComponent("securitySchemes", "integrationToken", {
    type: "http",
    scheme: "bearer",
    description: "Integration token prefixed with `ssp_`. Generated via POST /api/integrations/tokens.",
  });

  const IntegrationTokenSchema = z
    .object({
      id: z.string(),
      label: z.string(),
      createdAt: z.string().datetime(),
      lastUsedAt: z.string().datetime().nullable(),
      expiresAt: z.string().datetime().nullable(),
    })
    .openapi("IntegrationToken");

  registry.register("IntegrationToken", IntegrationTokenSchema);

  const CreateTokenRequest = z
    .object({
      label: z.string().min(1).max(80).optional().openapi({ description: "Human-readable label (default: Apple Watch Sync)." }),
      expiresAt: z.string().datetime().optional().openapi({ description: "Optional ISO 8601 expiry. Omit for no expiry." }),
    })
    .openapi("CreateTokenRequest");

  const CreateTokenResponse = z
    .object({
      token: z.string().openapi({ description: "Plaintext token — shown once, never stored." }),
      label: z.string(),
      expiresAt: z.string().datetime().nullable(),
    })
    .openapi("CreateTokenResponse");

  const ListTokensResponse = z
    .object({ tokens: z.array(IntegrationTokenSchema) })
    .openapi("ListTokensResponse");

  const FitnessProviderStatusSchema = z
    .object({
      id: z.string(),
      name: z.string(),
      available: z.boolean(),
      connected: z.boolean(),
      connectedAt: z.string().datetime().nullable().openapi({
        description: "Approximate \"linked since\" time: latest token creation for Apple; OAuth token refresh row for Fitbit/Google/Garmin.",
      }),
    })
    .openapi("FitnessProviderStatus");

  const FitnessStatusResponse = z
    .object({
      connected: z.boolean(),
      lastAppleHealthSyncAt: z.string().datetime().nullable().openapi({
        description:
          "Latest Apple Health (Shortcuts) sync for this user and challenge. Null if challengeId is omitted, the user is not enrolled, or no sync has occurred.",
      }),
      providers: z.array(FitnessProviderStatusSchema),
      message: z.string(),
    })
    .openapi("FitnessStatusResponse");

  registry.register("FitnessStatusResponse", FitnessStatusResponse);

  registry.registerPath({
    method: "get",
    path: "/api/integrations/fitness",
    summary: "Fitness sync status",
    description:
      "OAuth and Apple Health token summary. Optional query `challengeId` adds `lastAppleHealthSyncAt` when the user is enrolled in that challenge.",
    tags: ["Integrations"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
      query: z.object({
        challengeId: z
          .string()
          .optional()
          .openapi({ description: "Challenge id; when provided, includes last Apple Health sync time for that challenge." }),
      }),
    },
    responses: {
      200: {
        description: "Connection status and provider list.",
        content: { "application/json": { schema: FitnessStatusResponse } },
      },
      401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/integrations/tokens",
    summary: "Create API token",
    description: "Generate a new integration token for automated step sync (e.g. iOS Shortcuts). The plaintext token is returned once and never retrievable again. Max 10 tokens per user.",
    tags: ["Integrations"],
    security: [{ [bearerAuth.name]: [] }],
    request: { body: { content: { "application/json": { schema: CreateTokenRequest } } } },
    responses: {
      201: { description: "Token created.", content: { "application/json": { schema: CreateTokenResponse } } },
      401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
      422: { description: "Token limit (10) reached.", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/integrations/tokens",
    summary: "List API tokens",
    description: "List all integration tokens for the authenticated user. Token values are never returned.",
    tags: ["Integrations"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: { description: "Token list.", content: { "application/json": { schema: ListTokensResponse } } },
      401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/integrations/tokens/{id}",
    summary: "Revoke API token",
    tags: ["Integrations"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
      params: z.object({ id: z.string().openapi({ description: "Token id." }) }),
    },
    responses: {
      204: { description: "Token revoked." },
      401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
      404: { description: "Token not found or belongs to another user.", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  // ---------------------------------------------------------------------------
  // Integrations — Apple Health / Watch sync
  // ---------------------------------------------------------------------------

  const AppleHealthRowSchema = z
    .object({
      date: z.string().openapi({ description: "ISO date YYYY-MM-DD.", example: "2026-04-01" }),
      steps: z.number().int().min(0).max(200_000),
    })
    .openapi("AppleHealthRow");

  const AppleHealthSyncRequest = z
    .object({
      challengeId: z.string(),
      date: z.string().optional().openapi({ description: "Single-day shorthand (YYYY-MM-DD). Use instead of rows." }),
      steps: z.number().int().min(0).max(200_000).optional(),
      rows: z
        .array(AppleHealthRowSchema)
        .min(1)
        .max(31)
        .optional()
        .openapi({
          description:
            "Batch up to 31 days. Use instead of date+steps. If the same date appears more than once, the highest step count is stored.",
        }),
    })
    .openapi("AppleHealthSyncRequest");

  const SyncResponse = z
    .object({
      imported: z.number().int(),
      updated: z.number().int(),
      skipped: z.number().int(),
    })
    .openapi("SyncResponse");

  registry.register("SyncResponse", SyncResponse);

  registry.registerPath({
    method: "post",
    path: "/api/integrations/apple-health",
    summary: "Sync Apple Watch / Health steps",
    description:
      "Upsert step data from Apple Health. Authenticate with an integration token via `Authorization: Bearer ssp_…`. Send `Content-Type: application/json`. Accepts a single-day shorthand or a batch of up to 31 days (duplicate dates in one request keep the highest steps).",
    tags: ["Integrations"],
    security: [{ [integrationTokenAuth.name]: [] }],
    request: { body: { content: { "application/json": { schema: AppleHealthSyncRequest } } } },
    responses: {
      200: { description: "Steps synced.", content: { "application/json": { schema: SyncResponse } } },
      400: { description: "Invalid payload or date outside challenge window.", content: { "application/json": { schema: ErrorSchema } } },
      401: { description: "Missing or invalid integration token.", content: { "application/json": { schema: ErrorSchema } } },
      403: { description: "Not enrolled in the challenge.", content: { "application/json": { schema: ErrorSchema } } },
      404: { description: "Challenge not found.", content: { "application/json": { schema: ErrorSchema } } },
      409: { description: "Challenge is locked.", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  // ---------------------------------------------------------------------------
  // Integrations — OAuth providers (Fitbit, Google Fit)
  // ---------------------------------------------------------------------------

  const OAuthProviderSchema = z
    .object({
      id: z.string(),
      name: z.string(),
      available: z.boolean().openapi({ description: "True when the server has credentials configured for this provider." }),
      connected: z.boolean(),
      connectedAt: z.string().datetime().nullable(),
    })
    .openapi("OAuthProvider");

  const OAuthConnectionsResponse = z
    .object({ providers: z.array(OAuthProviderSchema) })
    .openapi("OAuthConnectionsResponse");

  registry.registerPath({
    method: "get",
    path: "/api/integrations/connections",
    summary: "List OAuth provider connections",
    description: "Returns connection status for all supported OAuth providers (Fitbit, Google Fit).",
    tags: ["Integrations"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: { description: "Provider list.", content: { "application/json": { schema: OAuthConnectionsResponse } } },
      401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  for (const providerSlug of ["fitbit", "google-fit"] as const) {
    const providerName = providerSlug === "fitbit" ? "Fitbit" : "Google Fit";

    registry.registerPath({
      method: "get",
      path: `/api/integrations/${providerSlug}/connect`,
      summary: `Connect ${providerName}`,
      description: `Redirects to ${providerName}'s OAuth 2.0 authorization page. Returns 503 when the server is not configured for this provider.`,
      tags: ["Integrations"],
      security: [{ [bearerAuth.name]: [] }],
      request: {
        query: z.object({
          challengeId: z.string().optional().openapi({ description: "Challenge to link the connection to." }),
        }),
      },
      responses: {
        302: { description: `Redirect to ${providerName} OAuth.` },
        401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
        503: { description: "Provider not configured on this server.", content: { "application/json": { schema: ErrorSchema } } },
      },
    });

    const OAuthSyncRequest = z
      .object({
        challengeId: z.string(),
        date: z.string().optional().openapi({ description: "YYYY-MM-DD. Defaults to today in challenge timezone." }),
      })
      .openapi(`${providerName.replace(" ", "")}SyncRequest`);

    registry.registerPath({
      method: "post",
      path: `/api/integrations/${providerSlug}/sync`,
      summary: `Sync ${providerName} steps`,
      description: `Fetch step data from ${providerName} for the given date and upsert into the challenge. Requires an active OAuth connection.`,
      tags: ["Integrations"],
      security: [{ [bearerAuth.name]: [] }],
      request: { body: { content: { "application/json": { schema: OAuthSyncRequest } } } },
      responses: {
        200: { description: "Steps synced.", content: { "application/json": { schema: SyncResponse } } },
        401: { description: "Not authenticated or token expired.", content: { "application/json": { schema: ErrorSchema } } },
        403: { description: "Provider not connected or not enrolled in challenge.", content: { "application/json": { schema: ErrorSchema } } },
        404: { description: "Challenge not found.", content: { "application/json": { schema: ErrorSchema } } },
        409: { description: "Challenge is locked.", content: { "application/json": { schema: ErrorSchema } } },
        502: { description: `Error fetching from ${providerName} API.`, content: { "application/json": { schema: ErrorSchema } } },
        503: { description: "Provider not configured on this server.", content: { "application/json": { schema: ErrorSchema } } },
      },
    });

    registry.registerPath({
      method: "delete",
      path: `/api/integrations/${providerSlug}/disconnect`,
      summary: `Disconnect ${providerName}`,
      description: `Remove the stored ${providerName} OAuth connection for the authenticated user.`,
      tags: ["Integrations"],
      security: [{ [bearerAuth.name]: [] }],
      responses: {
        204: { description: "Disconnected." },
        401: { description: "Not authenticated.", content: { "application/json": { schema: ErrorSchema } } },
        404: { description: `${providerName} is not connected.`, content: { "application/json": { schema: ErrorSchema } } },
      },
    });
  }

  // Summary route
  registry.registerPath({
    method: "get",
    path: "/api/me/summary",
    description:
      "Personal + team totals, rank, streak, and consistency score for the authenticated user in a challenge.",
    summary: "User summary",
    tags: ["Summary"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
      query: z.object({
        challengeId: z.string().openapi({
          description: "Challenge id to scope the summary to.",
        }),
      }),
    },
    responses: {
      200: {
        description: "Summary for the authenticated user.",
        content: { "application/json": { schema: UserSummaryResponse } },
      },
      400: {
        description: "`challengeId` query param missing.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      401: {
        description: "Authentication required.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Not enrolled in this challenge.",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Challenge not found.",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  return registry;
}

export function generateOpenApiDocument() {
  const registry = buildOpenApiRegistry();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "StepSprint API",
      version: "1.0.0",
      description:
        "HTTP API for StepSprint — a month-long step-challenge platform.",
    },
    servers: [{ url: "/" }],
  });
}
