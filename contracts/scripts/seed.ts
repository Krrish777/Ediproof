import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${network.name}.json`
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `No deployment found for ${network.name}. Run 'npm run deploy:sepolia' first.`
    );
  }
  const { address } = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  console.log(`Seeding contract at ${address} on ${network.name}\n`);

  const [deployer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("EdiproofCertificate", address);

  // The deployer is the owner AND the demo institution for simplicity.
  console.log(`Approving deployer ${deployer.address} as an institution...`);
  const alreadyApproved = await contract.approvedInstitutions(deployer.address);
  if (!alreadyApproved) {
    const tx = await contract.addInstitution(deployer.address);
    await tx.wait();
    console.log(`   ✓ approved`);
  } else {
    console.log(`   (already approved)`);
  }

  // Seed 3 sample certificates
  const STUDENT = deployer.address; // for demo, issue to self
  const samples = [
    {
      name: "Aarav Sharma",
      course: "B.Tech Computer Science",
      institution: "MIT",
      ipfs: "ipfs://bafybeigdyrztseedcert1aarav",
    },
    {
      name: "Priya Patel",
      course: "M.Sc Data Science",
      institution: "Stanford University",
      ipfs: "ipfs://bafybeigdyrztseedcert2priya",
    },
    {
      name: "Rahul Verma",
      course: "B.E. Electronics Engineering",
      institution: "IIT Delhi",
      ipfs: "ipfs://bafybeigdyrztseedcert3rahul",
    },
  ];

  for (const s of samples) {
    console.log(`Issuing cert for ${s.name} (${s.course}) from ${s.institution}...`);
    const tx = await contract.issueCertificate(
      STUDENT,
      s.name,
      s.course,
      s.institution,
      s.ipfs
    );
    const receipt = await tx.wait();
    console.log(`   ✓ tx ${receipt?.hash}`);
  }

  const total = await contract.totalCertificates();
  console.log(`\n✅ Seed complete. Total certificates: ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
