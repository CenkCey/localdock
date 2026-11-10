import { useEffect, useState } from 'react';

export default function SceneBackground({ scene }) {
  const [layers, setLayers] = useState([{ scene, key: 0 }]);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.scene === scene) return prev;
      return [top, { scene, key: top.key + 1 }];
    });
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), 900);
    return () => clearTimeout(timer);
  }, [scene]);

  return (
    <div className="scenes" aria-hidden="true">
      {layers.map((layer, i) => (
        <div key={layer.key} className={`scene scene-${layer.scene}${i > 0 ? ' scene-in' : ''}`} />
      ))}
    </div>
  );
}
