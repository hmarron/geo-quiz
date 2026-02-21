// ─── D3 map setup, color constants, rendering helpers ────────────────────────

const container = document.getElementById('map-container');
let width = container.clientWidth;
let height = container.clientHeight;

const COLOR_ACTIVE_FILL = "#374151";
const COLOR_BORDER = "#6b7280";
const COLOR_EXCLUDED_FILL = "#1a2a3a";

const svg = d3.select("#map-container")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);

const g = svg.append("g");

const projection = d3.geoMercator()
    .scale(width / 6.5)
    .translate([width / 2, height / 1.5]);

const path = d3.geoPath().projection(projection);

const zoom = d3.zoom()
    .scaleExtent([1, 100])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
        g.selectAll(".country").style("stroke-width", 0.5 / event.transform.k + "px");
    });

svg.call(zoom);

function getCountryRegionId(feature) {
    const props = feature.properties;
    const cont = (props.CONTINENT || props.continent || "").toLowerCase();
    const centroid = d3.geoCentroid(feature);
    const lat = centroid[1];

    if (cont.includes("north america")) return 'north-america';
    if (cont.includes("south america")) return 'south-america';
    if (cont.includes("europe")) return 'europe';
    if (cont.includes("asia")) return 'asia';
    if (cont.includes("oceania")) return 'oceania';
    if (cont.includes("africa")) return lat >= 0 ? 'africa-north' : 'africa-south';
    return null;
}

function zoomIn() { svg.transition().duration(400).call(zoom.scaleBy, 2); }
function zoomOut() { svg.transition().duration(400).call(zoom.scaleBy, 0.5); }
function resetZoom() { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); }

function mpColorCountry(featureId, color) {
    if (!featureId || !color) return;
    g.selectAll(".country")
        .filter(d => d.properties && d.properties.ISO_A3 === featureId)
        .style("fill", color);
}

window.addEventListener('resize', () => {
    width = container.clientWidth;
    height = container.clientHeight;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
});
