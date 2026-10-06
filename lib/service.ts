import {
  initializeLegalDocuments,
  contentState,
  legalState,
  validateAcceptance,
  interpolate,
} from "./content";
import { demoSeason, fictionalHouses } from "./demo";
import { recomputeCampaigns } from "./mail";
import { createAccount, adminUsers } from "./accounts";
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
  effectiveActivities,
  defaultRoles,
  localISO,
  publicHouse,
  seasonState,
  visible,
  type Instance,
  type Season,
  type User,
  type House,
} from "./domain";
import {
  setupSchema,
  houseSchema,
  seasonSchema,
  instanceSchema,
  credentials,
  routeSchema,
} from "./validation";
import { planRoute, validateRouteWindow } from "./routing";
import { RoutingError } from "./walking-router";
import { houseRouteKey } from "./route-state";
import { publicPrivacySettings } from "./privacy";
import {
  publicParticipationSettings,
  formatAddress,
  type AddressParts,
} from "./participation-settings";
import { frenchCommunes, frenchAddressReverse } from "./french-address";
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
      actor?.permissions.includes("admin.access") ? actor.id : null,
      action,
      target ?? null,
    ],
  );
}
export async function instance(
  client: Database = db(),
): Promise<Instance | null> {
  const { rows } = await client.query("SELECT * FROM instances LIMIT 1");
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
    await initializeLegalDocuments(i.id, c);
    let roleId = "";
    for (const name of Object.keys(defaultRoles)) {
      const { rows } = await c.query(
        "INSERT INTO roles(instance_id,name,permissions) VALUES($1,$2,$3) RETURNING id",
        [i.id, name, []],
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
      `SELECT count(*)::int houses,count(*) FILTER(WHERE status='VISIBLE')::int approved,
      count(*) FILTER(WHERE 'DECORATION'=ANY(activities))::int decoration,count(*) FILTER(WHERE 'CANDY'=ANY(activities))::int candy,
      count(*) FILTER(WHERE 'ACTING'=ANY(activities))::int acting FROM participations WHERE season_id=$1 AND instance_id=$2`,
      [s.id, instanceId],
    );
    const stats = { ...totals[0], routes: s.routes_count };
    // No addresses, text, precise coordinates, owner IDs or routes survive the purge.
    await c.query(
      "DELETE FROM audit_logs WHERE instance_id=$1 AND (target_id IN (SELECT id FROM participations WHERE season_id=$2) OR target_id IN (SELECT user_id FROM participations WHERE season_id=$2))",
      [instanceId, s.id],
    );
    await c.query(
      "DELETE FROM participations WHERE season_id=$1 AND instance_id=$2",
      [s.id, instanceId],
    );
    await c.query("DELETE FROM email_outbox WHERE season_id=$1", [s.id]);
    await c.query("DELETE FROM reminder_deliveries WHERE season_id=$1", [s.id]);
    await c.query(
      "UPDATE email_campaigns SET subject='',body='',active=false,status=CASE WHEN status IN('DRAFT','SCHEDULED','SENDING') THEN 'CANCELLED' ELSE status END WHERE season_id=$1",
      [s.id],
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
  await db().query("DELETE FROM email_tokens WHERE expires_at<=now()");
  await db().query(
    "DELETE FROM email_outbox WHERE season_id IS NULL AND status IN('SENT','FAILED','CANCELLED') AND created_at<now()-interval '30 days'",
  );
}
function formatDate(value: Date | string | undefined, zone: string) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", {
        timeZone: zone,
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "";
}

async function routeCandidates(
  client: Database,
  i: Instance,
  s: Season,
  start: Date | string,
  end: Date | string,
) {
  const { rows } = await client.query(
    "SELECT * FROM participations WHERE instance_id=$1 AND season_id=$2 AND status='VISIBLE' AND activity='ACTIVE' AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version))) AND starts_at<$4 AND ends_at>$3",
    [i.id, s.id, start, end],
  );
  return rows as unknown as House[];
}

export async function publicState(
  context: TimeContext | Date = realTime(),
  user: User | null = null,
) {
  const { now, preview } =
    context instanceof Date ? { now: context, preview: false } : context;
  if (preview && user?.role_name !== "SUPER_ADMIN")
    throw new HttpError(403, "Super Admin requis");
  if (!preview) await tick(now);
  const i = await instance();
  if (!i) return { setupRequired: true };
  const actualSeason = await activeSeason(i);
  const s = actualSeason && preview ? demoSeason(actualSeason) : actualSeason,
    state = seasonState(s, now);
  let count = 0,
    houses: ReturnType<typeof publicHouse>[] = [];
  let upcoming: ReturnType<typeof publicHouse>[] = [];
  let demoError: string | undefined;
  let previewHouses: House[] = [];
  let closedHouseIds: string[] = [];
  if (s && state !== "CLOSED" && state !== "ARCHIVED") {
    const { rows } = await db().query(
      "SELECT count(*)::int n FROM participations WHERE instance_id=$1 AND season_id=$2 AND status=$3 AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version)))",
      [i.id, s.id, "VISIBLE"],
    );
    count = Number(rows[0].n);
    if (state === "MAP_OPEN" && user) {
      const { rows } = await db().query(
        "SELECT * FROM participations WHERE instance_id=$1 AND season_id=$2 AND status='VISIBLE' AND activity='ACTIVE' AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version))) AND starts_at<=$3 AND ends_at>$3",
        [i.id, s.id, now],
      );
      houses = (rows as unknown as House[])
        .filter((h) => visible(h, s, now))
        .map(publicHouse);
    }
  }
  if (s && user && !preview && ["PREPARATION", "COUNTDOWN"].includes(state)) {
    const own = await db().query(
      "SELECT * FROM participations WHERE instance_id=$1 AND season_id=$2 AND user_id=$3 AND status='VISIBLE'",
      [i.id, s.id, user.id],
    );
    houses = (own.rows as unknown as House[]).map(publicHouse);
  }
  if (s && preview) {
    try {
      previewHouses = await demoHouses(i, s);
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
      demoError = `Maisons de démonstration indisponibles : ${e.message}`;
    }
    houses = previewHouses.filter((h) => visible(h, s, now)).map(publicHouse);
  }
  if (s && state === "MAP_OPEN" && user)
    upcoming = (
      preview
        ? previewHouses
        : await routeCandidates(db(), i, s, now, s.closes_at)
    )
      .filter(
        (h) =>
          h.status === "VISIBLE" &&
          h.activity === "ACTIVE" &&
          effectiveActivities(h).length &&
          +new Date(h.ends_at) > +now,
      )
      .map(publicHouse);
  if (s && state === "MAP_OPEN" && user && !preview) {
    closedHouseIds = (
      await db().query(
        "SELECT id FROM participations WHERE instance_id=$1 AND season_id=$2 AND status='VISIBLE' AND activity IN ('ENDED','PAUSED') AND ends_at>$3 AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version)))",
        [i.id, s.id, now],
      )
    ).rows.map((row) => String(row.id));
  }
  return {
    routeCandidates: upcoming,
    closedHouseIds,
    demoError,
    setupRequired: false,
    contents: Object.fromEntries(
      Object.entries(await contentState(i.id)).map(([k, v]) => [
        k,
        interpolate(v, {
          territory: i.territory,
          event_name: i.public_name,
          season_year: s?.year ?? "",
          house_count: state === "MAP_OPEN" ? houses.length : count,
          registration_date: formatDate(s?.registrations_open_at, i.timezone),
          map_open_date: formatDate(s?.opens_at, i.timezone),
          map_close_date: formatDate(s?.closes_at, i.timezone),
          purge_date: formatDate(s?.purge_at, i.timezone),
        }),
      ]),
    ),
    documents: await legalState(i.id),
    privacy: publicPrivacySettings(i.config.privacy),
    participation: publicParticipationSettings(i.config.participation),
    preview,
    demoAvailable:
      user?.role_name === "SUPER_ADMIN" &&
      !!actualSeason &&
      seasonState(actualSeason) !== "MAP_OPEN",
    mapAccessible: !!user,
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
          purge_at: s.purge_at,
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
    "SELECT id,password_hash FROM users WHERE email=$1 AND account_status='ACTIVE'",
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
  await db().query("UPDATE users SET last_login_at=now() WHERE id=$1", [
    rows[0].id,
  ]);
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
export const register = createAccount;
async function validateFrenchAddress(data: {
  address: string;
  address_parts?: AddressParts;
  latitude: number;
  longitude: number;
  position_confirmed?: boolean;
}) {
  if (!data.address_parts) return; // Existing integrations and admin forms remain compatible.
  if (!data.position_confirmed)
    throw new HttpError(400, "Confirmez le point de votre maison.");
  const a = data.address_parts;
  const [communes, point] = await Promise.all([
    frenchCommunes(a.postalCode),
    frenchAddressReverse(data.latitude, data.longitude),
  ]);
  const commune = communes.find(
    (c) => c.code === a.cityCode && c.nom === a.city,
  );
  if (!commune)
    throw new HttpError(
      400,
      "Choisissez une commune française correspondant au code postal.",
    );
  if (point.cityCode !== a.cityCode)
    throw new HttpError(
      400,
      "Le point de la maison doit se trouver dans la commune choisie.",
    );
  data.address = formatAddress(a);
}
function validateParticipationSettings(
  data: { address_parts?: AddressParts; rp: string; practical: string },
  i: Instance,
) {
  if (!data.address_parts) return;
  const settings = publicParticipationSettings(i.config.participation);
  if (
    data.rp.length > settings.descriptionLimit ||
    data.practical.length > settings.practicalLimit
  )
    throw new HttpError(
      400,
      "Raccourcissez la description ou les informations pratiques.",
    );
  if (
    settings.allowedCommuneCodes.length &&
    !settings.allowedCommuneCodes.includes(data.address_parts.cityCode)
  )
    throw new HttpError(
      400,
      "Cette commune n’est pas ouverte aux participations.",
    );
}
export async function createParticipation(user: User | null, input: unknown) {
  if (!user) throw new HttpError(401, "Connexion requise");
  const raw = z
    .object({ house: houseSchema, acceptance: z.unknown() })
    .parse(input);
  await validateFrenchAddress(raw.house);
  if (!raw.house.position_confirmed)
    throw new HttpError(
      400,
      "Choisissez ou confirmez explicitement le point de votre maison.",
    );
  return transaction(async (c) => {
    const u = (
      await c.query(
        "SELECT email_status,account_status FROM users WHERE id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (u.email_status !== "VERIFIED" || u.account_status !== "ACTIVE")
      throw new HttpError(403, "Vérifiez votre email avant de participer");
    const i = (
      await c.query("SELECT * FROM instances WHERE id=$1 FOR UPDATE", [
        user.instance_id,
      ])
    ).rows[0] as unknown as Instance;
    const ss = (
      await c.query("SELECT * FROM seasons WHERE id=$1 FOR UPDATE", [
        i.active_season_id,
      ])
    ).rows[0] as unknown as Season;
    if (
      !ss ||
      ss.purged_at ||
      !ss.registrations_open ||
      +new Date() < +new Date(ss.registrations_open_at) ||
      +new Date() >= +new Date(ss.closes_at)
    )
      throw new HttpError(403, "Inscriptions fermées");
    const a = await validateAcceptance(c, i.id, raw.acceptance);
    const h = raw.house;
    validateParticipationSettings(h, i);
    const [starts, ends] = houseDates(h, i, ss);
    await c.query(
      "INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,adaptable,rp,practical,terms_version,terms_accepted_at,guidelines_version,guidelines_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16,now())",
      [
        i.id,
        ss.id,
        user.id,
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
        a.terms_version,
        a.guidelines_version,
      ],
    );
    await audit(c, i.id, user, "participation.created");
    if (h.address_parts)
      await c.query(
        "UPDATE participations SET address_parts=$1 WHERE user_id=$2 AND season_id=$3",
        [JSON.stringify(h.address_parts), user.id, ss.id],
      );
    return { ok: true };
  });
}
export async function ownHouse(user: User | null) {
  if (!user) throw new HttpError(401, "Connexion requise");
  const { rows } = await db().query(
    "SELECT p.* FROM participations p JOIN instances i ON i.active_season_id=p.season_id WHERE p.user_id=$1 AND p.instance_id=$2",
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
  if (!admin) await validateFrenchAddress(data);
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM participations WHERE id=$1 AND instance_id=$2 FOR UPDATE",
      [id, user.instance_id],
    );
    const old = rows[0] as unknown as House;
    if (!old || (!admin && old.user_id !== user.id))
      throw new HttpError(404, "Maison introuvable");
    const i = (await instance(c))!,
      s = await activeSeason(i, c);
    if (!s || s.purged_at || +new Date() >= +new Date(s.closes_at))
      throw new HttpError(403, "Saison fermée");
    if (!admin) {
      const owner = (
        await c.query("SELECT email_status FROM users WHERE id=$1", [user.id])
      ).rows[0];
      if (owner.email_status !== "VERIFIED")
        throw new HttpError(
          403,
          "Vérifiez votre email avant de modifier votre participation",
        );
      const docs = await legalState(i.id, c);
      if (
        (docs.TERMS.requires_reaccept &&
          (old as House & { terms_version?: string }).terms_version !==
            docs.TERMS.version) ||
        (docs.GUIDELINES.requires_reaccept &&
          (old as House & { guidelines_version?: string })
            .guidelines_version !== docs.GUIDELINES.version)
      ) {
        const acceptance = await validateAcceptance(
          c,
          i.id,
          (input as { acceptance?: unknown }).acceptance,
        );
        await c.query(
          "UPDATE participations SET terms_version=$1,terms_accepted_at=now(),guidelines_version=$2,guidelines_accepted_at=now() WHERE id=$3",
          [acceptance.terms_version, acceptance.guidelines_version, id],
        );
      }
    }
    const [starts, ends] = houseDates(data, i, s);
    if (!admin) validateParticipationSettings(data, i);
    const status = old.status;
    await c.query(
      "UPDATE participations SET name=$1,address=$2,latitude=$3,longitude=$4,activities=$5,starts_at=$6,ends_at=$7,fear=$8,adaptable=$9,rp=$10,practical=$11,status=$12 WHERE id=$13 AND instance_id=$14",
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
    await c.query("UPDATE participations SET address_parts=$1 WHERE id=$2", [
      data.address_parts
        ? JSON.stringify(data.address_parts)
        : old.address === data.address
          ? (old.address_parts ?? null)
          : null,
      id,
    ]);
    return { status };
  });
}
export async function participantAction(user: User | null, input: unknown) {
  if (!user) throw new HttpError(403, "Compte participant requis");
  const data = z
    .object({
      action: z.enum(["pause", "resume", "end", "candy", "deplete", "delete"]),
      choice: z.enum(["continue", "close"]).optional(),
      available: z.boolean().optional(),
      confirm: z.literal("SUPPRIMER").optional(),
    })
    .parse(input);
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT h.*,s.purged_at,s.closes_at FROM participations h JOIN seasons s ON s.id=h.season_id WHERE user_id=$1 AND h.instance_id=$2 FOR UPDATE OF h,s",
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
      await c.query(
        "DELETE FROM participations WHERE user_id=$1 AND instance_id=$2",
        [user.id, user.instance_id],
      );
      await audit(c, user.instance_id, null, "participant.deleted");
      return { deleted: true };
    }
    if (h.purged_at || +new Date() >= +new Date(h.closes_at))
      throw new HttpError(403, "Saison fermée");
    if (data.action === "deplete") {
      if (
        !h.activities.includes("CANDY") ||
        !h.candy_available ||
        h.activity === "ENDED"
      )
        throw new HttpError(400, "Les bonbons ne sont plus actifs.");
      if (data.choice === "continue" && !h.activities.includes("ACTING"))
        throw new HttpError(
          400,
          "Sans mise en scène, confirmez la fermeture de la maison.",
        );
      if (!data.choice) throw new HttpError(400, "Confirmation requise.");
      await c.query(
        "UPDATE participations SET candy_available=false,activity=$1 WHERE id=$2",
        [data.choice === "close" ? "ENDED" : h.activity, h.id],
      );
    } else if (data.action === "candy") {
      if (typeof data.available !== "boolean")
        throw new HttpError(400, "Disponibilité requise");
      await c.query(
        "UPDATE participations SET candy_available=$1 WHERE id=$2",
        [data.available, h.id],
      );
    } else {
      if (h.activity === "ENDED" && data.action === "resume")
        throw new HttpError(400, "Cette activité est terminée");
      await c.query("UPDATE participations SET activity=$1 WHERE id=$2", [
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
  user: User | null = null,
) {
  if (!user) throw new HttpError(401, "Connexion requise");
  if (context.preview && user.role_name !== "SUPER_ADMIN")
    throw new HttpError(403, "Super Admin requis");
  const input = routeSchema.parse(userInput);
  const i = await instance();
  if (!i) throw new HttpError(404, "Instance manquante");
  const rawSeason = await activeSeason(i);
  const s = rawSeason && context.preview ? demoSeason(rawSeason) : rawSeason;
  if (!s || seasonState(s, context.now) !== "MAP_OPEN")
    throw new HttpError(403, "La carte est fermée");
  try {
    validateRouteWindow(s, input, context.now);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  let result;
  try {
    const candidates = context.preview
      ? await demoHouses(i, s)
      : await routeCandidates(db(), i, s, input.start, input.end);
    result = await planRoute(candidates, s, input, context.now);
  } catch (e) {
    if (e instanceof RoutingError)
      throw new HttpError(e.reason === "no_route" ? 422 : 503, e.message);
    if (e instanceof Error && e.message.startsWith("Plus de 200"))
      throw new HttpError(400, e.message);
    throw e;
  }
  // Network calls have completed before acquiring this short consistency lock.
  await transaction(async (c) => {
    const current = (
      await c.query(
        "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [s.id, i.id],
      )
    ).rows[0] as unknown as Season;
    const currentInstance = (
      await c.query("SELECT active_season_id FROM instances WHERE id=$1", [
        i.id,
      ])
    ).rows[0];
    const currentUser = (
      await c.query("SELECT account_status FROM users WHERE id=$1", [user.id])
    ).rows[0];
    if (!currentUser || currentUser.account_status !== "ACTIVE")
      throw new HttpError(403, "Compte indisponible");
    if (
      !current ||
      currentInstance?.active_season_id !== s.id ||
      +new Date(current.opens_at) !== +new Date(rawSeason!.opens_at) ||
      +new Date(current.closes_at) !== +new Date(rawSeason!.closes_at) ||
      (!context.preview && seasonState(current, context.now) !== "MAP_OPEN")
    )
      throw new HttpError(409, "La saison a changé. Recalculez le parcours.");
    const latest = context.preview
      ? await demoHouses(i, s, c)
      : await routeCandidates(c, i, current, input.start, input.end);
    if (
      result.stops.some(
        (stop) =>
          !latest.some(
            (h) =>
              h.id === stop.house.id &&
              houseRouteKey(publicHouse(h)) === houseRouteKey(stop.house),
          ),
      )
    )
      throw new HttpError(
        409,
        "Les maisons ont changé. Recalculez le parcours.",
      );
    if (!context.preview && result.stops.length)
      await c.query(
        "UPDATE seasons SET routes_count=routes_count+1 WHERE id=$1",
        [s.id],
      );
  });
  return result;
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
  requirePermission(user, "admin.access");
  const u = requirePermission(user, permission[section]);
  switch (section) {
    case "houses":
      return (
        await db().query(
          "SELECT h.*,u.email FROM participations h JOIN users u ON u.id=h.user_id WHERE h.instance_id=$1 ORDER BY h.status,h.name",
          [u.instance_id],
        )
      ).rows;
    case "users":
      return adminUsers(u);
    case "seasons":
    case "stats":
      return (
        await db().query(
          "SELECT s.*,(SELECT count(*)::int FROM email_campaigns ec WHERE ec.season_id=s.id AND ec.schedule_mode='RELATIVE' AND ec.active AND ec.status='SCHEDULED') relative_campaign_count,(SELECT count(DISTINCT u.id)::int FROM participations h JOIN users u ON u.id=h.user_id WHERE h.season_id=s.id AND u.demo=false AND u.account_status='ACTIVE' AND u.email_status='VERIFIED') reminder_recipient_estimate FROM seasons s WHERE s.instance_id=$1 ORDER BY s.year DESC",
          [u.instance_id],
        )
      ).rows.map((s) => redactSeason(s, u));
    case "settings":
      return await instance();
    case "roles":
      return (
        await db().query(
          "SELECT id,name FROM roles WHERE instance_id=$1 ORDER BY name",
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
        "SELECT count(*)::int total,count(*) FILTER(WHERE status='VISIBLE')::int approved,count(*) FILTER(WHERE status='HIDDEN')::int hidden FROM participations WHERE instance_id=$1 AND season_id=$2",
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
  requirePermission(user, "admin.access");
  if (!user) throw new HttpError(401, "Connexion requise");
  const data = z
    .object({
      action: z.string(),
      id: z.uuid().optional(),
      payload: z.unknown().optional(),
    })
    .parse(input);
  const u = user;
  if (data.action === "visibility") {
    requirePermission(u, "participants.edit");
    const status = z.enum(["VISIBLE", "HIDDEN"]).parse(data.payload);
    const result = await db().query(
      "UPDATE participations SET status=$1 WHERE id=$2 AND instance_id=$3 RETURNING id",
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
  if (data.action === "deleteHouse") {
    requirePermission(u, "participants.delete");
    if (data.payload !== "SUPPRIMER LA MAISON")
      throw new HttpError(400, "Confirmation requise");
    return transaction(async (c) => {
      await c.query(
        "DELETE FROM audit_logs WHERE instance_id=$1 AND target_id=$2",
        [u.instance_id, data.id],
      );
      const { rows } = await c.query(
        "DELETE FROM participations WHERE id=$1 AND instance_id=$2 RETURNING id",
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
          u.role_name !== "SUPER_ADMIN" &&
          +new Date(purge) !== +new Date(s.purge_at)
        )
          throw new HttpError(403, "Super Admin requis pour modifier la purge");
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
          "SELECT id FROM participations WHERE season_id=$1 AND (starts_at<$2 OR ends_at>$3) LIMIT 1",
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
      await recomputeCampaigns(c, s.id);
      if (
        (
          await c.query(
            "SELECT ec.id FROM email_campaigns ec JOIN seasons s ON s.id=ec.season_id WHERE ec.season_id=$1 AND ec.active AND ec.status IN('DRAFT','SCHEDULED') AND ec.scheduled_at>=s.purge_at LIMIT 1",
            [s.id],
          )
        ).rows.length
      )
        throw new HttpError(
          400,
          "La purge doit suivre toutes les communications programmées",
        );
      await audit(c, i.id, u, "season.updated", s.id);
      return { ok: true };
    });
  }
  throw new HttpError(400, "Action inconnue");
}

export async function demoHouses(
  i: Instance,
  s: Season,
  c: Database = db(),
  options: { generate?: boolean } = {},
) {
  const total = (
    await c.query(
      "SELECT count(*)::int n FROM participations p JOIN users u ON u.id=p.user_id WHERE p.instance_id=$1 AND p.season_id=$2 AND NOT p.demo AND NOT u.demo",
      [i.id, s.id],
    )
  ).rows[0];
  if (Number(total.n) < 2)
    return options.generate === false ? [] : fictionalHouses(i, s);
  const rows = (
    await c.query(
      "SELECT p.* FROM participations p JOIN users u ON u.id=p.user_id WHERE p.instance_id=$1 AND p.season_id=$2 AND NOT p.demo AND NOT u.demo AND p.status='VISIBLE' AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR p.legacy_imported)",
      [i.id, s.id],
    )
  ).rows as unknown as House[];
  return rows;
}
