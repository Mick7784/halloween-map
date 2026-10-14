// Disposable TLS termination for the *test-only* HTTPS mail-media flow.
// This certificate is restricted to e2e/fixtures and is never used in production.
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
const options = {
  cert: readFileSync(new URL("./fixtures/localhost-cert.pem", import.meta.url)),
  key: readFileSync(new URL("./fixtures/localhost-key.pem", import.meta.url)),
};
https.createServer(options, (req, res) => {
  const upstream = http.request({
    hostname: "127.0.0.1", port: 3000,
    path: req.url, method: req.method,
    headers: {
      ...req.headers,
      host: "127.0.0.1:3443",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "127.0.0.1:3443",
    },
  }, (result) => {
    res.writeHead(result.statusCode ?? 502, result.headers);
    result.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
}).listen(3443, "127.0.0.1");
