// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChessWager is Ownable {
    IERC20 public chessToken;

    enum MatchState { OPEN, ACTIVE, COMPLETED, CANCELLED }

    struct Match {
        address player1;
        address player2;
        uint256 wagerAmount;
        MatchState state;
        address winner;
    }

    mapping(uint256 => Match) public matches;
    uint256 public nextMatchId;

    event MatchCreated(uint256 indexed matchId, address indexed player1, uint256 wagerAmount);
    event MatchJoined(uint256 indexed matchId, address indexed player2);
    event MatchResolved(uint256 indexed matchId, address indexed winner, uint256 payout);
    event MatchDrawn(uint256 indexed matchId, uint256 splitAmount);
    event MatchCancelled(uint256 indexed matchId, address indexed player1);

    constructor(address _tokenAddress) Ownable(msg.sender) {
        chessToken = IERC20(_tokenAddress);
    }

    function createMatch(uint256 wagerAmount) public returns (uint256) {
        require(chessToken.transferFrom(msg.sender, address(this), wagerAmount), "Transfer failed");

        uint256 matchId = nextMatchId++;
        matches[matchId] = Match({
            player1: msg.sender,
            player2: address(0),
            wagerAmount: wagerAmount,
            state: MatchState.OPEN,
            winner: address(0)
        });

        emit MatchCreated(matchId, msg.sender, wagerAmount);
        return matchId;
    }

    function joinMatch(uint256 matchId) public {
        Match storage m = matches[matchId];
        require(m.state == MatchState.OPEN, "Match is not open");
        require(m.player1 != msg.sender, "Cannot join your own match");

        require(chessToken.transferFrom(msg.sender, address(this), m.wagerAmount), "Transfer failed");
        
        m.player2 = msg.sender;
        m.state = MatchState.ACTIVE;

        emit MatchJoined(matchId, msg.sender);
    }

    function cancelMatch(uint256 matchId) public {
        Match storage m = matches[matchId];
        require(m.state == MatchState.OPEN, "Match is not open");
        require(m.player1 == msg.sender || msg.sender == owner(), "Not authorized");

        m.state = MatchState.CANCELLED;
        require(chessToken.transfer(m.player1, m.wagerAmount), "Refund failed");

        emit MatchCancelled(matchId, m.player1);
    }

    // Server-authoritative match resolution
    function resolveMatch(uint256 matchId, address winner) public onlyOwner {
        Match storage m = matches[matchId];
        require(m.state == MatchState.ACTIVE, "Match is not active");
        require(winner == m.player1 || winner == m.player2, "Winner must be a player");

        m.state = MatchState.COMPLETED;
        m.winner = winner;
        uint256 pot = m.wagerAmount * 2;

        require(chessToken.transfer(winner, pot), "Payout failed");
        
        emit MatchResolved(matchId, winner, pot);
    }

    function resolveDraw(uint256 matchId) public onlyOwner {
        Match storage m = matches[matchId];
        require(m.state == MatchState.ACTIVE, "Match is not active");

        m.state = MatchState.COMPLETED;

        // Refund both players their initial wager
        require(chessToken.transfer(m.player1, m.wagerAmount), "Refund P1 failed");
        require(chessToken.transfer(m.player2, m.wagerAmount), "Refund P2 failed");

        emit MatchDrawn(matchId, m.wagerAmount);
    }
}
