import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const intersections = [
    { name: "Simpang Ahmad Yani (Dolog)", lat: -7.3204, lng: 112.7314 },
    { name: "Simpang Wonokromo (KBS)", lat: -7.2974, lng: 112.7369 },
    { name: "Simpang Mayjen Sungkono (Ciputra World)", lat: -7.2917, lng: 112.7161 },
    { name: "Simpang Diponegoro (Pasar Kupang)", lat: -7.2831, lng: 112.7310 },
    { name: "Simpang Raya Gubeng (Stasiun Gubeng)", lat: -7.2655, lng: 112.7516 },
    { name: "Simpang Pemuda (Monkasel)", lat: -7.2657, lng: 112.7478 },
    { name: "Simpang Kertajaya (Dharmawangsa)", lat: -7.2736, lng: 112.7592 },
    { name: "Simpang HR Muhammad (Patung Kuda)", lat: -7.2842, lng: 112.6931 },
    { name: "Simpang Darmo (Taman Bungkul)", lat: -7.2916, lng: 112.7381 },
    { name: "Simpang Tunjungan (Gedung Grahadi)", lat: -7.2628, lng: 112.7423 },
    { name: "Simpang Jemursari (Kendangsari)", lat: -7.3197, lng: 112.7460 },
    { name: "Simpang Merr (Kenjeran)", lat: -7.2650, lng: 112.7845 }
  ];

  console.log("Seeding intersections...");
  
  for (const intersection of intersections) {
    await prisma.trafficNode.create({
      data: {
        name: intersection.name,
        lat: intersection.lat,
        lng: intersection.lng,
        currentLevel: Math.floor(Math.random() * 50) + 10,
        predicted30: Math.floor(Math.random() * 50) + 20,
        confidence: 0.8 + Math.random() * 0.15,
        recommendation: null,
      },
    });
  }
  
  console.log("Seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
