import { useEffect, useState } from "react";
import { AlertCircle, Check, Copy, X } from "lucide-react";
import { useT } from "../lib/i18n";

interface Props {
  message: string;
  onClose: () => void;
}

export default function ErrorBubble({ message, onClose }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [message]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Kopyalama desteklenmiyorsa sadece sessizce kal.
    }
  };

  return (
    <div className="error-bubble" role="alert" aria-live="assertive">
      <div className="error-bubble-head">
        <div className="error-bubble-title">
          <AlertCircle size={14} />
          <span>{t("errorTitle")}</span>
        </div>
        <div className="error-bubble-actions">
          <button type="button" onClick={handleCopy} title={t("copyError")}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button type="button" onClick={onClose} title={t("closeError")}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="error-bubble-message">{message}</div>
    </div>
  );
}
