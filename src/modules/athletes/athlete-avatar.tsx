import { useEffect, useState } from "react";

interface AthleteAvatarProps {
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  className?: string;
}

/**
 * Avatar del deportista (D5): la foto es solo una URL del contrato. Si no hay
 * URL o la imagen falla, se muestran las iniciales (design.md A10). Si la URL
 * cambia (p. ej. tras una edición), se reintenta la imagen nueva.
 */
export function AthleteAvatar({ firstName, lastName, photoUrl, className = "size-10" }: AthleteAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const showImage = Boolean(photoUrl) && !imageFailed;

  if (!showImage) {
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    return (
      <div
        aria-hidden="true"
        className={`bg-avatar text-on-primary grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`}
      >
        <span className="text-label font-semibold">{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={photoUrl ?? undefined}
      alt={`${firstName} ${lastName}`}
      onError={() => setImageFailed(true)}
      className={`shrink-0 overflow-hidden rounded-full object-cover ${className}`}
    />
  );
}
