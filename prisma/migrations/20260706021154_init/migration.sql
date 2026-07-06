-- CreateTable
CREATE TABLE "TrafficNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "currentLevel" REAL NOT NULL DEFAULT 0,
    "predicted30" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 1,
    "recommendation" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "EmergencyVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "originLat" REAL NOT NULL,
    "originLng" REAL NOT NULL,
    "destLat" REAL NOT NULL,
    "destLng" REAL NOT NULL,
    "progress" REAL NOT NULL DEFAULT 0,
    "etaMinutes" REAL NOT NULL DEFAULT 0,
    "distanceKm" REAL NOT NULL DEFAULT 0,
    "greenWaveOn" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'enroute',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SimulationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL
);
