import { legalDefaults } from "./legal-defaults";
export { legalDefaults } from "./legal-defaults";
import { z } from "zod";
import { db, transaction, type Database } from "./db";
import { HttpError, requirePermission } from "./auth";
import type { User } from "./domain";
import { publicProjectLinks } from "./project-links";
export const variables = [
  "territory",
  "season_year",
  "registration_date",
  "map_open_date",
  "map_close_date",
  "purge_date",
  "house_count",
  "user_name",
  "event_name",
] as const;
const publicVars = variables.filter((v) => v !== "user_name");
export const contentDefaults: Record<
  string,
  { category: string; value: string; variables: readonly string[] }
> = Object.fromEntries(
  [
    ["home.eyebrow", "Accueil", "{{event_name}}"],
    ["home.title", "Accueil", "Les portes s’ouvriront bientôt."],
    [
      "home.preparation",
      "Accueil",
      "L’équipe prépare votre prochaine nuit d’Halloween.",
    ],
    [
      "home.subtitle",
      "Accueil",
      "{{house_count}} maisons accueillantes en ce moment",
    ],
    ["home.count", "Accueil", "déjà inscrites"],
    ["home.house", "Accueil", "maison"],
    ["home.houses", "Accueil", "maisons"],
    ["home.register", "Accueil", "Inscrire ma maison"],
    [
      "home.final",
      "Accueil",
      "Une commune plus vivante, un Halloween inoubliable.",
    ],
    ["home.open", "Accueil", "La nuit vous appartient."],
    ["home.closed", "Accueil", "C’est fini pour cette année."],
    [
      "home.closedBody",
      "Accueil",
      "Merci d’avoir partagé cette nuit. Rendez-vous l’année prochaine !",
    ],
    ["home.empty", "Accueil", "Aucune maison disponible pour ces horaires."],
    ["account.create", "Compte", "Créer mon compte"],
    [
      "account.verify",
      "Compte",
      "Vérifiez votre email pour inscrire votre maison.",
    ],
    [
      "account.activation",
      "Compte",
      "Bienvenue ! Choisissez votre mot de passe pour activer votre compte.",
    ],
    [
      "account.confirmation",
      "Compte",
      "Votre compte est créé. Consultez votre messagerie pour vérifier votre email.",
    ],
    [
      "participation.title",
      "Participation",
      "Votre maison entre dans la fête.",
    ],
    [
      "participation.intro",
      "Participation",
      "Une décoration, quelques bonbons, une mise en scène : à vous de choisir. Votre maison sera examinée avant son affichage à l’ouverture de la carte.",
    ],
    [
      "participation.confirmation",
      "Participation",
      "Votre participation est enregistrée et attend sa validation.",
    ],
    ["privacy.title", "Confidentialité", "Vos données restent les vôtres."],
    [
      "privacy.signup",
      "Confidentialité",
      "Halloween Map conserve uniquement les informations nécessaires au fonctionnement de votre compte.\n\nLes données liées à votre participation — notamment votre adresse, votre localisation, vos horaires et les informations concernant votre maison — sont supprimées automatiquement après l’événement.\n\nNous ne constituons aucun historique des adresses participantes et nous n’utilisons pas vos données à des fins commerciales.",
    ],
    [
      "privacy.account",
      "Confidentialité",
      "Votre compte, nom, email, mot de passe chiffré par empreinte et rôle sont conservés pour les prochaines éditions. Votre maison, adresse, position, horaires et descriptions sont supprimés à la purge. Seules les années de participation validée sont conservées cinq ans, puis effacées ; supprimer le compte efface aussi ces marqueurs.",
    ],
    ["footer.signature", "Interface", "Une expérience DomotiK Studio"],
  ].map(([key, category, value]) => [
    key,
    {
      category,
      value,
      variables: ["account.verify", "privacy.account"].includes(key)
        ? variables
        : publicVars,
    },
  ]),
);
export type LegalKind = keyof typeof legalDefaults;
export type LegalDocument = {
  id?: string;
  kind: LegalKind;
  version: string;
  title: string;
  body: string;
  status: string;
  active: boolean;
  requires_reaccept: boolean;
  published_at: string | null;
};
export function sanitizeContent(
  value: string,
  allowed: readonly string[] = publicVars,
) {
  if (
    /<\/?[a-z!]|javascript\s*:|data\s*:|vbscript\s*:|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(
      value,
    )
  )
    throw new HttpError(400, "HTML, scripts et liens non sûrs interdits");
  for (const match of value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g))
    if (!allowed.includes(match[1]))
      throw new HttpError(400, "Variable non autorisée : " + match[1]);
  for (const match of value.matchAll(/\]\(([^)]+)\)/g))
    if (!/^(https?:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(match[1]))
      throw new HttpError(400, "Lien non autorisé");
  return value.trim();
}
export function interpolate(
  value: string,
  vars: Record<string, string | number>,
) {
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    String(vars[key] ?? "{{" + key + "}}"),
  );
}
export async function contentState(
  instanceId: string,
  client: Database = db(),
) {
  const overrides = (
    await client.query(
      "SELECT key,value FROM content_overrides WHERE instance_id=$1",
      [instanceId],
    )
  ).rows;
  return Object.fromEntries(
    Object.entries(contentDefaults).map(([key, v]) => [
      key,
      String(overrides.find((o) => o.key === key)?.value ?? v.value),
    ]),
  );
}
export async function initializeLegalDocuments(
  instanceId: string,
  client: Database = db(),
) {
  for (const [kind, d] of Object.entries(legalDefaults))
    await client.query(
      "INSERT INTO legal_documents(instance_id,kind,version,title,body,status,active,published_at) VALUES($1,$2,'2026.1',$3,$4,'PUBLISHED',true,now()) ON CONFLICT DO NOTHING",
      [instanceId, kind, d.title, d.body],
    );
}
export async function legalState(
  instanceId: string,
  client: Database = db(),
): Promise<Record<LegalKind, LegalDocument>> {
  const rows = (
    await client.query(
      "SELECT * FROM legal_documents WHERE instance_id=$1 AND active=true",
      [instanceId],
    )
  ).rows;
  return Object.fromEntries(
    Object.entries(legalDefaults).map(([kind, d]) => [
      kind,
      rows.find((r) => r.kind === kind) ?? {
        ...d,
        kind,
        version: "2026.1",
        status: "PUBLISHED",
        active: true,
        requires_reaccept: false,
        published_at: null,
      },
    ]),
  ) as Record<LegalKind, LegalDocument>;
}
export async function contentAdmin(user: User | null) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "content.manage");
  const config = (
    await db().query("SELECT config FROM instances WHERE id=$1", [
      u.instance_id,
    ])
  ).rows[0].config as Record<string, unknown>;
  return {
    catalog: Object.fromEntries(
      Object.entries(contentDefaults).filter(([key]) =>
        [
          "home.preparation",
          "home.final",
          "home.closedBody",
          "account.verify",
          "account.activation",
          "account.confirmation",
          "participation.intro",
          "participation.confirmation",
          "privacy.signup",
          "privacy.account",
          "footer.signature",
        ].includes(key),
      ),
    ),
    links: publicProjectLinks(config.projectLinks, config.privacy),
    values: await contentState(u.instance_id),
    documents: (
      await db().query(
        "SELECT * FROM legal_documents WHERE instance_id=$1 ORDER BY created_at DESC",
        [u.instance_id],
      )
    ).rows,
    active: await legalState(u.instance_id),
  };
}
export async function contentAction(user: User | null, input: unknown) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "content.manage");
  const p = z
    .object({
      action: z.enum(["save", "reset", "draft", "publish", "links"]),
      links: z
        .object({
          bugEnabled: z.boolean(),
          supportEnabled: z.boolean(),
          contactEnabled: z.boolean(),
          bugEmail: z.email(),
          contactEmail: z.email().or(z.literal("")),
          bugUrl: z.url().or(z.literal("")),
          supportUrl: z.url().or(z.literal("")),
          contactUrl: z.url().or(z.literal("")),
        })
        .optional(),
      key: z.string().optional(),
      value: z.string().max(10000).optional(),
      id: z.uuid().optional(),
      document: z
        .object({
          kind: z.enum(["TERMS", "GUIDELINES", "PRIVACY", "NOTICE"]),
          version: z.string().regex(/^[0-9]{4}\.[0-9]{1,3}$/),
          title: z.string().trim().min(1).max(100),
          body: z.string().min(1).max(10000),
          requires_reaccept: z.boolean(),
        })
        .optional(),
    })
    .parse(input);
  if (p.action === "links") {
    if (!p.links) throw new HttpError(400, "Liens requis");
    for (const key of ["bugUrl", "supportUrl", "contactUrl"] as const)
      if (p.links[key]) {
        const url = new URL(p.links[key]);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new HttpError(400, "Utilisez une URL HTTPS sûre");
      }
    await transaction(async (c) => {
      await c.query(
        "UPDATE instances SET config=jsonb_set(config,'{projectLinks}',$1::jsonb) WHERE id=$2",
        [JSON.stringify(p.links), u.instance_id],
      );
      await c.query(
        "INSERT INTO audit_logs(instance_id,actor_id,action) VALUES($1,$2,'content.links.updated')",
        [u.instance_id, u.id],
      );
    });
    return { ok: true };
  }
  if (p.action === "save" || p.action === "reset") {
    if (!p.key || !contentDefaults[p.key])
      throw new HttpError(400, "Contenu inconnu");
    await transaction(async (c) => {
      if (p.action === "reset")
        await c.query(
          "DELETE FROM content_overrides WHERE instance_id=$1 AND key=$2",
          [u.instance_id, p.key],
        );
      else
        await c.query(
          "INSERT INTO content_overrides(instance_id,key,value) VALUES($1,$2,$3) ON CONFLICT(instance_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
          [
            u.instance_id,
            p.key,
            sanitizeContent(p.value ?? "", contentDefaults[p.key!].variables),
          ],
        );
      await c.query(
        "INSERT INTO audit_logs(instance_id,actor_id,action) VALUES($1,$2,$3)",
        [u.instance_id, u.id, "content." + p.action],
      );
    });
    return { ok: true };
  } else if (p.action === "draft") {
    if (!p.document) throw new HttpError(400, "Document requis");
    const d = p.document;
    const current = (await legalState(u.instance_id))[d.kind];
    const number = (v: string) =>
      Number(v.split(".")[0]) * 1000 + Number(v.split(".")[1]);
    if (number(d.version) <= number(current.version))
      throw new HttpError(
        400,
        "Une nouvelle version doit suivre la version active",
      );
    if (p.id) {
      const result = await db().query(
        "UPDATE legal_documents SET kind=$1,version=$2,title=$3,body=$4,requires_reaccept=$5 WHERE id=$6 AND instance_id=$7 AND status='DRAFT' RETURNING id",
        [
          d.kind,
          d.version,
          sanitizeContent(d.title, []),
          sanitizeContent(d.body, []),
          d.requires_reaccept,
          p.id,
          u.instance_id,
        ],
      );
      if (!result.rows.length)
        throw new HttpError(400, "Brouillon introuvable");
    } else
      await db().query(
        "INSERT INTO legal_documents(instance_id,kind,version,title,body,requires_reaccept) VALUES($1,$2,$3,$4,$5,$6)",
        [
          u.instance_id,
          d.kind,
          d.version,
          sanitizeContent(d.title, []),
          sanitizeContent(d.body, []),
          d.requires_reaccept,
        ],
      );
  } else
    await transaction(async (c) => {
      await c.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [
        u.instance_id,
      ]);
      const d = (
        await c.query(
          "SELECT * FROM legal_documents WHERE id=$1 AND instance_id=$2 AND status='DRAFT' FOR UPDATE",
          [p.id, u.instance_id],
        )
      ).rows[0];
      if (!d) throw new HttpError(400, "Brouillon introuvable");
      const kind = d.kind as LegalKind;
      // Materialize the accepted fallback before publishing its successor.
      await c.query(
        "INSERT INTO legal_documents(instance_id,kind,version,title,body,status,active,published_at) VALUES($1,$2,'2026.1',$3,$4,'PUBLISHED',false,now()) ON CONFLICT DO NOTHING",
        [
          u.instance_id,
          kind,
          legalDefaults[kind].title,
          legalDefaults[kind].body,
        ],
      );
      await c.query(
        "UPDATE legal_documents SET active=false WHERE instance_id=$1 AND kind=$2 AND active=true",
        [u.instance_id, kind],
      );
      await c.query(
        "UPDATE legal_documents SET status='PUBLISHED',active=true,published_at=now() WHERE id=$1",
        [d.id],
      );
      await c.query(
        "INSERT INTO audit_logs(instance_id,actor_id,action,target_id) VALUES($1,$2,'content.publish',$3)",
        [u.instance_id, u.id, d.id],
      );
    });
  if (p.action !== "publish")
    await db().query(
      "INSERT INTO audit_logs(instance_id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
      [u.instance_id, u.id, "content." + p.action, p.id ?? null],
    );
  return { ok: true };
}
export async function validateAcceptance(
  client: Database,
  instanceId: string,
  input: unknown,
) {
  if (
    input &&
    typeof input === "object" &&
    (input as { mode?: string }).mode === "GUIDELINES_ONLY"
  ) {
    const acknowledged = z
      .object({
        mode: z.literal("GUIDELINES_ONLY"),
        guidelines: z.literal(true),
        guidelines_version: z.string(),
      })
      .parse(input);
    const docs = await legalState(instanceId, client);
    if (acknowledged.guidelines_version !== docs.GUIDELINES.version)
      throw new HttpError(
        409,
        "Les bonnes pratiques ont changé. Relisez-les avant de confirmer.",
      );
    // Keep the current TERMS version for compatibility, without recording consent.
    return {
      terms: false,
      guidelines: true,
      terms_version: docs.TERMS.version,
      guidelines_version: acknowledged.guidelines_version,
    };
  }
  const p = z
    .object({
      terms: z.literal(true),
      guidelines: z.literal(true),
      terms_version: z.string(),
      guidelines_version: z.string(),
    })
    .parse(input);
  const docs = await legalState(instanceId, client);
  if (
    p.terms_version !== docs.TERMS.version ||
    p.guidelines_version !== docs.GUIDELINES.version
  )
    throw new HttpError(
      409,
      "Les documents ont changé. Relisez-les avant de confirmer.",
    );
  return p;
}
