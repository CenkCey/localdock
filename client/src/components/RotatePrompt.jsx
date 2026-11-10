import { Smartphone } from 'lucide-react';

export default function RotatePrompt() {
  return (
    <div className="rotate-prompt" role="alert">
      <Smartphone size={44} strokeWidth={1.75} />
      <p className="rotate-title">Rotate your phone</p>
      <p className="rotate-note">LocalDock works in landscape.</p>
    </div>
  );
}
