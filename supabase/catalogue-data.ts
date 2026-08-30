/**
 * The real roleplay catalogue + supplier price book, transcribed verbatim from
 * the supplier sourcing sheet (10 tabs: PP, MX, OMC, HT, BOA, ALLSTAR, DCMC,
 * FIVESTAR, NN, FFORBLUD).
 *
 * Shared by:
 *   - supabase/seed.ts            (full destructive dev seed)
 *   - supabase/import-catalogue.ts (non-destructive upsert — `npm run db:catalogue`)
 *
 * `price` is the member-facing sell price (Harga Jual). Rows a supplier lists
 * with no sell price (ovens, bagging tables, NN tools, Meth set, Morphine) are
 * seeded non-orderable so they show only in the Super Admin supplier view.
 *
 * Oddities are kept exactly as supplied: Ammo 9mm sells below cost in PP/MX/OMC;
 * Baggy sells for 100 at FIVESTAR vs 50 elsewhere (canonical items.price = 50).
 */
import type { ItemCategory, ItemUnit } from "../src/lib/database.types";

export interface SeedItem {
  name: string;
  category: ItemCategory;
  unit: ItemUnit;
  price: number;
  threshold: number;
  orderable?: boolean;
  active?: boolean;
  /** Opening stock booked via a movement (dev seed only; the importer ignores it). */
  opening: number;
}

const WEAPONS: [name: string, price: number, opening: number][] = [
  ["Pistol Kacang", 7000, 20],
  ["Pistol .50", 10000, 15],
  ["Ceramic Pistol", 29000, 10],
  ["Machine Pistol", 29000, 10],
  ["Mini SMG", 33000, 8],
  ["Micro SMG", 33000, 8],
  ["Black Revolver", 95000, 6],
  ["Sawoff SG", 60000, 6],
  ["AKM", 210000, 4],
  ["Virtus", 240000, 4],
  ["Carbine", 280000, 3],
  ["X17", 36000, 8],
  ["Navy", 79000, 5],
  ["Shotgun", 72000, 5],
  ["KVR", 86000, 5],
];

const AMMO: [
  name: string,
  price: number,
  threshold: number,
  opening: number,
][] = [
  ["Ammo 9mm", 3000, 200, 3000],
  ["Ammo 380", 1500, 200, 3000],
  ["Ammo 50", 1500, 200, 2000],
  ["Ammo 5.56mm", 7000, 200, 3000],
  ["Ammo 7.62mm", 7000, 200, 3000],
  ["Ammo Shotgun", 7000, 100, 1500],
  ["Ammo .44 Magnum", 5500, 100, 1000],
  ["Ammo .45 ACP", 5500, 100, 1000],
];

/** [name, buyPrice, sellPrice] — all carried only by FFORBLUD. */
export const ATTACHMENTS: [name: string, buy: number, sell: number][] = [
  ["Grip", 3900, 4500],
  ["Modern Grip 1", 3900, 4500],
  ["Modern Grip 2", 3900, 4500],
  ["Macro Scope", 3900, 4500],
  ["Medium Scope", 3900, 4500],
  ["Holo Scope", 3900, 4500],
  ["Red Dot", 3900, 4500],
  ["Modern Laser", 3900, 4500],
  ["Tactical Flashlight", 3900, 4500],
  ["Modern Flashlight", 3900, 4500],
  ["Extended Pistol Clip", 3900, 4500],
  ["Stock", 4500, 5000],
  ["Extended SMG Clip", 6500, 7000],
  ["Cylinder", 7500, 8000],
  ["Suppressor", 13000, 15000],
  ["Tactical Suppressor", 13000, 15000],
  ["Modern Suppressor Short", 13000, 15000],
  ["Modern Suppressor Long", 13000, 15000],
  ["SMG Drum", 13000, 15000],
  ["Modern Extended Clip 1", 15000, 16000],
  ["Modern Extended Clip 2", 15000, 16000],
  ["Extended Rifle Clip", 19500, 20000],
  ["Modern Extended Drum", 19500, 20000],
  ["Rifle Drum", 26000, 28000],
];

/** Non-orderable procurement stock (ovens, tables, tools, lab output). */
const TOOLS: string[] = [
  "Bagging Table",
  "Oven Opium",
  "Couldron Opium",
  "Meth Oven",
  "Meth Cooking",
  "Lamp",
  "Micro Hack USB",
  "Lockpick",
  "Explosive Mini",
  "Hack USB",
  "Spoofing Card",
  "Signal Booster",
  "Thermite",
  "Explosives",
  "Angle Grinder",
  "Small Drill",
  "Large Drill",
  "Plasma Cutter",
  "C4 Explosives",
  "Green Card",
];

/** 73 unique catalogue items, de-duplicated across every supplier tab. */
export const CATALOGUE_ITEMS: SeedItem[] = [
  ...WEAPONS.map(([name, price, opening]): SeedItem => ({
    name,
    category: "WEAPON",
    unit: "UNIT",
    price,
    threshold: 3,
    opening,
  })),
  ...AMMO.map(([name, price, threshold, opening]): SeedItem => ({
    name,
    category: "AMMO",
    unit: "BOX", // ammo is priced and capped per box, not per round
    price,
    threshold,
    opening,
  })),
  {
    name: "Vest Merah",
    category: "VEST",
    unit: "UNIT",
    price: 1500,
    threshold: 20,
    opening: 80,
  },
  {
    name: "Vest Biru",
    category: "VEST",
    unit: "UNIT",
    price: 4000,
    threshold: 15,
    opening: 60,
  },
  ...ATTACHMENTS.map(([name, , sell]): SeedItem => ({
    name,
    category: "ATTACHMENT",
    unit: "UNIT",
    price: sell,
    threshold: 5,
    opening: 15,
  })),
  {
    name: "Bibit",
    category: "PRODUCT",
    unit: "UNIT",
    price: 900,
    threshold: 50,
    opening: 200,
  },
  {
    name: "Morphine",
    category: "PRODUCT",
    unit: "UNIT",
    price: 0,
    threshold: 0,
    orderable: false,
    active: false,
    opening: 0,
  },
  {
    name: "Meth set",
    category: "PRODUCT",
    unit: "UNIT",
    price: 0,
    threshold: 0,
    orderable: false,
    active: false,
    opening: 0,
  },
  {
    name: "Baggy",
    category: "OTHER",
    unit: "PACK",
    price: 50,
    threshold: 100,
    opening: 500,
  },
  ...TOOLS.map((name): SeedItem => ({
    name,
    category: "TOOL",
    unit: "UNIT",
    price: 0,
    threshold: 0,
    orderable: false,
    active: false,
    opening: 0,
  })),
];

/**
 * The fictional placeholder catalogue that shipped before the real sheet. The
 * importer archives any of these still present (soft delete — kept for old
 * order/production references) so the live catalogue is only the real data.
 */
export const LEGACY_PLACEHOLDER_ITEMS: string[] = [
  "Pistol",
  "Combat Pistol",
  "SMG",
  "Carbine Rifle",
  "Pump Shotgun",
  "Prototype Rifle",
  "Pistol Rounds",
  "SMG Rounds",
  "Rifle Rounds",
  "Shotgun Shells",
  "Light Armor",
  "Heavy Armor",
  "Legacy Vest (discontinued)",
  "Refined Product",
  "Packaged Product",
  "Burner Phone",
  "Lockpick Set",
];

// Tab codes from the sourcing sheet; real names to be set in the admin UI.
export const SUPPLIERS = [
  "PP",
  "MX",
  "OMC",
  "HT",
  "BOA",
  "ALLSTAR",
  "DCMC",
  "FIVESTAR",
  "NN",
  "FFORBLUD",
] as const;

export type SupplierCode = (typeof SUPPLIERS)[number];

/**
 * One row per (supplier, item), exactly as the sheet lists it:
 * [supplierCode, itemName, buyPrice, sellPrice | null, maxQuantity | null].
 * A null sell price marks a procure-only line (not sold on to members).
 */
export type SupplierItemRow = [
  code: SupplierCode,
  item: string,
  buy: number,
  sell: number | null,
  max: number | null,
];

export const SUPPLIER_ITEMS: SupplierItemRow[] = [
  ...(["PP", "MX", "OMC"] as const).flatMap((code): SupplierItemRow[] => [
    [code, "Pistol Kacang", 6500, 7000, 25],
    [code, "Pistol .50", 9100, 10000, 25],
    [code, "Ceramic Pistol", 26000, 29000, 25],
    [code, "Machine Pistol", 26000, 29000, 25],
    [code, "Mini SMG", 29900, 33000, 25],
    [code, "Micro SMG", 29900, 33000, 25],
    [code, "Ammo 9mm", 3900, 3000, 300],
    [code, "Ammo 380", 1300, 1500, 300],
    [code, "Ammo 50", 1300, 1500, 300],
    [code, "Vest Merah", 1300, 1500, 150],
  ]),
  ["HT", "Black Revolver", 91000, 95000, 20],
  ["HT", "Sawoff SG", 52000, 60000, 15],
  ["HT", "AKM", 195000, 210000, 20],
  ["HT", "Virtus", 227500, 240000, 20],
  ["HT", "Carbine", 260000, 280000, 15],
  ["HT", "Ammo 5.56mm", 6500, 7000, 500],
  ["HT", "Ammo 7.62mm", 6500, 7000, 500],
  ["HT", "Vest Biru", 2600, 4000, 250],
  ["BOA", "X17", 32500, 36000, 25],
  ["BOA", "Navy", 71500, 79000, 15],
  ["BOA", "Shotgun", 65000, 72000, 15],
  ["BOA", "KVR", 78000, 86000, 15],
  ["BOA", "Ammo Shotgun", 6500, 7000, 200],
  ["BOA", "Ammo .44 Magnum", 5200, 5500, 300],
  ["BOA", "Ammo .45 ACP", 5200, 5500, 300],
  ["BOA", "Vest Biru", 2600, 4000, 80],
  ["ALLSTAR", "Oven Opium", 35000, null, null],
  ["ALLSTAR", "Couldron Opium", 35000, null, null],
  ["ALLSTAR", "Meth Oven", 35000, null, null],
  ["ALLSTAR", "Meth Cooking", 35000, null, null],
  ["ALLSTAR", "Bagging Table", 30000, null, null],
  ["ALLSTAR", "Baggy", 50, 50, null],
  ["ALLSTAR", "Lamp", 75, null, null],
  ["ALLSTAR", "Meth set", 1125, null, 200],
  ["ALLSTAR", "Morphine", 1050, null, 150],
  ["DCMC", "Bibit", 700, 900, 200],
  ["DCMC", "Baggy", 50, 50, null],
  ["DCMC", "Bagging Table", 30000, null, null],
  ["FIVESTAR", "Bibit", 700, 900, 200],
  ["FIVESTAR", "Baggy", 50, 100, null],
  ["FIVESTAR", "Bagging Table", 30000, null, null],
  ["NN", "Micro Hack USB", 1000, null, null],
  ["NN", "Lockpick", 3000, null, null],
  ["NN", "Explosive Mini", 3500, null, null],
  ["NN", "Hack USB", 7500, null, null],
  ["NN", "Spoofing Card", 7500, null, null],
  ["NN", "Signal Booster", 7500, null, null],
  ["NN", "Thermite", 7500, null, null],
  ["NN", "Explosives", 8000, null, null],
  ["NN", "Angle Grinder", 8000, null, null],
  ["NN", "Small Drill", 9000, null, null],
  ["NN", "Large Drill", 10000, null, null],
  ["NN", "Plasma Cutter", 10000, null, null],
  ["NN", "C4 Explosives", 10000, null, null],
  ["NN", "Green Card", 22000, null, null],
  ...ATTACHMENTS.map(([name, buy, sell]): SupplierItemRow => [
    "FFORBLUD",
    name,
    buy,
    sell,
    25,
  ]),
];
