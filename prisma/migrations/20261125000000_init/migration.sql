-- MyFlat: migration inicial. Gerada pelo Prisma + regras de integridade em SQL (fim do arquivo).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'CLEANING', 'FINANCE', 'PROPERTY_OWNER');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('AIRBNB', 'BOOKING', 'DECOLAR', 'WHATSAPP', 'DIRECT', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('INQUIRY', 'AWAITING_CONFIRM', 'HOLD', 'CONFIRMED', 'CHECKED_IN', 'IN_STAY', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "OccupancyKind" AS ENUM ('RESERVATION', 'BLOCK', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "BlockReason" AS ENUM ('MAINTENANCE', 'OWNER_USE', 'CLEANING', 'ADMINISTRATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('CLEANING', 'MAINTENANCE', 'PURCHASE', 'RESTOCK', 'CHECK_IN', 'CHECK_OUT', 'DOCUMENTS', 'FINANCE', 'GUEST_SERVICE', 'GUEST_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('INBOX', 'TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'QUICK_CAPTURE', 'AUTOMATION', 'AI', 'WHATSAPP');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PB',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "owner_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_guests" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "beds" INTEGER NOT NULL DEFAULT 1,
    "bathrooms" INTEGER NOT NULL DEFAULT 1,
    "check_in_time" TEXT NOT NULL DEFAULT '14:00',
    "check_out_time" TEXT NOT NULL DEFAULT '11:00',
    "commission_rate" DECIMAL(5,4),
    "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "external_listing_id" TEXT,
    "ical_import_url" TEXT,
    "ical_export_token" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "guest_id" UUID,
    "code" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "external_ref" TEXT,
    "status" "ReservationStatus" NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guest_count" INTEGER NOT NULL DEFAULT 1,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "channel_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hold_expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "kind" "OccupancyKind" NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" "Channel" NOT NULL DEFAULT 'MANUAL',
    "reservation_id" UUID,
    "block_reason" "BlockReason",
    "note" TEXT,
    "channel_listing_id" UUID,
    "external_uid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "occupancy_id" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID,
    "reservation_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "due_date" DATE,
    "assignee_user_id" UUID,
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "owners_organization_id_id_key" ON "owners"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_organization_id_id_key" ON "properties"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "units_organization_id_id_key" ON "units"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "units_organization_id_property_id_code_key" ON "units"("organization_id", "property_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "channel_listings_ical_export_token_key" ON "channel_listings"("ical_export_token");

-- CreateIndex
CREATE UNIQUE INDEX "channel_listings_organization_id_id_key" ON "channel_listings"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_listings_unit_id_channel_key" ON "channel_listings"("unit_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "guests_organization_id_id_key" ON "guests"("organization_id", "id");

-- CreateIndex
CREATE INDEX "reservations_organization_id_unit_id_check_in_idx" ON "reservations"("organization_id", "unit_id", "check_in");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_organization_id_id_key" ON "reservations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_organization_id_code_key" ON "reservations"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "occupancies_reservation_id_key" ON "occupancies"("reservation_id");

-- CreateIndex
CREATE INDEX "occupancies_organization_id_unit_id_check_in_idx" ON "occupancies"("organization_id", "unit_id", "check_in");

-- CreateIndex
CREATE UNIQUE INDEX "occupancies_channel_listing_id_external_uid_key" ON "occupancies"("channel_listing_id", "external_uid");

-- CreateIndex
CREATE INDEX "availability_events_organization_id_unit_id_created_at_idx" ON "availability_events"("organization_id", "unit_id", "created_at");

-- CreateIndex
CREATE INDEX "tasks_organization_id_status_due_date_idx" ON "tasks"("organization_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_entity_id_idx" ON "audit_logs"("organization_id", "entity", "entity_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_property_id_fkey" FOREIGN KEY ("organization_id", "property_id") REFERENCES "properties"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_organization_id_unit_id_fkey" FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_unit_id_fkey" FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_organization_id_unit_id_fkey" FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_channel_listing_id_fkey" FOREIGN KEY ("channel_listing_id") REFERENCES "channel_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_events" ADD CONSTRAINT "availability_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===================== Regras que o Prisma não expressa =====================
-- ADR-0003: duas ocupações ativas da mesma unidade nunca se sobrepõem.
-- Intervalo meio-aberto [check_in, check_out): saída e entrada no mesmo dia não conflitam.
ALTER TABLE "occupancies"
  ADD CONSTRAINT "occupancies_dates_check" CHECK ("check_out" > "check_in"),
  ADD CONSTRAINT "occupancies_no_overlap" EXCLUDE USING gist (
    "organization_id" WITH =,
    "unit_id" WITH =,
    daterange("check_in", "check_out", '[)') WITH &&
  ) WHERE ("is_active");

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_dates_check" CHECK ("check_out" > "check_in"),
  ADD CONSTRAINT "reservations_amounts_check" CHECK ("total_amount" >= 0 AND "channel_fee" >= 0 AND "guest_count" > 0),
  ADD CONSTRAINT "reservations_hold_check" CHECK ("status" <> 'HOLD' OR "hold_expires_at" IS NOT NULL);

ALTER TABLE "units"
  ADD CONSTRAINT "units_commission_check" CHECK ("commission_rate" IS NULL OR ("commission_rate" >= 0 AND "commission_rate" <= 1)),
  ADD CONSTRAINT "units_guests_check" CHECK ("max_guests" > 0);

