// Single source of truth for the admin menus and their routes.
export const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "/admin" },
  { id: "branding", label: "Branding", icon: "palette", path: "/admin/branding" },
  { id: "card", label: "Scratch Card & Prizes", icon: "card", path: "/admin/card" },
  { id: "coupons", label: "Coupons", icon: "ticket", path: "/admin/coupons" },
  { id: "redeem", label: "Redeem", icon: "scan", path: "/admin/redeem" },
  { id: "whatsapp", label: "WhatsApp", icon: "chat", path: "/admin/whatsapp" },
  { id: "templates", label: "Templates", icon: "template", path: "/admin/templates" },
  { id: "promotions", label: "Promotions", icon: "megaphone", path: "/admin/promotions" },
  { id: "records", label: "Users & Plays", icon: "users", path: "/admin/users" },
];
