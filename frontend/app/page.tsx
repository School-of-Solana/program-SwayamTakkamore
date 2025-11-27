"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "./components/WalletButton";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { useState } from "react";
import idl from "../idl.json";

const PROGRAM_ID = new PublicKey("B8zkr7q9e5vJxmGdFTbMzY91e48qnucsPArvsVp3GjLJ");

// Available tokens for trading
const AVAILABLE_TOKENS = [
  { name: "ERA", symbol: "ER", mint: "ErSoqSh6ScLySdaYdkDL4zZqSFjuEQoQWM9g72TNyDo3" },
  { name: "UASR", symbol: "UA", mint: "UajyG2a5UKYfjNQKovSKrynQW9pgEgZgf3MBC93Nf8M" },
];

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [activeTab, setActiveTab] = useState<"create" | "accept" | "cancel">("create");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [createdOfferDetails, setCreatedOfferDetails] = useState<{
    seed: string;
    wallet: string;
    sendToken: string;
    sendAmount: string;
    receiveToken: string;
    receiveAmount: string;
  } | null>(null);
  
  // Initialize states
  const [initializerMint, setInitializerMint] = useState("");
  const [takerMint, setTakerMint] = useState("");
  const [initializerAmount, setInitializerAmount] = useState("");
  const [takerAmount, setTakerAmount] = useState("");
  const [seed, setSeed] = useState("");
  
  // Exchange states
  const [exchangeInitializer, setExchangeInitializer] = useState("");
  const [exchangeSeed, setExchangeSeed] = useState("");
  const [exchangeInitMint, setExchangeInitMint] = useState("");
  const [exchangeTakerMint, setExchangeTakerMint] = useState("");
  
  // Cancel states
  const [cancelSeed, setCancelSeed] = useState("");
  const [cancelMint, setCancelMint] = useState("");
  
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const getProvider = () => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(
      connection,
      wallet as any,
      AnchorProvider.defaultOptions()
    );
  };

  const initializeEscrow = async () => {
    if (!wallet.publicKey) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!initializerMint || !takerMint || !initializerAmount || !takerAmount) {
      setStatus("Please fill all required fields");
      return;
    }

    try {
      setLoading(true);
      setStatus("Initializing escrow...");

      const provider = getProvider();
      if (!provider) throw new Error("Provider not available");

      const program = new Program(idl as any, provider);

      const initializerMintPubkey = new PublicKey(initializerMint);
      const takerMintPubkey = new PublicKey(takerMint);
      const seedBn = new BN(seed || Date.now());

      // Derive PDA for escrow account
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          wallet.publicKey.toBuffer(),
          seedBn.toArrayLike(Buffer, "le", 8),
        ],
        PROGRAM_ID
      );

      // Derive PDA for vault account
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), escrowPda.toBuffer()],
        PROGRAM_ID
      );

      // Get associated token accounts
      const initializerDepositTokenAccount = await getAssociatedTokenAddress(
        initializerMintPubkey,
        wallet.publicKey
      );

      const tx = await program.methods
        .initializeEscrow(
          new BN(initializerAmount),
          new BN(takerAmount),
          seedBn
        )
        .accounts({
          initializer: wallet.publicKey,
          escrow: escrowPda,
          mint: initializerMintPubkey,
          initializerDepositTokenAccount,
          vaultTokenAccount: vaultPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Save offer details for display
      const usedSeed = seed || Date.now().toString();
      const sendTokenName = AVAILABLE_TOKENS.find(t => t.mint === initializerMint)?.name || "Token";
      const receiveTokenName = AVAILABLE_TOKENS.find(t => t.mint === takerMint)?.name || "Token";
      
      setCreatedOfferDetails({
        seed: usedSeed,
        wallet: wallet.publicKey.toBase58(),
        sendToken: sendTokenName,
        sendAmount: initializerAmount,
        receiveToken: receiveTokenName,
        receiveAmount: takerAmount,
      });

      setStatus(`Trade offer created successfully! Transaction: ${tx.slice(0, 8)}...`);
      console.log("Transaction signature:", tx);
    } catch (error: any) {
      console.error("Error creating trade offer:", error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exchangeEscrow = async () => {
    if (!wallet.publicKey) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!exchangeInitializer || !exchangeSeed || !exchangeInitMint || !exchangeTakerMint) {
      setStatus("Please fill all required fields");
      return;
    }

    try {
      setLoading(true);
      setStatus("Checking your token accounts...");

      const provider = getProvider();
      if (!provider) throw new Error("Provider not available");

      const program = new Program(idl as any, provider);

      const initializerPubkey = new PublicKey(exchangeInitializer);
      const initMintPubkey = new PublicKey(exchangeInitMint);
      const takerMintPubkey = new PublicKey(exchangeTakerMint);
      const seedBn = new BN(exchangeSeed);

      // Derive escrow PDA
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          initializerPubkey.toBuffer(),
          seedBn.toArrayLike(Buffer, "le", 8),
        ],
        PROGRAM_ID
      );

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), escrowPda.toBuffer()],
        PROGRAM_ID
      );

      // Get token accounts
      const takerDepositTokenAccount = await getAssociatedTokenAddress(
        takerMintPubkey,
        wallet.publicKey
      );

      const takerReceiveTokenAccount = await getAssociatedTokenAddress(
        initMintPubkey,
        wallet.publicKey
      );

      const initializerReceiveTokenAccount = await getAssociatedTokenAddress(
        takerMintPubkey,
        initializerPubkey
      );

      // Check if taker has both required token accounts
      const connection = provider.connection;
      
      console.log("Taker wallet:", wallet.publicKey.toBase58());
      console.log("Taker deposit token account:", takerDepositTokenAccount.toBase58());
      console.log("Taker receive token account:", takerReceiveTokenAccount.toBase58());
      
      const takerDepositAccountInfo = await connection.getAccountInfo(takerDepositTokenAccount);
      const takerReceiveAccountInfo = await connection.getAccountInfo(takerReceiveTokenAccount);
      
      if (!takerDepositAccountInfo) {
        const tokenName = AVAILABLE_TOKENS.find(t => t.mint === exchangeTakerMint)?.symbol || "token";
        throw new Error(`You don't have a token account for ${tokenName}. Please create it first using: spl-token create-account ${exchangeTakerMint}`);
      }
      
      if (!takerReceiveAccountInfo) {
        const tokenName = AVAILABLE_TOKENS.find(t => t.mint === exchangeInitMint)?.symbol || "token";
        throw new Error(`You don't have a token account for ${tokenName}. Please create it first using: spl-token create-account ${exchangeInitMint}`);
      }

      setStatus("Executing atomic swap...");

      const tx = await program.methods
        .exchange()
        .accounts({
          taker: wallet.publicKey,
          takerDepositTokenAccount,
          takerReceiveTokenAccount,
          initializer: initializerPubkey,
          initializerReceiveTokenAccount,
          escrow: escrowPda,
          vaultTokenAccount: vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setStatus(`🎉 Swap Successful! Both tokens exchanged atomically. Transaction: ${tx.slice(0, 8)}...`);
      console.log("Transaction signature:", tx);
    } catch (error: any) {
      console.error("Error exchanging:", error);
      
      // Provide helpful error messages
      if (error.message.includes("AccountNotInitialized") && error.message.includes("escrow")) {
        setStatus(`❌ Error: This escrow offer doesn't exist. Please check: 1) The initializer wallet address is correct, 2) The seed number is correct, 3) The offer hasn't been cancelled or already accepted.`);
      } else if (error.message.includes("AccountNotInitialized")) {
        const tokenName = AVAILABLE_TOKENS.find(t => t.mint === exchangeTakerMint)?.name || "token";
        setStatus(`❌ Error: You don't have a token account for ${tokenName}. You need to create a token account and have some ${tokenName} tokens before accepting this trade. Use: spl-token create-account ${exchangeTakerMint}`);
      } else if (error.message.includes("insufficient")) {
        setStatus(`❌ Error: Insufficient token balance. Make sure you have enough tokens to complete this trade.`);
      } else {
        setStatus(`❌ Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelEscrow = async () => {
    if (!wallet.publicKey) {
      setStatus("Please connect your wallet");
      return;
    }

    if (!cancelSeed || !cancelMint) {
      setStatus("Please provide the seed and mint address");
      return;
    }

    try {
      setLoading(true);
      setStatus("Cancelling escrow...");

      const provider = getProvider();
      if (!provider) throw new Error("Provider not available");

      const program = new Program(idl as any, provider);

      const seedBn = new BN(cancelSeed);
      const mintPubkey = new PublicKey(cancelMint);

      // Derive escrow PDA
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          wallet.publicKey.toBuffer(),
          seedBn.toArrayLike(Buffer, "le", 8),
        ],
        PROGRAM_ID
      );

      // Derive vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), escrowPda.toBuffer()],
        PROGRAM_ID
      );

      // Get initializer token account
      const initializerDepositTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        wallet.publicKey
      );

      const tx = await program.methods
        .cancelEscrow()
        .accounts({
          initializer: wallet.publicKey,
          escrow: escrowPda,
          initializerDepositTokenAccount,
          vaultTokenAccount: vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setStatus(`✅ Refund Complete! Your tokens have been returned from escrow. Transaction: ${tx.slice(0, 8)}...`);
      console.log("Transaction signature:", tx);
    } catch (error: any) {
      console.error("Error cancelling:", error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Safe Token Trading
          </h1>
          <p className="text-white/80">
            Trade tokens safely with escrow protection on Solana
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="flex justify-center mb-8">
          <WalletButton />
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("create")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "create"
                  ? "text-purple-600 border-b-2 border-purple-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📝 Create Offer
            </button>
            <button
              onClick={() => setActiveTab("accept")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "accept"
                  ? "text-purple-600 border-b-2 border-purple-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              ✅ Accept Trade
            </button>
            <button
              onClick={() => setActiveTab("cancel")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "cancel"
                  ? "text-purple-600 border-b-2 border-purple-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🔄 Cancel & Refund
            </button>
          </div>

          {/* Create Offer Tab */}
          {activeTab === "create" && (
            <div className="space-y-6">
              {/* Header Description */}
              <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
                <h3 className="font-semibold text-purple-900 mb-2">
                  Create a Safe Token Trade Offer
                </h3>
                <p className="text-sm text-purple-700">
                  Lock your tokens in escrow and wait for someone to accept. If they don't accept, you can cancel anytime and refund safely.
                </p>
              </div>

              {/* You will SEND section */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  📤 You will SEND
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Token
                    </label>
                    <select
                      value={initializerMint}
                      onChange={(e) => setInitializerMint(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
                    >
                      <option value="">Select a token</option>
                      {AVAILABLE_TOKENS.filter(t => t.mint).map((token) => (
                        <option key={token.mint} value={token.mint}>
                          {token.name} ({token.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount
                    </label>
                    <input
                      type="number"
                      value={initializerAmount}
                      onChange={(e) => setInitializerAmount(e.target.value)}
                      placeholder="How many tokens?"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      💡 These tokens will be locked in escrow.
                    </p>
                  </div>
                </div>
              </div>

              {/* You want to RECEIVE section */}
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                  📥 You want to RECEIVE
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Token
                    </label>
                    <select
                      value={takerMint}
                      onChange={(e) => setTakerMint(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-700"
                    >
                      <option value="">Select a token</option>
                      {AVAILABLE_TOKENS.filter(t => t.mint).map((token) => (
                        <option key={token.mint} value={token.mint}>
                          {token.name} ({token.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount
                    </label>
                    <input
                      type="number"
                      value={takerAmount}
                      onChange={(e) => setTakerAmount(e.target.value)}
                      placeholder="How many tokens?"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-gray-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      💡 This is what you expect in return.
                    </p>
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="border-t border-gray-200 pt-4">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  <span>{showAdvanced ? '▼' : '▶'}</span>
                  <span>Advanced Settings</span>
                </button>
                
                {showAdvanced && (
                  <div className="mt-4 space-y-3 bg-gray-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Offer ID (Seed)
                      </label>
                      <input
                        type="number"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        placeholder="Leave empty to auto-generate"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Optional: Custom ID for your offer. Auto-generated if left empty.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Token Mint Addresses
                      </label>
                      <input
                        type="text"
                        value={initializerMint}
                        onChange={(e) => setInitializerMint(e.target.value)}
                        placeholder="Send token mint address"
                        className="w-full px-3 py-2 mb-2 border border-gray-300 rounded text-xs"
                      />
                      <input
                        type="text"
                        value={takerMint}
                        onChange={(e) => setTakerMint(e.target.value)}
                        placeholder="Receive token mint address"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Create Button */}
              <button
                onClick={initializeEscrow}
                disabled={loading || !wallet.connected}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
              >
                {loading ? "Creating Offer..." : "🔒 Lock Tokens & Create Offer"}
              </button>

              {/* Success Card */}
              {createdOfferDetails && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 p-6 rounded-xl">
                  <h4 className="font-bold text-green-900 text-lg mb-3 flex items-center gap-2">
                    🎉 Offer Created!
                  </h4>
                  <p className="text-sm text-green-700 mb-4">
                    Share these details with the other person:
                  </p>
                  <div className="bg-white p-4 rounded-lg space-y-2 text-sm font-mono">
                    <div><strong>Offer ID:</strong> {createdOfferDetails.seed}</div>
                    <div><strong>Your Wallet:</strong> {createdOfferDetails.wallet.slice(0, 8)}...{createdOfferDetails.wallet.slice(-6)}</div>
                    <div className="text-blue-600"><strong>You Send →</strong> {createdOfferDetails.sendAmount} {createdOfferDetails.sendToken}</div>
                    <div className="text-green-600"><strong>You Receive →</strong> {createdOfferDetails.receiveAmount} {createdOfferDetails.receiveToken}</div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `Offer ID: ${createdOfferDetails.seed}\nWallet: ${createdOfferDetails.wallet}\nSend: ${createdOfferDetails.sendAmount} ${createdOfferDetails.sendToken}\nReceive: ${createdOfferDetails.receiveAmount} ${createdOfferDetails.receiveToken}`
                      );
                      alert('Copied to clipboard!');
                    }}
                    className="mt-3 w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition text-sm"
                  >
                    📋 Copy Details
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Accept Trade Tab */}
          {activeTab === "accept" && (
            <div className="space-y-6">
              {/* Header Description */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
                <h3 className="font-semibold text-green-900 mb-2">
                  Accept a Trade Offer
                </h3>
                <p className="text-sm text-green-700">
                  You will send your tokens and receive the creator's tokens instantly & atomically. Both transfers happen together or not at all.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📋 Offer Creator Address
                </label>
                <input
                  type="text"
                  value={exchangeInitializer}
                  onChange={(e) => setExchangeInitializer(e.target.value)}
                  placeholder="Wallet address of person who created the offer"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-gray-400 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔑 Offer ID
                </label>
                <input
                  type="number"
                  value={exchangeSeed}
                  onChange={(e) => setExchangeSeed(e.target.value)}
                  placeholder="The seed/ID they shared with you"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token They Send (You'll Receive)
                  </label>
                  <select
                    value={exchangeInitMint}
                    onChange={(e) => setExchangeInitMint(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-700"
                  >
                    <option value="">Select token</option>
                    {AVAILABLE_TOKENS.filter(t => t.mint).map((token) => (
                      <option key={token.mint} value={token.mint}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token You Send
                  </label>
                  <select
                    value={exchangeTakerMint}
                    onChange={(e) => setExchangeTakerMint(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-700"
                  >
                    <option value="">Select token</option>
                    {AVAILABLE_TOKENS.filter(t => t.mint).map((token) => (
                      <option key={token.mint} value={token.mint}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Requirements Notice */}
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex gap-2 items-start">
                  <span className="text-blue-600 text-lg">ℹ️</span>
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Before accepting this trade:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Make sure you have a token account for the token you'll send</li>
                      <li>Ensure you have enough tokens in your wallet</li>
                      <li>Both tokens will swap atomically (or transaction fails)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Summary Box */}
              {exchangeInitMint && exchangeTakerMint && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="font-semibold text-gray-800 mb-2">Trade Summary</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">You will send:</span>
                      <span className="font-medium text-red-600">{AVAILABLE_TOKENS.find(t => t.mint === exchangeTakerMint)?.name || 'Token'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">You will receive:</span>
                      <span className="font-medium text-green-600">{AVAILABLE_TOKENS.find(t => t.mint === exchangeInitMint)?.name || 'Token'}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 Tip: Check your wallet to confirm you have the token to send
                  </p>
                </div>
              )}

              <button
                onClick={exchangeEscrow}
                disabled={loading || !wallet.connected}
                className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-green-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
              >
                {loading ? "Processing..." : "✅ Confirm & Swap Tokens"}
              </button>
            </div>
          )}

          {/* Cancel & Refund Tab */}
          {activeTab === "cancel" && (
            <div className="space-y-6">
              {/* Header Description */}
              <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
                <h3 className="font-semibold text-orange-900 mb-2">
                  Cancel Trade & Get Your Tokens Back
                </h3>
                <p className="text-sm text-orange-700">
                  Only the person who created the offer can cancel. Your locked tokens will be returned to you.
                </p>
              </div>

              {/* Warning Box */}
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <div className="flex gap-3">
                  <span className="text-red-600 text-xl">⚠️</span>
                  <div>
                    <h4 className="font-semibold text-red-900 mb-1">Important</h4>
                    <p className="text-sm text-red-700">
                      If the swap was already completed, this action is not allowed. You can only cancel offers that haven't been accepted yet.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔑 Offer ID
                  </label>
                  <input
                    type="number"
                    value={cancelSeed}
                    onChange={(e) => setCancelSeed(e.target.value)}
                    placeholder="The seed/ID you used when creating the offer"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-gray-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token You Locked
                  </label>
                  <select
                    value={cancelMint}
                    onChange={(e) => setCancelMint(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-700"
                  >
                    <option value="">Select the token you deposited</option>
                    {AVAILABLE_TOKENS.filter(t => t.mint).map((token) => (
                      <option key={token.mint} value={token.mint}>
                        {token.name} ({token.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={cancelEscrow}
                  disabled={loading || !wallet.connected}
                  className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
                >
                  {loading ? "Cancelling..." : "🔄 Cancel Offer & Refund"}
                </button>
              </div>
            </div>
          )}

          {/* Status Message (for all tabs) */}
          {status && (
            <div className={`mt-4 p-4 rounded-lg ${status.includes("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              <p className="text-sm break-all">{status}</p>
            </div>
          )}
        </div>

        {/* Trust & Safety Section */}
        <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 backdrop-blur rounded-xl p-6 border border-blue-200">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-3xl">🔒</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">
                How Does This Work?
              </h3>
              <p className="text-sm text-gray-600">
                Safe, transparent, and trustless token trading
              </p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex gap-2">
              <span className="text-green-600">✓</span>
              <p><strong>Your tokens are locked safely in escrow</strong> - Only the smart contract can move them.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">✓</span>
              <p><strong>Atomic swaps</strong> - Both sides transfer tokens at the exact same time, or nothing happens at all.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">✓</span>
              <p><strong>Cancel anytime</strong> - If the other person doesn't accept, you can get your tokens back immediately.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">✓</span>
              <p><strong>Fully on-chain</strong> - Everything happens on Solana blockchain. Transparent and verifiable.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">✓</span>
              <p><strong>No middleman</strong> - Smart contract ensures fair trades without trusting anyone.</p>
            </div>
          </div>
        </div>

        {/* Quick Help */}
        <div className="mt-4 bg-white/90 backdrop-blur rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            💡 Quick Guide
          </h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="font-semibold text-purple-900 mb-2">1️⃣ Create Offer</div>
              <p className="text-gray-700">Lock your tokens and set what you want in return. Share the Offer ID with the other person.</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="font-semibold text-green-900 mb-2">2️⃣ Accept Trade</div>
              <p className="text-gray-700">Got an Offer ID? Enter it here to complete the swap and get their tokens instantly.</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="font-semibold text-orange-900 mb-2">3️⃣ Cancel & Refund</div>
              <p className="text-gray-700">Changed your mind? Cancel your offer and get your locked tokens back safely.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
