"use client";

import {
  Shield,
  Activity,
  Wallet,
  Copy,
  Check,
  LogOut,
  ChevronDown,
  Eye,
  EyeOff,
  Download,
  ArrowRight,
  Fingerprint,
  Lock,
  ArrowDownToLine,
  Loader2,
  AlertTriangle,
  Droplets,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useUnlink, formatAmount } from "@unlink-xyz/react";
import { useEvmWallet } from "../hooks/useEvmWallet";
import { COLLATERAL_SYMBOL } from "../lib/constants";

type PanelView =
  | "main"
  | "evm_connect"
  | "evm_sign"
  | "unlink_create"
  | "backup"
  | "deposit"
  | "import"
  | "connected";

export type AppView = "markets" | "portfolio";

interface HeaderProps {
  view?: AppView;
  onNavigate?: (view: AppView) => void;
}

const COLLATERAL_ADDRESS_LOWER = (process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "").toLowerCase();

export function Header({ view = "markets", onNavigate }: HeaderProps) {
  const evm = useEvmWallet();
  const {
    ready,
    walletExists,
    activeAccount,
    activeAccountIndex,
    accounts,
    balances,
    createWallet,
    createAccount,
    importWallet,
    exportMnemonic,
    clearWallet,
    deposit,
    busy,
    error: unlinkError,
    clearError,
  } = useUnlink();

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>("main");
  const [mnemonic, setMnemonic] = useState("");
  const [importInput, setImportInput] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [faucetReady, setFaucetReady] = useState<boolean | null>(null);
  const [faucetUnavailableReason, setFaucetUnavailableReason] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen || panelView !== "connected") return;
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${API}/api/faucet/status`)
      .then((r) => r.json())
      .then((data: { ready?: boolean; unavailableReason?: string }) => {
        setFaucetReady(!!data.ready);
        setFaucetUnavailableReason(data.unavailableReason ?? null);
      })
      .catch(() => {
        setFaucetReady(false);
        setFaucetUnavailableReason("Could not reach backend.");
      });
  }, [panelOpen, panelView]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanelCleanup();
      }
    }
    if (panelOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [panelOpen]);

  const isFullyConnected =
    evm.connected && evm.signature && walletExists && activeAccount;

  const unlinkInfo = accounts.find((a) => a.index === activeAccountIndex);
  const unlinkAddress = unlinkInfo?.address ?? "";
  const shortUnlink = unlinkAddress
    ? `${unlinkAddress.slice(0, 10)}...${unlinkAddress.slice(-6)}`
    : "";

  const formattedBalances = Object.entries(balances).map(([token, amount]) => ({
    token,
    display: formatAmount(amount, 18),
  }));
  const hasBalance = formattedBalances.some(
    (b) => b.display !== "0" && b.display !== "0.0"
  );

  function closePanelCleanup() {
    setPanelOpen(false);
    if (panelView !== "connected" && panelView !== "main") setPanelView("main");
    setMnemonic("");
    setImportInput("");
    setShowMnemonic(false);
  }

  function resolveMainView(): PanelView {
    if (!evm.connected) return "evm_connect";
    if (!evm.signature) return "evm_sign";
    if (!walletExists) return "unlink_create";
    if (walletExists && !activeAccount) return "unlink_create";
    return "connected";
  }

  function openPanel() {
    setPanelOpen(true);
    setPanelView(resolveMainView());
  }

  async function handleEvmConnect() {
    await evm.connect();
    setPanelView("evm_sign");
  }

  async function handleEvmSign() {
    const result = await evm.signIdentity();
    if (result) {
      if (!walletExists) {
        setPanelView("unlink_create");
      } else if (!activeAccount) {
        setPanelView("unlink_create");
      } else {
        setPanelView("connected");
      }
    }
  }

  async function handleCreateUnlink() {
    try {
      // Derive Unlink wallet from identity signature so the same EVM wallet always gets the same Unlink address
      if (evm.signature) {
        const { deriveMnemonicFromSignature } = await import("../lib/deriveUnlinkMnemonic");
        const derivedMnemonic = await deriveMnemonicFromSignature(evm.signature);
        await importWallet(derivedMnemonic);
        await createAccount();
        setPanelView("connected");
        return;
      }
      const result = await createWallet();
      await createAccount();
      setMnemonic(result.mnemonic);
      setPanelView("backup");
    } catch {
      // surfaced via unlinkError
    }
  }

  async function handleImport() {
    if (!importInput.trim()) return;
    try {
      await importWallet(importInput.trim());
      await createAccount();
      setImportInput("");
      setPanelView("connected");
    } catch {
      // surfaced via unlinkError
    }
  }

  async function handleDeposit() {
    if (!depositAmount || !evm.address) return;
    try {
      const amountWei = BigInt(Math.floor(parseFloat(depositAmount) * 1e18));
      const COLLATERAL =
        process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "";
      if (!COLLATERAL) return;

      const result = await deposit([
        { token: COLLATERAL, amount: amountWei, depositor: evm.address },
      ]);

      const eth = (
        window as unknown as {
          ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<string> };
        }
      ).ethereum;
      if (eth && result) {
        await eth.request({
          method: "eth_sendTransaction",
          params: [
            {
              to: result.to,
              data: result.calldata,
              from: evm.address,
              value: "0x0",
            },
          ],
        });
      }

      setDepositAmount("");
      setPanelView("connected");
    } catch {
      // surfaced via unlinkError
    }
  }

  async function handleExport() {
    try {
      const m = await exportMnemonic();
      setMnemonic(m);
      setPanelView("backup");
    } catch {
      // surfaced via unlinkError
    }
  }

  async function handleFaucet() {
    if (!unlinkAddress) return;
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${API}/api/faucet/drip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlinkAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFaucetMsg({ type: "err", text: data.error || "Faucet request failed" });
      } else {
        setFaucetMsg({
          type: "ok",
          text: `${data.amount || "100"} ${COLLATERAL_SYMBOL} sent!`,
        });
      }
    } catch (e) {
      setFaucetMsg({
        type: "err",
        text: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setFaucetLoading(false);
    }
  }

  async function handleFullDisconnect() {
    await clearWallet();
    evm.disconnect();
    closePanelCleanup();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const currentStep = !evm.connected ? 1 : !evm.signature ? 1 : !walletExists || !activeAccount ? 2 : 3;

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-accent" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Anon Market</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink active={view === "markets"} onClick={() => onNavigate?.("markets")}>
              Markets
            </NavLink>
            <NavLink active={view === "portfolio"} onClick={() => onNavigate?.("portfolio")}>
              Portfolio
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3 relative" ref={panelRef}>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-muted text-green text-xs font-medium">
            <Activity className="w-3 h-3" />
            <span>Monad</span>
          </div>

          {!ready ? (
            <div className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-muted">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
              Loading...
            </div>
          ) : isFullyConnected ? (
            <button
              onClick={() => { setPanelOpen(!panelOpen); setPanelView("connected"); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-border-hover text-sm transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-green" />
              <span className="font-mono text-xs">{shortUnlink}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            </button>
          ) : (
            <button
              onClick={openPanel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Connect</span>
            </button>
          )}

          {/* -------- Dropdown Panel -------- */}
          {panelOpen && (
            <div className="absolute right-0 top-full mt-2 w-[340px] rounded-xl bg-card border border-border shadow-2xl shadow-black/40 z-50 overflow-hidden">
              {/* Errors */}
              {(unlinkError || evm.error) && (
                <div className="px-4 py-2 bg-red-muted text-red text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span className="truncate flex-1">
                    {unlinkError?.message || evm.error}
                  </span>
                  <button
                    onClick={() => { clearError(); evm.clearError(); }}
                    className="text-red hover:text-foreground shrink-0"
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* Step indicator (during setup only) */}
              {!isFullyConnected && panelView !== "backup" && panelView !== "import" && (
                <div className="px-4 pt-3 pb-1">
                  <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-0 mb-1">
                    {[1, 2, 3].map((s, i) => (
                      <div key={s} className="contents">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              s < currentStep
                                ? "bg-green text-white"
                                : s === currentStep
                                  ? "bg-accent text-white"
                                  : "bg-border text-muted"
                            }`}
                          >
                            {s < currentStep ? "✓" : s}
                          </div>
                          <span className="text-[9px] text-muted">
                            {["Identity", "Private Wallet", "Fund"][i]}
                          </span>
                        </div>
                        {i < 2 && (
                          <div
                            className={`h-0.5 mx-1 rounded ${
                              s < currentStep ? "bg-green" : "bg-border"
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Step 1a: Connect EVM Wallet ---- */}
              {panelView === "evm_connect" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-accent" />
                    <p className="text-sm font-semibold">Connect Wallet</p>
                  </div>
                  <p className="text-xs text-muted">
                    Connect your EVM wallet to anchor your identity. This wallet
                    is only used for sign-in and funding — never for trading.
                  </p>
                  <button
                    onClick={handleEvmConnect}
                    disabled={evm.connecting}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {evm.connecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wallet className="w-4 h-4" />
                    )}
                    {evm.connecting ? "Connecting..." : "Connect EVM Wallet"}
                  </button>
                  {!evm.hasWallet && (
                    <p className="text-[10px] text-yellow text-center">
                      No wallet detected. Install MetaMask or another browser
                      wallet.
                    </p>
                  )}
                </div>
              )}

              {/* ---- Step 1b: Sign Message (identity verification) ---- */}
              {panelView === "evm_sign" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-accent" />
                    <p className="text-sm font-semibold">Verify Identity</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-background text-xs">
                    <div className="w-2 h-2 rounded-full bg-green shrink-0" />
                    <span className="font-mono truncate">{evm.shortAddress}</span>
                    {!evm.isMonad && (
                      <button
                        onClick={evm.switchToMonad}
                        className="ml-auto text-[10px] text-yellow hover:text-foreground shrink-0"
                      >
                        Switch to Monad
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Sign a message to prove wallet ownership. This does not
                    authorize any transaction or spend.
                  </p>
                  <button
                    onClick={handleEvmSign}
                    disabled={evm.signing}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {evm.signing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4 h-4" />
                    )}
                    {evm.signing ? "Waiting for signature..." : "Sign Message"}
                  </button>
                </div>
              )}

              {/* ---- Step 2: Create Unlink Private Wallet ---- */}
              {panelView === "unlink_create" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-accent" />
                    <p className="text-sm font-semibold">
                      Create Private Wallet
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    Generate a private Unlink wallet. This is your shadow
                    execution wallet — completely separate from your EVM
                    identity. All RFQs, parlays, and settlements happen here.
                  </p>
                  <div className="p-2 rounded-lg bg-accent-muted text-[10px] text-accent flex items-start gap-1.5">
                    <Shield className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      Your private wallet cannot be linked to your EVM address
                      on-chain. Balances, positions, and trade history are
                      invisible.
                    </span>
                  </div>
                  <button
                    onClick={handleCreateUnlink}
                    disabled={busy}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    {busy ? "Generating..." : "Create Private Wallet"}
                  </button>
                  <button
                    onClick={() => setPanelView("import")}
                    className="w-full py-2 rounded-lg bg-background border border-border hover:border-border-hover text-xs font-medium transition-colors"
                  >
                    Import Existing Wallet
                  </button>
                </div>
              )}

              {/* ---- Import Wallet ---- */}
              {panelView === "import" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Import Wallet</p>
                    <button
                      onClick={() => setPanelView("unlink_create")}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Back
                    </button>
                  </div>
                  <textarea
                    value={importInput}
                    onChange={(e) => setImportInput(e.target.value)}
                    placeholder="Enter your 24-word mnemonic..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-accent focus:outline-none text-xs font-mono resize-none placeholder:text-muted/50"
                  />
                  <button
                    onClick={handleImport}
                    disabled={busy || !importInput.trim()}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {busy ? "Importing..." : "Import"}
                  </button>
                </div>
              )}

              {/* ---- Mnemonic Backup ---- */}
              {panelView === "backup" && mnemonic && (
                <div className="p-4 space-y-3">
                  <p className="text-sm font-semibold">
                    Backup Your Mnemonic
                  </p>
                  <p className="text-xs text-red font-medium">
                    Save this somewhere safe. You will not see it again.
                  </p>
                  <div className="relative">
                    <div
                      className={`p-3 rounded-lg bg-background border border-border text-xs font-mono leading-relaxed break-all ${
                        !showMnemonic ? "blur-sm select-none" : ""
                      }`}
                    >
                      {mnemonic}
                    </div>
                    <button
                      onClick={() => setShowMnemonic(!showMnemonic)}
                      className="absolute top-2 right-2 p-1 rounded bg-card border border-border text-muted hover:text-foreground"
                    >
                      {showMnemonic ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => copyToClipboard(mnemonic)}
                    className="w-full py-2 rounded-lg bg-background border border-border hover:border-border-hover text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </button>
                  <button
                    onClick={() => {
                      setMnemonic("");
                      setShowMnemonic(false);
                      setPanelView("deposit");
                    }}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    I&apos;ve Saved It
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* ---- Step 3: Deposit (Fund Private Wallet) ---- */}
              {panelView === "deposit" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 text-accent" />
                    <p className="text-sm font-semibold">Fund Private Wallet</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-background text-xs">
                      <span className="text-muted">From:</span>
                      <span className="font-mono">{evm.shortAddress}</span>
                      <span className="ml-auto text-[10px] text-muted">
                        EVM
                      </span>
                    </div>
                    <div className="flex justify-center">
                      <ArrowRight className="w-3 h-3 text-muted rotate-90" />
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-accent-muted text-xs">
                      <span className="text-muted">To:</span>
                      <span className="font-mono text-accent">{shortUnlink}</span>
                      <span className="ml-auto text-[10px] text-accent">
                        Private
                      </span>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-background text-[10px] text-muted flex items-start gap-1.5">
                    <Shield className="w-3 h-3 shrink-0 mt-0.5 text-accent" />
                    <span>
                      Funds route through the Unlink deposit contract. Your EVM
                      address is not linked to your private wallet on-chain.
                    </span>
                  </div>

                  <div>
                    <label className="text-xs text-muted mb-1 block">
                      Amount ({COLLATERAL_SYMBOL})
                    </label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-accent focus:outline-none text-sm placeholder:text-muted/50"
                    />
                  </div>

                  <button
                    onClick={handleDeposit}
                    disabled={busy || !depositAmount || parseFloat(depositAmount) <= 0}
                    className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="w-4 h-4" />
                    )}
                    {busy ? "Depositing..." : "Deposit to Private Wallet"}
                  </button>

                  <button
                    onClick={() => setPanelView("connected")}
                    className="w-full py-1.5 text-xs text-muted hover:text-foreground transition-colors"
                  >
                    Skip for now
                  </button>
                </div>
              )}

              {/* ---- Connected State ---- */}
              {panelView === "connected" && isFullyConnected && (
                <div className="divide-y divide-border">
                  {/* Identity (EVM) */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted uppercase tracking-wider">
                        Identity
                      </span>
                      <span className="text-[10px] text-green flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green" />
                        Verified
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Wallet className="w-3 h-3 text-muted" />
                      <span className="font-mono">{evm.shortAddress}</span>
                      {evm.isMonad ? (
                        <span className="ml-auto text-[10px] text-green">
                          Monad
                        </span>
                      ) : (
                        <button
                          onClick={evm.switchToMonad}
                          className="ml-auto text-[10px] text-yellow hover:text-foreground"
                        >
                          Switch to Monad
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Private Wallet (Unlink) */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted uppercase tracking-wider">
                        Private Wallet
                      </span>
                      <span className="text-[10px] text-accent flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Shielded
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Shield className="w-3 h-3 text-accent" />
                      <span className="font-mono">{shortUnlink}</span>
                      <button
                        onClick={() => copyToClipboard(unlinkAddress)}
                        className="ml-auto p-0.5 rounded text-muted hover:text-foreground"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-green" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Balances */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted uppercase tracking-wider">
                        Shielded Balance
                      </span>
                      <button
                        onClick={() => setPanelView("deposit")}
                        className="text-[10px] text-accent hover:text-accent-hover font-medium"
                      >
                        + Deposit
                      </button>
                    </div>
                    {hasBalance ? (
                      <div className="space-y-1">
                        {formattedBalances
                          .filter(
                            (b) => b.display !== "0" && b.display !== "0.0"
                          )
                          .map((b) => (
                            <div
                              key={b.token}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="font-mono text-xs text-muted truncate max-w-[140px]">
                                {COLLATERAL_ADDRESS_LOWER && b.token.toLowerCase() === COLLATERAL_ADDRESS_LOWER
                                  ? COLLATERAL_SYMBOL
                                  : `${b.token.slice(0, 6)}...${b.token.slice(-4)}`}
                              </span>
                              <span className="font-semibold">
                                {b.display}
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted">
                        No balance.{" "}
                        <button
                          onClick={() => setPanelView("deposit")}
                          className="text-accent hover:text-accent-hover"
                        >
                          Deposit funds
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Testnet Faucet */}
                  <div className="p-3">
                    {faucetUnavailableReason && (
                      <p className="mb-2 text-xs text-muted">
                        {faucetUnavailableReason}
                      </p>
                    )}
                    {faucetMsg && (
                      <div
                        className={`mb-2 p-2 rounded-lg text-xs ${
                          faucetMsg.type === "ok"
                            ? "bg-green-muted text-green"
                            : "bg-red-muted text-red"
                        }`}
                      >
                        {faucetMsg.text}
                      </div>
                    )}
                    <button
                      onClick={handleFaucet}
                      disabled={faucetLoading || faucetReady === false}
                      className="w-full py-2 rounded-lg bg-accent-muted hover:bg-accent/20 disabled:opacity-50 text-accent text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {faucetLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Droplets className="w-3.5 h-3.5" />
                      )}
                      {faucetLoading
                        ? "Requesting..."
                        : faucetReady === false
                          ? "Faucet unavailable"
                          : `Request 100 ${COLLATERAL_SYMBOL}`}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="p-2">
                    <button
                      onClick={() => setPanelView("deposit")}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      Deposit from EVM
                    </button>
                    <button
                      onClick={handleExport}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Mnemonic
                    </button>
                    <button
                      onClick={handleFullDisconnect}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red hover:bg-red-muted transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect All
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  children,
  active = false,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-accent-muted text-accent"
          : "text-muted hover:text-foreground hover:bg-card-hover"
      }`}
    >
      {children}
    </button>
  );
}
