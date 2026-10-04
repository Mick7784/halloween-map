import { setupAuthorized, finishBootstrap } from "./bootstrap";
import { realTime, type TimeContext } from "./time";
import { timingSafeEqual } from "node:crypto";
import { db, transaction, type Database } from "./db";
import {
  HttpError,
  hashPassword,
  createSession,
  verifyPassword,
  requirePermission,
  rateLimit,
} from "./auth";
import {
  defaultRoles,
  localISO,
  publicHouse,
  seasonState,
  visible,
  type Instance,
  type Season,
  type User,
  type House,
  permissions,
} from "./domain";
import {
  setupSchema,
  registrationSchema,
  houseSchema,
  seasonSchema,
  instanceSchema,
  credentials,
  routeSchema,
} from "./validation";
import { planRoute } from "./routing";
import { z } from "zod";
export async function audit(
  client: Database,
  instanceId: string,
  actor: User | null,
  action: string,
  target?: string,
) {
  await client.query(
    "INSERT INTO audit_logs(instance_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
    [
      instanceId,
      actor?.kind === "STAFF" ? actor.id : null,
      action,
      target ?? null,
    ],
  );
}
export async function instance(): Promise<Instance | null> {
  const { rows } = await db().query("SELECT * FROM instances LIMIT 1");
  return (rows[0] as unknown as Instance) ?? null;
}
export async function activeSeason(
  i: Instance,
  client: Database = db(),
): Promise<Season | null> {
  const { rows } = await client.query(
    "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2",
    [i.active_season_id, i.id],
  );
  return (rows[0] as unknown as Season) ?? null;
}
export function verifySetupToken(value: string) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.startsWith("replace-"))
    throw new HttpError(
      503,
      "Configurez SETUP_TOKEN dans le fichier .env avant le premier lancement.",
    );
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new HttpError(403, "Clé de configuration invalide");
}
export async function setup(input: unknown, setupSession?: string) {
  const data = setupSchema.parse(input);
  if (data.token) verifySetupToken(data.token);
  else if (!(await setupAuthorized(setupSession)))
    throw new HttpError(
      403,
      "Ouvrez le lien de configuration affiché dans les logs",
    );
  await rateLimit("setup", 15);
  const password = await hashPassword(data.admin.password);
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(710031)");
    if ((await c.query("SELECT id FROM instances LIMIT 1")).rows.length)
      throw new HttpError(409, "Configuration déjà terminée");
    if (!data.token && !(await setupAuthorized(setupSession, c)))
      throw new HttpError(403, "Session de configuration expirée");
    const v = data.instance;
    const { rows: ii } = await c.query(
      "INSERT INTO instances(public_name,territory,postal_code,country,timezone,latitude,longitude,zoom) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        v.public_name,
        v.territory,
        v.postal_code,
        v.country,
        v.timezone,
        v.latitude,
        v.longitude,
        v.zoom,
      ],
    );
    const i = ii[0] as unknown as Instance;
    let roleId = "";
    for (const [name, perms] of Object.entries(defaultRoles)) {
      const { rows } = await c.query(
        "INSERT INTO roles(instance_id,name,permissions) VALUES($1,$2,$3) RETURNING id",
        [i.id, name, perms],
      );
      if (name === "SUPER_ADMIN") roleId = String(rows[0].id);
    }
    const { rows: u } = await c.query(
      "INSERT INTO users(instance_id,email,display_name,password_hash,role_id,kind) VALUES($1,$2,$3,$4,$5,'STAFF') RETURNING id",
      [i.id, data.admin.email, data.admin.display_name, password, roleId],
    );
    const s = await insertSeason(c, i, data.season);
    await c.query("UPDATE instances SET active_season_id=$1 WHERE id=$2", [
      s.id,
      i.id,
    ]);
    await finishBootstrap(c);
    await audit(c, i.id, null, "setup.completed");
    return { token: await createSession(String(u[0].id), c) };
  });
}
async function insertSeason(
  c: Database,
  i: Instance,
  data: z.infer<typeof seasonSchema>,
) {
  const { opens, closes, registrations, purge } = seasonDates(data, i.timezone);
  const { rows } = await c.query(
    "INSERT INTO seasons(instance_id,year,opens_at,closes_at,registrations_open,activated,registrations_open_at,purge_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [
      i.id,
      data.year,
      opens,
      closes,
      data.registrations_open,
      data.activated,
      registrations,
      purge,
    ],
  );
  return rows[0] as unknown as Season;
}
function seasonDates(data: z.infer<typeof seasonSchema>, zone: string) {
  try {
    const opens = localISO(data.opens_at, zone),
      closes = localISO(data.closes_at, zone);
    const registrations = data.registrations_open_at
      ? localISO(data.registrations_open_at, zone)
      : new Date(+new Date(opens) - 30 * 86400000).toISOString();
    const purge = data.purge_at
      ? localISO(data.purge_at, zone)
      : new Date(+new Date(closes) + 36 * 3600000).toISOString();
    if (
      +new Date(registrations) > +new Date(opens) ||
      +new Date(opens) >= +new Date(closes) ||
      +new Date(closes) > +new Date(purge)
    )
      throw new Error("Ordre des dates invalide");
    return { opens, closes, registrations, purge };
  } catch {
    throw new HttpError(
      400,
      "Dates invalides : inscriptions ≤ ouverture < fermeture ≤ purge, avec une heure locale non ambiguë",
    );
  }
}
export async function purgeSeason(
  seasonId: string,
  instanceId: string,
  actor: User | null = null,
  manual = false,
  now = new Date(),
) {
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
      [seasonId, instanceId],
    );
    const s = rows[0] as unknown as Season;
    if (!s) throw new HttpError(404, "Saison introuvable");
    if (s.purged_at) return { purged: false };
    if (!manual && +new Date(s.purge_at) > +now) return { purged: false };
    const { rows: totals } = await c.query(
      `SELECT count(*)::int houses,count(*) FILTER(WHERE status='APPROVED')::int approved,
      count(*) FILTER(WHERE 'DECORATION'=ANY(activities))::int decoration,count(*) FILTER(WHERE 'CANDY'=ANY(activities))::int candy,
      count(*) FILTER(WHERE 'ACTING'=ANY(activities))::int acting FROM houses WHERE season_id=$1 AND instance_id=$2`,
      [s.id, instanceId],
    );
    const stats = { ...totals[0], routes: s.routes_count };
    // No addresses, text, precise coordinates, owner IDs or routes survive the purge.
    await c.query(
      "DELETE FROM audit_logs WHERE instance_id=$1 AND (target_id IN (SELECT id FROM houses WHERE season_id=$2) OR target_id IN (SELECT user_id FROM houses WHERE season_id=$2))",
      [instanceId, s.id],
    );
    await c.query(
      "DELETE FROM users WHERE instance_id=$1 AND kind='PARTICIPANT' AND id IN (SELECT user_id FROM houses WHERE season_id=$2)",
      [instanceId, s.id],
    );
    await c.query("DELETE FROM houses WHERE season_id=$1 AND instance_id=$2", [
      s.id,
      instanceId,
    ]);
    // Remove orphan participants too; V0.1 allows only one live season per instance.
    await c.query(
      "DELETE FROM users WHERE instance_id=$1 AND kind='PARTICIPANT' AND NOT EXISTS(SELECT 1 FROM houses h WHERE h.user_id=users.id)",
      [instanceId],
    );
    await c.query(
      "UPDATE seasons SET stats=$1,purged_at=$2,registrations_open=false,activated=false,reminder_enabled=false,reminder_subject='',reminder_body='' WHERE id=$3",
      [JSON.stringify(stats), now, s.id],
    );
    await audit(
      c,
      instanceId,
      actor,
      manual ? "season.purge.manual" : "season.purge.automatic",
      s.id,
    );
    return { purged: true, stats };
  });
}
export async function tick(now = new Date()) {
  const { rows } = await db().query(
    "SELECT id,instance_id FROM seasons WHERE purged_at IS NULL AND purge_at<=$1",
    [now],
  );
  for (const s of rows)
    await purgeSeason(String(s.id), String(s.instance_id), null, false, now);
  await db().query("DELETE FROM sessions WHERE expires_at<=now()");
  await db().query("DELETE FROM setup_sessions WHERE expires_at<=now()");
  await db().query("DELETE FROM rate_limits WHERE reset_at<now()");
}
export async function publicState(context: TimeContext | Date = realTime()) {
  const { now, preview } =
    context instanceof Date ? { now: context, preview: false } : context;
  if (!preview) await tick(now);
  const i = await instance();
  if (!i) return { setupRequired: true };
  const s = await activeSeason(i),
    state = seasonState(s, now);
  let count = 0,
    houses: ReturnType<typeof publicHouse>[] = [];
  if (s && state !== "CLOSED" && state !== "ARCHIVED") {
    const { rows } = await db().query(
      "SELECT count(*)::int n FROM houses WHERE instance_id=$1 AND season_id=$2 AND status=$3",
      [i.id, s.id, "APPROVED"],
    );
    count = Number(rows[0].n);
    if (state === "MAP_OPEN") {
      const { rows } = await db().query(
        "SELECT * FROM houses WHERE instance_id=$1 AND season_id=$2 AND status='APPROVED' AND activity='ACTIVE' AND starts_at<=$3 AND ends_at>$3",
        [i.id, s.id, now],
      );
      houses = (rows as unknown as House[])
        .filter((h) => visible(h, s, now))
        .map(publicHouse);
    }
  }
  return {
    setupRequired: false,
    preview,
    instance: {
      public_name: i.public_name,
      territory: i.territory,
      timezone: i.timezone,
      latitude: i.latitude,
      longitude: i.longitude,
      zoom: i.zoom,
      footer: i.config.footer,
      defaultOpen: i.config.defaultOpen,
      defaultClose: i.config.defaultClose,
    },
    season: s
      ? {
          year: s.year,
          opens_at: s.opens_at,
          closes_at: s.closes_at,
          registrations_open:
            s.registrations_open &&
            !s.purged_at &&
            +now >= +new Date(s.registrations_open_at) &&
            +now < +new Date(s.closes_at),
        }
      : null,
    state,
    count,
    houses,
    serverTime: now.toISOString(),
  };
}
export async function login(input: unknown) {
  const data = credentials.parse(input);
  await rateLimit("login:" + data.email);
  const { rows } = await db().query(
    "SELECT id,password_hash FROM users WHERE email=$1",
    [data.email],
  );
  // Run the same expensive derivation for unknown accounts.
  const fallback = "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
  if (
    !(await verifyPassword(
      data.password,
      String(rows[0]?.password_hash ?? fallback),
    )) ||
    !rows[0]
  )
    throw new HttpError(401, "Email ou mot de passe incorrect");
  return { token: await createSession(String(rows[0].id)) };
}
function houseDates(data: z.infer<typeof houseSchema>, i: Instance, s: Season) {
  const starts = localISO(data.starts_at, i.timezone),
    ends = localISO(data.ends_at, i.timezone);
  if (
    +new Date(ends) <= +new Date(starts) ||
    +new Date(starts) < +new Date(s.opens_at) ||
    +new Date(ends) > +new Date(s.closes_at)
  )
    throw new HttpError(
      400,
      "Les horaires doivent être compris entre l’ouverture et la fermeture de la carte",
    );
  return [starts, ends];
}
export async function register(input: unknown) {
  const data = registrationSchema.parse(input);
  await rateLimit("register:" + data.account.email, 5);
  const hash = await hashPassword(data.account.password);
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM instances LIMIT 1 FOR UPDATE",
    );
    const i = rows[0] as unknown as Instance;
    if (!i) throw new HttpError(409, "Instance non configurée");
    const { rows: seasons } = await c.query(
      "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
      [i.active_season_id, i.id],
    );
    const s = seasons[0] as unknown as Season;
    if (
      !s ||
      s.purged_at ||
      !s.registrations_open ||
      +new Date() < +new Date(s.registrations_open_at) ||
      +new Date() >= +new Date(s.closes_at)
    )
      throw new HttpError(403, "Inscriptions fermées");
    const [starts, ends] = houseDates(data.house, i, s);
    const { rows: u } = await c.query(
      "INSERT INTO users(instance_id,email,display_name,password_hash,kind) VALUES($1,$2,'Participant',$3,'PARTICIPANT') RETURNING id",
      [i.id, data.account.email, hash],
    );
    const h = data.house;
    await c.query(
      "INSERT INTO houses(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,adaptable,rp,practical) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        i.id,
        s.id,
        u[0].id,
        h.name,
        h.address,
        h.latitude,
        h.longitude,
        h.activities,
        starts,
        ends,
        h.fear,
        h.adaptable,
        h.rp,
        h.practical,
      ],
    );
    await audit(c, i.id, null, "participant.registered");
    return { token: await createSession(String(u[0].id), c) };
  });
}
export async function ownHouse(user: User | null) {
  if (!user) throw new HttpError(401, "Connexion requise");
  const { rows } = await db().query(
    "SELECT * FROM houses WHERE user_id=$1 AND instance_id=$2",
    [user.id, user.instance_id],
  );
  return rows[0] ?? null;
}
export async function updateHouse(
  user: User | null,
  id: string,
  input: unknown,
  admin = false,
) {
  if (!user) throw new HttpError(401, "Connexion requise");
  if (admin) requirePermission(user, "participants.edit");
  const data = houseSchema.parse(input);
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM houses WHERE id=$1 AND instance_id=$2 FOR UPDATE",
      [id, user.instance_id],
    );
    const old = rows[0] as unknown as House;
    if (!old || (!admin && old.user_id !== user.id))
      throw new HttpError(404, "Maison introuvable");
    const i = (await instance())!,
      s = await activeSeason(i, c);
    if (!s || s.purged_at || +new Date() >= +new Date(s.closes_at))
      throw new HttpError(403, "Saison fermée");
    const [starts, ends] = houseDates(data, i, s);
    const changed = [
      "name",
      "address",
      "latitude",
      "longitude",
      "rp",
      "practical",
    ].some((key) => old[key as keyof House] !== data[key as keyof typeof data]);
    const status = !admin && changed ? "PENDING" : old.status;
    await c.query(
      "UPDATE houses SET name=$1,address=$2,latitude=$3,longitude=$4,activities=$5,starts_at=$6,ends_at=$7,fear=$8,adaptable=$9,rp=$10,practical=$11,status=$12 WHERE id=$13 AND instance_id=$14",
      [
        data.name,
        data.address,
        data.latitude,
        data.longitude,
        data.activities,
        starts,
        ends,
        data.fear,
        data.adaptable,
        data.rp,
        data.practical,
        status,
        id,
        user.instance_id,
      ],
    );
    await audit(c, user.instance_id, user, "house.updated", id);
    return { status };
  });
}
export async function participantAction(user: User | null, input: unknown) {
  if (!user || user.kind !== "PARTICIPANT")
    throw new HttpError(403, "Compte participant requis");
  const data = z
    .object({
      action: z.enum(["pause", "resume", "end", "candy", "delete"]),
      available: z.boolean().optional(),
      confirm: z.literal("SUPPRIMER").optional(),
    })
    .parse(input);
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT h.*,s.purged_at,s.closes_at FROM houses h JOIN seasons s ON s.id=h.season_id WHERE user_id=$1 AND h.instance_id=$2 FOR UPDATE OF h,s",
      [user.id, user.instance_id],
    );
    const h = rows[0] as unknown as House & {
      purged_at: unknown;
      closes_at: string;
    };
    if (!h) throw new HttpError(404, "Maison introuvable");
    if (data.action === "delete") {
      if (data.confirm !== "SUPPRIMER")
        throw new HttpError(400, "Confirmation requise");
      await c.query(
        "DELETE FROM audit_logs WHERE instance_id=$1 AND target_id IN ($2,$3)",
        [user.instance_id, h.id, user.id],
      );
      await c.query("DELETE FROM users WHERE id=$1 AND instance_id=$2", [
        user.id,
        user.instance_id,
      ]);
      await audit(c, user.instance_id, null, "participant.deleted");
      return { deleted: true };
    }
    if (h.purged_at || +new Date() >= +new Date(h.closes_at))
      throw new HttpError(403, "Saison fermée");
    if (data.action === "candy") {
      if (typeof data.available !== "boolean")
        throw new HttpError(400, "Disponibilité requise");
      await c.query("UPDATE houses SET candy_available=$1 WHERE id=$2", [
        data.available,
        h.id,
      ]);
    } else {
      if (h.activity === "ENDED" && data.action === "resume")
        throw new HttpError(400, "Cette activité est terminée");
      await c.query("UPDATE houses SET activity=$1 WHERE id=$2", [
        { pause: "PAUSED", resume: "ACTIVE", end: "ENDED" }[data.action],
        h.id,
      ]);
    }
    await audit(c, user.instance_id, user, "participant." + data.action, h.id);
    return { ok: true };
  });
}
export async function route(
  userInput: unknown,
  context: TimeContext = realTime(),
) {
  const input = routeSchema.parse(userInput);
  const i = await instance();
  if (!i) throw new HttpError(404, "Instance manquante");
  return transaction(async (c) => {
    const { rows: ss } = await c.query(
      "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
      [i.active_season_id, i.id],
    );
    const s = ss[0] as unknown as Season;
    if (!s || seasonState(s, context.now) !== "MAP_OPEN")
      throw new HttpError(403, "La carte est fermée");
    const { rows } = await c.query(
      "SELECT * FROM houses WHERE instance_id=$1 AND season_id=$2 AND status='APPROVED' AND activity='ACTIVE' AND starts_at<=$3 AND ends_at>$3",
      [i.id, s.id, context.now],
    );
    const result = planRoute(rows as unknown as House[], s, input, context.now);
    if (!context.preview)
      await c.query(
        "UPDATE seasons SET routes_count=routes_count+1 WHERE id=$1",
        [s.id],
      );
    return result;
  });
}
export async function adminRead(user: User | null, section: string) {
  const permission: Record<string, string> = {
    dashboard: "stats.read",
    houses: "participants.read",
    users: "users.read",
    seasons: "season.read",
    stats: "stats.read",
    settings: "settings.read",
    roles: "users.read",
    audit: "audit.read",
  };
  if (!permission[section]) throw new HttpError(404, "Section inconnue");
  const u = requirePermission(user, permission[section]);
  switch (section) {
    case "houses":
      return (
        await db().query(
          "SELECT h.*,u.email FROM houses h JOIN users u ON u.id=h.user_id WHERE h.instance_id=$1 ORDER BY h.status,h.name",
          [u.instance_id],
        )
      ).rows;
    case "users":
      return (
        await db().query(
          "SELECT u.id,u.email,u.display_name,u.kind,u.role_id,r.name role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.instance_id=$1 ORDER BY u.created_at",
          [u.instance_id],
        )
      ).rows;
    case "seasons":
    case "stats":
      return (
        await db().query(
          "SELECT s.*,(SELECT count(DISTINCT u.id)::int FROM houses h JOIN users u ON u.id=h.user_id WHERE h.season_id=s.id AND u.kind='PARTICIPANT' AND u.demo=false) reminder_recipient_estimate FROM seasons s WHERE s.instance_id=$1 ORDER BY s.year DESC",
          [u.instance_id],
        )
      ).rows.map((s) => redactSeason(s, u));
    case "settings":
      return await instance();
    case "roles":
      return (
        await db().query(
          "SELECT * FROM roles WHERE instance_id=$1 ORDER BY name",
          [u.instance_id],
        )
      ).rows;
    case "audit":
      return (
        await db().query(
          "SELECT a.id,a.action,a.created_at,a.target_id,u.display_name actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.instance_id=$1 ORDER BY a.created_at DESC LIMIT 200",
          [u.instance_id],
        )
      ).rows;
    default: {
      const i = (await instance())!,
        s = await activeSeason(i);
      const { rows } = await db().query(
        "SELECT count(*)::int total,count(*) FILTER(WHERE status='APPROVED')::int approved,count(*) FILTER(WHERE status='PENDING')::int pending FROM houses WHERE instance_id=$1 AND season_id=$2",
        [i.id, s?.id ?? null],
      );
      const { rows: users } = await db().query(
        "SELECT count(*)::int total FROM users WHERE instance_id=$1",
        [i.id],
      );
      return {
        ...rows[0],
        users: users[0].total,
        routes: s?.routes_count ?? 0,
        state: seasonState(s),
        season: s
          ? redactSeason(s as unknown as Record<string, unknown>, u)
          : null,
      };
    }
  }
}
function redactSeason(s: Record<string, unknown>, user: User) {
  if (user.permissions.includes("season.manage")) return s;
  return { ...s, reminder_subject: "", reminder_body: "" };
}
export async function adminAction(user: User | null, input: unknown) {
  if (!user) throw new HttpError(401, "Connexion requise");
  const data = z
    .object({
      action: z.string(),
      id: z.uuid().optional(),
      payload: z.unknown().optional(),
    })
    .parse(input);
  const u = user;
  if (data.action === "moderate") {
    requirePermission(u, "participants.validate");
    const status = z
      .enum(["APPROVED", "REJECTED", "DISABLED"])
      .parse(data.payload);
    const result = await db().query(
      "UPDATE houses SET status=$1 WHERE id=$2 AND instance_id=$3 RETURNING id",
      [status, data.id, u.instance_id],
    );
    if (!result.rows.length) throw new HttpError(404, "Maison introuvable");
    await audit(
      db(),
      u.instance_id,
      u,
      "house." + status.toLowerCase(),
      data.id,
    );
    return { ok: true };
  }
  if (data.action === "editHouse")
    return updateHouse(u, data.id!, data.payload, true);
  if (data.action === "deleteParticipant") {
    requirePermission(u, "participants.delete");
    if (data.payload !== "SUPPRIMER")
      throw new HttpError(400, "Confirmation requise");
    return transaction(async (c) => {
      await c.query(
        "DELETE FROM audit_logs WHERE instance_id=$1 AND (target_id=$2 OR target_id IN(SELECT id FROM houses WHERE user_id=$2))",
        [u.instance_id, data.id],
      );
      const { rows } = await c.query(
        "DELETE FROM users WHERE id=$1 AND instance_id=$2 AND kind='PARTICIPANT' RETURNING id",
        [data.id, u.instance_id],
      );
      if (!rows.length) throw new HttpError(404, "Participant introuvable");
      await audit(c, u.instance_id, u, "participant.deleted");
      return { ok: true };
    });
  }
  if (data.action === "settings") {
    requirePermission(u, "settings.manage");
    const p = instanceSchema
      .extend({
        footer: z.string().max(150),
        defaultOpen: z.string().regex(/^\d{2}-\d{2}T\d{2}:\d{2}$/),
        defaultClose: z.string().regex(/^\d{2}-\d{2}T\d{2}:\d{2}$/),
      })
      .parse(data.payload);
    await db().query(
      "UPDATE instances SET public_name=$1,territory=$2,postal_code=$3,country=$4,timezone=$5,latitude=$6,longitude=$7,zoom=$8,config=config || $9::jsonb WHERE id=$10",
      [
        p.public_name,
        p.territory,
        p.postal_code,
        p.country,
        p.timezone,
        p.latitude,
        p.longitude,
        p.zoom,
        JSON.stringify({
          footer: p.footer,
          defaultOpen: p.defaultOpen,
          defaultClose: p.defaultClose,
        }),
        u.instance_id,
      ],
    );
    await audit(db(), u.instance_id, u, "settings.updated");
    return { ok: true };
  }
  if (data.action === "purge") {
    if (u.role_name !== "SUPER_ADMIN")
      throw new HttpError(403, "Super Admin requis");
    if (data.payload !== "PURGER")
      throw new HttpError(400, "Confirmation requise");
    return purgeSeason(data.id!, u.instance_id, u, true);
  }
  if (data.action === "season") {
    requirePermission(u, "season.manage");
    const p = seasonSchema.parse(data.payload);
    const i = (await instance())!;
    return transaction(async (c) => {
      await c.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [i.id]);
      let s: Season;
      if (data.id) {
        const { rows } = await c.query(
          "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
          [data.id, i.id],
        );
        s = rows[0] as unknown as Season;
        if (!s || s.purged_at || s.archived)
          throw new HttpError(
            400,
            "Une saison purgée ne peut pas être réouverte",
          );
        const { opens, closes, registrations, purge } = seasonDates(
          p,
          i.timezone,
        );
        if (
          (
            await c.query(
              "SELECT id FROM seasons WHERE id=$1 AND reminder_enabled=true AND reminder_at>=$2",
              [s.id, purge],
            )
          ).rows.length
        )
          throw new HttpError(400, "La purge doit suivre le rappel programmé");
        const { rows: invalid } = await c.query(
          "SELECT id FROM houses WHERE season_id=$1 AND (starts_at<$2 OR ends_at>$3) LIMIT 1",
          [s.id, opens, closes],
        );
        if (invalid.length)
          throw new HttpError(
            400,
            "Les nouveaux horaires excluent des maisons inscrites",
          );
        await c.query(
          "UPDATE seasons SET year=$1,opens_at=$2,closes_at=$3,registrations_open=$4,activated=$5,registrations_open_at=$7,purge_at=$8 WHERE id=$6",
          [
            p.year,
            opens,
            closes,
            p.registrations_open,
            p.activated,
            s.id,
            registrations,
            purge,
          ],
        );
      } else {
        const old = await activeSeason(i, c);
        if (old && !old.purged_at)
          throw new HttpError(
            409,
            "Fermez et purgez la saison actuelle avant d’en créer une nouvelle",
          );
        if (old)
          await c.query("UPDATE seasons SET archived=true WHERE id=$1", [
            old.id,
          ]);
        // New seasons always require a separate explicit activation.
        s = await insertSeason(c, i, { ...p, activated: false });
        await c.query("UPDATE instances SET active_season_id=$1 WHERE id=$2", [
          s.id,
          i.id,
        ]);
      }
      await audit(c, i.id, u, "season.updated", s.id);
      return { ok: true };
    });
  }
  if (data.action === "createStaff" || data.action === "userRole") {
    requirePermission(u, "users.manage");
    const p =
      data.action === "createStaff"
        ? credentials
            .extend({
              display_name: z.string().trim().min(1).max(80),
              role_id: z.uuid(),
            })
            .parse(data.payload)
        : z.object({ role_id: z.uuid() }).parse(data.payload);
    const { rows } = await db().query(
      "SELECT * FROM roles WHERE id=$1 AND instance_id=$2",
      [p.role_id, u.instance_id],
    );
    if (!rows.length) throw new HttpError(400, "Rôle invalide");
    const target = rows[0];
    if (
      u.role_name !== "SUPER_ADMIN" &&
      (target.name === "SUPER_ADMIN" ||
        (target.permissions as string[]).some(
          (p) => !u.permissions.includes(p),
        ))
    )
      throw new HttpError(403, "Attribution de droits interdite");
    if (data.action === "createStaff") {
      const p2 = p as z.infer<typeof credentials> & {
        display_name: string;
        role_id: string;
      };
      await db().query(
        "INSERT INTO users(instance_id,email,display_name,password_hash,role_id,kind) VALUES($1,$2,$3,$4,$5,'STAFF')",
        [
          u.instance_id,
          p2.email,
          p2.display_name,
          await hashPassword(p2.password),
          p2.role_id,
        ],
      );
    } else {
      if (data.id === u.id)
        throw new HttpError(
          400,
          "Vous ne pouvez pas changer votre propre rôle",
        );
      const old = (
        await db().query(
          "SELECT r.name FROM users x JOIN roles r ON r.id=x.role_id WHERE x.id=$1 AND x.instance_id=$2",
          [data.id, u.instance_id],
        )
      ).rows[0];
      if (!old || old.name === "SUPER_ADMIN")
        throw new HttpError(403, "Ce compte est protégé");
      await db().query(
        "UPDATE users SET role_id=$1 WHERE id=$2 AND instance_id=$3 AND kind='STAFF'",
        [p.role_id, data.id, u.instance_id],
      );
    }
    await audit(db(), u.instance_id, u, "user.role.updated");
    return { ok: true };
  }
  if (data.action === "role") {
    requirePermission(u, "roles.manage");
    const p = z
      .object({
        name: z.string().regex(/^[A-Z][A-Z0-9_]{2,39}$/),
        permissions: z.array(z.enum(permissions)).max(permissions.length),
      })
      .parse(data.payload);
    if (p.name === "SUPER_ADMIN")
      throw new HttpError(400, "Le rôle Super Admin est protégé");
    await db().query(
      "INSERT INTO roles(instance_id,name,permissions) VALUES($1,$2,$3) ON CONFLICT(instance_id,name) DO UPDATE SET permissions=EXCLUDED.permissions",
      [u.instance_id, p.name, p.permissions],
    );
    await audit(db(), u.instance_id, u, "role.updated");
    return { ok: true };
  }
  throw new HttpError(400, "Action inconnue");
}
