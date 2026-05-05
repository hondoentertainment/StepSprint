import { config } from "./config";
import { createPrismaClient } from "./prismaClientFactory";

export const prisma = createPrismaClient(config.databaseUrl);
