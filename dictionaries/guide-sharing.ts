const es = {
  password: "Contraseña (mínimo 6 caracteres)",
  generate: "Generar contraseña", copy: "Copiar", warning: "Guárdala ahora: después no se puede volver a ver",
  shareIntro: "Publica la guía antes de crear un enlace. Quien tenga el enlace y la contraseña puede reenviarlos.",
  created: "Enlace creado. Guarda el enlace y la contraseña ahora.",
  createdLink: "Enlace creado", createdPassword: "Contraseña del enlace creado",
  copyMessage: "Copiar mensaje para el huésped", messageLanguage: "Idioma del mensaje",
  copied: "Copiado.", copyError: "No se pudo copiar. Selecciona el texto y cópialo manualmente.",
  generateError: "No se pudo generar la contraseña. Puedes escribir una de al menos 6 caracteres.",
  guestMessage: (url: string, password: string) => `Aquí tienes la guía del alojamiento:\n${url}\nContraseña: ${password}`,
};
const en: typeof es = {
  password: "Password (at least 6 characters)",
  generate: "Generate password", copy: "Copy", warning: "Save it now: you cannot view it again later",
  shareIntro: "Publish the guide before creating a link. Anyone with the link and password can forward them.",
  created: "Link created. Save the link and password now.",
  createdLink: "Created link", createdPassword: "Password for the created link",
  copyMessage: "Copy message for the guest", messageLanguage: "Message language",
  copied: "Copied.", copyError: "Unable to copy. Select the text and copy it manually.",
  generateError: "Unable to generate a password. You can enter one with at least 6 characters.",
  guestMessage: (url: string, password: string) => `Here is your property guide:\n${url}\nPassword: ${password}`,
};
export function guideSharingCopy(lang: string) { return lang === "en" ? en : es; }
