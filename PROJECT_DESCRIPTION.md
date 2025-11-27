# Project Description

**Deployed Frontend URL:** [voidroot_escrow.vercel.app]

**Solana Program ID:** `B8zkr7q9e5vJxmGdFTbMzY91e48qnucsPArvsVp3GjLJ`

## Project Overview

### Description
This is a **Trustless Token Escrow & Trading Platform** built on Solana blockchain. The dApp enables peer-to-peer token trading without requiring trust between parties. Users can create secure trade offers by locking their tokens in an on-chain escrow account, and other users can atomically exchange tokens according to the offer terms. The entire process is trustless, permissionless, and secured by Solana's runtime.

The escrow mechanism uses **Program Derived Addresses (PDAs)** to ensure that locked tokens cannot be accessed by anyone except through the smart contract's logic. This guarantees that tokens are either exchanged fairly or returned to the original owner if the trade is cancelled.

### Key Features

- **Create Trade Offers:** Lock your tokens in escrow and specify what tokens you want in return
- **Accept Trades:** Browse and accept trade offers with atomic token swaps
- **Cancel & Refund:** Cancel your offers anytime and get your tokens back safely
- **Trustless Design:** No intermediaries or custodians - smart contracts handle everything
- **User-Friendly Interface:** Clean, intuitive UI with token selector dropdowns and real-time status updates
- **Multi-Wallet Support:** Compatible with Phantom and Solflare wallets
- **Devnet Testing:** Fully functional on Solana Devnet with test tokens
  
### How to Use the dApp

1. **Connect Wallet:** Click the wallet button in the top-right corner and connect your Phantom or Solflare wallet (Devnet)

2. **Create a Trade Offer:**
   - Go to the "Create Offer" tab
   - Select the token you want to SEND and enter the amount
   - Select the token you want to RECEIVE and enter the amount
   - Click "Create Trade Offer" and approve the transaction
   - Copy the Seed number from the success card to share with potential traders

3. **Accept a Trade:**
   - Go to the "Accept Trade" tab
   - Enter the initializer's wallet address (person who created the offer)
   - Enter the seed number they shared with you
   - Enter both token mint addresses (what they're offering and what they want)
   - Click "Accept Trade" to complete the atomic swap

4. **Cancel & Refund:**
   - Go to the "Cancel & Refund" tab
   - Enter your seed number from when you created the offer
   - Enter the token mint address you locked
   - Click "Cancel & Refund" to get your tokens back

## Program Architecture

The escrow program follows a secure, trustless architecture using Solana's Account model and PDA (Program Derived Address) design pattern. The core flow involves three main operations: initializing escrow, exchanging tokens, and cancelling escrow.

### PDA Usage

PDAs are critical to this escrow design as they allow the program to "own" and control accounts without requiring private keys. This ensures that locked tokens are inaccessible to anyone (including the program deployer) except through the program's instruction logic.

**PDAs Used:**

1. **Escrow PDA** - Stores the escrow state and metadata
   - **Seeds:** `["escrow", initializer_pubkey, seed_u64]`
   - **Purpose:** Holds information about the trade offer including token amounts, participants, and completion status
   - **Why:** Using the initializer's pubkey and a unique seed ensures each user can have multiple concurrent escrow offers without conflicts

2. **Vault PDA** - Token account that holds the locked tokens
   - **Seeds:** `["vault", escrow_pda]`
   - **Purpose:** Secure custody of the initializer's tokens until trade completion or cancellation
   - **Why:** Derived from the escrow PDA to create a unique vault for each trade offer. The program has authority over this account.

### Program Instructions

**Instructions Implemented:**

1. **`initialize_escrow`** - Creates a new trade offer
   - Creates the escrow PDA account with trade parameters
   - Creates the vault token account (PDA)
   - Transfers the initializer's tokens to the vault
   - Stores: initializer pubkey, token accounts, amounts, seed, timestamp
   - **Security:** Only the initializer can create escrow with their tokens

2. **`exchange`** - Completes the atomic token swap
   - Transfers tokens from taker to initializer (what initializer requested)
   - Transfers tokens from vault to taker (what initializer offered)
   - Marks escrow as completed to prevent double-spending
   - Closes vault and escrow accounts, returning rent to initializer
   - **Security:** Atomic transaction ensures both transfers succeed or both fail

3. **`cancel_escrow`** - Cancels offer and refunds tokens
   - Verifies the caller is the original initializer
   - Transfers tokens from vault back to initializer
   - Closes vault and escrow accounts, returning rent to initializer
   - **Security:** Only the initializer can cancel their own offers

### Account Structure

```rust
#[account]
pub struct Escrow {
    pub initializer: Pubkey,              // Creator of the escrow offer (32 bytes)
    pub initializer_token_account: Pubkey, // Where initializer receives taker's tokens (32 bytes)
    pub initializer_amount: u64,          // Amount initializer is offering (8 bytes)
    pub taker_amount: u64,                // Amount initializer wants in return (8 bytes)
    pub seed: u64,                        // Unique identifier for this escrow (8 bytes)
    pub is_completed: bool,               // Prevents double-spending (1 byte)
    pub timestamp: i64,                   // When the escrow was created (8 bytes)
    // Total: 98 bytes (+ 8 bytes discriminator = 106 bytes on-chain)
}
```

**Field Explanations:**
- `initializer`: The wallet address that created and funded this escrow
- `initializer_token_account`: Where the initializer will receive the taker's tokens
- `initializer_amount`: How many tokens the initializer locked in the vault
- `taker_amount`: How many tokens the initializer expects from the taker
- `seed`: A unique number (timestamp-based) to allow multiple escrows per user
- `is_completed`: Flag to prevent accepting/cancelling already-completed trades
- `timestamp`: Unix timestamp for tracking and potential expiration logic

## Testing

### Test Coverage

The project includes **6 comprehensive tests** covering both happy path (successful operations) and unhappy path (error handling) scenarios. All tests pass successfully and validate the program's security and correctness.

**Happy Path Tests:**

1. **Initialize Escrow Successfully**
   - Creates a new escrow account and vault PDA
   - Transfers tokens from initializer to vault
   - Verifies escrow state is properly initialized with correct amounts and addresses
   - Confirms vault token account has the expected balance

2. **Exchange Tokens Successfully**
   - Taker provides their tokens and receives initializer's tokens from vault
   - Initializer receives taker's tokens
   - Atomic swap ensures both transfers complete successfully
   - Verifies escrow is marked as completed
   - Confirms vault and escrow accounts are closed and rent is returned

3. **Cancel Escrow Successfully**
   - Initializer cancels their own escrow offer
   - Tokens are returned from vault to initializer
   - Vault and escrow accounts are closed properly
   - Rent is refunded to the initializer

**Unhappy Path Tests:**

1. **Cannot Cancel Someone Else's Escrow**
   - Tests that only the original initializer can cancel an escrow
   - Verifies proper authorization checks
   - Different user attempting to cancel should fail with error

2. **Cannot Exchange with Completed Escrow**
   - Tests double-spending prevention
   - After a successful exchange, attempting another exchange should fail
   - Verifies the `is_completed` flag works correctly

3. **Cannot Exchange with Wrong Amounts**
   - Tests that taker must provide exact amount requested
   - Protects initializer from receiving less than expected
   - Verifies amount validation in the exchange instruction

### Running Tests

```bash
# Navigate to the Anchor project directory
cd anchor_project/escrow_dapp

# Run all tests (requires Solana test validator)
anchor test

# Run tests with detailed logs
anchor test -- --nocapture
```

### Test Tokens

For Devnet testing, two SPL tokens have been created:

- **Token A (ERA):** `ErSoqSh6ScLySdaYdkDL4zZqSFjuEQoQWM9g72TNyDo3`
- **Token B (TKB):** `UajyG2a5UKYfjNQKovSKrynQW9pgEgZgf3MBC93Nf8M`

These tokens can be used to test the full escrow flow on Devnet without spending real SOL.

### Additional Notes for Evaluators

**Design Decisions:**

1. **Seed-based Escrow IDs:** Using a seed (timestamp) allows users to create multiple concurrent escrow offers without conflicts. This is more flexible than single-escrow-per-user designs.

2. **PDA Vault Pattern:** The vault PDA ensures tokens are held by the program itself, not by any user or admin. This eliminates counterparty risk and makes the escrow truly trustless.

3. **Atomic Swaps:** The exchange instruction uses Solana's transaction atomicity to guarantee that both token transfers succeed together or both fail. There's no possibility of partial execution.

4. **Rent Reclamation:** When escrow completes or is cancelled, the accounts are properly closed and rent is returned to the initializer, making the system economically efficient.

5. **User-Friendly Frontend:** The UI was intentionally designed to be simple and accessible to everyday users, not just developers. Token dropdowns, clear labels, and helpful error messages guide users through the process.

**Security Considerations:**

- All PDAs use proper seed derivation to prevent collisions
- Authorization checks ensure only valid participants can perform actions
- The `is_completed` flag prevents double-spending attacks
- Token accounts are validated before operations
- Proper account ownership checks throughout the program

**Known Limitations:**

- Offers don't have automatic expiration (could be added with timestamp checks)
- No on-chain order book or discovery mechanism (offers are shared off-chain via seed)
- Requires both parties to have token accounts pre-created
- Currently supports 1-to-1 token swaps only (not multi-token bundles)

**Future Enhancements:**

- Add escrow expiration timestamps
- Implement partial fill support
- Create on-chain order book for trade discovery
- Add support for NFT trading
- Implement reputation/rating system for traders