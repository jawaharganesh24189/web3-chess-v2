// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChessToken is ERC20, Ownable {
    constructor() ERC20("Web3 Chess Token", "CHSS") Ownable(msg.sender) {
        // Mint 1,000,000 tokens to the deployer
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    // Allow owner to mint more tokens for faucets/rewards
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
