const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy ChessToken ($CHSS)
  const ChessToken = await hre.ethers.getContractFactory("ChessToken");
  const chessToken = await ChessToken.deploy();
  await chessToken.waitForDeployment();
  const tokenAddress = await chessToken.getAddress();
  console.log("ChessToken deployed to:", tokenAddress);

  // Deploy ChessWager contract
  const ChessWager = await hre.ethers.getContractFactory("ChessWager");
  const chessWager = await ChessWager.deploy(tokenAddress);
  await chessWager.waitForDeployment();
  const wagerAddress = await chessWager.getAddress();
  console.log("ChessWager deployed to:", wagerAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
