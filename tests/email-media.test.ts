import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  images: new Map<string, { id: string; hash: string; data: Buffer; filename: string; hidden: boolean }>(),
  query: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  db: () => ({ query: state.query }),
  transaction: async (fn: (client: {query: typeof state.query}) => Promise<unknown>) => fn({query: state.query}),
}));
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
import { GET as list, POST, PATCH } from "../app/api/admin/email-media/route";
import { GET as getImage } from "../app/api/email-media/[id]/route";

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://map.example");
  state.images.clear();
  state.query.mockReset();
  state.query.mockImplementation(async (sql: string, args: unknown[]) => {
    const stored = [...state.images.values()];
    if (sql.startsWith("SELECT id FROM instances")) return { rows: [{ id: args[0] }] };
    if (sql.startsWith("SELECT id,hidden FROM email_media"))
      return { rows: stored.filter((v) => v.hash === args[1]).map((v) => ({ id: v.id, hidden: v.hidden })) };
    if (sql.startsWith("SELECT id FROM email_media"))
      return { rows: stored.filter((v) => v.hash === args[1]).map((v) => ({ id: v.id })) };
    if (sql.startsWith("SELECT count(*)"))
      return { rows: [{ count: stored.filter((v) => !v.hidden).length }] };
    if (sql.startsWith("INSERT INTO email_media")) {
      const [id, , filename, hash, , data] = args as [string, string, string, string, number, Buffer];
      state.images.set(id, { id, hash, filename, data: Buffer.from(data), hidden: false });
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE email_media SET hidden=true")) {
      const image = state.images.get(String(args[0]));
      if (image) image.hidden = true;
      return { rows: image ? [{ id: image.id }] : [] };
    }
    if (sql.startsWith("UPDATE email_media SET hidden=false")) {
      const image = state.images.get(String(args[0]));
      if (image) image.hidden = false;
      return { rows: [] };
    }
    if (sql.startsWith("SELECT data FROM email_media"))
      return { rows: stored.filter((v) => v.id === args[0]).map((v) => ({ data: v.data })) };
    if (sql.startsWith("SELECT id,filename,size_bytes,created_at FROM email_media"))
      return { rows: stored.filter((v) => !v.hidden).map((v) => ({
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
  it("archives images without invalidating public image links", async () => {
    const uploaded = await POST(new NextRequest("https://map.example/api/admin/email-media", {
      method: "POST", headers: { origin: "https://map.example" }, body: await imageForm(),
    }));
    const asset = await uploaded.json();
    const archived = await PATCH(new NextRequest("https://map.example/api/admin/email-media", {
      method: "PATCH", headers: { origin: "https://map.example", "Content-Type": "application/json" },
      body: JSON.stringify({ id: asset.id }),
    }));
    expect(archived.status).toBe(200);
    expect((await (await list(new NextRequest("https://map.example/api/admin/email-media"))).json()).capacity.used).toBe(0);
    const publicAsset = await getImage(new NextRequest(asset.url), {
      params: Promise.resolve({ id: asset.id }),
    });
    expect(publicAsset.status).toBe(200);
    const reimported = await POST(new NextRequest("https://map.example/api/admin/email-media", {
      method: "POST", headers: { origin: "https://map.example" }, body: await imageForm(),
    }));
    expect((await reimported.json()).id).toBe(asset.id);
    expect(state.images.size).toBe(1);
  });
  it("enforces the active-image quota and allows imports after archiving", async () => {
    for (let i = 0; i < 60; i++) {
      const id = "00000000-0000-4000-8000-" + i.toString(16).padStart(12, "0");
      state.images.set(id, { id, hash: "other-" + i, data: Buffer.from([1]),
        filename: "test-" + i + ".webp", hidden: false });
    }
    const blocked = await POST(new NextRequest("https://map.example/api/admin/email-media", {
      method: "POST", headers: { origin: "https://map.example" }, body: await imageForm(),
    }));
    expect(blocked.status).toBe(409);
    const first = state.images.values().next().value!;
    first.hidden = true;
    const allowed = await POST(new NextRequest("https://map.example/api/admin/email-media", {
      method: "POST", headers: { origin: "https://map.example" }, body: await imageForm(),
    }));
    expect(allowed.status).toBe(200);
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
