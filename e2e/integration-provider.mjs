// Disposable integration services. No external recipients or production data.
import tls from "node:tls";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
const messages = [];
const sslOptions = {
  key: fs.readFileSync(
    new URL("./fixtures/localhost-key.pem", import.meta.url),
  ),
  cert: fs.readFileSync(
    new URL("./fixtures/localhost-cert.pem", import.meta.url),
  ),
};
function smtpConnection(socket, greeting = true) {
  socket.setEncoding("utf8");
  if (greeting) socket.write("220 localhost fixture SMTP\r\n");
  let buffer = "",
    collecting = false,
    lines = [],
    recipients = [];
  socket.on("error", () => {});
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      if (collecting) {
        if (line === ".") {
          messages.push({ recipients, raw: lines.join("\r\n") });
          collecting = false;
          socket.write("250 captured\r\n");
        } else lines.push(line.replace(/^\.\./, "."));
      } else if (/^(EHLO|HELO)/i.test(line))
        socket.write("250-localhost\r\n250 SIZE 10000000\r\n");
      else if (/^MAIL FROM:/i.test(line)) {
        recipients = [];
        socket.write("250 OK\r\n");
      } else if (/^RCPT TO:/i.test(line)) {
        const recipient = line.match(/<([^>]+)>/)?.[1];
        if (!recipient?.endsWith("@example.invalid"))
          socket.write("550 Fixture recipients only\r\n");
        else {
          recipients.push(recipient);
          socket.write("250 OK\r\n");
        }
      } else if (/^DATA$/i.test(line)) {
        collecting = true;
        lines = [];
        socket.write("354 End with dot\r\n");
      } else if (/^QUIT$/i.test(line)) socket.end("221 Goodbye\r\n");
      else if (/^(RSET|NOOP)/i.test(line)) socket.write("250 OK\r\n");
      else socket.write("502 Unsupported\r\n");
    }
  });
}
tls
  .createServer(sslOptions, (socket) => smtpConnection(socket))
  .listen(3107, "127.0.0.1");
net
  .createServer((socket) => {
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.write("220 localhost STARTTLS fixture\r\n");
    let buffer = "";
    function negotiate(chunk) {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^(EHLO|HELO)/i.test(line))
          socket.write("250-localhost\r\n250 STARTTLS\r\n");
        else if (/^STARTTLS$/i.test(line)) {
          socket.write("220 Ready for TLS\r\n");
          socket.removeListener("data", negotiate);
          const secure = new tls.TLSSocket(socket, {
            isServer: true,
            secureContext: tls.createSecureContext(sslOptions),
          });
          smtpConnection(secure, false);
          return;
        } else socket.write("530 STARTTLS required\r\n");
      }
    }
    socket.on("data", negotiate);
  })
  .listen(3109, "127.0.0.1");
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let data = { ok: true };
    if (url.pathname === "/messages") data = messages;
    else if (url.pathname === "/reset") messages.length = 0;
    else if (
      url.pathname.startsWith("/geo-api/") ||
      url.pathname.startsWith("/ban/")
    ) {
      const lat = Number(url.searchParams.get("lat") ?? 48.1),
        lon = Number(url.searchParams.get("lon") ?? -1.67);
      const nearby = Math.abs(lat - 48.1) < 0.02 && Math.abs(lon + 1.67) < 0.02;
      data = url.pathname.startsWith("/geo-api/")
        ? (!url.searchParams.has("lat") || nearby) &&
          (!url.searchParams.has("codePostal") ||
            url.searchParams.get("codePostal") === "35000")
          ? [
              {
                nom: "Rennes",
                code: "35238",
                codesPostaux: ["35000"],
                type: "commune-actuelle",
              },
            ]
          : []
        : {
            features: nearby
              ? [
                  {
                    properties: {
                      label: "12 Rue des Lanternes 35000 Rennes",
                      street: "Rue des Lanternes",
                      housenumber: "12",
                      postcode: "35000",
                      city: "Rennes",
                      citycode: "35238",
                    },
                    geometry: { coordinates: [lon, lat] },
                  },
                ]
              : [],
          };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  })
  .listen(3108, "127.0.0.1");
