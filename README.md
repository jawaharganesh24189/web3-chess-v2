# Web3 Chess V2

Play a local two-player chess match in the browser with **no wallet required**.
The smart-contract wagering logic lives in the `hardhat` folder for future
integration.

## Prerequisites

- Node.js and npm

## Run the game locally (no MetaMask required)

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://localhost:5173` and start playing immediately.

## How to play in the browser

- Drag pieces to move.
- Promotions auto-queen.
- Use **New game**, **Undo move**, and **Flip board** in the side panel.
- The status banner shows whose turn it is, checks, and game-over states.

## Smart contracts (optional)

If you want to explore the on-chain wager contracts, use the Hardhat project:

```bash
cd hardhat
npm install
npm test
```

To run a local chain and deploy:

```bash
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

> Note: The current browser UI uses local chess play only. Wallet integration
> and contract wiring are not yet connected.
