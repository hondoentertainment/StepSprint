import pino, { LoggerOptions } from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

const level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");

const options: LoggerOptions = {
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (!isProduction && !isTest) {
  options.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

export const logger = pino(options);

export default logger;
