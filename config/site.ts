import { NavItem } from "@/types/nav"

interface SiteConfig {
  name: string
  description: string
  mainNav: NavItem[]
}

export const siteConfig: SiteConfig = {
  name: "HCI GPT assistant",
  description: "Upload a file, start asking question",
  mainNav: [
    {
      title: "Home",
      href: "/",
    },
    {
      title: "Documents",
      href: "/documents",
    },
  ],
}
