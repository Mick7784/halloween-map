import { mailLayout } from "./mail-layout";
import { editorialText } from "./editorial-format";
export const messageKinds = [
  "VERIFY",
  "INVITE",
  "RESET",
  "HOUSE_SUBMITTED",
  "HOUSE_APPROVED",
  "HOUSE_REFUSED",
] as const;
export type MessageKind = (typeof messageKinds)[number];
export type MessageTemplate = { subject: string; body: string };
export const messageVariables = [
  "name",
  "event_name",
  "territory",
  "season_year",
  "map_open_date",
  "map_close_date",
  "registration_date",
  "house_name",
  "house_start_time",
  "refusal_reason",
] as const;
export const templateLabels: Record<MessageKind, string> = {
  VERIFY: "Vérification du compte",
  INVITE: "Invitation",
  RESET: "Récupération du mot de passe",
  HOUSE_SUBMITTED: "Maison reçue",
  HOUSE_APPROVED: "Maison acceptée",
  HOUSE_REFUSED: "Maison refusée",
};
export const messageDefaults: Record<MessageKind, MessageTemplate> = {
  VERIFY: {
    subject: "Vérifiez votre email — Halloween Map",
    body: "Bonjour {{name}},\n\nVérifiez votre adresse email à l’aide du bouton sécurisé ci-dessous.",
  },
  INVITE: {
    subject: "Votre invitation — Halloween Map",
    body: "Bonjour {{name}},\n\nVotre compte vous attend. Activez-le à l’aide du bouton sécurisé ci-dessous.",
  },
  RESET: {
    subject: "Réinitialisez votre mot de passe — Halloween Map",
    body: "Bonjour {{name}},\n\nChoisissez un nouveau mot de passe à l’aide du bouton sécurisé ci-dessous.",
  },
  HOUSE_SUBMITTED: {
    subject: "Votre inscription a bien été reçue — {{event_name}}",
    body: "Bonjour {{name}},\n\nNous avons bien enregistré votre inscription pour **{{house_name}}**. Votre maison est en attente de validation. Vous recevrez un message lorsque votre participation aura été examinée.",
  },
  HOUSE_APPROVED: {
    subject: "Votre maison est acceptée — {{event_name}}",
    body: "Bonjour {{name}},\n\nVotre participation **{{house_name}}** est acceptée. Votre maison apparaîtra sur la carte à partir de l’ouverture officielle ({{map_open_date}}), selon vos horaires et votre disponibilité.",
  },
  HOUSE_REFUSED: {
    subject: "Votre participation doit être corrigée — {{event_name}}",
    body: "Bonjour {{name}},\n\nVotre maison **{{house_name}}** n’a pas été acceptée.\n\n**Motif :** {{refusal_reason}}\n\nCorrigez les informations depuis Ma participation pour demander un nouvel examen.",
  },
};
export const templateExamples: Record<string, string> = {
  name: "Camille",
  event_name: "Halloween",
  territory: "Votre commune",
  season_year: "2026",
  map_open_date: "31 octobre à 18:00",
  map_close_date: "31 octobre à 23:00",
  registration_date: "1 octobre",
  house_name: "Maison des lanternes",
  house_start_time: "18:30",
  refusal_reason: "L’adresse doit être complétée.",
};
export function renderMessage(
  template: MessageTemplate,
  variables: Record<string, string>,
  cta?: { label: string; url: string },
) {
  const fill = (value: string) =>
    value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => variables[key] ?? "");
  const subject = fill(template.subject).replace(/[\r\n]/g, " ");
  return {
    subject,
    html: mailLayout(subject, template.body, cta, variables),
    text:
      fill(editorialText(template.body)) +
      (cta ? `\n\n${cta.label} : ${cta.url}` : ""),
  };
}
