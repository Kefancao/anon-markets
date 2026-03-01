"use client";

import { UnlinkProvider } from "@unlink-xyz/react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function UnlinkWalletProvider({ children }: Props) {
  return (
    <UnlinkProvider chain="monad-testnet" autoSync={true} syncInterval={5000}>
      {children}
    </UnlinkProvider>
  );
}
