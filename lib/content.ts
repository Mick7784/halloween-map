import { z } from "zod";
import { db, transaction, type Database } from "./db";
import { HttpError, requirePermission } from "./auth";
import type { User } from "./domain";
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
      "Une décoration, quelques bonbons, une mise en scène : à vous de choisir. Votre maison est inscrite automatiquement.",
    ],
    [
      "participation.confirmation",
      "Participation",
      "Votre participation est enregistrée.",
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
      "Votre compte, nom, email, mot de passe chiffré par empreinte et rôle sont conservés pour les prochaines éditions. Votre maison, adresse, position, horaires et descriptions sont supprimés à la purge.",
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
export const legalDefaults = {
  TERMS: {
    title: "Conditions d’utilisation",
    body: "## Participer à Halloween\n\nInscrivez uniquement une adresse que vous êtes autorisé à proposer. Les maisons sont inscrites automatiquement ; l’équipe peut les masquer si nécessaire. Vous êtes responsable de votre accueil et pouvez le mettre en pause ou le terminer.\n\nLes parcours sont indicatifs. Les visiteurs respectent les propriétés privées, les horaires et la voie publique. Les enfants restent accompagnés.\n\nLes informations de participation sont supprimées après la saison. L’exploitant reste responsable de l’organisation et de la publication de ses textes.",
  },
  GUIDELINES: {
    title: "Bonnes pratiques",
    body: "- Disposer de l’autorisation d’inscrire cette adresse.\n- Garder les accès dégagés.\n- Éclairer les passages.\n- Sécuriser les installations et décorations.\n- Respecter le voisinage et limiter le bruit.\n- Rester prudent sur la voie publique.\n- Annoncer honnêtement le niveau de peur.\n- Informer sur les bonbons et allergènes.\n- Assumer la responsabilité de l’accueil.\n- Considérer les parcours comme indicatifs.\n- Mettre en pause ou terminer l’accueil si nécessaire.",
  },
  PRIVACY: {
    title: "Politique de confidentialité",
    body: "## Compte durable, participation éphémère\n\nLe compte conserve votre nom, email, état de vérification, empreinte sécurisée du mot de passe et permissions pour les prochaines éditions. Vous pouvez supprimer votre compte et ses données associées depuis Mon compte.\n\nLa purge automatique efface la maison, adresse, position GPS, horaires, activités, descriptions et informations pratiques. Aucun historique des adresses ni réutilisation commerciale. Seuls des totaux anonymes subsistent.\n\nLes emails de service servent à vérifier le compte, activer une invitation et informer les participants. Les liens sont temporaires et à usage unique. Aucun contenu privé n’est conservé hors ligne.\n\nLa géolocalisation est facultative. OpenStreetMap et CARTO reçoivent les requêtes nécessaires à la carte. L’exploitant doit préciser son identité, son contact, les délais de conservation des comptes inactifs et les modalités d’exercice des droits.",
  },
  NOTICE: {
    title: "Mentions légales",
    body: "## Exploitant de l’événement\n\nL’exploitant doit renseigner ici son identité, ses coordonnées, le responsable de publication et l’hébergeur avant ouverture au public.\n\nHalloween Map — une expérience DomotiK Studio. Cartographie © OpenStreetMap contributors · © CARTO.",
  },
} as const;
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
  return {
    catalog: contentDefaults,
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
      action: z.enum(["save", "reset", "draft", "publish"]),
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
  if (p.action === "save" || p.action === "reset") {
    if (!p.key || !contentDefaults[p.key])
      throw new HttpError(400, "Contenu inconnu");
    if (p.action === "reset")
      await db().query(
        "DELETE FROM content_overrides WHERE instance_id=$1 AND key=$2",
        [u.instance_id, p.key],
      );
    else
      await db().query(
        "INSERT INTO content_overrides(instance_id,key,value) VALUES($1,$2,$3) ON CONFLICT(instance_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
        [
          u.instance_id,
          p.key,
          sanitizeContent(p.value ?? "", contentDefaults[p.key].variables),
        ],
      );
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
    });
  return { ok: true };
}
export async function validateAcceptance(
  client: Database,
  instanceId: string,
  input: unknown,
) {
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
