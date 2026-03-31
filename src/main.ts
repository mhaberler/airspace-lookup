import './style.css'
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

L.Icon.Default.imagePath = 'img/icon/';

const m_mono = L.tileLayer(
    'https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
});

const map = L.map('map', {
    center: [47,15],
    zoom: 12,
    zoomControl: true,
    layers: [m_mono]
});

L.control.scale({
    imperial: false,
    maxWidth: 300
}).addTo(map);
