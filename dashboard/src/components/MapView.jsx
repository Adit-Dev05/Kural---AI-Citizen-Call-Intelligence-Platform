import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function getCoordinates(ticket) {
  if (ticket.latitude && ticket.longitude) {
    const lat = parseFloat(ticket.latitude);
    const lng = parseFloat(ticket.longitude);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  // Fallback: center of Chennai with jitter
  const jitterLat = (Math.random() - 0.5) * 0.08;
  const jitterLng = (Math.random() - 0.5) * 0.08;
  return [13.0827 + jitterLat, 80.2707 + jitterLng];
}

export default function MapView({ tickets, mode = 'pins' }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!mapInstanceRef.current && mapContainerRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([13.0827, 80.2707], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstanceRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear previous layer
    if (layerRef.current) {
      mapInstanceRef.current.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const activeTickets = tickets.filter(t => t.status !== 'resolved');

    const mainGroup = L.layerGroup();

    if (mode === 'heatmap') {
      // Heatmap mode layer
      const heatData = activeTickets.map(ticket => {
        const coords = getCoordinates(ticket);
        const intensity = ticket.urgency === 'urgent' ? 1.0 : ticket.urgency === 'medium' ? 0.6 : 0.3;
        return [...coords, intensity];
      });

      if (heatData.length > 0) {
        L.heatLayer(heatData, {
          radius: 45,
          blur: 35,
          maxZoom: 12,
          max: 0.8,
          gradient: { 0.2: '#3b82f6', 0.4: '#22c55e', 0.6: '#f59e0b', 0.8: '#ef4444', 1.0: '#dc2626' }
        }).addTo(mainGroup);
      }
    }

    // Always add markers for visual clarity
    activeTickets.forEach(ticket => {
      const coords = getCoordinates(ticket);
      const isEmergency = ticket.source === 'emergency';

      const customIcon = L.divIcon({
        className: `custom-map-marker ${isEmergency ? 'marker-emergency' : 'marker-normal'}`,
        html: `<div class="marker-pin">${isEmergency ? '🚨' : '📍'}</div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -35]
      });

      const popupContent = `
        <div class="map-popup">
          <div class="popup-header">
            <span class="popup-ticket-id">${ticket.ticket_number}</span>
            <span class="popup-source">${ticket.source === 'emergency' ? '🚨 EMERGENCY' : '📝 Triage'}</span>
          </div>
          <div class="popup-body">
            <p><strong>Summary:</strong> ${ticket.summary || '(no summary)'}</p>
            <p><strong>Department:</strong> ${ticket.department}</p>
            <p><strong>Location:</strong> ${ticket.location || 'Not specified'}</p>
            <p><strong>Status:</strong> ${ticket.status}, <strong>Urgency:</strong> <span style="color:${ticket.urgency === 'urgent' ? '#ef4444' : '#f59e0b'}">${ticket.urgency}</span></p>
          </div>
        </div>
      `;

      L.marker(coords, { icon: customIcon })
        .bindPopup(popupContent)
        .addTo(mainGroup);
    });

    mainGroup.addTo(mapInstanceRef.current);
    layerRef.current = mainGroup;
  }, [tickets, mode]);

  return (
    <div className="map-view-card">
      <div className="map-header">
        <h3>{mode === 'heatmap' ? '🔥 Grievance Heatmap' : '📍 Live Grievance Map'}</h3>
        <span className="map-badge">LIVE TRACKING</span>
      </div>
      <div ref={mapContainerRef} className="map-container" style={{ height: '380px', width: '100%', borderRadius: '8px' }} />
    </div>
  );
}
