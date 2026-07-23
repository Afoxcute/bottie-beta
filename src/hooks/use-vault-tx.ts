"use client";

import { useState, useCallback } from "react";
import type { Address, Hex } from "viem";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { usePrivy } from "@privy-io/react-auth";
import { useYoClient } from "@yo-protocol/react";

type Step = "idle" | "processing" | "success" | "error";

export function useVaultDeposit({
  vault,
  onConfirmed,
  onError,
}: {
  vault: Address;
  onConfirmed?: (hash: Hex) => void;
  onError?: (err: Error) => void;
}) {
  const { client } = useSmartWallets();
  const { user } = usePrivy();
  const yoClient = useYoClient();
  const [step, setStep] = useState<Step>("idle");
  const [hash, setHash] = useState<Hex | undefined>();

  const walletAddress = (user?.smartWallet?.address ??
    user?.wallet?.address) as Address | undefined;

  const deposit = useCallback(
    async ({
      token,
      amount,
    }: {
      token: Address;
      amount: bigint;
      chainId?: number;
    }) => {
      if (!client || !walletAddress || !yoClient) return;
      setStep("processing");
      try {
        const txs = await yoClient.prepareDepositWithApproval({
          vault,
          token,
          owner: walletAddress,
          recipient: walletAddress,
          amount,
          slippageBps: 50,
        });
        const txHash = await client.sendTransaction({
          calls: txs.map((tx) => ({
            to: tx.to as Address,
            data: tx.data as Hex,
            value: tx.value ? BigInt(tx.value) : undefined,
          })),
        });
        setHash(txHash);
        setStep("success");
        onConfirmed?.(txHash);
      } catch (err: any) {
        setStep("error");
        onError?.(
          err instanceof Error
            ? err
            : new Error(err?.message || "Transaction failed"),
        );
      }
    },
    [client, walletAddress, vault, yoClient, onConfirmed, onError],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setHash(undefined);
  }, []);

  return {
    deposit,
    step,
    isLoading: step === "processing",
    isSuccess: step === "success",
    hash,
    reset,
  };
}

export function useVaultRedeem({
  vault,
  onConfirmed,
  onError,
}: {
  vault: Address;
  onConfirmed?: (hash: Hex) => void;
  onError?: (err: Error) => void;
}) {
  const { client } = useSmartWallets();
  const { user } = usePrivy();
  const yoClient = useYoClient();
  const [step, setStep] = useState<Step>("idle");
  const [hash, setHash] = useState<Hex | undefined>();

  const walletAddress = (user?.smartWallet?.address ??
    user?.wallet?.address) as Address | undefined;

  const redeem = useCallback(
    async (shares: bigint) => {
      if (!client || !walletAddress || !yoClient) return;
      setStep("processing");
      try {
        const txs = await yoClient.prepareRedeemWithApproval({
          vault,
          shares,
          owner: walletAddress,
          recipient: walletAddress,
        });
        const txHash = await client.sendTransaction({
          calls: txs.map((tx) => ({
            to: tx.to as Address,
            data: tx.data as Hex,
            value: tx.value ? BigInt(tx.value) : undefined,
          })),
        });
        setHash(txHash);
        setStep("success");
        onConfirmed?.(txHash);
      } catch (err: any) {
        setStep("error");
        onError?.(
          err instanceof Error
            ? err
            : new Error(err?.message || "Transaction failed"),
        );
      }
    },
    [client, walletAddress, vault, yoClient, onConfirmed, onError],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setHash(undefined);
  }, []);

  return {
    redeem,
    step,
    isLoading: step === "processing",
    isSuccess: step === "success",
    hash,
    instant: true,
    reset,
  };
}
