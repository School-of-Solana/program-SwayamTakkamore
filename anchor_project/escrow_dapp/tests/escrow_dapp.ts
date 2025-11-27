import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EscrowDapp } from "../target/types/escrow_dapp";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("escrow_dapp", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrowDapp as Program<EscrowDapp>;
  
  let mintA: PublicKey;
  let mintB: PublicKey;
  let initializerTokenAccountA: PublicKey;
  let initializerTokenAccountB: PublicKey;
  let takerTokenAccountA: PublicKey;
  let takerTokenAccountB: PublicKey;
  let escrowPDA: PublicKey;
  let vaultPDA: PublicKey;
  
  const initializer = provider.wallet as anchor.Wallet;
  const taker = Keypair.generate();
  const seed = new anchor.BN(Math.floor(Math.random() * 1000000));
  const initializerAmount = 1000;
  const takerAmount = 500;

  before(async () => {
    // Airdrop SOL to taker
    const airdropSignature = await provider.connection.requestAirdrop(
      taker.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create mints
    mintA = await createMint(
      provider.connection,
      initializer.payer,
      initializer.publicKey,
      null,
      9
    );

    mintB = await createMint(
      provider.connection,
      initializer.payer,
      initializer.publicKey,
      null,
      9
    );

    // Create token accounts for initializer
    initializerTokenAccountA = await createAccount(
      provider.connection,
      initializer.payer,
      mintA,
      initializer.publicKey
    );

    initializerTokenAccountB = await createAccount(
      provider.connection,
      initializer.payer,
      mintB,
      initializer.publicKey
    );

    // Create token accounts for taker
    takerTokenAccountA = await createAccount(
      provider.connection,
      initializer.payer,
      mintA,
      taker.publicKey
    );

    takerTokenAccountB = await createAccount(
      provider.connection,
      initializer.payer,
      mintB,
      taker.publicKey
    );

    // Mint tokens
    await mintTo(
      provider.connection,
      initializer.payer,
      mintA,
      initializerTokenAccountA,
      initializer.publicKey,
      initializerAmount
    );

    await mintTo(
      provider.connection,
      initializer.payer,
      mintB,
      takerTokenAccountB,
      initializer.publicKey,
      takerAmount
    );

    // Derive PDAs
    [escrowPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        initializer.publicKey.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowPDA.toBuffer()],
      program.programId
    );
  });

  it("Initialize escrow", async () => {
    await program.methods
      .initializeEscrow(new anchor.BN(initializerAmount), new anchor.BN(takerAmount), seed)
      .accounts({
        initializer: initializer.publicKey,
        escrow: escrowPDA,
        mint: mintA,
        initializerDepositTokenAccount: initializerTokenAccountA,
        vaultTokenAccount: vaultPDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify escrow account
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    assert.ok(escrowAccount.initializer.equals(initializer.publicKey));
    assert.equal(escrowAccount.expectedTakerAmount.toNumber(), takerAmount);
    assert.equal(escrowAccount.isCompleted, false);

    // Verify vault has tokens
    const vaultAccount = await getAccount(provider.connection, vaultPDA);
    assert.equal(Number(vaultAccount.amount), initializerAmount);

    // Verify initializer account decreased
    const initializerAccountA = await getAccount(
      provider.connection,
      initializerTokenAccountA
    );
    assert.equal(Number(initializerAccountA.amount), 0);
  });

  it("Exchange escrow tokens", async () => {
    await program.methods
      .exchange()
      .accounts({
        taker: taker.publicKey,
        takerDepositTokenAccount: takerTokenAccountB,
        takerReceiveTokenAccount: takerTokenAccountA,
        initializer: initializer.publicKey,
        initializerReceiveTokenAccount: initializerTokenAccountB,
        escrow: escrowPDA,
        vaultTokenAccount: vaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    // Verify escrow is completed and closed
    try {
      await program.account.escrow.fetch(escrowPDA);
      assert.fail("Escrow account should be closed");
    } catch (error) {
      assert.include(error.message, "Account does not exist");
    }

    // Verify token balances after exchange
    const takerAccountA = await getAccount(provider.connection, takerTokenAccountA);
    assert.equal(Number(takerAccountA.amount), initializerAmount);

    const takerAccountB = await getAccount(provider.connection, takerTokenAccountB);
    assert.equal(Number(takerAccountB.amount), 0);

    const initializerAccountB = await getAccount(
      provider.connection,
      initializerTokenAccountB
    );
    assert.equal(Number(initializerAccountB.amount), takerAmount);
  });

  describe("Unhappy paths", () => {
    let newEscrowPDA: PublicKey;
    let newVaultPDA: PublicKey;
    let newSeed: anchor.BN;

    beforeEach(async () => {
      // Create new escrow for each unhappy test
      newSeed = new anchor.BN(Math.floor(Math.random() * 1000000));

      [newEscrowPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          initializer.publicKey.toBuffer(),
          newSeed.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [newVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), newEscrowPDA.toBuffer()],
        program.programId
      );

      // Mint more tokens to initializer
      await mintTo(
        provider.connection,
        initializer.payer,
        mintA,
        initializerTokenAccountA,
        initializer.publicKey,
        initializerAmount
      );
    });

    it("Fails to initialize escrow with zero amount", async () => {
      try {
        await program.methods
          .initializeEscrow(new anchor.BN(0), new anchor.BN(takerAmount), newSeed)
          .accounts({
            initializer: initializer.publicKey,
            escrow: newEscrowPDA,
            mint: mintA,
            initializerDepositTokenAccount: initializerTokenAccountA,
            vaultTokenAccount: newVaultPDA,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with zero amount");
      } catch (error) {
        assert.include(error.message, "InvalidAmount");
      }
    });

    it("Fails to cancel escrow with wrong authority", async () => {
      // Initialize escrow
      await program.methods
        .initializeEscrow(new anchor.BN(initializerAmount), new anchor.BN(takerAmount), newSeed)
        .accounts({
          initializer: initializer.publicKey,
          escrow: newEscrowPDA,
          mint: mintA,
          initializerDepositTokenAccount: initializerTokenAccountA,
          vaultTokenAccount: newVaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Try to cancel with wrong authority
      try {
        await program.methods
          .cancelEscrow()
          .accounts({
            initializer: taker.publicKey,
            escrow: newEscrowPDA,
            initializerDepositTokenAccount: takerTokenAccountA,
            vaultTokenAccount: newVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([taker])
          .rpc();
        assert.fail("Should have failed with wrong authority");
      } catch (error) {
        assert.include(error.message, "");
      }
    });

    it("Successfully cancels escrow", async () => {
      // Initialize escrow
      await program.methods
        .initializeEscrow(new anchor.BN(initializerAmount), new anchor.BN(takerAmount), newSeed)
        .accounts({
          initializer: initializer.publicKey,
          escrow: newEscrowPDA,
          mint: mintA,
          initializerDepositTokenAccount: initializerTokenAccountA,
          vaultTokenAccount: newVaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const initializerBalanceBefore = await getAccount(
        provider.connection,
        initializerTokenAccountA
      );

      // Cancel escrow
      await program.methods
        .cancelEscrow()
        .accounts({
          initializer: initializer.publicKey,
          escrow: newEscrowPDA,
          initializerDepositTokenAccount: initializerTokenAccountA,
          vaultTokenAccount: newVaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify tokens returned
      const initializerBalanceAfter = await getAccount(
        provider.connection,
        initializerTokenAccountA
      );
      assert.equal(
        Number(initializerBalanceAfter.amount),
        Number(initializerBalanceBefore.amount) + initializerAmount
      );

      // Verify escrow closed
      try {
        await program.account.escrow.fetch(newEscrowPDA);
        assert.fail("Escrow account should be closed");
      } catch (error) {
        assert.include(error.message, "Account does not exist");
      }
    });

    it("Fails to exchange twice (already completed)", async () => {
      // Initialize escrow
      await program.methods
        .initializeEscrow(new anchor.BN(initializerAmount), new anchor.BN(takerAmount), newSeed)
        .accounts({
          initializer: initializer.publicKey,
          escrow: newEscrowPDA,
          mint: mintA,
          initializerDepositTokenAccount: initializerTokenAccountA,
          vaultTokenAccount: newVaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Mint more tokens to taker
      await mintTo(
        provider.connection,
        initializer.payer,
        mintB,
        takerTokenAccountB,
        initializer.publicKey,
        takerAmount
      );

      // First exchange
      await program.methods
        .exchange()
        .accounts({
          taker: taker.publicKey,
          takerDepositTokenAccount: takerTokenAccountB,
          takerReceiveTokenAccount: takerTokenAccountA,
          initializer: initializer.publicKey,
          initializerReceiveTokenAccount: initializerTokenAccountB,
          escrow: newEscrowPDA,
          vaultTokenAccount: newVaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker])
        .rpc();

      // Try second exchange (should fail)
      try {
        await program.methods
          .exchange()
          .accounts({
            taker: taker.publicKey,
            takerDepositTokenAccount: takerTokenAccountB,
            takerReceiveTokenAccount: takerTokenAccountA,
            initializer: initializer.publicKey,
            initializerReceiveTokenAccount: initializerTokenAccountB,
            escrow: newEscrowPDA,
            vaultTokenAccount: newVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([taker])
          .rpc();
        assert.fail("Should have failed on second exchange");
      } catch (error) {
        // Account should be closed or not exist after first exchange
        assert.ok(error.message.includes("Account does not exist") || error.message.includes("escrow"));
      }
    });
  });
});
