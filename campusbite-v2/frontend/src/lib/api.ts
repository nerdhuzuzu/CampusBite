import axios from "axios";
import { io, type Socket } from "socket.io-client";

const rawApiBase = (import.meta.env.VITE_V2_API_URL || "/api/v2").trim();

export const apiV2 = axios.create({
  baseURL: rawApiBase,
  withCredentials: true,
});

apiV2.interceptors.request.use((config) => {
  const token = localStorage.getItem("campusbite_v2_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Resolves the backend origin for Socket.IO and relative media URLs (/api/v2/public/media/:id or /uploads/:file).
 */
export function resolveBackendOrigin(): string {
  const wsEnv = (import.meta.env.VITE_V2_WS_URL || "").trim();
  if (wsEnv) return wsEnv.replace(/\/+$/, "");

  if (rawApiBase.startsWith("http://") || rawApiBase.startsWith("https://")) {
    try {
      return new URL(rawApiBase).origin;
    } catch {
      // fall through
    }
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const origin = resolveBackendOrigin();
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

let socketV2: Socket | null = null;

export function getSocketV2(): Socket {
  if (!socketV2) {
    const token = localStorage.getItem("campusbite_v2_token");
    socketV2 = io(resolveBackendOrigin(), {
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      transports: ["websocket", "polling"],
    });
  }
  return socketV2;
}

export function formatINR(amount: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}
