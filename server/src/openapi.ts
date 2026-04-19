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
/*  Registry                                                          */
/* ------------------------------------------------------------------ */

export function buildOpenApiRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  // Schemas
  registry.register("User", UserSchema);
  registry.register("Error", ErrorSchema);
  registry.register("Submission", SubmissionSchema);

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
