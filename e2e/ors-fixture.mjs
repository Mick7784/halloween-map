// Test-only ORS contract server. Never imported by the application.
import http from "node:http";
let failSnap = false;
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end('{"testProvider":true}');
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.url === "/test-only/snap-failure") {
      failSnap = body.enabled === true;
      res.end(JSON.stringify({ enabled: failSnap }));
      return;
    }
    if (failSnap && req.url === "/v2/snap/foot-walking/json") {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: { code: 6000 } }));
      return;
    }
    if (req.url === "/v2/snap/foot-walking/json")
      res.end(
        JSON.stringify({
          locations: body.locations.map((location) => ({
            location,
            snapped_distance: 0,
          })),
        }),
      );
    else if (req.url === "/v2/matrix/foot-walking")
      res.end(
        JSON.stringify({
          distances: body.sources.map((a) =>
            body.destinations.map((b) => (a === b ? 0 : 140)),
          ),
          durations: body.sources.map((a) =>
            body.destinations.map((b) => (a === b ? 0 : 120)),
          ),
        }),
      );
    else if (req.url === "/v2/directions/foot-walking/geojson")
      res.end(
        JSON.stringify({
          features: [
            {
              geometry: { type: "LineString", coordinates: body.coordinates },
              properties: {
                ...(body.instructions === false
                  ? {}
                  : {
                      segments: body.coordinates
                        .slice(1)
                        .map(() => ({
                          distance: 140,
                          duration: 120,
                          steps: [
                            {
                              instruction: "Test instruction ignored",
                              distance: 140,
                              duration: 120,
                            },
                          ],
                        })),
                    }),
              },
            },
          ],
        }),
      );
    else {
      res.statusCode = 404;
      res.end('{"error":"foot-walking only"}');
    }
  })
  .listen(3106, "127.0.0.1");
