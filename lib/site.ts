/** Public site configuration. Labels live in messages/*.json, never here. */
export const mainNav = [
  { href: "/ideas", key: "ideas" },
  { href: "/jobs", key: "jobs" },
  { href: "/talent", key: "talent" },
  { href: "/academy", key: "academy" },
  { href: "/pricing", key: "pricing" },
] as const;

export type MainNavKey = (typeof mainNav)[number]["key"];

export const footerNav = {
  product: [
    { href: "/ideas", label: "Nav.ideas" },
    { href: "/jobs", label: "Nav.jobs" },
    { href: "/talent", label: "Nav.talent" },
    { href: "/academy", label: "Nav.academy" },
    { href: "/pricing", label: "Nav.pricing" },
  ],
  company: [
    { href: "/how-it-works", label: "Footer.howItWorks" },
    { href: "/faq", label: "Footer.faq" },
    { href: "/contact", label: "Footer.contact" },
  ],
  legal: [
    { href: "/terms", label: "Footer.terms" },
    { href: "/privacy", label: "Footer.privacy" },
    { href: "/cookies", label: "Footer.cookies" },
    { href: "/content-policy", label: "Footer.contentPolicy" },
  ],
} as const;

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
