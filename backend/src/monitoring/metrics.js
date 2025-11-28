import client from "prom-client";

const registry = new client.Registry();

registry.setDefaultLabels({ app: "chat-app-backend" });

client.collectDefaultMetrics({ register: registry });

export const activeSocketsGuage = new client.Gauge({
  name: "ws_active_sockets",
  help: "number of active socket.io connections",
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_req_total",
  help: "total http req to backend",
  registers: [registry],
});

export { registry };
