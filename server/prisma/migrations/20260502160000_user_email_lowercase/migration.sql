-- Emails are case-insensitive for auth; normalize existing rows for consistent lookups.
UPDATE "User" SET email = lower(email);
