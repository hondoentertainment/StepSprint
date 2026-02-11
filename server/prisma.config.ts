import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.resolve(__dirname, "prisma/schema.prisma"),
  datasource: {
    url: "file:./dev.db",
  },
});
