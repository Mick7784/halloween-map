import {
  applicationSeason,
  selectedSeason,
  eligibleOwner,
} from "./season-context";
import {
  initializeLegalDocuments,
  contentState,
  legalState,
  validateAcceptance,
  interpolate,
} from "./content";
import { recomputeCampaigns } from "./mail";
import { createAccount, adminUsers } from "./accounts";
import { setupAuthorized, finishBootstrap } from "./bootstrap";
import { realTime, type TimeContext } from "./time";
import { timingSafeEqual } from "node:crypto";
import { db, transaction, type Database } from "./db";
import {
  HttpError,
  hashPassword,
  hashToken,
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
  mapAccessible,
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
  routeAvailabilitySchema,
} from "./validation";
import { planRoute, validateRouteWindow } from "./routing";
import { RoutingError } from "./walking-router";
import { houseRouteKey, houseTravelKey } from "./route-state";
import type { RouteAvailability } from "./active-route";
import { publicPrivacySettings } from "./privacy";
import { publicProjectLinks } from "./project-links";
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
  seasonId?: string,
) {
  await client.query(
    "INSERT INTO audit_logs(instance_id,actor_id,action,target_id,season_id) VALUES($1,$2,$3,$4,COALESCE($5::uuid,(SELECT season_id FROM participations WHERE id=$4 AND instance_id=$1),(SELECT id FROM seasons WHERE id=$4 AND instance_id=$1)))",
    [
      instanceId,
      actor?.permissions.includes("admin.access") ? actor.id : null,
      action,
      target ?? null,
      seasonId ?? actor?.created_for_season_id ?? null,
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
    "INSERT INTO seasons(instance_id,year,opens_at,closes_at,registrations_open,activated,registrations_open_at,purge_at,name,is_test) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [
      i.id,
      data.year,
      opens,
      closes,
      data.registrations_open,
      data.activated,
      registrations,
      purge,
      data.name ?? "Halloween " + data.year,
      data.is_test,
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
export async function deleteTestSeason(
  user: User,
  seasonId: string,
  confirmation: unknown,
) {
  requirePermission(user, "season.manage");
  if (user.role_name !== "SUPER_ADMIN")
    throw new HttpError(403, "Super Admin requis");
  return transaction(async (c) => {
    await c.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [
      user.instance_id,
    ]);
    const s = (
      await c.query(
        "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [seasonId, user.instance_id],
      )
    ).rows[0];
    if (!s || !s.is_test)
      throw new HttpError(
        403,
        "Suppression complète réservée aux saisons TEST",
      );
    if (confirmation !== s.name)
      throw new HttpError(400, "Saisissez exactement le nom de la saison");
    const users = (
      await c.query(
        "SELECT id,email FROM users WHERE created_for_season_id=$1 AND instance_id=$2 FOR UPDATE",
        [seasonId, user.instance_id],
      )
    ).rows;
    if (users.some((u) => u.id === user.id))
      throw new HttpError(403, "Votre propre compte doit être conservé");
    if (
      (
        await c.query(
          "SELECT id FROM participations WHERE user_id IN(SELECT id FROM users WHERE created_for_season_id=$1) AND season_id<>$1 LIMIT 1",
          [seasonId],
        )
      ).rows.length
    )
      throw new HttpError(
        409,
        "Un compte est lié à une autre saison : suppression bloquée pour protéger ses données",
      );
    if (
      (
        await c.query("SELECT id FROM instances WHERE active_season_id=$1", [
          seasonId,
        ])
      ).rows.length
    )
      throw new HttpError(409, "La saison publique doit être conservée");
    const tokens = (
      await c.query(
        "SELECT token_hash FROM email_tokens WHERE user_id IN(SELECT id FROM users WHERE created_for_season_id=$1)",
        [seasonId],
      )
    ).rows;
    const keys = [
      ...users.flatMap((u) => [
        "login:" + u.email,
        "register:" + u.email,
        "password-reset:" + u.email,
        "identity:" + u.id,
        "account-change:" + u.id,
        "route-availability:" + u.id,
        "address:" + u.id,
      ]),
      ...tokens.flatMap((t) => [
        "reset-token:" + t.token_hash,
        "email-link:" + t.token_hash,
        "activation:" + t.token_hash,
      ]),
    ].map(hashToken);
    await c.query("DELETE FROM rate_limits WHERE key=ANY($1)", [keys]);
    await c.query(
      "DELETE FROM audit_logs WHERE instance_id=$1 AND (season_id=$2 OR target_id=$2 OR target_id IN(SELECT id FROM participations WHERE season_id=$2) OR target_id IN(SELECT id FROM email_campaigns WHERE season_id=$2) OR target_id IN(SELECT id FROM users WHERE created_for_season_id=$2) OR actor_id IN(SELECT id FROM users WHERE created_for_season_id=$2))",
      [user.instance_id, seasonId],
    );
    await c.query(
      "UPDATE instances SET test_season_id=NULL WHERE id=$1 AND test_season_id=$2",
      [user.instance_id, seasonId],
    );
    await c.query(
      "DELETE FROM users WHERE created_for_season_id=$1 AND instance_id=$2",
      [seasonId, user.instance_id],
    );
    // Season and user foreign keys remove houses, campaigns, deliveries, tokens and sessions.
    await c.query("DELETE FROM seasons WHERE id=$1 AND instance_id=$2", [
      seasonId,
      user.instance_id,
    ]);
    await audit(c, user.instance_id, user, "season.test.deleted");
    return { deleted: true };
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
    "SELECT * FROM participations WHERE instance_id=$1 AND season_id=$2 AND status='VISIBLE' AND review_status='VALIDATED' AND activity='ACTIVE' AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version))) AND starts_at<$4 AND ends_at>$3",
    [i.id, s.id, start, end],
  );
  return rows as unknown as House[];
}

export async function publicState(
  context: TimeContext | Date = realTime(),
  user: User | null = null,
) {
  const { now, earlyAccess } =
    context instanceof Date ? { now: context, earlyAccess: false } : context;
  if (earlyAccess && user?.role_name !== "SUPER_ADMIN")
    throw new HttpError(403, "Super Admin requis");
  await tick(now);
  const i = await instance();
  if (!i) return { setupRequired: true };
  const actualSeason = await activeSeason(i);
  const s = await applicationSeason(i, user, earlyAccess),
    state = mapAccessible(s, now, earlyAccess)
      ? "MAP_OPEN"
      : seasonState(s, now);
  let count = 0,
    houses: ReturnType<typeof publicHouse>[] = [];
  let upcoming: ReturnType<typeof publicHouse>[] = [];
  let closedHouseIds: string[] = [];
  if (s && state !== "CLOSED" && state !== "ARCHIVED") {
    const { rows } = await db().query(
      "SELECT count(*)::int n FROM participations WHERE instance_id=$1 AND season_id=$2 AND status=$3 AND review_status='VALIDATED' AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version)))",
      [i.id, s.id, "VISIBLE"],
    );
    count = Number(rows[0].n);
    if (state === "MAP_OPEN" && user) {
      const { rows } = await db().query(
        "SELECT * FROM participations WHERE instance_id=$1 AND season_id=$2 AND status='VISIBLE' AND review_status='VALIDATED' AND activity='ACTIVE' AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version))) AND starts_at<=$3 AND ends_at>$3",
        [i.id, s.id, now],
      );
      houses = (rows as unknown as House[])
        .filter((h) => visible(h, s, now, earlyAccess))
        .map(publicHouse);
    }
  }
  if (s && user && ["PREPARATION", "COUNTDOWN"].includes(state)) {
    const own = await db().query(
      "SELECT * FROM participations WHERE instance_id=$1 AND season_id=$2 AND user_id=$3 AND status='VISIBLE'",
      [i.id, s.id, user.id],
    );
    houses = (own.rows as unknown as House[]).map(publicHouse);
  }
  if (s && state === "MAP_OPEN" && user)
    upcoming = (await routeCandidates(db(), i, s, now, s.closes_at))
      .filter(
        (h) =>
          h.status === "VISIBLE" &&
          h.activity === "ACTIVE" &&
          effectiveActivities(h).length &&
          +new Date(h.ends_at) > +now,
      )
      .map(publicHouse);
  if (s && state === "MAP_OPEN" && user) {
    closedHouseIds = (
      await db().query(
        "SELECT id FROM participations WHERE instance_id=$1 AND season_id=$2 AND status='VISIBLE' AND review_status='VALIDATED' AND activity IN ('ENDED','PAUSED') AND ends_at>$3 AND EXISTS(SELECT 1 FROM users u WHERE u.id=participations.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR participations.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=participations.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND participations.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND participations.guidelines_version IS DISTINCT FROM d.version)))",
        [i.id, s.id, now],
      )
    ).rows.map((row) => String(row.id));
  }
  return {
    routeCandidates: upcoming,
    closedHouseIds,
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
    projectLinks: publicProjectLinks(i.config.projectLinks, i.config.privacy),
    participation: publicParticipationSettings(i.config.participation),
    demoAvailable:
      user?.role_name === "SUPER_ADMIN" &&
      (!!i.test_season_id ||
        (!!actualSeason &&
          ["PREPARATION", "COUNTDOWN"].includes(seasonState(actualSeason)))),
    mapAccessible: !!user,
    instance: {
      id: i.id,
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
          id: s.id,
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
export async function createParticipation(
  user: User | null,
  input: unknown,
  management?: { actor: User; seasonId: string },
) {
  if (management) {
    requirePermission(management.actor, "participants.edit");
    if (management.actor.instance_id !== user?.instance_id)
      throw new HttpError(403, "Instance incompatible");
  }
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
        "SELECT email_status,account_status,created_for_season_id FROM users WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [user.id, user.instance_id],
      )
    ).rows[0];
    if (!u || u.email_status !== "VERIFIED" || u.account_status !== "ACTIVE")
      throw new HttpError(403, "Vérifiez votre email avant de participer");
    const i = (
      await c.query("SELECT * FROM instances WHERE id=$1 FOR UPDATE", [
        user.instance_id,
      ])
    ).rows[0] as unknown as Instance;
    const ss = (
      await c.query(
        "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [management?.seasonId ?? i.active_season_id, i.id],
      )
    ).rows[0] as unknown as Season;
    if (
      !ss ||
      ss.purged_at ||
      !ss.registrations_open ||
      +new Date() < +new Date(ss.registrations_open_at) ||
      +new Date() >= +new Date(ss.closes_at)
    )
      throw new HttpError(403, "Inscriptions fermées");
    if (!eligibleOwner(u.created_for_season_id as string | null, ss))
      throw new HttpError(
        403,
        "Compte incompatible avec la saison sélectionnée",
      );
    const a = await validateAcceptance(c, i.id, raw.acceptance);
    const h = raw.house;
    validateParticipationSettings(h, i);
    const [starts, ends] = houseDates(h, i, ss);
    await c.query(
      "INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,adaptable,rp,practical,terms_version,terms_accepted_at,guidelines_version,guidelines_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $17 THEN now() ELSE NULL END,$16,now())",
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
        a.terms,
      ],
    );
    if (management)
      await c.query(
        "UPDATE participations SET review_status='PENDING' WHERE user_id=$1 AND season_id=$2",
        [user.id, ss.id],
      );
    await audit(
      c,
      i.id,
      management?.actor ?? user,
      "participation.created",
      undefined,
      ss.id,
    );
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
  return rows[0]
    ? ({ ...rows[0], status: "VISIBLE", is_test: undefined } as Record<
        string,
        unknown
      >)
    : null;
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
      s = admin
        ? ((
            await c.query(
              "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2",
              [old.season_id, user.instance_id],
            )
          ).rows[0] as unknown as Season)
        : await activeSeason(i, c);
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
          "UPDATE participations SET terms_version=$1,terms_accepted_at=CASE WHEN $4 THEN now() ELSE NULL END,guidelines_version=$2,guidelines_accepted_at=now() WHERE id=$3",
          [
            acceptance.terms_version,
            acceptance.guidelines_version,
            id,
            acceptance.terms,
          ],
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
    return { status: admin ? status : "VISIBLE" };
  });
}
export async function participantAction(
  user: User | null,
  input: unknown,
  managedId?: string,
) {
  if (managedId) requirePermission(user, "participants.edit");
  if (!user) throw new HttpError(403, "Compte participant requis");
  const data = z
    .object({
      action: z.enum(["pause", "resume", "end", "candy", "deplete", "delete"]),
      choice: z.enum(["continue", "close"]).optional(),
      available: z.boolean().optional(),
      confirm: z.literal("SUPPRIMER").optional(),
    })
    .parse(input);
  if (managedId && data.action === "delete")
    throw new HttpError(400, "Utilisez la suppression admin confirmée");
  return transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT h.*,s.purged_at,s.closes_at FROM participations h JOIN seasons s ON s.id=h.season_id WHERE " +
        (managedId ? "h.id" : "user_id") +
        "=$1 AND h.instance_id=$2 FOR UPDATE OF h,s",
      [managedId ?? user.id, user.instance_id],
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
      await audit(
        c,
        user.instance_id,
        null,
        "participant.deleted",
        undefined,
        String(h.season_id),
      );
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
      if (!managedId && h.activity === "ENDED" && data.action === "resume")
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
  if (context.earlyAccess && user.role_name !== "SUPER_ADMIN")
    throw new HttpError(403, "Super Admin requis");
  const input = routeSchema.parse(userInput);
  const i = await instance();
  if (!i) throw new HttpError(404, "Instance manquante");
  const rawSeason = await applicationSeason(i, user, context.earlyAccess);
  const s = rawSeason;
  if (!s || !mapAccessible(s, context.now, context.earlyAccess))
    throw new HttpError(403, "La carte est fermée");
  await validateAcceptance(db(), i.id, input.acceptance);
  try {
    validateRouteWindow(s, input, context.now, context.earlyAccess);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  let result;
  try {
    const candidates = await routeCandidates(
      db(),
      i,
      s,
      input.start,
      input.end,
    );
    result = await planRoute(
      candidates.filter((h) => !input.excludedHouseIds.includes(h.id)),
      s,
      input,
      context.now,
      undefined,
      context.earlyAccess,
    );
  } catch (e) {
    if (e instanceof RoutingError)
      throw new HttpError(e.reason === "no_route" ? 422 : 503, e.message);
    if (e instanceof Error && e.message.startsWith("Plus de 200"))
      throw new HttpError(400, e.message);
    throw e;
  }
  // Network calls have completed before acquiring this short consistency lock.
  await transaction(async (c) => {
    await validateAcceptance(c, i.id, input.acceptance);
    const current = (
      await c.query(
        "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [s.id, i.id],
      )
    ).rows[0] as unknown as Season;
    const currentInstance = (
      await c.query(
        "SELECT active_season_id,test_season_id FROM instances WHERE id=$1",
        [i.id],
      )
    ).rows[0];
    const currentUser = (
      await c.query("SELECT account_status FROM users WHERE id=$1", [user.id])
    ).rows[0];
    if (!currentUser || currentUser.account_status !== "ACTIVE")
      throw new HttpError(403, "Compte indisponible");
    if (
      !current ||
      (context.earlyAccess &&
      user.role_name === "SUPER_ADMIN" &&
      currentInstance?.test_season_id
        ? currentInstance.test_season_id
        : currentInstance?.active_season_id) !== s.id ||
      +new Date(current.opens_at) !== +new Date(rawSeason!.opens_at) ||
      +new Date(current.closes_at) !== +new Date(rawSeason!.closes_at) ||
      !mapAccessible(current, context.now, context.earlyAccess)
    )
      throw new HttpError(409, "La saison a changé. Recalculez le parcours.");
    const latest = await routeCandidates(c, i, current, input.start, input.end);
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
    if (result.stops.length)
      await c.query(
        "UPDATE seasons SET routes_count=routes_count+1 WHERE id=$1",
        [s.id],
      );
  });
  return result;
}
export async function routeAvailability(
  user: User | null,
  userInput: unknown,
  context: TimeContext = realTime(),
): Promise<RouteAvailability> {
  if (!user) throw new HttpError(401, "Connexion requise");
  if (context.earlyAccess && user.role_name !== "SUPER_ADMIN")
    throw new HttpError(403, "Super Admin requis");
  const input = routeAvailabilitySchema.parse(userInput);
  const i = await instance();
  const raw = i && (await applicationSeason(i, user, context.earlyAccess));
  const s = raw;
  const checkedAt = context.now.toISOString();
  if (
    !i ||
    user.instance_id !== i.id ||
    input.instanceId !== i.id ||
    !s ||
    input.seasonId !== s.id ||
    !mapAccessible(s, context.now, context.earlyAccess)
  )
    return {
      valid: false,
      checkedAt,
      steps: input.steps.map(({ id }) => ({
        id,
        available: false,
        reason: "unavailable",
      })),
    };
  // Missing, hidden, deleted and ineligible owners deliberately share one generic result.
  const houses = (
    await db().query(
      "SELECT p.* FROM participations p WHERE p.instance_id=$1 AND p.season_id=$2 AND p.id=ANY($3::uuid[]) AND p.status='VISIBLE' AND p.review_status='VALIDATED' AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.account_status='ACTIVE' AND (u.email_status='VERIFIED' OR p.legacy_imported)) AND NOT EXISTS(SELECT 1 FROM legal_documents d WHERE d.instance_id=p.instance_id AND d.active AND d.requires_reaccept AND ((d.kind='TERMS' AND p.terms_version IS DISTINCT FROM d.version) OR (d.kind='GUIDELINES' AND p.guidelines_version IS DISTINCT FROM d.version)))",
      [i.id, s.id, input.steps.map((step) => step.id)],
    )
  ).rows as unknown as House[];
  return {
    valid: true,
    checkedAt,
    steps: input.steps.map((step) => {
      const h = houses.find((h) => h.id === step.id);
      if (!h)
        return {
          id: step.id,
          available: false,
          reason: "unavailable" as const,
        };
      const activities = effectiveActivities(h);
      let reason: RouteAvailability["steps"][number]["reason"];
      const arrival = Math.max(
        +context.now,
        +new Date(step.arrival),
        +new Date(h.starts_at),
      );
      const departure = Math.max(+new Date(step.departure), arrival + 300000);
      if (h.activity === "PAUSED") reason = "paused";
      else if (h.activity === "ENDED") reason = "ended";
      else if (
        (input.mode !== "COLLECTION" && departure > +new Date(h.ends_at)) ||
        (input.mode === "COLLECTION" &&
          input.end !== undefined &&
          +new Date(h.starts_at) >= +new Date(input.end)) ||
        +context.now >= +new Date(h.ends_at)
      )
        reason = "expired";
      else if (
        !activities.length ||
        (input.activities.length &&
          !input.activities.some((a) => activities.includes(a)))
      )
        reason = "activities";
      else if (
        (!h.adaptable &&
          input.maxFear !== undefined &&
          h.fear > input.maxFear) ||
        (input.mode !== "COLLECTION" &&
          houseTravelKey(publicHouse(h)) !== step.key)
      )
        reason = "changed";
      return {
        id: step.id,
        available: !reason,
        ...(reason ? { reason } : {}),
        activities,
        ...(input.mode === "COLLECTION" ? { house: publicHouse(h) } : {}),
      };
    }),
  };
}
export async function adminRead(
  user: User | null,
  section: string,
  seasonId?: string,
) {
  const permission: Record<string, string> = {
    dashboard: "stats.read",
    houses: "participants.read",
    users: "users.read",
    eligibleOwners: "users.read",
    seasons: "season.read",
    stats: "stats.read",
    settings: "settings.read",
    roles: "users.read",
    audit: "audit.read",
  };
  if (!permission[section]) throw new HttpError(404, "Section inconnue");
  requirePermission(user, "admin.access");
  const u = requirePermission(user, permission[section]);
  const scoped = await selectedSeason(u, seasonId);
  switch (section) {
    case "houses":
      return (
        await db().query(
          "SELECT h.*,u.email,u.display_name owner_name,s.opens_at season_opens_at,s.closes_at season_closes_at,s.year season_year,s.is_test season_is_test FROM participations h JOIN users u ON u.id=h.user_id JOIN seasons s ON s.id=h.season_id WHERE h.instance_id=$1 AND h.season_id=$2 ORDER BY h.status,h.name",
          [u.instance_id, scoped?.id ?? null],
        )
      ).rows;
    case "users":
      return adminUsers(u, scoped?.id);
    case "eligibleOwners":
      return (await adminUsers(u, scoped?.id, true)).filter(
        (row) =>
          row.account_status === "ACTIVE" &&
          row.email_status === "VERIFIED" &&
          !row.participation,
      );
    case "seasons":
    case "stats":
      return (
        await db().query(
          "SELECT s.*,(s.id=(SELECT active_season_id FROM instances WHERE id=s.instance_id)) public_active,(s.id=(SELECT test_season_id FROM instances WHERE id=s.instance_id)) test_used,(SELECT count(*)::int FROM email_campaigns ec WHERE ec.season_id=s.id AND ec.schedule_mode='RELATIVE' AND ec.active AND ec.status='SCHEDULED') relative_campaign_count,(SELECT count(DISTINCT u.id)::int FROM participations h JOIN users u ON u.id=h.user_id WHERE h.season_id=s.id AND u.account_status='ACTIVE' AND u.email_status='VERIFIED') reminder_recipient_estimate FROM seasons s WHERE s.instance_id=$1 ORDER BY s.year DESC",
          [u.instance_id],
        )
      ).rows
        .filter((s) => section !== "stats" || s.id === scoped?.id)
        .map((s) => redactSeason(s, u));
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
          "SELECT a.id,a.action,a.created_at,a.target_id,u.display_name actor,COALESCE(h.name,s.name,t.display_name) target_label FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN participations h ON h.id=a.target_id AND h.instance_id=a.instance_id LEFT JOIN seasons s ON s.id=a.target_id AND s.instance_id=a.instance_id LEFT JOIN users t ON t.id=a.target_id AND t.instance_id=a.instance_id WHERE a.instance_id=$1 AND a.season_id=$2 ORDER BY a.created_at DESC LIMIT 200",
          [u.instance_id, scoped?.id ?? null],
        )
      ).rows;
    default: {
      const i = (await instance())!,
        s = scoped;
      const { rows } = await db().query(
        "SELECT count(*)::int total,count(*) FILTER(WHERE review_status='VALIDATED')::int approved,count(*) FILTER(WHERE review_status='PENDING')::int pending,count(*) FILTER(WHERE status='HIDDEN')::int hidden FROM participations WHERE instance_id=$1 AND season_id=$2",
        [i.id, s?.id ?? null],
      );
      const { rows: users } = await db().query(
        "SELECT count(*)::int total FROM users u WHERE instance_id=$1 AND (created_for_season_id=$2 OR EXISTS(SELECT 1 FROM participations p WHERE p.user_id=u.id AND p.season_id=$2))",
        [i.id, s?.id ?? null],
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
      seasonId: z.uuid().optional(),
      id: z.uuid().optional(),
      payload: z.unknown().optional(),
    })
    .parse(input);
  const u = user;
  if (
    [
      "houseActivity",
      "reviewHouse",
      "visibility",
      "editHouse",
      "deleteHouse",
    ].includes(data.action)
  ) {
    const context = await selectedSeason(u, data.seasonId);
    const target = (
      await db().query(
        "SELECT id FROM participations WHERE id=$1 AND instance_id=$2 AND season_id=$3",
        [data.id, u.instance_id, context?.id ?? null],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, "Maison absente de cette saison");
  }
  if (data.action === "createHouse") {
    requirePermission(u, "participants.edit");
    const context = await selectedSeason(u, data.seasonId);
    if (!context) throw new HttpError(404, "Saison introuvable");
    const payload = z
      .object({ userId: z.uuid(), participation: z.unknown() })
      .parse(data.payload);
    const owner = (
      await db().query("SELECT * FROM users WHERE id=$1 AND instance_id=$2", [
        payload.userId,
        u.instance_id,
      ])
    ).rows[0];
    if (!owner) throw new HttpError(404, "Utilisateur introuvable");
    return createParticipation(
      owner as unknown as User,
      payload.participation,
      { actor: u, seasonId: context.id },
    );
  }
  if (data.action === "activateSeason") {
    requirePermission(u, "season.manage");
    const id = z.uuid().parse(data.id);
    if (data.payload !== "ACTIVER")
      throw new HttpError(400, "Confirmation requise");
    return transaction(async (c) => {
      await c.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [
        u.instance_id,
      ]);
      const target = (
        await c.query(
          "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
          [id, u.instance_id],
        )
      ).rows[0] as unknown as Season;
      if (
        !target ||
        target.is_test ||
        target.archived ||
        target.purged_at ||
        +new Date(target.closes_at) <= Date.now()
      )
        throw new HttpError(400, "Choisissez une saison REAL disponible");
      await c.query(
        "UPDATE seasons SET activated=false WHERE instance_id=$1 AND NOT is_test AND id<>$2",
        [u.instance_id, id],
      );
      await c.query("UPDATE seasons SET activated=true WHERE id=$1", [id]);
      await c.query("UPDATE instances SET active_season_id=$1 WHERE id=$2", [
        id,
        u.instance_id,
      ]);
      await audit(c, u.instance_id, u, "season.activated", id);
      return { ok: true, activeSeasonId: id };
    });
  }
  if (data.action === "useForTests") {
    if (u.role_name !== "SUPER_ADMIN")
      throw new HttpError(403, "Super Admin requis");
    const context = await selectedSeason(u, data.id);
    if (!context?.is_test || context.purged_at || context.archived)
      throw new HttpError(400, "Choisissez une saison TEST disponible");
    await db().query("UPDATE instances SET test_season_id=$1 WHERE id=$2", [
      context.id,
      u.instance_id,
    ]);
    await audit(db(), u.instance_id, u, "season.test.selected", context.id);
    return { ok: true };
  }
  if (data.action === "deleteTestSeason")
    return deleteTestSeason(u, z.uuid().parse(data.id), data.payload);
  if (data.action === "houseActivity")
    return participantAction(u, data.payload, z.uuid().parse(data.id));
  if (data.action === "reviewHouse") {
    requirePermission(u, "participants.edit");
    const payload = z
      .object({
        status: z.enum(["PENDING", "VALIDATED", "REFUSED"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(data.payload);
    if (payload.status === "REFUSED" && !payload.reason)
      throw new HttpError(400, "Précisez le motif du refus");
    return transaction(async (c) => {
      const result = await c.query(
        "UPDATE participations SET review_status=$1,refusal_reason=$2 WHERE id=$3 AND instance_id=$4 RETURNING id",
        [
          payload.status,
          payload.status === "REFUSED" ? payload.reason : "",
          data.id,
          u.instance_id,
        ],
      );
      if (!result.rows.length) throw new HttpError(404, "Maison introuvable");
      await audit(
        c,
        u.instance_id,
        u,
        "house.review." + payload.status.toLowerCase(),
        data.id,
      );
      return { ok: true };
    });
  }
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
      await audit(
        c,
        u.instance_id,
        u,
        "participant.deleted",
        undefined,
        (await selectedSeason(u, data.seasonId, c))?.id,
      );
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
    if (p.is_test && u.role_name !== "SUPER_ADMIN")
      throw new HttpError(403, "Super Admin requis pour le mode TEST");
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
        if (Boolean(s.is_test) !== p.is_test) {
          if (u.role_name !== "SUPER_ADMIN")
            throw new HttpError(403, "Super Admin requis");
          const used = (
            await c.query(
              "SELECT id FROM seasons WHERE id=$1 AND (routes_count>0 OR EXISTS(SELECT 1 FROM participations WHERE season_id=$1) OR EXISTS(SELECT 1 FROM users WHERE created_for_season_id=$1) OR EXISTS(SELECT 1 FROM email_campaigns WHERE season_id=$1) OR EXISTS(SELECT 1 FROM instances WHERE active_season_id=$1 OR test_season_id=$1))",
              [s.id],
            )
          ).rows[0];
          if (used)
            throw new HttpError(
              409,
              "Le mode d’une saison utilisée ne peut pas être changé",
            );
        }
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
          "UPDATE seasons SET year=$1,opens_at=$2,closes_at=$3,registrations_open=$4,activated=$5,registrations_open_at=$7,purge_at=$8,name=$9,is_test=$10 WHERE id=$6",
          [
            p.year,
            opens,
            closes,
            p.registrations_open,
            p.is_test ? p.activated : !s.is_test && s.activated,
            s.id,
            registrations,
            purge,
            p.name ?? s.name ?? "Halloween " + p.year,
            p.is_test,
          ],
        );
      } else {
        s = await insertSeason(c, i, { ...p, activated: false });
        // Creating or selecting a season never changes the public season.
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
