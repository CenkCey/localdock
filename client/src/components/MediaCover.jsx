import { useEffect, useState } from 'react';
import { AudioLines } from 'lucide-react';

const MIN_SIDE = 110;

export default function MediaCover({ src, size = 22 }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(false);
  }, [src]);

  return (
    <>
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          style={ok ? undefined : { display: 'none' }}
          onLoad={(event) => {
            const img = event.currentTarget;
            setOk(Math.min(img.naturalWidth, img.naturalHeight) >= MIN_SIDE);
          }}
          onError={() => setOk(false)}
        />
      )}
      {!ok && <AudioLines size={size} strokeWidth={2.25} />}
    </>
  );
}
