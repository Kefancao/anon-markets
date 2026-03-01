"use client";

import { UnlinkWalletProvider } from "../components/UnlinkWalletProvider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <UnlinkWalletProvider>{children}</UnlinkWalletProvider>;
}
