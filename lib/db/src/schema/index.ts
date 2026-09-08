import { pgTable, text, integer, boolean, real, timestamp, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["viewer", "editor", "admin"]);
export const partStatusEnum = pgEnum("part_status", ["pending", "in-progress", "done"]);
export const productionLineEnum = pgEnum("production_line", ["L1", "L2", "L3"]);
export const auditActionEnum = pgEnum("audit_action", [
  "Creazione", "Modifica", "Modifica Data", "Cambio Priorità", "Cancellazione", "Cambio Stato"
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:           text("id").primaryKey(),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName:  text("display_name").notNull(),
  role:         userRoleEnum("role").notNull().default("viewer"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const selectUserSchema = createSelectSchema(users).omit({ passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, "passwordHash">;

// ─── Employees ───────────────────────────────────────────────────────────────

export const employees = pgTable("employees", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  skills:    text("skills").array().notNull().default([]),
  email:     text("email"),
  phone:     text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// ─── Catalog Phases ──────────────────────────────────────────────────────────

export const catalogPhases = pgTable("catalog_phases", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  skill:        text("skill").notNull(),
  hoursPerUnit: real("hours_per_unit").notNull(),
  unit:         text("unit").notNull().default("pz"),
  description:  text("description"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export const insertCatalogPhaseSchema = createInsertSchema(catalogPhases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCatalogPhase = z.infer<typeof insertCatalogPhaseSchema>;
export type CatalogPhase = typeof catalogPhases.$inferSelect;

// ─── Catalog Products ─────────────────────────────────────────────────────────

export const catalogProducts = pgTable("catalog_products", {
  id:          text("id").primaryKey(),
  code:        text("code").notNull().unique(),
  name:        text("name").notNull(),
  description: text("description"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

export const insertCatalogProductSchema = createInsertSchema(catalogProducts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCatalogProduct = z.infer<typeof insertCatalogProductSchema>;
export type CatalogProduct = typeof catalogProducts.$inferSelect;

// ─── Catalog Product ↔ Phase join ─────────────────────────────────────────────

export const catalogProductPhases = pgTable("catalog_product_phases", {
  productId: text("product_id").notNull().references(() => catalogProducts.id, { onDelete: "cascade" }),
  phaseId:   text("phase_id").notNull().references(() => catalogPhases.id, { onDelete: "cascade" }),
  position:  integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.productId, t.phaseId] })]);

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orders = pgTable("orders", {
  id:          text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  name:        text("name").notNull(),
  startDate:   text("start_date").notNull(), // YYYY-MM-DD
  color:       text("color").notNull().default("#3b82f6"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ─── Lots ────────────────────────────────────────────────────────────────────

export const lots = pgTable("lots", {
  id:       text("id").primaryKey(),
  orderId:  text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  name:     text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const insertLotSchema = createInsertSchema(lots).omit({ id: true });
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Lot = typeof lots.$inferSelect;

// ─── Parts (Fasi di Lavorazione) ─────────────────────────────────────────────

export const parts = pgTable("parts", {
  id:               text("id").primaryKey(),
  lotId:            text("lot_id").notNull().references(() => lots.id, { onDelete: "cascade" }),
  name:             text("name").notNull(),
  estimatedHours:   integer("estimated_hours").notNull().default(8),
  requiredSkill:    text("required_skill").notNull(),
  line:             productionLineEnum("line").notNull().default("L1"),
  status:           partStatusEnum("status").notNull().default("pending"),
  quantity:         integer("quantity").default(1),
  adjustment:       integer("adjustment").default(0), // % adjustment
  manualStartDate:  text("manual_start_date"),
  catalogPhaseId:   text("catalog_phase_id").references(() => catalogPhases.id, { onDelete: "set null" }),
  catalogProductId: text("catalog_product_id").references(() => catalogProducts.id, { onDelete: "set null" }),
  position:         integer("position").notNull().default(0),
});

export const insertPartSchema = createInsertSchema(parts).omit({ id: true });
export type InsertPart = z.infer<typeof insertPartSchema>;
export type Part = typeof parts.$inferSelect;

// ─── Part ↔ Employee assignment ───────────────────────────────────────────────

export const partEmployees = pgTable("part_employees", {
  partId:     text("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.partId, t.employeeId] })]);

// ─── Holidays ────────────────────────────────────────────────────────────────

export const holidays = pgTable("holidays", {
  id:        text("id").primaryKey(),
  date:      text("date").notNull(), // YYYY-MM-DD
  name:      text("name").notNull(),
  recurring: boolean("recurring").notNull().default(false),
});

export const insertHolidaySchema = createInsertSchema(holidays).omit({ id: true });
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidays.$inferSelect;

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id:         text("id").primaryKey(),
  timestamp:  timestamp("timestamp").defaultNow().notNull(),
  userId:     text("user_id").references(() => users.id, { onDelete: "set null" }),
  username:   text("username").notNull(),
  refId:      text("ref_id").notNull(),
  actionType: text("action_type").notNull(),
  prevValue:  text("prev_value").notNull().default(""),
  newValue:   text("new_value").notNull(),
  notes:      text("notes"),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ─── App Settings ─────────────────────────────────────────────────────────────

export const appSettings = pgTable("app_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const ordersRelations = relations(orders, ({ many }) => ({
  lots: many(lots),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  order: one(orders, { fields: [lots.orderId], references: [orders.id] }),
  parts: many(parts),
}));

export const partsRelations = relations(parts, ({ one, many }) => ({
  lot:              one(lots, { fields: [parts.lotId], references: [lots.id] }),
  catalogPhase:     one(catalogPhases, { fields: [parts.catalogPhaseId], references: [catalogPhases.id] }),
  catalogProduct:   one(catalogProducts, { fields: [parts.catalogProductId], references: [catalogProducts.id] }),
  partEmployees:    many(partEmployees),
}));

export const partEmployeesRelations = relations(partEmployees, ({ one }) => ({
  part:     one(parts, { fields: [partEmployees.partId], references: [parts.id] }),
  employee: one(employees, { fields: [partEmployees.employeeId], references: [employees.id] }),
}));

export const catalogProductsRelations = relations(catalogProducts, ({ many }) => ({
  productPhases: many(catalogProductPhases),
}));

export const catalogPhasesRelations = relations(catalogPhases, ({ many }) => ({
  productPhases: many(catalogProductPhases),
}));

export const catalogProductPhasesRelations = relations(catalogProductPhases, ({ one }) => ({
  product: one(catalogProducts, { fields: [catalogProductPhases.productId], references: [catalogProducts.id] }),
  phase:   one(catalogPhases,   { fields: [catalogProductPhases.phaseId],   references: [catalogPhases.id] }),
}));