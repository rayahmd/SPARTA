const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.trafficNode.count()
  .then(c => console.log('Node count:', c))
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
