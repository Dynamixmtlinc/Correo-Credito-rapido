import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando seed...");

  // Escuelas / Edificios
  const escuelas = [
    { nombre: "École primaire Barthélemy-Vimont", codigo: "BV" },
    { nombre: "École primaire Champlain", codigo: "CH" },
    { nombre: "École secondaire Édouard-Montpetit", codigo: "EM" },
    { nombre: "École secondaire Jean-de-Brébeuf", codigo: "JB" },
    { nombre: "École primaire Laurier", codigo: "LA" },
    { nombre: "École primaire Mont-Royal", codigo: "MR" },
    { nombre: "Centre administratif CSDM", codigo: "CA" },
    { nombre: "École primaire Notre-Dame-des-Neiges", codigo: "NN" },
    { nombre: "École secondaire Paul-Gérin-Lajoie", codigo: "PG" },
    { nombre: "École primaire Saint-Gérard", codigo: "SG" },
  ];

  for (const ecole of escuelas) {
    await prisma.ecole.upsert({
      where: { codigo: ecole.codigo },
      update: {},
      create: ecole,
    });
  }
  console.log(`✓ ${escuelas.length} écoles creadas`);

  // Proveedores
  const proveedores = [
    { nombre: "Construction Dubois Inc.", homologue: true },
    { nombre: "Électricité Morin & Fils", homologue: true },
    { nombre: "Plomberie Express MTRL", homologue: false },
    { nombre: "Services Informatiques Nexus", homologue: true },
    { nombre: "Entretien Ménager ProNord", homologue: false },
    { nombre: "Ventilation Clima-Tech", homologue: true },
    { nombre: "Peinture Professionnelle Leblanc", homologue: false },
    { nombre: "Fournitures Scolaires Montréal", homologue: true },
    { nombre: "Sécurité Sentinel Québec", homologue: true },
    { nombre: "Transport Rapide CSDM", homologue: false },
  ];

  for (const prov of proveedores) {
    await prisma.fournisseur.create({ data: prov }).catch(() => {});
  }
  console.log(`✓ ${proveedores.length} fournisseurs creados`);

  // Bureaux
  const bureaux = [
    { nombre: "Bureau Central", email: "bureau.central@csdm.qc.ca" },
    { nombre: "Bureau Nord", email: "bureau.nord@csdm.qc.ca" },
    { nombre: "Bureau Sud", email: "bureau.sud@csdm.qc.ca" },
    { nombre: "Bureau Est", email: "bureau.est@csdm.qc.ca" },
    { nombre: "Bureau Ouest", email: "bureau.ouest@csdm.qc.ca" },
  ];

  for (const bureau of bureaux) {
    await prisma.bureau.upsert({
      where: { email: bureau.email },
      update: {},
      create: bureau,
    });
  }
  console.log(`✓ ${bureaux.length} bureaux creados`);

  // Versión
  await prisma.version.create({
    data: { version: "1.0.0", notas: "Versión inicial — migración desde Power Apps" },
  });
  console.log("✓ Versión inicial creada");

  console.log("Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
