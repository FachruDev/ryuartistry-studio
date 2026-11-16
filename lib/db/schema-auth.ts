/** Dashboard operators. Credentials live here (hashed), never in environment variables. */
import { boolean, integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["superadmin", "operator"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stored lowercase; login is case-insensitive on the username. */
  username: text("username").notNull().unique(),
  /** "scrypt$N$r$p$saltB64$hashB64" — see lib/auth/password.ts. */
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("operator"),
  active: boolean("active").notNull().default(true),
  /** Set for seeded/reset passwords; the dashboard nags until it is changed. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  /** Bumped on password change; sessions carrying an older version stop working. */
  sessionVersion: integer("session_version").notNull().default(1),
  failedLogins: smallint("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
