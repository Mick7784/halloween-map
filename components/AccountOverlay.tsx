"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  api,
  AsyncButton,
  Field,
  labels,
  Notice,
  values,
  type PublicState,
} from "./common";
import type { User } from "../lib/domain";
import InstallApp from "./InstallApp";
import AccountPrivacy from "./AccountPrivacy";
import AccountPolicy from "./AccountPolicy";
import Editorial from "./Editorial";
import "./AccountOverlay.css";

type View =
  "main" | "information" | "security" | "privacy" | "policy" | "delete";
const titles: Record<View, string> = {
  main: "Mon compte",
  information: "Mes informations",
  security: "Mot de passe",
  privacy: "Confidentialité et données",
  policy: "Politique de confidentialité",
  delete: "Supprimer mon compte",
};

export default function AccountOverlay({
  user,
  state,
  refresh,
  onClose,
}: {
  user: User;
  state: PublicState;
  refresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const [returning, setReturning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [participationYears, setParticipationYears] = useState<
    { year: number }[] | null
  >(null);
  useEffect(() => {
    let alive = true;
    void api<{ year: number }[]>("history")
      .then((rows) => {
        if (alive) setParticipationYears(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const previousView = useRef<View>("main");
  useEffect(() => {
    if (window.location.pathname !== "/account") return;
    const query = new URLSearchParams(window.location.search);
    if (query.has("created"))
      setMessage(
        state.contents?.["account.confirmation"] ?? "Votre compte est créé.",
      );
    if (query.has("link"))
      setError(
        "Ce lien est invalide ou expiré. Demandez une nouvelle vérification.",
      );
  }, [state.contents]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (previousView.current !== view) {
      panel.current?.querySelector<HTMLElement>(".account-subview h2")?.focus();
      if (view === "main") {
        if (back.current?.getClientRects().length) back.current.focus();
        else
          panel.current?.querySelector<HTMLElement>(".account-close")?.focus();
      }
      previousView.current = view;
    }
  }, [view]);
  const [history, setHistory] = useState<View[]>([]);
  function navigate(next: View) {
    if (next !== "main") setHistory((previous) => [...previous, view]);
    else setHistory([]);
    setReturning(next === "main");
    setView(next);
  }
  function close() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(
      onClose,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200,
    );
  }
  async function action(input: unknown) {
    const result = await api<{ deleted?: boolean }>("account", input);
    if (result.deleted) {
      window.location.href = "/";
      return;
    }
    await refresh();
  }
  const information = (
    <section className="account-card">
      <h2 tabIndex={-1}>
        <UserRound /> Informations personnelles
      </h2>
      <IdentityForm user={user} action={action} refresh={refresh} />
      <div className="account-verification">
        <span
          className={
            "account-email-status" +
            (user.email_status === "VERIFIED" ? " is-verified" : "")
          }
        >
          {user.email_status === "VERIFIED" && (
            <Check size={13} aria-hidden="true" />
          )}
          {user.email_status === "VERIFIED"
            ? "Email vérifié"
            : "Email non vérifié"}
        </span>
        {user.email_status !== "VERIFIED" && (
          <>
            <Editorial
              text={(
                state.contents?.["account.verify"] ??
                "Vérifiez votre email pour participer."
              ).replace(/\{\{user_name\}\}/g, user.display_name)}
            />
            <AsyncButton
              onClick={async () => {
                await action({ action: "resend" });
                setMessage(
                  "Message de vérification programmé. Consultez votre messagerie.",
                );
              }}
            >
              Renvoyer la vérification
            </AsyncButton>
            <small>
              Le lien expire après 48 heures. Un renvoi invalide le précédent.
            </small>
          </>
        )}
      </div>
    </section>
  );
  const security = (
    <section className="account-card">
      <h2 tabIndex={-1}>
        <LockKeyhole /> Sécurité
      </h2>
      <AccountForm
        action="password"
        label="Modifier le mot de passe"
        submit={action}
        success="Mot de passe modifié."
        tone="purple"
      >
        <PasswordField name="current_password" label="Mot de passe actuel" />
        <PasswordField
          name="password"
          label="Nouveau mot de passe"
          newPassword
        />
        <PasswordField
          name="confirmation"
          label="Confirmation du nouveau mot de passe"
          newPassword
        />
        <small className="account-hint">12 caractères minimum.</small>
      </AccountForm>
    </section>
  );
  return (
    <div
      className={"account-overlay" + (closing ? " is-closing" : "")}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={panel}
        className={"account-dialog account-view-" + view}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <header className="account-header">
          {view !== "main" && (
            <button
              className="account-back"
              aria-label={"Revenir à " + titles[history.at(-1) ?? "main"]}
              onClick={() => {
                const previous = history.at(-1) ?? "main";
                setHistory((stack) => stack.slice(0, -1));
                setReturning(previous === "main");
                setView(previous);
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 id="account-title">{titles[view]}</h1>
          <button
            className="close account-close"
            aria-label="Fermer Mon compte"
            onClick={close}
          >
            <X size={23} />
          </button>
        </header>
        <div
          className={
            "account-scroll" +
            (view === "main" && returning ? " is-returning" : "")
          }
        >
          <Notice error={error} />
          {view === "main" ? (
            <>
              <div className="account-identity">
                <span className="account-avatar" aria-hidden="true">
                  {user.display_name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase() || "?"}
                </span>
                <div>
                  <strong>{user.display_name}</strong>
                  <span>{user.email}</span>
                  {user.role_name && user.role_name !== "USER" && (
                    <small className="account-role">
                      {labels[user.role_name] ?? user.role_name}
                    </small>
                  )}
                </div>
              </div>
              <div className="account-mobile-settings">
                <AccountRow
                  refButton={back}
                  icon={<UserRound />}
                  title="Mes informations"
                  subtitle="Nom, email et profil"
                  onClick={() => navigate("information")}
                />
                <AccountRow
                  icon={<LockKeyhole />}
                  title="Mot de passe"
                  subtitle="Modifier votre mot de passe"
                  onClick={() => navigate("security")}
                />
              </div>
              <div className="account-forms">
                {information}
                {security}
              </div>
              <div className="account-secondary">
                {participationYears && (
                  <details>
                    <summary>Mes années de participation</summary>
                    {participationYears.length ? (
                      <ul>
                        {participationYears.map((p, n) => (
                          <li key={n}>
                            Halloween {p.year} — Participation enregistrée
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Aucune participation validée conservée.</p>
                    )}
                    <p className="small">
                      Inscription validée comme propriétaire. Années uniquement,
                      conservées cinq ans et effacées avec le compte.
                    </p>
                  </details>
                )}
                <InstallApp account />
                <AccountRow
                  icon={<ShieldCheck />}
                  title="Confidentialité et données"
                  subtitle="Voir et gérer vos données personnelles"
                  onClick={() => navigate("privacy")}
                />
              </div>
              <div className="account-session">
                <AsyncButton
                  onClick={async () => {
                    await api("logout", {});
                    window.location.href = "/";
                  }}
                >
                  <span className="account-row-icon">
                    <LogOut />
                  </span>
                  <span className="account-row-copy">
                    <strong>Se déconnecter</strong>
                    <small>Vous reviendrez à l’accueil.</small>
                  </span>
                  <ChevronRight size={19} />
                </AsyncButton>
              </div>
              <div className="account-danger">
                <AccountRow
                  danger
                  icon={<Trash2 />}
                  title="Supprimer mon compte"
                  subtitle="Action irréversible · confirmation requise"
                  onClick={() => navigate("delete")}
                />
              </div>
            </>
          ) : (
            <div key={view} className="account-subview">
              {view === "information" && information}
              {view === "security" && security}
              {view === "privacy" && (
                <AccountPrivacy
                  user={user}
                  state={state}
                  onDelete={() => navigate("delete")}
                  onPolicy={() => navigate("policy")}
                />
              )}
              {view === "policy" && <AccountPolicy state={state} />}
              {view === "delete" && (
                <section className="account-card account-delete-confirm">
                  <h2 tabIndex={-1}>
                    <Trash2 /> Confirmation de suppression
                  </h2>
                  <p>
                    Cette action est irréversible. Votre compte, votre
                    participation et les données associées seront supprimés.
                  </p>
                  <AccountForm
                    action="delete"
                    label="Supprimer définitivement mon compte"
                    submit={action}
                    tone="danger"
                  >
                    <PasswordField
                      name="current_password"
                      label="Mot de passe actuel"
                    />
                    <Field
                      label="Saisissez SUPPRIMER MON COMPTE"
                      name="confirm"
                    />
                    <label className="account-consent">
                      <input type="checkbox" required /> Je comprends que cette
                      suppression est définitive.
                    </label>
                  </AccountForm>
                  <button
                    className="account-cancel"
                    onClick={() => navigate("main")}
                  >
                    Annuler
                  </button>
                </section>
              )}
            </div>
          )}
          {message && (
            <p className="notice info" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="account-scene" aria-hidden="true" />
      </section>
    </div>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  onClick,
  danger = false,
  refButton,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  danger?: boolean;
  refButton?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={refButton}
      className={"account-row" + (danger ? " danger" : "")}
      onClick={onClick}
    >
      <span className="account-row-icon">{icon}</span>
      <span className="account-row-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <ChevronRight size={19} />
    </button>
  );
}
function PasswordField({
  name,
  label,
  newPassword = false,
}: {
  name: string;
  label: string;
  newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field account-password">
      <span>{label}</span>
      <span className="account-password-input">
        <input
          name={name}
          required
          minLength={newPassword ? 12 : undefined}
          maxLength={128}
          type={visible ? "text" : "password"}
          autoComplete={newPassword ? "new-password" : "current-password"}
        />
        <button
          type="button"
          aria-label={
            (visible ? "Masquer " : "Afficher ") + label.toLowerCase()
          }
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}
function IdentityForm({
  user,
  action,
  refresh,
}: {
  user: User;
  action: (p: unknown) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState(user.display_name),
    [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const changedEmail = email.trim().toLowerCase() !== user.email;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = values(form);
        setBusy(true);
        setError("");
        setMessage("");
        let savedName = false;
        try {
          if (name.trim() !== user.display_name) {
            await action({ action: "name", display_name: name });
            savedName = true;
          }
          if (changedEmail)
            await action({
              action: "email",
              email,
              current_password: data.current_password,
            });
          setMessage(
            changedEmail
              ? "Modifications enregistrées. Vérifiez votre nouvel email."
              : "Modifications enregistrées.",
          );
          const password = form.querySelector<HTMLInputElement>(
            '[name="current_password"]',
          );
          if (password) password.value = "";
        } catch (e) {
          setError(
            (savedName ? "Le nom est enregistré. " : "") + (e as Error).message,
          );
          await refresh().catch(() => {});
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>Nom d’affichage</span>
        <input
          name="display_name"
          autoComplete="nickname"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {changedEmail && (
        <>
          <PasswordField name="current_password" label="Mot de passe actuel" />
          <small className="account-hint">
            Le nouvel email devra être vérifié.
          </small>
        </>
      )}
      <Notice error={error} />
      {message && (
        <p className="account-success" role="status">
          {message}
        </p>
      )}
      <button
        className="primary account-save"
        disabled={busy || (name.trim() === user.display_name && !changedEmail)}
      >
        <Save size={17} />
        {busy ? "Enregistrement…" : "Enregistrer les modifications"}
      </button>
    </form>
  );
}
function AccountForm({
  children,
  action,
  label,
  submit,
  tone,
  success,
}: {
  children: ReactNode;
  action: string;
  label: string;
  submit: (p: unknown) => Promise<void>;
  tone?: string;
  success?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = values(form);
        setError("");
        setMessage("");
        if (action === "password" && data.password !== data.confirmation) {
          setError("Les nouveaux mots de passe ne correspondent pas.");
          return;
        }
        setBusy(true);
        try {
          await submit({ action, ...data });
          if (success) {
            form.reset();
            setMessage(success);
          }
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <Notice error={error} />
      {message && (
        <p className="account-success" role="status">
          {message}
        </p>
      )}
      <button className={"account-save " + (tone ?? "")} disabled={busy}>
        {action === "password" ? (
          <LockKeyhole size={17} />
        ) : (
          <Trash2 size={17} />
        )}
        {busy ? "Veuillez patienter…" : label}
      </button>
    </form>
  );
}
