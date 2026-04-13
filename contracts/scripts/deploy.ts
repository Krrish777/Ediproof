import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying EdiproofCertificate to ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  const Factory = await ethers.getContractFactory("EdiproofCertificate");
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ EdiproofCertificate deployed at: ${address}`);
  console.log(`   tx: ${contract.deploymentTransaction()?.hash}`);

  // Persist deployment info for the frontend + scripts
  const out = {
    network: network.name,
    address,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    txHash: contract.deploymentTransaction()?.hash ?? null,
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${network.name}.json`),
    JSON.stringify(out, null, 2)
  );

  // Export ABI to frontend
  const artifact = require("../artifacts/contracts/EdiproofCertificate.sol/EdiproofCertificate.json");
  const frontendAbiDir = path.join(__dirname, "..", "..", "frontend", "src", "lib");
  try {
    fs.mkdirSync(frontendAbiDir, { recursive: true });
    fs.writeFileSync(
      path.join(frontendAbiDir, "EdiproofCertificate.abi.json"),
      JSON.stringify(artifact.abi, null, 2)
    );
    fs.writeFileSync(
      path.join(frontendAbiDir, "deployment.json"),
      JSON.stringify({ address, network: network.name }, null, 2)
    );
    console.log(`   ABI + address exported to frontend/src/lib/`);
  } catch (e) {
    console.warn(`   Could not export to frontend (safe to ignore if frontend not scaffolded yet):`, e);
  }

  console.log("\nNext steps:");
  console.log(`  1. npx hardhat verify --network sepolia ${address} ${deployer.address}`);
  console.log(`  2. Add VITE_CONTRACT_ADDRESS=${address} to frontend/.env.local`);
  console.log(`  3. Run: npm run seed:sepolia`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
