import { HouseGuideContent } from "@/components/site/house-guide-content";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "@/dictionaries";
import { guestGuideCopy } from "@/dictionaries/guest-guide";
import { guideCookieName,readGuide } from "@/lib/dal/guest-guide";
import { guideTokenSchema } from "@/lib/domain/house-guide";
import { getSiteByHost } from "@/lib/dal/public/site";
import { getProperty } from "@/lib/dal/public/property";
import { PrintButton } from "./print-button";
import styles from "./guide-print.module.css";
import { UnlockForm } from "./unlock-form";
import { closeGuideAction } from "./actions";
export const dynamic='force-dynamic';
const privateMetadata:Metadata={title:'Private house guide',description:'Private guest access',robots:{index:false,follow:false,noarchive:true},openGraph:{title:'Private house guide',description:'Private guest access',images:[]},twitter:{title:'Private house guide',description:'Private guest access',images:[]},alternates:{canonical:null,languages:{}}};
async function propertyName(host:string) {
 const site=await getSiteByHost(host);if(!site)notFound();
 return (await getProperty(site.slug)).name;
}
export async function generateMetadata({params}:{params:Promise<{host:string;lang:string}>}):Promise<Metadata> {
 const {host,lang}=await params;
 return {...privateMetadata,title:{absolute:`${guestGuideCopy(lang).documentTitle} – ${await propertyName(host)}`}};
}
export default async function GuidePage({params}:{params:Promise<{host:string;lang:string;token:string}>}) {
 const{host,lang,token}=await params;if(!hasLocale(lang)||!guideTokenSchema.safeParse(token).success)notFound();
 const dict=guestGuideCopy(lang);const session=(await cookies()).get(guideCookieName(token))?.value;
 const guide=await readGuide(host,token,session);
 const name=guide?await propertyName(host):null;
 return <main className={`${styles.guide} mx-auto w-full max-w-3xl px-5 py-12 sm:py-20`}><p className="mb-3 text-sm uppercase tracking-wider opacity-70">{dict.private}</p>
 {!guide?<section className="mx-auto max-w-md space-y-6 rounded-2xl border border-current/15 p-6 sm:p-8"><h1 className="font-site-heading text-3xl">{dict.title}</h1><p>{dict.intro}</p><UnlockForm host={host} lang={lang} token={token}/></section>:<>
 <div className="mb-10 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 font-semibold">{name}</p><h1 className="font-site-heading text-3xl sm:text-4xl">{guide.title}</h1></div><PrintButton label={dict.downloadPdf}/><form action={closeGuideAction.bind(null,lang,token)}><button className="min-h-11 rounded-lg border border-current/30 px-4 py-2">{dict.leave}</button></form></div>
 <nav aria-label={dict.title} className="mb-10 flex flex-wrap gap-2">{guide.sections.map((s,i)=><a key={s.id} className="rounded-full border border-current/20 px-4 py-2" href={`#section-${i}`}>{s.title}</a>)}</nav>
 <HouseGuideContent guide={guide} imageBase={`/${lang}/guia/${token}/imagen`}/></>}
 </main>;
}
