import type { EmailContent } from "./content";
import type { EmailBrand } from "./config";
import { format } from "@/lib/domain/format";
import { emailMessages, type EmailLang } from "./messages";

// Table-based layout with inline styles: the only thing every mail client
// renders consistently. React escapes every interpolated string, and there is
// no dangerouslySetInnerHTML anywhere in lib/email.
const font = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export function EmailLayout({ lang, content, brand }: { lang: EmailLang; content: EmailContent; brand: EmailBrand }) {
  const m = emailMessages[lang];
  return (
    <html lang={lang}>
      {/* eslint-disable-next-line @next/next/no-head-element -- standalone email document, not a Next page */}
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width" />
        <title>{content.subject}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f4f1ec", fontFamily: font }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>{content.preheader}</div>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ backgroundColor: "#f4f1ec" }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: 560, backgroundColor: "#ffffff", borderRadius: 8 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "32px 32px 8px", color: "#7a6a58", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>{brand.name}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "0 32px", color: "#2b2a28" }}>
                        <h1 style={{ fontSize: 22, margin: "8px 0 16px" }}>{content.heading}</h1>
                        {content.paragraphs.map((paragraph, index) => (
                          <p key={index} style={{ fontSize: 15, lineHeight: "24px", margin: "0 0 16px" }}>
                            {paragraph}
                          </p>
                        ))}
                        {content.cta ? (
                          <p style={{ margin: "8px 0 24px" }}>
                            <a href={content.cta.url} style={{ backgroundColor: "#2b2a28", color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: 6, fontSize: 15, display: "inline-block" }}>
                              {content.cta.label}
                            </a>
                          </p>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "16px 32px 32px", color: "#8b8680", fontSize: 12, lineHeight: "18px" }}>
                        {format(m.footer, { brand: brand.name })}
                        {brand.poweredBy ? <><br />{m.poweredBy}</> : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
