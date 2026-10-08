"use client";

import { CalendarDays, CreditCard, KeyRound, Loader2, UserRound } from "lucide-react";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { TextField } from "@/components/auth/AuthScreen";

/**
 * Card fields for Mercado Pago, on Lastro's own page. Number, expiry and CVV are Mercado Pago's
 * secure fields (its iframes, styled like Lastro's inputs): the card is typed into Mercado Pago,
 * which hands back a single-use token. Lastro's page, server, database and logs never see the
 * card number or the CVV.
 */

const SDK_URL = "https://sdk.mercadopago.com/js/v2";

/* Only the parts of MercadoPago.js this page uses. */
interface MpField {
  mount(containerId: string): MpField;
  unmount(): void;
  on(event: string, cb: (e: { bin?: string | null; field?: string; errorMessages?: unknown[] }) => void): void;
}
interface MpInstance {
  fields: {
    create(type: "cardNumber" | "expirationDate" | "securityCode", opts: Record<string, unknown>): MpField;
    createCardToken(data: { cardholderName: string; identificationType: string; identificationNumber: string }): Promise<{ id: string }>;
  };
  getPaymentMethods(q: { bin: string }): Promise<{ results: { id: string; issuer?: { id?: number | string } }[] }>;
  getIssuers(q: { paymentMethodId: string; bin: string }): Promise<{ id: number | string }[]>;
}
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, opts?: { locale?: string }) => MpInstance;
  }
}

let sdk: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  sdk ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      sdk = null;
      reject(new Error("sdk"));
    };
    document.head.appendChild(s);
  });
  return sdk;
}

export interface CardToken {
  token: string;
  payment_method_id: string;
  issuer_id: string | null;
}

export interface CardFieldsHandle {
  /** Tokenizes the typed card with Mercado Pago. Throws a message for the buyer when it can't. */
  tokenize(cpf: string): Promise<CardToken>;
}

type FieldName = "cardNumber" | "expirationDate" | "securityCode";

const FIELD_STYLE = {
  height: "100%",
  padding: "0",
  fontSize: "16px",
  color: "#0B1530",
  placeholderColor: "#8A93A8",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export const CardFields = forwardRef<CardFieldsHandle, { publicKey: string; submitted: boolean }>(function CardFields({ publicKey, submitted }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids: Record<FieldName, string> = { cardNumber: `mp-num-${uid}`, expirationDate: `mp-exp-${uid}`, securityCode: `mp-cvv-${uid}` };
  const mp = useRef<MpInstance | null>(null);
  const bin = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [holder, setHolder] = useState("");
  const [invalid, setInvalid] = useState<Partial<Record<FieldName, boolean>>>({});
  const [holderTouched, setHolderTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    const mounted: MpField[] = [];
    loadSdk()
      .then(() => {
        if (!alive || !window.MercadoPago) return;
        const instance = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        mp.current = instance;
        const make = (type: FieldName, placeholder: string) => {
          const f = instance.fields.create(type, { placeholder, style: FIELD_STYLE }).mount(ids[type]);
          f.on("validityChange", (e) => setInvalid((s) => ({ ...s, [type]: Array.isArray(e.errorMessages) && e.errorMessages.length > 0 })));
          mounted.push(f);
          return f;
        };
        const number = make("cardNumber", "0000 0000 0000 0000");
        make("expirationDate", "MM/AA");
        make("securityCode", "CVV");
        number.on("binChange", (e) => {
          bin.current = e.bin ?? null;
        });
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
      for (const f of mounted) {
        try {
          f.unmount();
        } catch {
          /* already gone */
        }
      }
    };
    // The containers' ids are stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  const holderError = (submitted || holderTouched) && holder.trim().length < 3 ? "Como está impresso no cartão." : null;

  useImperativeHandle(ref, () => ({
    async tokenize(cpf: string) {
      const instance = mp.current;
      if (!instance || state !== "ready") throw new Error("Os campos do cartão ainda não carregaram. Tente de novo em instantes.");
      if (holder.trim().length < 3) throw new Error("Informe o nome impresso no cartão.");
      const b = bin.current;
      if (!b) throw new Error("Confira o número do cartão.");
      let token: { id: string };
      try {
        token = await instance.fields.createCardToken({ cardholderName: holder.trim(), identificationType: "CPF", identificationNumber: cpf.replace(/\D/g, "") });
      } catch {
        throw new Error("Confira o número, a validade e o código de segurança do cartão.");
      }
      const { results } = await instance.getPaymentMethods({ bin: b }).catch(() => ({ results: [] }));
      const method = results[0];
      if (!method?.id) throw new Error("Não reconhecemos a bandeira deste cartão.");
      let issuer = method.issuer?.id != null ? String(method.issuer.id) : null;
      if (!issuer) {
        const list = await instance.getIssuers({ paymentMethodId: method.id, bin: b }).catch(() => []);
        issuer = list[0]?.id != null ? String(list[0].id) : null;
      }
      return { token: token.id, payment_method_id: method.id, issuer_id: issuer };
    },
  }));

  if (state === "error") {
    return <p className="rounded-[20px] bg-rose/10 px-4 py-3 text-[14px] text-rose-ink">Não foi possível carregar o pagamento com cartão. Verifique sua conexão ou pague com Pix.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <SecureField label="Número do cartão" id={ids.cardNumber} icon={<CreditCard className="size-[18px]" />} invalid={invalid.cardNumber} loading={state === "loading"} />
      </div>
      <SecureField label="Validade" id={ids.expirationDate} icon={<CalendarDays className="size-[18px]" />} invalid={invalid.expirationDate} loading={state === "loading"} />
      <SecureField label="Código de segurança" id={ids.securityCode} icon={<KeyRound className="size-[18px]" />} invalid={invalid.securityCode} loading={state === "loading"} />
      <div className="sm:col-span-2">
        <TextField label="Nome impresso no cartão" name="cardholder" icon={<UserRound className="size-[18px]" />} value={holder} onChange={setHolder} onBlur={() => setHolderTouched(true)} error={holderError} autoComplete="cc-name" maxLength={60} />
      </div>
    </div>
  );
});

/** A Mercado Pago iframe in a Lastro-styled pill (same look as TextField). */
function SecureField({ label, id, icon, invalid, loading }: { label: string; id: string; icon: React.ReactNode; invalid?: boolean; loading: boolean }) {
  return (
    <div>
      <p className="mb-2 block pl-2 text-[14px] font-semibold text-ink-700">{label}</p>
      <div className={cn("flex h-14 items-center gap-2 rounded-full bg-white pr-4 pl-5 shadow-[0_8px_20px_-14px_rgba(22,80,180,0.5)] transition-shadow", invalid ? "ring-2 ring-rose/60" : "focus-within:ring-2 focus-within:ring-electric")}>
        <span className="text-ink-400" aria-hidden>
          {icon}
        </span>
        <div id={id} className="h-full min-w-0 flex-1 py-[17px] [&_iframe]:h-[22px]! [&_iframe]:w-full!" aria-label={label} />
        {loading && <Loader2 className="size-4 animate-spin text-ink-400" aria-hidden />}
      </div>
      {invalid && <p className="mt-1.5 text-[12px] text-rose-ink">Confira este campo.</p>}
    </div>
  );
}
