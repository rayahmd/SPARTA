import prisma from '../db';

const INCIDENT_TYPES = ['kecelakaan', 'banjir', 'jalan_ditutup', 'event', 'hambatan'];

export async function maybeGenerateIncident() {
  const prob = Math.random();
  if (prob < 0.05) { // 5% chance
    // Get a random node
    const nodes = await prisma.trafficNode.findMany();
    if (nodes.length > 0) {
      const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
      const type = INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)];
      
      // expire in 1-3 hours
      const durationHours = 1 + Math.random() * 2;
      const expiresAt = new Date(Date.now() + durationHours * 3600000);

      await prisma.incident.create({
        data: {
          type,
          lat: randomNode.lat + (Math.random() * 0.002 - 0.001),
          lng: randomNode.lng + (Math.random() * 0.002 - 0.001),
          description: `Insiden ${type} terdeteksi di dekat ${randomNode.name}`,
          source: 'system',
          status: 'active',
          expiresAt
        }
      });
    }
  }

  // Auto-resolve expired incidents
  await prisma.incident.updateMany({
    where: {
      status: 'active',
      expiresAt: {
        lt: new Date()
      }
    },
    data: {
      status: 'resolved'
    }
  });
}
