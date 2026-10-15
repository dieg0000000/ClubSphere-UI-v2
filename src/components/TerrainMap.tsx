import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin, Map } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface TerrainMapProps {
  latitude: number;
  longitude: number;
  name: string;
  address?: string;
}

const TerrainMap = ({ latitude, longitude, name, address }: TerrainMapProps) => {
  return (
    <div style={{ marginTop: '16px', position: 'relative', zIndex: 1 }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={16}
        style={{
          height: '250px',
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]}>
          <Popup>
            <strong>{name}</strong>
            {address && <><br/>{address}</>}
          </Popup>
        </Marker>
      </MapContainer>

      <div style={{
        display: 'flex', gap: '16px', marginTop: '8px'
      }}>
        <a
          href={`https://maps.google.com/?q=${latitude},${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--primary)', fontSize: '13px' }}
        >
          <MapPin className="w-3 h-3 inline mr-1" />Ouvrir dans Google Maps →
        </a>
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=16`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-muted)', fontSize: '13px' }}
        >
          <Map className="w-3 h-3 inline mr-1" />OpenStreetMap →
        </a>
      </div>
    </div>
  );
};

export default TerrainMap;
