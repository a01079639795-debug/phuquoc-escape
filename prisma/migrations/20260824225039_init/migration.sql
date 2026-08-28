-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('RU', 'EN', 'VI');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'PARTNER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('HOTEL', 'BIKE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('VND', 'USD');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('NIGHT', 'DAY');

-- CreateEnum
CREATE TYPE "AmenityScope" AS ENUM ('HOTEL', 'BIKE', 'ANY');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('AUTOMATIC', 'SEMI_AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('HOTEL', 'BIKE', 'GENERAL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MessengerType" AS ENUM ('NONE', 'TELEGRAM', 'WHATSAPP', 'ZALO', 'VIBER');

-- CreateEnum
CREATE TYPE "RequestSource" AS ENUM ('WEB_LISTING', 'WEB_GENERAL', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'RU',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaTranslation" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AreaTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amenity" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "scope" "AmenityScope" NOT NULL DEFAULT 'ANY',
    "group" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmenityTranslation" (
    "id" UUID NOT NULL,
    "amenityId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AmenityTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" UUID NOT NULL,
    "type" "ListingType" NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" UUID,
    "areaId" UUID,
    "address" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "priceFromAmount" BIGINT,
    "currency" "Currency" NOT NULL DEFAULT 'VND',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingTranslation" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,

    CONSTRAINT "ListingTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelDetails" (
    "listingId" UUID NOT NULL,
    "stars" INTEGER,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "distanceToBeachM" INTEGER,
    "distanceToCenterM" INTEGER,
    "totalRooms" INTEGER,

    CONSTRAINT "HotelDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "BikeDetails" (
    "listingId" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "engineCc" INTEGER,
    "transmission" "Transmission" NOT NULL DEFAULT 'AUTOMATIC',
    "year" INTEGER,
    "depositAmount" BIGINT,
    "depositCurrency" "Currency",
    "helmetsIncluded" INTEGER NOT NULL DEFAULT 2,
    "deliveryIncluded" BOOLEAN NOT NULL DEFAULT false,
    "deliveryFeeAmount" BIGINT,

    CONSTRAINT "BikeDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "ListingUnit" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "code" TEXT,
    "capacity" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceAmount" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'VND',
    "priceUnit" "PriceUnit" NOT NULL,
    "minDuration" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ListingUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingUnitTranslation" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ListingUnitTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingAmenity" (
    "listingId" UUID NOT NULL,
    "amenityId" UUID NOT NULL,

    CONSTRAINT "ListingAmenity_pkey" PRIMARY KEY ("listingId","amenityId")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "blurDataUrl" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" UUID NOT NULL,
    "publicCode" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "listingId" UUID,
    "listingUnitId" UUID,
    "userId" UUID,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactPhoneNormalized" TEXT,
    "contactEmail" TEXT,
    "messenger" "MessengerType" NOT NULL DEFAULT 'NONE',
    "messengerHandle" TEXT,
    "dateFrom" DATE,
    "dateTo" DATE,
    "guests" INTEGER,
    "quantity" INTEGER,
    "comment" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'RU',
    "source" "RequestSource" NOT NULL DEFAULT 'WEB_LISTING',
    "utm" JSONB,
    "assignedToId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestNote" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "UserRole",
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" UUID,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_phoneNormalized_idx" ON "User"("phoneNormalized");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_type_idx" ON "UserToken"("userId", "type");

-- CreateIndex
CREATE INDEX "UserToken_expiresAt_idx" ON "UserToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Area_slug_key" ON "Area"("slug");

-- CreateIndex
CREATE INDEX "Area_isActive_sortOrder_idx" ON "Area"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "AreaTranslation_locale_idx" ON "AreaTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "AreaTranslation_areaId_locale_key" ON "AreaTranslation"("areaId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Amenity_code_key" ON "Amenity"("code");

-- CreateIndex
CREATE INDEX "Amenity_scope_isActive_sortOrder_idx" ON "Amenity"("scope", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "AmenityTranslation_locale_idx" ON "AmenityTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "AmenityTranslation_amenityId_locale_key" ON "AmenityTranslation"("amenityId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");

-- CreateIndex
CREATE INDEX "Listing_type_status_areaId_idx" ON "Listing"("type", "status", "areaId");

-- CreateIndex
CREATE INDEX "Listing_status_priceFromAmount_idx" ON "Listing"("status", "priceFromAmount");

-- CreateIndex
CREATE INDEX "Listing_status_isFeatured_sortOrder_idx" ON "Listing"("status", "isFeatured", "sortOrder");

-- CreateIndex
CREATE INDEX "Listing_ownerId_idx" ON "Listing"("ownerId");

-- CreateIndex
CREATE INDEX "ListingTranslation_locale_title_idx" ON "ListingTranslation"("locale", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ListingTranslation_listingId_locale_key" ON "ListingTranslation"("listingId", "locale");

-- CreateIndex
CREATE INDEX "BikeDetails_brand_model_idx" ON "BikeDetails"("brand", "model");

-- CreateIndex
CREATE INDEX "ListingUnit_listingId_isActive_sortOrder_idx" ON "ListingUnit"("listingId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ListingUnit_listingId_code_key" ON "ListingUnit"("listingId", "code");

-- CreateIndex
CREATE INDEX "ListingUnitTranslation_locale_idx" ON "ListingUnitTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "ListingUnitTranslation_unitId_locale_key" ON "ListingUnitTranslation"("unitId", "locale");

-- CreateIndex
CREATE INDEX "ListingAmenity_amenityId_idx" ON "ListingAmenity"("amenityId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_uploadedById_idx" ON "MediaAsset"("uploadedById");

-- CreateIndex
CREATE INDEX "ListingImage_listingId_sortOrder_idx" ON "ListingImage"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "ListingImage_mediaId_idx" ON "ListingImage"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingImage_listingId_mediaId_key" ON "ListingImage"("listingId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Request_publicCode_key" ON "Request"("publicCode");

-- CreateIndex
CREATE INDEX "Request_status_createdAt_idx" ON "Request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_assignedToId_status_idx" ON "Request"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Request_contactPhoneNormalized_idx" ON "Request"("contactPhoneNormalized");

-- CreateIndex
CREATE INDEX "Request_userId_createdAt_idx" ON "Request"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Request_listingId_createdAt_idx" ON "Request"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Request_createdAt_idx" ON "Request"("createdAt");

-- CreateIndex
CREATE INDEX "RequestNote_requestId_createdAt_idx" ON "RequestNote"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestNote_authorId_idx" ON "RequestNote"("authorId");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_listingId_idx" ON "Favorite"("listingId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaTranslation" ADD CONSTRAINT "AreaTranslation_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmenityTranslation" ADD CONSTRAINT "AmenityTranslation_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingTranslation" ADD CONSTRAINT "ListingTranslation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelDetails" ADD CONSTRAINT "HotelDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BikeDetails" ADD CONSTRAINT "BikeDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingUnit" ADD CONSTRAINT "ListingUnit_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingUnitTranslation" ADD CONSTRAINT "ListingUnitTranslation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ListingUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAmenity" ADD CONSTRAINT "ListingAmenity_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAmenity" ADD CONSTRAINT "ListingAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_listingUnitId_fkey" FOREIGN KEY ("listingUnitId") REFERENCES "ListingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestNote" ADD CONSTRAINT "RequestNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestNote" ADD CONSTRAINT "RequestNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

