import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Loads .env + .env.{mode} (e.g. .env.development)
  const env = loadEnv(mode, process.cwd(), "");

  const port = Number(env.VITE_PORT) || 5173;

  return {
    plugins: [react()],
    server: {
      port,
    },
  };
});
