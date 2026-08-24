import { io, type Socket } from "socket.io-client";
import { authApi } from "@/lib/api";

type Listener = () => void;

export function connectCallCenterRealtime(
  onHint: Listener,
  onConnectionChange: (connected: boolean) => void,
): () => void {
  const baseUrl =
    process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3000/call-center";
  const socket: Socket = io(baseUrl, {
    transports: ["websocket"],
    auth: { token: authApi.accessToken() },
    reconnection: true,
  });
  const events = [
    "call-center.ready",
    "call.updated",
    "call.assigned",
    "call.dispositioned",
    "presence.updated",
    "whatsapp.message",
    "whatsapp.status",
    "appointment.created",
  ];
  socket.on("connect", () => {
    onConnectionChange(true);
    onHint();
  });
  socket.on("disconnect", () => onConnectionChange(false));
  events.forEach((event) => socket.on(event, onHint));
  return () => socket.disconnect();
}
