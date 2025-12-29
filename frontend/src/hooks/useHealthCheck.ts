import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";

type HealthStatus = "ok" | "error" | "unknown" | "loading";

interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  uptime: number;
}

export function useHealthCheck() {
  const [status, setStatus] = useState<HealthStatus>("loading");

  useEffect(() => {
    let isMounted = true;

    apiFetch<HealthResponse>("/health")
      .then((data) => {
        if (isMounted) {
          setStatus(data.status === "ok" ? "ok" : "unknown");
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { status };
}