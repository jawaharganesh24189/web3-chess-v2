// SPDX-License-Identifier: MIT
// Hardhat test suite for ChessToken and ChessWager
// Uses Ethers.js v6 and Chai

import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse CHSS tokens (18 decimals) */
const tokens = (n) => ethers.parseUnits(String(n), 18);

/** Enum values that mirror the Solidity MatchState enum */
const MatchState = { OPEN: 0n, ACTIVE: 1n, COMPLETED: 2n, CANCELLED: 3n };

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

/**
 * Deploys both contracts and distributes initial tokens to three test accounts.
 * Returns { chessToken, chessWager, owner, player1, player2, stranger }
 */
async function deployFixture() {
  const [owner, player1, player2, stranger] = await ethers.getSigners();

  // Deploy ChessToken
  const ChessToken = await ethers.getContractFactory("ChessToken");
  const chessToken = await ChessToken.deploy();
  await chessToken.waitForDeployment();

  // Deploy ChessWager
  const ChessWager = await ethers.getContractFactory("ChessWager");
  const chessWager = await ChessWager.deploy(await chessToken.getAddress());
  await chessWager.waitForDeployment();

  // Distribute tokens: 10 000 CHSS each to player1, player2, stranger
  const INITIAL = tokens(10_000);
  await chessToken.connect(owner).transfer(player1.address, INITIAL);
  await chessToken.connect(owner).transfer(player2.address, INITIAL);
  await chessToken.connect(owner).transfer(stranger.address, INITIAL);

  return { chessToken, chessWager, owner, player1, player2, stranger };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("ChessToken", function () {
  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------
  describe("Deployment & Setup", function () {
    it("should deploy with the correct name and symbol", async function () {
      const { chessToken } = await deployFixture();
      expect(await chessToken.name()).to.equal("Web3 Chess Token");
      expect(await chessToken.symbol()).to.equal("CHSS");
    });

    it("should mint 1 000 000 tokens to the deployer on construction", async function () {
      const { chessToken, owner } = await deployFixture();
      const deployerBalance = await chessToken.balanceOf(owner.address);
      // Deployer minted 1 000 000 and transferred 30 000 to three players
      expect(deployerBalance).to.equal(tokens(1_000_000 - 30_000));
    });

    it("should set the deployer as owner", async function () {
      const { chessToken, owner } = await deployFixture();
      expect(await chessToken.owner()).to.equal(owner.address);
    });

    it("should distribute tokens to test accounts", async function () {
      const { chessToken, player1, player2, stranger } = await deployFixture();
      expect(await chessToken.balanceOf(player1.address)).to.equal(tokens(10_000));
      expect(await chessToken.balanceOf(player2.address)).to.equal(tokens(10_000));
      expect(await chessToken.balanceOf(stranger.address)).to.equal(tokens(10_000));
    });
  });

  // -------------------------------------------------------------------------
  // Minting
  // -------------------------------------------------------------------------
  describe("mint()", function () {
    it("should allow owner to mint tokens to any address", async function () {
      const { chessToken, owner, stranger } = await deployFixture();
      const mintAmount = tokens(500);
      await chessToken.connect(owner).mint(stranger.address, mintAmount);
      expect(await chessToken.balanceOf(stranger.address)).to.equal(tokens(10_000) + mintAmount);
    });

    it("should revert when a non-owner tries to mint", async function () {
      const { chessToken, player1, stranger } = await deployFixture();
      await expect(
        chessToken.connect(player1).mint(stranger.address, tokens(100))
      ).to.be.revertedWithCustomError(chessToken, "OwnableUnauthorizedAccount");
    });
  });
});

// ---------------------------------------------------------------------------

describe("ChessWager", function () {
  const WAGER = tokens(100);

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------
  describe("Deployment", function () {
    it("should store the token address correctly", async function () {
      const { chessToken, chessWager } = await deployFixture();
      expect(await chessWager.chessToken()).to.equal(await chessToken.getAddress());
    });

    it("should set deployer as owner", async function () {
      const { chessWager, owner } = await deployFixture();
      expect(await chessWager.owner()).to.equal(owner.address);
    });

    it("should start with nextMatchId equal to 0", async function () {
      const { chessWager } = await deployFixture();
      expect(await chessWager.nextMatchId()).to.equal(0n);
    });
  });

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------
  describe("Approvals", function () {
    it("createMatch should revert when no approval is given", async function () {
      const { chessWager, player1 } = await deployFixture();
      await expect(
        chessWager.connect(player1).createMatch(WAGER)
      ).to.revert(ethers);
    });

    it("joinMatch should revert when the joiner has no approval", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      // player1 approves and creates the match
      await chessToken.connect(player1).approve(await chessWager.getAddress(), WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      // player2 has balance but NO approval
      await expect(
        chessWager.connect(player2).joinMatch(0)
      ).to.revert(ethers);
    });

    it("joinMatch should revert when the joiner has insufficient approval", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      await chessToken.connect(player1).approve(await chessWager.getAddress(), WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      // player2 approves only 1 token, which is less than the wager
      await chessToken.connect(player2).approve(await chessWager.getAddress(), tokens(1));
      await expect(
        chessWager.connect(player2).joinMatch(0)
      ).to.revert(ethers);
    });

    it("joinMatch should revert when the joiner has insufficient token balance", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const HUGE_WAGER = tokens(9_000);
      await chessToken.connect(player1).approve(await chessWager.getAddress(), HUGE_WAGER);
      await chessWager.connect(player1).createMatch(HUGE_WAGER);
      // Give player2 less than the wager amount
      await chessToken
        .connect(player2)
        .transfer(player1.address, tokens(9_500)); // drain player2
      await chessToken
        .connect(player2)
        .approve(await chessWager.getAddress(), HUGE_WAGER);
      await expect(
        chessWager.connect(player2).joinMatch(0)
      ).to.revert(ethers);
    });
  });

  // -------------------------------------------------------------------------
  // Happy Path: Win
  // -------------------------------------------------------------------------
  describe("Happy Path – Win (Create → Join → resolveMatch)", function () {
    it("should transfer wager from player1 on createMatch", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);

      const before = await chessToken.balanceOf(player1.address);
      await chessWager.connect(player1).createMatch(WAGER);
      const after = await chessToken.balanceOf(player1.address);

      expect(before - after).to.equal(WAGER);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(WAGER);
    });

    it("should transfer wager from player2 on joinMatch", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      const before = await chessToken.balanceOf(player2.address);
      await chessWager.connect(player2).joinMatch(0);
      const after = await chessToken.balanceOf(player2.address);

      expect(before - after).to.equal(WAGER);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(WAGER * 2n);
    });

    it("should pay the winner 2× the wager on resolveMatch", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      const before = await chessToken.balanceOf(player1.address);
      await chessWager.connect(owner).resolveMatch(0, player1.address);
      const after = await chessToken.balanceOf(player1.address);

      expect(after - before).to.equal(WAGER * 2n);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(0n);
    });

    it("should set match state to COMPLETED after resolveMatch", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveMatch(0, player2.address);

      const m = await chessWager.matches(0);
      expect(m.state).to.equal(MatchState.COMPLETED);
      expect(m.winner).to.equal(player2.address);
    });

    it("should emit MatchResolved with correct args", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      await expect(chessWager.connect(owner).resolveMatch(0, player1.address))
        .to.emit(chessWager, "MatchResolved")
        .withArgs(0n, player1.address, WAGER * 2n);
    });
  });

  // -------------------------------------------------------------------------
  // Happy Path: Draw
  // -------------------------------------------------------------------------
  describe("Happy Path – Draw (Create → Join → resolveDraw)", function () {
    it("should refund both players their original wager on resolveDraw", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      const p1Before = await chessToken.balanceOf(player1.address);
      const p2Before = await chessToken.balanceOf(player2.address);
      await chessWager.connect(owner).resolveDraw(0);
      const p1After = await chessToken.balanceOf(player1.address);
      const p2After = await chessToken.balanceOf(player2.address);

      expect(p1After - p1Before).to.equal(WAGER);
      expect(p2After - p2Before).to.equal(WAGER);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(0n);
    });

    it("should set match state to COMPLETED after resolveDraw", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveDraw(0);

      const m = await chessWager.matches(0);
      expect(m.state).to.equal(MatchState.COMPLETED);
    });

    it("should emit MatchDrawn with the wager amount (split amount per player)", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      await expect(chessWager.connect(owner).resolveDraw(0))
        .to.emit(chessWager, "MatchDrawn")
        .withArgs(0n, WAGER);
    });
  });

  // -------------------------------------------------------------------------
  // Happy Path: Cancel
  // -------------------------------------------------------------------------
  describe("Happy Path – Cancel (Create → cancelMatch)", function () {
    it("should refund player1 on cancelMatch", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      const before = await chessToken.balanceOf(player1.address);
      await chessWager.connect(player1).cancelMatch(0);
      const after = await chessToken.balanceOf(player1.address);

      expect(after - before).to.equal(WAGER);
    });

    it("should set match state to CANCELLED", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessWager.connect(player1).cancelMatch(0);

      const m = await chessWager.matches(0);
      expect(m.state).to.equal(MatchState.CANCELLED);
    });

    it("should allow the owner to cancel an open match on behalf of a player", async function () {
      const { chessToken, chessWager, owner, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      const before = await chessToken.balanceOf(player1.address);
      await chessWager.connect(owner).cancelMatch(0);
      const after = await chessToken.balanceOf(player1.address);

      expect(after - before).to.equal(WAGER);
    });

    it("should emit MatchCancelled with correct args", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      await expect(chessWager.connect(player1).cancelMatch(0))
        .to.emit(chessWager, "MatchCancelled")
        .withArgs(0n, player1.address);
    });
  });

  // -------------------------------------------------------------------------
  // Event Verification
  // -------------------------------------------------------------------------
  describe("Event Verification", function () {
    it("createMatch should emit MatchCreated with matchId, player1, wagerAmount", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);

      await expect(chessWager.connect(player1).createMatch(WAGER))
        .to.emit(chessWager, "MatchCreated")
        .withArgs(0n, player1.address, WAGER);
    });

    it("joinMatch should emit MatchJoined with matchId and player2", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);

      await expect(chessWager.connect(player2).joinMatch(0))
        .to.emit(chessWager, "MatchJoined")
        .withArgs(0n, player2.address);
    });

    it("nextMatchId should increment after each createMatch call", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();

      await chessToken.connect(player1).approve(wagerAddr, WAGER * 2n);
      await chessWager.connect(player1).createMatch(WAGER);
      expect(await chessWager.nextMatchId()).to.equal(1n);

      await chessWager.connect(player1).createMatch(WAGER);
      expect(await chessWager.nextMatchId()).to.equal(2n);
    });
  });

  // -------------------------------------------------------------------------
  // Sad Paths / Edge Cases
  // -------------------------------------------------------------------------
  describe("Edge Cases & Reverts (Sad Paths)", function () {
    // -- joinMatch ----------------------------------------------------------
    it("should revert when joining an ACTIVE match", async function () {
      const { chessToken, chessWager, player1, player2, stranger } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0); // match is now ACTIVE

      await chessToken.connect(stranger).approve(wagerAddr, WAGER);
      await expect(
        chessWager.connect(stranger).joinMatch(0)
      ).to.be.revertedWith("Match is not open");
    });

    it("should revert when joining a COMPLETED match", async function () {
      const { chessToken, chessWager, owner, player1, player2, stranger } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveMatch(0, player1.address);

      await chessToken.connect(stranger).approve(wagerAddr, WAGER);
      await expect(
        chessWager.connect(stranger).joinMatch(0)
      ).to.be.revertedWith("Match is not open");
    });

    it("should revert when joining a CANCELLED match", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessWager.connect(player1).cancelMatch(0);

      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await expect(
        chessWager.connect(player2).joinMatch(0)
      ).to.be.revertedWith("Match is not open");
    });

    it("should revert when a player tries to join their own match", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER * 2n);
      await chessWager.connect(player1).createMatch(WAGER);

      await expect(
        chessWager.connect(player1).joinMatch(0)
      ).to.be.revertedWith("Cannot join your own match");
    });

    // -- resolveMatch -------------------------------------------------------
    it("should revert when a non-owner calls resolveMatch", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      await expect(
        chessWager.connect(player1).resolveMatch(0, player1.address)
      ).to.be.revertedWithCustomError(chessWager, "OwnableUnauthorizedAccount");
    });

    it("should revert resolveMatch on an OPEN (not yet joined) match", async function () {
      const { chessToken, chessWager, owner, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      await expect(
        chessWager.connect(owner).resolveMatch(0, player1.address)
      ).to.be.revertedWith("Match is not active");
    });

    it("should revert resolveMatch on a COMPLETED match", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveMatch(0, player1.address);

      await expect(
        chessWager.connect(owner).resolveMatch(0, player2.address)
      ).to.be.revertedWith("Match is not active");
    });

    it("should revert resolveMatch when winner is not a player in the match", async function () {
      const { chessToken, chessWager, owner, player1, player2, stranger } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      await expect(
        chessWager.connect(owner).resolveMatch(0, stranger.address)
      ).to.be.revertedWith("Winner must be a player");
    });

    // -- resolveDraw --------------------------------------------------------
    it("should revert when a non-owner calls resolveDraw", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      await expect(
        chessWager.connect(player2).resolveDraw(0)
      ).to.be.revertedWithCustomError(chessWager, "OwnableUnauthorizedAccount");
    });

    it("should revert resolveDraw on an OPEN (not yet joined) match", async function () {
      const { chessToken, chessWager, owner, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      await expect(
        chessWager.connect(owner).resolveDraw(0)
      ).to.be.revertedWith("Match is not active");
    });

    it("should revert resolveDraw on a COMPLETED match", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveDraw(0);

      await expect(
        chessWager.connect(owner).resolveDraw(0)
      ).to.be.revertedWith("Match is not active");
    });

    // -- cancelMatch --------------------------------------------------------
    it("should revert when an unauthorized address cancels a match", async function () {
      const { chessToken, chessWager, player1, stranger } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);

      await expect(
        chessWager.connect(stranger).cancelMatch(0)
      ).to.be.revertedWith("Not authorized");
    });

    it("should revert cancelMatch on an ACTIVE match", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      await expect(
        chessWager.connect(player1).cancelMatch(0)
      ).to.be.revertedWith("Match is not open");
    });

    it("should revert cancelMatch on an already CANCELLED match", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessWager.connect(player1).cancelMatch(0);

      await expect(
        chessWager.connect(player1).cancelMatch(0)
      ).to.be.revertedWith("Match is not open");
    });

    // -- Multiple matches ---------------------------------------------------
    it("should correctly manage multiple concurrent matches with independent IDs", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();

      // player1 creates two separate matches
      await chessToken.connect(player1).approve(wagerAddr, WAGER * 3n);
      await chessWager.connect(player1).createMatch(WAGER);        // matchId = 0
      await chessWager.connect(player1).createMatch(WAGER * 2n);   // matchId = 1

      // player2 joins match 1 (the 200-token match)
      await chessToken.connect(player2).approve(wagerAddr, WAGER * 2n);
      await chessWager.connect(player2).joinMatch(1);

      const m0 = await chessWager.matches(0);
      const m1 = await chessWager.matches(1);

      expect(m0.state).to.equal(MatchState.OPEN);
      expect(m1.state).to.equal(MatchState.ACTIVE);
      expect(m1.wagerAmount).to.equal(WAGER * 2n);

      // Resolve match 1 and check balance
      const beforeWin = await chessToken.balanceOf(player2.address);
      await chessWager.connect(owner).resolveMatch(1, player2.address);
      const afterWin = await chessToken.balanceOf(player2.address);
      expect(afterWin - beforeWin).to.equal(WAGER * 4n); // 2 × 200 tokens
    });

    // -- Zero-wager edge case -----------------------------------------------
    it("should allow creating a match with a zero wager (edge case)", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, 0n);

      // 0-token transferFrom succeeds on standard ERC20; no revert expected
      await expect(chessWager.connect(player1).createMatch(0n)).not.to.revert(ethers);
    });
  });

  // -------------------------------------------------------------------------
  // State Machine Completeness
  // -------------------------------------------------------------------------
  describe("State Machine Completeness", function () {
    it("OPEN → ACTIVE transition should set player2 correctly", async function () {
      const { chessToken, chessWager, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);

      const m = await chessWager.matches(0);
      expect(m.player2).to.equal(player2.address);
      expect(m.state).to.equal(MatchState.ACTIVE);
    });

    it("OPEN → CANCELLED: wager contract balance should be 0 after cancel", async function () {
      const { chessToken, chessWager, player1 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessWager.connect(player1).cancelMatch(0);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(0n);
    });

    it("ACTIVE → COMPLETED (win): wager contract balance should be 0 after payout", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveMatch(0, player1.address);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(0n);
    });

    it("ACTIVE → COMPLETED (draw): wager contract balance should be 0 after draw", async function () {
      const { chessToken, chessWager, owner, player1, player2 } = await deployFixture();
      const wagerAddr = await chessWager.getAddress();
      await chessToken.connect(player1).approve(wagerAddr, WAGER);
      await chessWager.connect(player1).createMatch(WAGER);
      await chessToken.connect(player2).approve(wagerAddr, WAGER);
      await chessWager.connect(player2).joinMatch(0);
      await chessWager.connect(owner).resolveDraw(0);
      expect(await chessToken.balanceOf(wagerAddr)).to.equal(0n);
    });
  });
});
