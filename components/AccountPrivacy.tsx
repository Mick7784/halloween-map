"use client";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import {
  ChevronRight,
  Clock3,
  House as HouseIcon,
  LockKeyhole,
  Mail,
  Route,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  api,
  AsyncButton,
  labels,
  Notice,
  time,
  type PublicState,
} from "./common";
import { publicPrivacySettings } from "../lib/privacy";
import type { House, User } from "../lib/domain";

export default function AccountPrivacy({
  user,
  state,
  onDelete,
  onPolicy,
}: {
  user: User;
  state: PublicState;
  onDelete: () => void;
  onPolicy: () => void;
}) {
  const [house, setHouse] = useState<House | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setHouse(await api<House | null>("house"));
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    void api<House | null>("house")
      .then((h) => {
        if (active) {
          setHouse(h);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const settings = publicPrivacySettings(state.privacy);
  const zone = state.instance?.timezone ?? "Europe/Paris";
  const date = state.season?.purge_at
    ? DateTime.fromISO(state.season.purge_at).setZone(zone).setLocale("fr")
    : null;
  const purge = date?.isValid ? date.toFormat("d LLLL yyyy à HH:mm") : null;
  return (
    <div className="account-privacy">
      <h2 className="account-privacy-title" tabIndex={-1}>
        <ShieldCheck size={20} /> Vos données personnelles
      </h2>
      <p className="account-privacy-intro">
        {settings.intro ??
          "Retrouvez ici les principales informations conservées par Halloween Map et leur durée de conservation."}
      </p>
      <div className="account-privacy-blocks">
        <section className="account-card">
          <h3>Années de participation et fréquentation</h3>
          <p>
            Seules les années de participation validée sont conservées cinq ans
            après enregistrement, sans ancienne information de maison. La
            suppression du compte efface ces marqueurs. La présence active
            expire après trois minutes ; seuls les relevés de quinze minutes et
            le pic anonymes sont archivés.
          </p>
        </section>
        <section className="account-card">
          <h3>
            <UserRound size={18} /> Compte
          </h3>
          <dl className="account-data">
            <div>
              <dt>Nom d’affichage</dt>
              <dd>{user.display_name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Rôle</dt>
              <dd>{labels[user.role_name ?? "USER"] ?? user.role_name}</dd>
            </div>
            <div>
              <dt>Vérification de l’email</dt>
              <dd>
                {user.email_status === "VERIFIED"
                  ? "Email vérifié"
                  : "Email non vérifié"}
              </dd>
            </div>
          </dl>
          <p>
            Les données nécessaires à votre connexion sont protégées et ne sont
            pas affichées ici.
          </p>
          <p className="account-retention">
            {settings.accountRetention ??
              "Les informations nécessaires de votre compte sont conservées pour vous permettre de participer aux prochaines éditions. Vous pouvez supprimer votre compte à tout moment."}
          </p>
        </section>
        <section className="account-card">
          <h3>
            <HouseIcon size={18} /> Participation Halloween
          </h3>
          {loaded ? (
            house ? (
              <>
                <dl className="account-data">
                  <div>
                    <dt>Maison</dt>
                    <dd>{house.name}</dd>
                  </div>
                  <div>
                    <dt>Adresse</dt>
                    <dd>{house.address}</dd>
                  </div>
                  <div>
                    <dt>Position</dt>
                    <dd>
                      {Number(house.latitude).toFixed(5)},{" "}
                      {Number(house.longitude).toFixed(5)}
                    </dd>
                  </div>
                  <div>
                    <dt>Horaires d’accueil</dt>
                    <dd>
                      {time(String(house.starts_at), zone)} –{" "}
                      {time(String(house.ends_at), zone)}
                    </dd>
                  </div>
                  <div>
                    <dt>Activités</dt>
                    <dd>
                      {house.activities.map((a) => labels[a] ?? a).join(", ")}
                    </dd>
                  </div>
                </dl>
                <details className="account-participation-details">
                  <summary>
                    Description et paramètres de la participation
                  </summary>
                  <dl className="account-data">
                    {house.rp && (
                      <div>
                        <dt>Description</dt>
                        <dd>{house.rp}</dd>
                      </div>
                    )}
                    {house.practical && (
                      <div>
                        <dt>Informations pratiques</dt>
                        <dd>{house.practical}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Frayeur</dt>
                      <dd>
                        {house.adaptable
                          ? "Adaptable aux visiteurs"
                          : `Niveau ${house.fear} sur 5`}
                      </dd>
                    </div>
                    <div>
                      <dt>Visibilité et accueil</dt>
                      <dd>
                        {labels[house.status] ?? house.status} ·{" "}
                        {labels[house.activity] ?? house.activity}
                      </dd>
                    </div>
                    {house.activities.includes("CANDY") && (
                      <div>
                        <dt>Bonbons</dt>
                        <dd>
                          {house.candy_available ? "Disponibles" : "Épuisés"}
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
                <p className="account-retention">
                  {settings.participationRetention ??
                    "Les détails de cette participation (adresse, position, horaires et activités) sont supprimés à la purge de la saison."}{" "}
                  Seules les années de participation validée sont conservées
                  pendant cinq ans, sans information de maison, puis effacées
                  avec le compte. Les autres archives sont des totaux anonymes.
                </p>
              </>
            ) : (
              <p>Aucune participation enregistrée pour la saison active.</p>
            )
          ) : (
            <p role="status">
              {error
                ? "Les données de participation n’ont pas pu être chargées."
                : "Chargement de votre participation…"}
            </p>
          )}
          <Notice error={error} />
          {error && <AsyncButton onClick={load}>Réessayer</AsyncButton>}
        </section>
        <section className="account-card">
          <h3>
            <Route size={18} /> Parcours
          </h3>
          <p>
            Votre parcours courant reste dans la vue carte. Aucun historique
            personnel de vos parcours n’est enregistré.
          </p>
          <p className="account-retention">
            {settings.routeRetention ??
              "Seul le nombre total de parcours calculés est conservé, sous forme de statistiques anonymes de la saison."}
          </p>
        </section>
        <section className="account-card account-purge">
          <h3>
            <Clock3 size={18} /> Prochaine purge
          </h3>
          <strong>{purge ?? "Date non encore disponible"}</strong>
          <p>
            {purge
              ? "Les données de participation de cette édition seront supprimées. Votre compte reste disponible pour les prochaines éditions."
              : "La date sera affichée dès que la saison et sa purge seront configurées par l’organisateur."}
          </p>
        </section>
      </div>
      <div className="account-privacy-actions">
        <button className="account-row" onClick={onPolicy}>
          <span className="account-row-icon">
            <LockKeyhole />
          </span>
          <span className="account-row-copy">
            <strong>Politique de confidentialité</strong>
            <small>Consulter la politique complète</small>
          </span>
          <ChevronRight size={19} />
        </button>
        {settings.contactEmail ? (
          <a
            className="account-row"
            href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent(settings.contactSubject ?? "Halloween Map — Contact")}`}
          >
            <span className="account-row-icon">
              <Mail />
            </span>
            <span className="account-row-copy">
              <strong>Nous contacter</strong>
              <small>{settings.contactEmail}</small>
            </span>
            <ChevronRight size={19} />
          </a>
        ) : (
          <details className="account-contact">
            <summary className="account-row">
              <span className="account-row-icon">
                <Mail />
              </span>
              <span className="account-row-copy">
                <strong>Nous contacter</strong>
                <small>Coordonnées à venir</small>
              </span>
              <ChevronRight size={19} />
            </summary>
            <p>
              Les coordonnées de contact de l’organisateur ne sont pas encore
              renseignées. Vous pouvez consulter les{" "}
              <a href="/legal" target="_blank" rel="noopener noreferrer">
                mentions légales
              </a>{" "}
              pour retrouver les informations disponibles.
            </p>
          </details>
        )}
      </div>
      <div className="account-danger">
        <button className="account-row danger" onClick={onDelete}>
          <span className="account-row-icon">
            <Trash2 />
          </span>
          <span className="account-row-copy">
            <strong>Supprimer mon compte</strong>
            <small>Action irréversible · confirmation requise</small>
          </span>
          <ChevronRight size={19} />
        </button>
      </div>
    </div>
  );
}
