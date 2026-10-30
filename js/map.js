// Creates the Leaflet map and the base tile layers.
import { S } from './state.js';

S.map = L.map('map', { zoomSnap: 0.5, wheelPxPerZoomLevel: 90, maxZoom: 19, worldCopyJump: true }).setView([40.7508, 14.4869], 17);
export const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, pane: 'p_streets', attribution: '© OpenStreetMap' });
export const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'p_sat', attribution: 'Esri World Imagery' });
