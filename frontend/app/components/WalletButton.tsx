'use client';

import dynamic from 'next/dynamic';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export function WalletButton() {
  return <WalletMultiButtonDynamic className="!bg-white !text-purple-600 hover:!bg-gray-100" />;
}
