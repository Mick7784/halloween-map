// Only loaded by the browser integration server, never by production start.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  if (["geo.api.gouv.fr", "data.geopf.fr"].includes(url.hostname)) {
    url.pathname =
      (url.hostname === "geo.api.gouv.fr" ? "/geo-api" : "/ban") + url.pathname;
    url.protocol = "http:";
    url.hostname = "127.0.0.1";
    url.port = "3108";
    return original(url, init);
  }
  return original(input, init);
};
