import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  images: new Map<string, { id: string; hash: string; data: Buffer; filename: string }>(),
  query: vi.fn(),
}));
vi.mock("../lib/db", () => ({ db: () => ({ query: state.query }) }));
vi.mock("../lib/auth", () => ({
  getUser: vi.fn(async () => ({
    id: "a0000000-0000-4000-8000-000000000001",
    instance_id: "b0000000-0000-4000-8000-000000000002",
  })),
  requirePermission: (user: unknown) => user,
  rateLimit: vi.fn(async () => undefined),
  HttpError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
import { GET as list, POST } from "../app/api/admin/email-media/route";
import { GET as getImage } from "../app/api/email-media/[id]/route";

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://map.example");
  state.images.clear();
  state.query.mockReset();
  state.query.mockImplementation(async (sql: string, args: unknown[]) => {
    const stored = [...state.images.values()];
    if (sql.startsWith("SELECT id FROM email_media"))
      return { rows: stored.filter((v) => v.hash === args[1]).map((v) => ({ id: v.id })) };
    if (sql.startsWith("SELECT count(*)"))
      return { rows: [{ count: stored.length }] };
    if (sql.startsWith("INSERT INTO email_media")) {
      const [id, , filename, hash, , data] = args as [string, string, string, string, number, Buffer];
      state.images.set(id, { id, hash, filename, data: Buffer.from(data) });
      return { rows: [] };
    }
    if (sql.startsWith("SELECT data FROM email_media"))
      return { rows: stored.filter((v) => v.id === args[0]).map((v) => ({ data: v.data })) };
    if (sql.startsWith("SELECT id,filename,size_bytes,created_at FROM email_media"))
      return { rows: stored.map((v) => ({
        id: v.id, filename: v.filename, size_bytes: v.data.byteLength,
        created_at: "2026-10-14T12:00:00Z",
      })) };
    throw new Error("Unhandled email-media SQL: " + sql);
  });
});
afterEach(() => vi.unstubAllEnvs());

async function imageForm() {
  const png = await sharp({ create: {
    width: 64, height: 64, channels: 4, background: "#ff922f",
  } }).png().toBuffer();
  const form = new FormData();
  form.set("image", new File([new Uint8Array(png)], "citrouille.png", {
    type: "image/png",
  }));
  return form;
}
function request(origin = "https://map.example") {
  return new NextRequest(origin + "/api/admin/email-media", {
    method: "POST",
    headers: { origin },
    body: new FormData(),
  });
}

describe("V0.9.5 — durable HTTPS email media", () => {
  it("uploads an optimized image and serves it permanently to email recipients", async () => {
    const response = await POST(new NextRequest("https://map.example/api/admin/email-media", {
      method: "POST", headers: { origin: "https://map.example" }, body: await imageForm(),
    }));
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created.url).toMatch(/^https:\/\/map\.example\/api\/email-media\//);
    expect(state.images.size).toBe(1);
    const asset = await getImage(new NextRequest(created.url), {
      params: Promise.resolve({ id: created.id as string }),
    });
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Content-Type")).toBe("image/webp");
    expect(asset.headers.get("Cache-Control")).toContain("immutable");
    const bytes = Buffer.from(await asset.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
    const gallery = await list(new NextRequest("https://map.example/api/admin/email-media"));
    expect(gallery.status).toBe(200);
    expect((await gallery.json()).images[0].url).toBe(created.url);
  });
  it("rejects a different origin and preserves the image library", async () => {
    const response = await POST(new NextRequest("https://map.example/api/admin/email-media", {
      method: "POST", headers: { origin: "https://foreign.example" },
      body: await imageForm(),
    }));
    expect(response.status).toBe(403);
    expect(state.images.size).toBe(0);
  });
  it("never accepts non-HTTPS email-image origins in production", async () => {
    vi.stubEnv("APP_ORIGIN", "http://map.example");
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request("http://map.example"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("HTTPS");
    expect(state.images.size).toBe(0);
  });
});
