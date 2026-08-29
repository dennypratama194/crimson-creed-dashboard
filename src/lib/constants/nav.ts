import type { Route } from "next";
import {
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Package,
  Radio,
  ScrollText,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { AppRole } from "@/lib/constants/enums";

export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  /** Match child routes too (e.g. /orders/new highlights "Orders"). */
  matchPrefix?: boolean;
};

export type NavSection = { heading?: string; items: NavItem[] };

const MEMBER_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Orders",
        href: "/orders",
        icon: ShoppingCart,
        matchPrefix: true,
      },
      {
        label: "Production",
        href: "/production",
        icon: FlaskConical,
        matchPrefix: true,
      },
    ],
  },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ShoppingCart,
        matchPrefix: true,
      },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: Boxes,
        matchPrefix: true,
      },
    ],
  },
  {
    heading: "Production",
    items: [
      {
        label: "Review queue",
        href: "/admin/production/logs",
        icon: ClipboardCheck,
        matchPrefix: true,
      },
      {
        label: "Pay rates",
        href: "/admin/production/rates",
        icon: FlaskConical,
      },
      {
        label: "Payroll",
        href: "/admin/payroll",
        icon: Wallet,
        matchPrefix: true,
      },
    ],
  },
  {
    heading: "Manage",
    items: [
      {
        label: "Members",
        href: "/admin/members",
        icon: Users,
        matchPrefix: true,
      },
      {
        label: "Items",
        href: "/admin/items",
        icon: Package,
        matchPrefix: true,
      },
    ],
  },
  {
    heading: "History",
    items: [
      { label: "Activity", href: "/admin/activity", icon: ClipboardList },
      { label: "Audit log", href: "/admin/audit", icon: ScrollText },
    ],
  },
  {
    heading: "Live",
    items: [{ label: "FiveM server", href: "/admin/fivem", icon: Radio }],
  },
];

export function navFor(role: AppRole): NavSection[] {
  return role === "SUPER_ADMIN" ? ADMIN_SECTIONS : MEMBER_SECTIONS;
}
