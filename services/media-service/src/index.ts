import { createHealthResponse } from "@mango/contracts";

const service = "media-service";
const port = Number(process.env.MEDIA_SERVICE_PORT ?? 3005);

Bun.serve({
  port,
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      return Response.json(createHealthResponse(service));
    }

    return Response.json({
      service,
      message: "Media service is running."
    });
  }
});

console.log(`${service} listening on http://localhost:${port}`);
