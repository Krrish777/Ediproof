# Credentials checklist (give these to Claude)

Fill these in and paste them back so I can wire up the env files and test deployment.

## 1. Alchemy (Sepolia RPC)
- [ ] Create free account: https://dashboard.alchemy.com
- [ ] Create new app → Chain: Ethereum, Network: Sepolia
- [ ] Copy the "HTTPS" URL from the app's dashboard

```
ALCHEMY_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/_____________
```

## 2. MetaMask wallets
- [ ] Create 2 accounts in MetaMask: "Institution" and "Student"
- [ ] Export the private key of the Institution account
      (⚠️ only for a throwaway testnet wallet — never share mainnet keys)
- [ ] Switch MetaMask to the Sepolia network

```
DEPLOYER_PRIVATE_KEY=0x_____________________________________________
INSTITUTION_ADDRESS=0x_____________________________________________
STUDENT_ADDRESS=0x_________________________________________________
```

## 3. Sepolia ETH (free test money)
- [ ] Paste the Institution address into the Alchemy faucet:
      https://www.alchemy.com/faucets/ethereum-sepolia
- [ ] Wait for the drip (~30 seconds, gives 0.1 Sepolia ETH)
- [ ] Also drip to the Student address if you want it to sign anything

## 4. Pinata (IPFS storage)
- [ ] Create free account: https://app.pinata.cloud
- [ ] Go to "API Keys" → "New Key" → enable "pinFileToIPFS" scope
- [ ] Copy the **JWT** (not the API Key / Secret — we need the JWT)
- [ ] (Optional) Grab your dedicated gateway URL from the Gateway tab

```
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9._______________
PINATA_GATEWAY=https://__________.mypinata.cloud
```

## 5. Etherscan (contract verification)
- [ ] Create free account: https://etherscan.io/register
- [ ] Go to API Keys → Add → copy the key

```
ETHERSCAN_API_KEY=___________________________________________
```

---

Once you paste these back, I will:
1. Write them into `contracts/.env.local` and `backend/.env.local`
2. Run `npm install` in both folders
3. Compile + test the contract on Hardhat local
4. Deploy to Sepolia + verify on Etherscan
5. Seed 3 demo certificates
6. Start the backend and smoke test the upload endpoint
