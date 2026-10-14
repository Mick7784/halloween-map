"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, List, ListOrdered, Undo2, Redo2, Link2, Image,
  Table2, Minus, Code2, Eye, Pencil, Type, Palette,
} from "lucide-react";
import { Button, Select } from "./ui";

type Mode = "visual" | "html" | "preview";
type ImageFields = { src: string; alt: string; width: string };
type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  variables?: readonly string[];
  requireSecureAction?: boolean;
};

const imageDefault = { src: "", alt: "", width: "240" };
function htmlBody(value: string) {
  if (typeof DOMParser === "undefined") return value;
  return new DOMParser().parseFromString(value, "text/html").body.innerHTML;
}
function ToolbarButton({
  label, icon: Icon, onClick, disabled,
}: {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button type="button" title={label} aria-label={label}
      disabled={disabled} onClick={onClick}>
      <Icon size={17} />
    </Button>
  );
}

export default function EmailHtmlEditor({
  value, onChange, disabled = false, variables = [], requireSecureAction = false,
}: Props) {
  const [mode, setMode] = useState<Mode>("visual");
  const [source, setSource] = useState(value);
  const [imageForm, setImageForm] = useState(false);
  const [imageFields, setImageFields] = useState<ImageFields>(imageDefault);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState("");
  const [linkForm, setLinkForm] = useState(false);
  const [library, setLibrary] = useState<{ id: string; filename: string; url: string }[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const surface = useRef<HTMLDivElement | null>(null);
  const selection = useRef<Range | null>(null);
  const lastSent = useRef(value);
  const editing = useRef(false);

  useEffect(() => {
    if (value !== lastSent.current && !editing.current) {
      setSource(value);
      if (surface.current && mode === "visual")
        surface.current.innerHTML = htmlBody(value);
    }
  }, [value, mode]);

  useEffect(() => {
    if (mode === "visual" && surface.current)
      surface.current.innerHTML = htmlBody(source);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function publish(next: string) {
    editing.current = true;
    lastSent.current = next;
    setSource(next);
    onChange(next);
    editing.current = false;
  }
  function snapshot() {
    if (!surface.current) return;
    const body = surface.current.innerHTML;
    // Preserve the validated document wrapper as much as possible.
    const document = new DOMParser().parseFromString(source, "text/html");
    document.body.innerHTML = body;
    publish('<!doctype html>' + document.documentElement.outerHTML);
  }
  function rememberSelection() {
    const current = window.getSelection();
    if (current?.rangeCount && surface.current?.contains(current.anchorNode))
      selection.current = current.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    surface.current?.focus();
    if (!selection.current) return;
    const current = window.getSelection();
    current?.removeAllRanges();
    current?.addRange(selection.current);
  }
  function exec(command: string, argument?: string) {
    if (disabled || !surface.current) return;
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, argument);
    rememberSelection();
    snapshot();
  }
  function insert(html: string) {
    exec("insertHTML", html);
  }
  function insertVariable(key: string) {
    if (!key) return;
    exec("insertText", "{{" + key + "}}");
  }
  function editImage(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLImageElement) {
      setSelectedImage(target);
      setImageFields({
        src: target.getAttribute("src") ?? "",
        alt: target.getAttribute("alt") ?? "",
        width: target.getAttribute("width") ?? "240",
      });
      setImageForm(true);
      void loadLibrary();
    }
    rememberSelection();
  }
  async function loadLibrary() {
    try {
      const response = await fetch("/api/admin/email-media", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bibliothèque inaccessible");
      setLibrary(data.images ?? []);
    } catch (e) {
      setImageError((e as Error).message);
    }
  }
  async function uploadImage(file?: File) {
    if (!file || disabled) return;
    setImageError("");
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.set("image", file);
      const response = await fetch("/api/admin/email-media", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import impossible");
      setImageFields((previous) => ({
        ...previous,
        src: data.url,
        alt: previous.alt || file.name.replace(/\\.[^.]+$/, ""),
      }));
      await loadLibrary();
    } catch (e) {
      setImageError((e as Error).message);
    } finally {
      setUploadBusy(false);
    }
  }
  function saveImage() {
    setImageError("");
    if (!/^https:\/\/[^\s<>"']+$/i.test(imageFields.src) ||
      imageFields.src.includes("{{")) {
      setImageError("L'image doit posséder une adresse HTTPS publique.");
      return;
    }
    const width = Number(imageFields.width);
    if (!Number.isInteger(width) || width < 30 || width > 1200) {
      setImageError("Choisissez une largeur comprise entre 30 et 1200 pixels.");
      return;
    }
    if (selectedImage) {
      selectedImage.setAttribute("src", imageFields.src);
      selectedImage.setAttribute("alt", imageFields.alt);
      selectedImage.setAttribute("width", String(width));
      selectedImage.setAttribute("style", "max-width:100%;height:auto");
      snapshot();
    } else {
      insert('<img src="' + escapeAttribute(imageFields.src) +
        '" alt="' + escapeAttribute(imageFields.alt) +
        '" width="' + width + '" style="max-width:100%;height:auto">');
    }
    setImageForm(false);
    setSelectedImage(null);
    setImageFields(imageDefault);
  }
  const editingTools = disabled || mode !== "visual";
  return (
    <section className="email-html-editor">
      <div className="email-html-editor-modes" role="group" aria-label="Mode de l'éditeur d'email">
        <Button type="button" aria-pressed={mode === "visual"}
          onClick={() => setMode("visual")}><Pencil size={15} /> Visuel</Button>
        <Button type="button" aria-pressed={mode === "html"}
          onClick={() => setMode("html")}><Code2 size={15} /> HTML</Button>
        <Button type="button" aria-pressed={mode === "preview"}
          onClick={() => setMode("preview")}><Eye size={15} /> Aperçu</Button>
      </div>
      <div role="toolbar" aria-label="Mise en forme des emails" className="email-html-toolbar">
        <Select aria-label="Style du texte" disabled={editingTools} defaultValue="p"
          onChange={(e) => exec("formatBlock", e.target.value)}>
          <option value="p">Paragraphe</option>
          <option value="h1">Titre 1</option>
          <option value="h2">Titre 2</option>
          <option value="h3">Titre 3</option>
        </Select>
        <Select aria-label="Police" disabled={editingTools} defaultValue="Arial"
          onChange={(e) => exec("fontName", e.target.value)}>
          <option>Arial</option><option>Georgia</option><option>Verdana</option>
          <option>Tahoma</option><option>Trebuchet MS</option>
        </Select>
        <Select aria-label="Taille du texte" disabled={editingTools} defaultValue="3"
          onChange={(e) => exec("fontSize", e.target.value)}>
          <option value="2">Petite</option>
          <option value="3">Normale</option>
          <option value="4">Grande</option>
          <option value="5">Très grande</option>
        </Select>
        <ToolbarButton label="Gras" icon={Bold} onClick={() => exec("bold")} disabled={editingTools} />
        <ToolbarButton label="Italique" icon={Italic} onClick={() => exec("italic")} disabled={editingTools} />
        <ToolbarButton label="Souligné" icon={Underline} onClick={() => exec("underline")} disabled={editingTools} />
        <ToolbarButton label="Barré" icon={Strikethrough} onClick={() => exec("strikeThrough")} disabled={editingTools} />
        <ToolbarButton label="Aligner à gauche" icon={AlignLeft} onClick={() => exec("justifyLeft")} disabled={editingTools} />
        <ToolbarButton label="Centrer" icon={AlignCenter} onClick={() => exec("justifyCenter")} disabled={editingTools} />
        <ToolbarButton label="Aligner à droite" icon={AlignRight} onClick={() => exec("justifyRight")} disabled={editingTools} />
        <ToolbarButton label="Liste à puces" icon={List} onClick={() => exec("insertUnorderedList")} disabled={editingTools} />
        <ToolbarButton label="Liste numérotée" icon={ListOrdered} onClick={() => exec("insertOrderedList")} disabled={editingTools} />
        <ToolbarButton label="Lien" icon={Link2} onClick={() => { rememberSelection(); setLinkForm(true); }} disabled={editingTools} />
        <ToolbarButton label="Image" icon={Image} onClick={() => {
          rememberSelection(); setSelectedImage(null); setImageFields(imageDefault);
          setImageForm(true); setImageError("");
          void loadLibrary();
        }} disabled={editingTools} />
        <ToolbarButton label="Tableau deux colonnes" icon={Table2} onClick={() => insert(
          '<table role="presentation" width="100%" cellpadding="8" cellspacing="0"><tbody><tr>' +
          '<td width="50%" style="vertical-align:top">Colonne 1</td>' +
          '<td width="50%" style="vertical-align:top">Colonne 2</td></tr></tbody></table><p></p>',
        )} disabled={editingTools} />
        <ToolbarButton label="Séparateur" icon={Minus} onClick={() => insert('<hr style="border-top:1px solid #777777">')} disabled={editingTools} />
        <ToolbarButton label="Annuler" icon={Undo2} onClick={() => exec("undo")} disabled={editingTools} />
        <ToolbarButton label="Rétablir" icon={Redo2} onClick={() => exec("redo")} disabled={editingTools} />
        <label className="email-html-color" title="Couleur du texte">
          <Palette size={16} />
          <input aria-label="Couleur du texte" type="color" defaultValue="#ffffff"
            disabled={editingTools} onChange={(e) => exec("foreColor", e.target.value)} />
        </label>
        <label className="email-html-color" title="Surlignage">
          <Type size={16} />
          <input aria-label="Couleur de surlignage" type="color" defaultValue="#ff922f"
            disabled={editingTools} onChange={(e) => exec("hiliteColor", e.target.value)} />
        </label>
        {variables.length > 0 && (
          <Select aria-label="Insérer une variable" disabled={editingTools} defaultValue=""
            onChange={(e) => { insertVariable(e.target.value); e.target.value = ""; }}>
            <option value="" disabled>Variable</option>
            {variables.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        )}
        {requireSecureAction &&
          <Button disabled={editingTools} type="button"
            onClick={() => insert('<p><a href="{{secure_action_url}}" ' +
              'style="display:inline-block;padding:14px;background-color:#ff922f;color:#17171e">' +
              'Ouvrir mon compte</a></p>')}>
            Insérer le bouton sécurisé
          </Button>}
      </div>
      {linkForm && (
        <div className="email-html-insert-panel">
          <label>Adresse du lien
            <input aria-label="URL du lien" value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)} />
          </label>
          <Button type="button" onClick={() => {
            if (!/^https:\/\/[^\s<>"']+$/i.test(linkUrl) &&
              !/^mailto:[^\s<>"']+$/i.test(linkUrl)) return;
            exec("createLink", linkUrl); setLinkForm(false);
          }}>Appliquer</Button>
          <Button type="button" onClick={() => setLinkForm(false)}>Annuler</Button>
        </div>
      )}
      {imageForm && (
        <div className="email-html-insert-panel" role="group" aria-label="Éditer l'image">
          <label>Importer une image (PNG/JPEG/WebP, 2 Mo max)
            <input aria-label="Importer une image" type="file" accept="image/png,image/jpeg,image/webp"
              disabled={disabled || uploadBusy} onChange={(e) => {
                void uploadImage(e.target.files?.[0]);
                e.target.value = "";
              }} />
          </label>
          {library.length > 0 && <label>Bibliothèque
            <Select aria-label="Choisir une image de la bibliothèque" value=""
              onChange={(e) => {
                setImageFields((previous) => ({ ...previous, src: e.target.value }));
              }}>
              <option value="">Choisir une image…</option>
              {library.map((asset) => <option key={asset.id} value={asset.url}>
                {asset.filename}</option>)}
            </Select>
          </label>}
          <label>Adresse HTTPS de l’image
            <input aria-label="URL de l'image" value={imageFields.src}
              onChange={(e) => setImageFields({ ...imageFields, src: e.target.value })} />
          </label>
          <label>Texte alternatif
            <input aria-label="Texte alternatif" value={imageFields.alt}
              onChange={(e) => setImageFields({ ...imageFields, alt: e.target.value })} />
          </label>
          <label>Largeur en pixels
            <input aria-label="Largeur de l'image" type="number" min="30" max="1200"
              value={imageFields.width}
              onChange={(e) => setImageFields({ ...imageFields, width: e.target.value })} />
          </label>
          <Button type="button" disabled={disabled || uploadBusy} onClick={saveImage}>
            {selectedImage ? "Modifier l’image" : "Insérer l’image"}
          </Button>
          <Button type="button" onClick={() => {
            setImageForm(false); setSelectedImage(null);
          }}>Annuler</Button>
          {selectedImage && <Button type="button" onClick={() => {
            selectedImage.remove(); snapshot(); setImageForm(false); setSelectedImage(null);
          }}>Supprimer l’image</Button>}
          {imageError && <p role="alert">{imageError}</p>}
        </div>
      )}
      {mode === "visual" && (
        <div className="email-html-paper-wrap">
          <div ref={surface} className="email-html-paper" contentEditable={!disabled}
            suppressContentEditableWarning role="textbox" aria-label="Document HTML d'email"
            aria-multiline="true" onInput={snapshot} onClick={editImage}
            onKeyUp={rememberSelection} onMouseUp={rememberSelection}
          />
        </div>
      )}
      {mode === "html" && (
        <textarea aria-label="Code source HTML de l'email" spellCheck={false}
          className="email-html-source" value={source} disabled={disabled}
          onChange={(e) => publish(e.target.value)} />
      )}
      {mode === "preview" && (
        <div className="email-html-paper-wrap">
          <iframe title="Aperçu du document HTML" sandbox="" referrerPolicy="no-referrer"
            className="email-html-preview" srcDoc={source} />
        </div>
      )}
      <p className="small muted">
        Les images doivent avoir une URL HTTPS accessible aux destinataires.
        Le HTML et les styles sont validés sur le serveur avant enregistrement.
        L’aperçu ne contient jamais de vrai jeton d’activation.
      </p>
    </section>
  );
}
function escapeAttribute(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
