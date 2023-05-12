import { NavItem } from "@/types/nav"

interface SiteConfig {
  name: string
  description: string
  mainNav: NavItem[]
  links: {
    twitter: string
    github: string
  }
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
    {
      title: "Credentials",
      href: "/credentials",
    },
  ],
  links: {
    twitter: "https://twitter.com/fraserxu",
    github: "https://github.com/fraserxu/book-gpt",
  },
}
