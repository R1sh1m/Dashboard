# Apple Maps UI/UX Reference & MapKit Integration Notes

Reference for Apple Maps design patterns and MapKit/web integration. Useful if the team ever swaps Leaflet for Apple Maps, embeds an Apple web map, or aligns the dashboard's map UX with Apple's conventions.

Sources:
- [Apple Maps HIG](https://developer.apple.com/design/human-interface-guidelines/maps)
- [MapKit documentation](https://developer.apple.com/documentation/mapkit)
- [MapKit JS](https://developer.apple.com/documentation/mapkitjs)
- [Maps Server API](https://developer.apple.com/maps/)
- WWDC23 "Meet MapKit for SwiftUI"; WWDC20 "Design for location privacy"

The Apple Maps HIG is the authoritative external reference for map behavior.
This document translates it into implementation guidance for the dashboard's
Leaflet stack.

---

## 1. Apple Maps layout principles

- The map occupies the majority of the screen; controls float over it without obscuring the expected interactive behavior (zoom, pan, rotate).
- Keep the map interactive and avoid noninteractive overlays that block expected
  pan, zoom, or rotation gestures.
- Search lives at the **bottom** (thumb-reachable), not the top — a sliding bottom-sheet search card.
- Category filters appear as horizontal pills below the search field.
- Place details slide up as a card over the map; at the large detent the map peeks above, at the small detent the map is ~88% of the screen.
- Keep the selected location visible while a place card is open and avoid
  duplicating telemetry that is already visible elsewhere.
- Map emphasis styles: **default** (fully saturated, aligns with the Maps app) vs **muted** (desaturated, good when you have information-rich overlays).
- Map types: explore / driving / transit / satellite / hybrid.

---

## 2. Search card (sliding bottom sheet — hero component)

| Property | Value |
|----------|-------|
| Width | Full screen |
| Detents | Small (88 pt — search bar only), medium (~50% screen), large (full-screen modal) |
| Background | `.regularMaterial` blur (translucent frosted layer over the map) |
| Corner radius | 10 pt (medium/large); 0 pt on small |
| Drag indicator | 36 × 5 pt rounded rect, `#3C3C43` at 30% opacity, 8 pt below top edge |

**Search field:**
- Full width − 32 pt margins; height 44 pt
- Background `#F2F2F7` (surface gray) inside the blur material
- Corner radius 10 pt
- Leading: 16 pt SF Symbol `magnifyingglass`, `#3C3C43` at 60% opacity
- Text: SF Pro Display 17 pt Regular `#000000`; placeholder "Search Maps" `#3C3C43` at 30%
- Trailing: microphone (`mic.fill`) and "Cancel" when active

**Below the search field:** horizontal category pills row — Food / Coffee / Drinks / Shopping / Parking / Transit.

**Medium detent:** Favorites, Recents, Guides — each in a 2-col grid of large rounded tiles.

---

## 3. Category pill

| Property | Value |
|----------|-------|
| Size | 64 × 88 pt |
| Background | `#FFFFFF` solid white card (not translucent) |
| Corner radius | 14 pt |
| Icon | 28 pt SF Symbol filled, category color (e.g., `fork.knife` `#FF9500` orange for Food) |
| Label | SF Pro Text 14 pt Medium `#000000`, centered, 1 line |
| Padding | 16 pt vertical, 8 pt horizontal |
| Tap | Scale to 0.96; opens category-filtered search |

---

## 4. Place card (detail view)

**Top section (60 pt):**
- Place title: SF Pro Display 28 pt Bold `#000000`
- Subtitle: SF Pro Text 15 pt Regular `#3C3C43` at 60% (e.g., "Bakery · French · $$")
- Close button: top-right, 30 pt circle with `xmark` SF Symbol, `.regularMaterial` background

**Action button row (60 pt, horizontal scroll if needed):**
- "Directions": filled `#0A84FF` pill, white text, 44 pt height, 24 pt horizontal padding, SF Pro Text 17 pt Semibold
- "Call": outlined `#0A84FF` pill (1 pt border, white background, blue text)
- "Share": outlined gray pill
- "Save": outlined gray pill with heart icon

**Photo row (when available):** horizontal scroll of 16:9 photo cards, 80 pt tall, 12 pt corner radius.

**Info sections (each below the previous):**
- Hours: row with green "Open" badge or red "Closed" + closing time
- Address: row with map-pin icon + tap to copy
- Phone: row with phone icon + tappable number
- Website: row with globe icon + domain

**Reviews section:** UPPERCASE section header; star rating row + "N reviews" + review cards if expanded.

**Sticky "Directions" bottom button:** 48 pt height, `#0A84FF` background, 8 pt corner radius, white text.

**Spacing:** generous — 24 pt section gaps; place card top section has 32 pt above the title.

---

## 5. Map controls (floating top-right stack)

Three circular translucent buttons stacked vertically over the map:

| Property | Value |
|----------|-------|
| Container | Each button 44 × 44 pt circle |
| Background | `.regularMaterial` blur (frosted white over the map) |
| Icons | SF Symbols, 18 pt, `#000000` (or `#FFFFFF` in dark mode) |
| Stack gap | 8 pt vertical |
| Position | Top-right, 16 pt inset from edge, 16 pt below safe-area top |

**Buttons (top to bottom):**
1. **Layer picker** (`square.3.layers.3d`) — opens map style selector (Standard / Satellite / Hybrid / Transit)
2. **Current location** (`location.fill` when locked, `location` when not) — centers map on user
3. **3D toggle / Compass** (`map.fill` or `compass`) — toggles 3D buildings

---

## 6. Location privacy (Apple Maps approach)

- **Precise location:** pulsing blue dot — strong visual, primary organizational element.
- **Approximate location:** shaded circular area; fades as people zoom in to maintain cartographic legibility.
- Don't require precise data to use the product; allow as much as possible with approximate location.
- For approximate-location users, remove nonessential UI that requires precise data.
- Build trust through transparency: clear language at decision points (first launch), status bar + control at the top of the map showing the current setting.
- Offer proportional value: limit precise-location requests to features that need them (e.g., turn-by-turn directions), asked close to when the value is delivered.
- Provide a "My Location" option so users can manually opt into precise origin for routing.

---

## 7. MapKit / MapKit JS integration notes (for future Apple Maps adoption)

**MapKit (native, iOS/macOS):**
- `MKMapView` — embed as-is; never subclass. Assign a delegate for interaction callbacks.
- Coordinate systems: `CLLocationCoordinate2D` (lat/lon), `MKMapPoint` (Mercator x/y), `CGPoint` (view points).
- `MKStandardMapConfiguration.EmphasisStyle`: default vs muted.
- Annotations: `MKAnnotationView` — default red pin; tintable; icon string 2–3 chars max.
- Overlays: highlight regions/paths with blend modes.
- Search: text-completion for destination search; `MKLocalSearch`.
- Directions: `MKDirections` for ETAs and routes.
- Look Around: interactive street-level panoramas.
- Snapshots: optimized camera/pitch controls for map images.
- Capability: turn on the Maps capability in Xcode (adds entitlement; App Store distribution only).

**MapKit JS (web — relevant to this dashboard's stack):**
- Embed interactive maps in websites across macOS, Windows, Android.
- Loader auto-handles library dependencies; promise-based APIs; standard web event model; TypeScript definitions.
- Add annotations/overlays to call out POIs and user destinations.
- Requires a MapKit JS key from Apple Developer (restricted to your domain).

**Maps Server API (REST):**
- Geocoding, search, estimated time of arrival across platforms.
- Lower data usage, better battery life.

**Unified Maps URLs (iOS 18.4+, macOS 15.4+, watchOS 11.4+):**
- `/frame?center=40.773957,-73.970974&span=0.05,0.05&mode=follow&pitch=45&map=explore`
- `/search?query=pizza&center=...&span=...`
- Path components control framing (orientation, style, span, perspective) and search.

---

## 8. Applying Apple Maps patterns to this Leaflet dashboard

Until a possible MapKit migration, the dashboard's `MapView.tsx` should mirror Apple Maps conventions:

- Bottom-sheet search card over the map (reuse `PoiModal.tsx` / `SensorSheet.tsx` patterns).
- Category pill row below search.
- Top-right floating control stack (layer picker, center-on-rover, compass/3D).
- Place cards for points of interest (human-presence markers) following §4.
- Approximate vs precise location handling per §6 (rover GPS vs last-known location).
- Muted emphasis style if overlaying rich telemetry (power, environmental, motor matrices).
